const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {sample, dataView} = require('./fixture.cjs');
const {identity, selectionHost} = require('./selection-host.cjs');

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(data = sample()) {
    const dom = new JSDOM('<div id="root"></div>');
    const root = dom.window.document.querySelector('#root');
    data.table.identity = data.table.rows.map((_, index) => ({key: `row-${index}`}));
    const selection = selectionHost();
    const host = {
        colorPalette: {getColor: () => ({value: '#1670a5'})}, hostCapabilities: {allowInteractions: true},
        createSelectionManager: () => selection.manager, createSelectionIdBuilder: selection.createSelectionIdBuilder,
        eventService: {renderingStarted() {}, renderingFinished() {}, renderingFailed(_o, reason) {throw Error(reason);}}
    };
    const view = new ProcessFlowView({element: root, host});
    const update = (options = {}) => view.update({type: 2, dataViews: [data], viewport: {width: 1000, height: 600}, ...options});
    const line = (source, target) => root.querySelector(`.process-flow-edge[data-source="${source}"][data-target="${target}"]`);
    const fire = (element, type = 'click', options = {}) => element.dispatchEvent(new dom.window.MouseEvent(type,
        {bubbles: true, cancelable: true, clientX: 130, clientY: 240, ...options}));
    update();
    return {root, dom, data, selection, host, view, update, line, fire};
}

test('single click selects original row, dims unrelated marks and repeat click deselects', async () => {
    const f = fixture();
    f.fire(f.line('B', 'C')); await settle();
    assert.deepEqual(f.selection.calls[0], {type: 'select', keys: ['row-1'], multiSelect: false});
    assert.equal(f.line('B', 'C').dataset.selected, 'true');
    assert.equal(f.line('B', 'D').style.opacity, '0.3');
    assert.equal(f.root.querySelector('[data-node-id="C"]').dataset.selected, 'true');
    f.fire(f.line('B', 'C')); await settle();
    assert.equal(f.selection.manager.hasSelection(), false);
    assert.equal(f.line('B', 'D').style.opacity, '1');
});

test('line hit area and label select the same row; Ctrl and Meta add/remove selections', async () => {
    const f = fixture();
    const same = edge => [...f.root.querySelectorAll('[data-edge-id]')].filter(e => e.dataset.edgeId === edge.dataset.edgeId);
    f.fire(same(f.line('B', 'C')).find(e => e.classList.contains('process-flow-edge-hit'))); await settle();
    f.fire(same(f.line('B', 'D')).find(e => e.classList.contains('process-flow-edge-label')).querySelector('text'), 'click', {ctrlKey: true}); await settle();
    assert.equal(f.selection.manager.getSelectionIds().length, 2);
    f.fire(f.line('B', 'C'), 'click', {metaKey: true}); await settle();
    assert.deepEqual(f.selection.manager.getSelectionIds().map(id => id.getKey()), ['row-2']);
});

test('node selection is a union of incident rows including target-only nodes and self loops', async () => {
    const f = fixture();
    f.fire(f.root.querySelector('[data-node-id="B"] rect')); await settle();
    assert.deepEqual(f.selection.calls.at(-1).keys.sort(), ['row-0', 'row-1', 'row-2']);
    f.fire(f.root.querySelector('[data-node-id="H"] text')); await settle();
    assert.deepEqual(f.selection.calls.at(-1).keys.sort(), ['row-7', 'row-8']);
    const loop = fixture(dataView([['A', 'A', -1]], ['source', 'target', 'value']));
    loop.fire(loop.root.querySelector('[data-node-id="A"]')); await settle();
    assert.deepEqual(loop.selection.calls[0].keys, ['row-0']);
});

test('blank canvas clears while zoom controls, summary, and scrollbar navigation preserve selection', async () => {
    const f = fixture();
    f.fire(f.line('B', 'C')); await settle();
    f.fire(f.root.querySelector('[aria-label="Zoom in"]'));
    f.fire(f.root.querySelector('.process-flow-summary'));
    f.root.querySelector('.process-flow-viewport').dispatchEvent(new f.dom.window.Event('scroll'));
    await settle();
    assert.equal(f.selection.calls.length, 1);
    f.fire(f.root.querySelector('svg')); await settle();
    assert.equal(f.selection.calls.at(-1).type, 'clear');
    assert.equal(f.line('B', 'C').dataset.selected, 'false');
});

test('context menu passes edge identity and CSS coordinates; multi-row nodes use general context', async () => {
    const f = fixture();
    f.root.querySelector('[aria-label="Zoom in"]').click();
    assert.equal(f.fire(f.line('B', 'C'), 'contextmenu'), false); await settle();
    assert.deepEqual(f.selection.calls.at(-1), {type: 'contextmenu', key: 'row-1', position: {x: 130, y: 240}});
    f.fire(f.root.querySelector('svg'), 'contextmenu'); await settle();
    assert.equal(f.selection.calls.at(-1).key, undefined);
    f.fire(f.root.querySelector('[data-node-id="B"]'), 'contextmenu'); await settle();
    assert.equal(f.selection.calls.at(-1).key, undefined);
    f.fire(f.root.querySelector('[data-node-id="A"]'), 'contextmenu'); await settle();
    assert.equal(f.selection.calls.at(-1).key, 'row-0');
});

test('allowInteractions suppresses select, clear and context menu and supports later restoration', async () => {
    const f = fixture(); f.host.hostCapabilities.allowInteractions = false; f.update();
    f.fire(f.line('B', 'C')); f.fire(f.root.querySelector('svg'));
    assert.equal(f.fire(f.line('B', 'C'), 'contextmenu'), true); await settle();
    assert.equal(f.selection.calls.length, 0);
    assert.equal(f.line('B', 'C').dataset.selectable, 'false');
    f.host.hostCapabilities.allowInteractions = true; f.update();
    f.fire(f.line('B', 'C')); await settle();
    assert.equal(f.selection.calls.length, 1);
});

test('restored and partial host selections match row includes; unknown selections do not dim every mark', () => {
    const f = fixture();
    f.selection.restore([identity('source-B', id => ['row-1', 'row-2'].includes(id.getKey()))]);
    assert.equal(f.line('B', 'C').dataset.selected, 'true');
    assert.equal(f.line('B', 'D').dataset.selected, 'true');
    assert.equal(f.line('A', 'B').style.opacity, '0.3');
    f.update({type: 4, dataViews: undefined});
    assert.equal(f.line('B', 'D').dataset.selected, 'true');
    f.selection.restore([identity('unrelated-model-field')]);
    assert.equal(f.line('A', 'B').style.opacity, '1');
    f.selection.restore([]);
    assert.equal(f.root.querySelectorAll('[data-selected="true"]').length, 0);
});

test('missing row identities do not invent selections or clear existing ones on click', async () => {
    const f = fixture(); delete f.data.table.identity[1]; f.update();
    f.fire(f.line('B', 'C')); f.fire(f.root.querySelector('[data-node-id="B"]')); await settle();
    assert.equal(f.selection.calls.length, 0);
    assert.equal(f.line('B', 'C').dataset.selectable, 'false');
    f.fire(f.line('B', 'C'), 'contextmenu'); await settle();
    assert.equal(f.selection.calls.at(-1).key, undefined);
});

test('duplicate endpoints and keys still select original rows after parsing and sorting', async () => {
    const f = fixture(dataView([['Z','Y',1,'same'], [null,'B',0,'invalid'], ['A','B',2,'same'], ['A','B',3,'same']],
        ['source','target','value','tooltipId']));
    for (const line of f.root.querySelectorAll('.process-flow-edge')) {
        f.fire(line); await settle();
    }
    assert.deepEqual(f.selection.calls.map(c => c.keys[0]).sort(), ['row-0','row-2','row-3']);
});

test('rapid asynchronous operations remain ordered; restored host state supersedes pending work', async () => {
    const f = fixture();
    const original = f.selection.manager.select;
    let release;
    f.selection.manager.select = async (...args) => {
        await new Promise(resolve => {release = resolve;});
        return original(...args);
    };
    f.fire(f.line('B', 'C')); f.fire(f.line('B', 'D'), 'click', {ctrlKey: true});
    await settle(); assert.equal(f.selection.calls.length, 0);
    release(); await settle();
    assert.equal(f.selection.calls.length, 1);
    release(); await settle();
    assert.deepEqual(f.selection.manager.getSelectionIds().map(id => id.getKey()), ['row-1', 'row-2']);
    f.selection.restore([identity('row-8')]);
    assert.equal(f.line('G', 'H').dataset.selected, 'true');
});

test('failed host operations produce a recoverable status and destroy ignores pending work and callbacks', async () => {
    const f = fixture();
    const select = f.selection.manager.select;
    f.selection.manager.select = async () => {throw Error('host failure');};
    f.fire(f.line('B', 'C')); await settle();
    assert.match(f.root.querySelector('[role="status"].process-flow-interaction-error').textContent, /could not apply/);
    f.selection.manager.select = select;
    f.fire(f.line('B', 'D')); await settle();
    assert.equal(f.root.querySelector('.process-flow-interaction-error'), null);
    f.fire(f.line('B', 'C')); f.view.destroy(); await settle();
    const calls = f.selection.calls.length;
    f.selection.restore([]);
    assert.equal(f.root.children.length, 0);
    assert.equal(f.selection.calls.length, calls);
});

test('host data filtering replaces edges without carrying positional selection to new rows', () => {
    const f = fixture(); f.selection.restore([identity('row-1')]);
    f.data.table.rows = [f.data.table.rows[2]];
    f.data.table.identity = [{key: 'row-2'}]; f.update();
    assert.equal(f.root.querySelectorAll('.process-flow-edge').length, 1);
    assert.equal(f.line('B', 'D').dataset.selected, 'false');
    assert.equal(f.line('B', 'D').style.opacity, '1');
});

test('capabilities enable multiple visual selections without claiming unsupported table highlights', () => {
    const capabilities = require('../capabilities.json');
    assert.equal(capabilities.supportsMultiVisualSelection, true);
    assert.notEqual(capabilities.supportsHighlight, true);
});

test('a restore callback wins over an in-flight response and stale queued clicks are discarded on update', async () => {
    const f = fixture();
    let release;
    f.selection.manager.select = () => new Promise(resolve => {release = resolve;});
    f.fire(f.line('B', 'C')); f.fire(f.line('B', 'D')); await settle();
    f.selection.restore([identity('row-8')]);
    f.update({type: 4, dataViews: undefined});
    release([identity('row-1')]); await settle();
    assert.equal(f.line('G', 'H').dataset.selected, 'true');
    assert.equal(f.line('B', 'C').dataset.selected, 'false');
    assert.equal(f.selection.calls.length, 0);
});
