const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {edgeIdentities, edgeTooltipItems} = require('../.tmp/tests/tooltips.js');
const {dataView, sample} = require('./fixture.cjs');

function fixture(data = sample()) {
    const dom = new JSDOM('<div id="root"></div>');
    const root = dom.window.document.querySelector('#root');
    const calls = [];
    data.table.identity = data.table.rows.map((_, i) => ({key: `row-${i}`}));
    const host = {
        locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
        hostCapabilities: {allowInteractions: true},
        eventService: {renderingStarted() {}, renderingFinished() {}, renderingFailed(_o, reason) {throw Error(reason);}},
        tooltipService: {enabled: () => true,
            show: o => calls.push(['show', o]), move: o => calls.push(['move', o]), hide: o => calls.push(['hide', o])},
        createSelectionIdBuilder: () => {
            let row;
            return {withTable(table, i) {row = table.identity[i]; return this;},
                createSelectionId() {return {getKey: () => row.key, hasIdentity: () => true};}};
        }
    };
    const view = new ProcessFlowView({element: root, host});
    const update = () => view.update({type: 2, dataViews: [data], viewport: {width: 1000, height: 600}});
    update();
    const line = (source, target) => root.querySelector(`.process-flow-edge[data-source="${source}"][data-target="${target}"]`);
    const fire = (element, type, init = {}) => element.dispatchEvent(new dom.window.MouseEvent(type,
        {bubbles: true, clientX: 123, clientY: 234, ...init}));
    return {root, dom, data, host, view, update, calls, line, fire};
}

test('native tooltips carry full signed values, optional text, and original table row identity', () => {
    const f = fixture();
    for (const [target, id, value, row] of [['C', 'T002', '-18', 1], ['D', 'T003', '-5', 2]]) {
        f.fire(f.line('B', target), 'pointerover');
        const [kind, options] = f.calls.at(-1);
        assert.equal(kind, 'show');
        const fields = Object.fromEntries(options.dataItems.map(i => [i.displayName, i.value]));
        assert.equal(fields.Source, 'B'); assert.equal(fields.Target, target);
        assert.equal(fields.Value, value); assert.equal(fields['Tooltip ID'], id);
        assert.ok(fields.Label); assert.ok(fields.Group);
        assert.equal(options.identities[0].getKey(), `row-${row}`);
        assert.deepEqual(options.coordinates, [123, 234]);
    }
});

test('sorting and skipped invalid rows never change identity indexes; duplicate keys retain row identities', () => {
    const data = dataView([['Z', 'Y', 4, 'same'], [null, 'X', 1, 'bad'], ['A', 'B', -2, 'same']],
        ['source', 'target', 'value', 'tooltipId']);
    const f = fixture(data);
    const graph = parseGraph(data);
    const identities = edgeIdentities(f.host, data.table, graph.edges);
    assert.equal(graph.edges.length, 2);
    for (const edge of graph.edges) assert.equal(identities.get(edge.id).getKey(), `row-${edge.rowIndex}`);
    assert.equal(new Set([...identities.values()].map(i => i.getKey())).size, 2);
});

test('labels and wide line hit areas share tooltip context without hiding between them', () => {
    const f = fixture();
    const line = f.line('B', 'C');
    const targets = [...f.root.querySelectorAll('[data-edge-id]')].filter(e => e.dataset.edgeId === line.dataset.edgeId);
    const hit = targets.find(e => e.classList.contains('process-flow-edge-hit'));
    const label = targets.find(e => e.classList.contains('process-flow-edge-label'));
    assert.equal(hit.getAttribute('vector-effect'), 'non-scaling-stroke');
    assert.equal(hit.getAttribute('stroke-width'), '12');
    f.fire(hit, 'pointerover');
    f.fire(hit, 'pointerout', {relatedTarget: label});
    f.fire(label.querySelector('text'), 'pointerover');
    assert.deepEqual(f.calls.map(c => c[0]), ['show', 'move']);
    f.fire(label, 'pointermove', {clientX: 300, clientY: 250});
    assert.deepEqual(f.calls.at(-1)[1].coordinates, [300, 250]);
    f.fire(label, 'pointerout', {relatedTarget: f.root});
    assert.equal(f.calls.at(-1)[0], 'hide');
});

test('scroll, zoom, update and destroy hide tooltips and old elements lose listeners', () => {
    const f = fixture();
    f.fire(f.line('B', 'C'), 'pointerover');
    f.root.querySelector('.process-flow-viewport').dispatchEvent(new f.dom.window.Event('scroll'));
    assert.equal(f.calls.at(-1)[0], 'hide');
    f.fire(f.line('B', 'C'), 'pointerover');
    f.root.querySelector('[aria-label="Zoom in"]').click();
    assert.equal(f.calls.at(-1)[0], 'hide');
    const old = f.line('B', 'C');
    f.fire(old, 'pointerover'); f.update();
    assert.equal(f.calls.at(-1)[0], 'hide');
    const count = f.calls.length; f.fire(old, 'pointerover');
    assert.equal(f.calls.length, count);
    f.fire(f.line('B', 'D'), 'pointerover'); f.view.destroy();
    assert.equal(f.calls.at(-1)[0], 'hide');
    assert.equal(f.root.children.length, 0);
});

test('missing host identities fall back to native data items and disabled service never opens', () => {
    const f = fixture();
    delete f.data.table.identity; f.update();
    f.fire(f.line('B', 'C'), 'pointerover');
    assert.deepEqual(f.calls.at(-1)[1].identities, []);
    f.host.tooltipService.enabled = () => false;
    f.fire(f.line('B', 'D'), 'pointerover');
    assert.equal(f.calls.at(-1)[0], 'hide');
    const count = f.calls.length; f.fire(f.line('B', 'D'), 'pointermove');
    assert.equal(f.calls.length, count);
    f.host.createSelectionIdBuilder = () => ({withTable() {return this;}, createSelectionId: () => ({hasIdentity: () => false})});
    f.data.table.identity = [{}];
    assert.equal(edgeIdentities(f.host, f.data.table, parseGraph(f.data).edges).size, 0);
});

test('tooltips remain available with host interactions disabled; zoom never scales pointer coordinates', () => {
    const f = fixture();
    f.root.querySelector('[aria-label="Zoom in"]').click();
    f.fire(f.line('B', 'C'), 'pointerover');
    assert.deepEqual(f.calls.at(-1)[1].coordinates, [123, 234]);
    f.host.hostCapabilities.allowInteractions = false; f.update();
    assert.equal(f.root.querySelector('button'), null);
    f.fire(f.line('B', 'D'), 'pointerover');
    assert.equal(f.calls.at(-1)[0], 'show');
});

test('full text and zero/decimal values are retained without requiring optional fields', () => {
    const edge = {source: '<script>', target: 'B', value: 0, label: 'x'.repeat(500)};
    const items = edgeTooltipItems(edge, 'en-US');
    assert.equal(items.find(i => i.displayName === 'Source').value, '<script>');
    assert.equal(items.find(i => i.displayName === 'Label').value.length, 500);
    assert.equal(items.find(i => i.displayName === 'Value').value, '0');
    assert.equal(items.length, 4);
    assert.equal(edgeTooltipItems({...edge, value: -0.00125}, 'en-US')[2].value, '-0.00125');
});

test('capabilities expose native and canvas tooltips using the business key role', () => {
    const capabilities = require('../capabilities.json');
    assert.deepEqual(capabilities.tooltips.supportedTypes, {default: true, canvas: true});
    assert.deepEqual(capabilities.tooltips.roles, ['tooltipId']);
});

test('illustrative details use valid keys and distinct T002/T003 records with matching totals', () => {
    const csv = fs.readFileSync(path.join(__dirname, '../../example_data/FlowDetails.csv'), 'utf8').trim().split(/\r?\n/);
    assert.equal(csv.shift(), 'Tooltip ID,Detail ID,Description,Amount');
    const rows = csv.map(row => row.split(','));
    const graph = parseGraph(sample());
    assert.equal(new Set(rows.map(r => r[1])).size, rows.length);
    for (const edge of graph.edges) {
        const details = rows.filter(row => row[0] === edge.tooltipId);
        assert.ok(details.length > 0);
        assert.equal(details.reduce((sum, row) => sum + Number(row[3]), 0), edge.value);
    }
    assert.ok(rows.every(row => graph.edges.some(edge => edge.tooltipId === row[0])));
    assert.notDeepEqual(rows.filter(r => r[0] === 'T002'), rows.filter(r => r[0] === 'T003'));
});
