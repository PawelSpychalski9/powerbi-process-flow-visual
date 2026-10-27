const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {parseGraph, MAX_TEXT_LENGTH, MAX_TEXT_CHARACTERS} = require('../.tmp/tests/graph.js');
const {layoutGraph} = require('../.tmp/tests/layout.js');
const {renderGraph} = require('../.tmp/tests/renderer.js');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {edgeTooltipItems} = require('../.tmp/tests/tooltips.js');
const {dataView, sample} = require('./fixture.cjs');
const {stressCases, stressData} = require('./stress-fixtures.cjs');
const {selectionHost} = require('./selection-host.cjs');

test('missing roles, malformed tables/rows and non-finite values are readable states, preserving valid row indexes', () => {
    for (const table of [{rows: []}, {columns:[], rows:{}}, {columns:[null], rows:[]}]) {
        assert.notEqual(parseGraph({metadata:{columns:[]}, table}).status, 'ready');
    }
    const data = dataView([null, {}, ['A','B',Infinity], ['A','B',NaN], ['A','B',-Infinity], ['A','B',0]], ['source','target','value']);
    const graph = parseGraph(data);
    assert.equal(graph.skippedRows, 5);
    assert.equal(graph.edges[0].rowIndex, 5);
    assert.equal(graph.edges[0].value, 0);
    assert.match(graph.warnings.join(' '), /5 invalid/);
    assert.match(parseGraph(dataView([['A','B']],['source','target'])).message,/value/);
});

test('text safety limits reject the whole graph without truncating or merging IDs', () => {
    const valid = dataView([['x'.repeat(MAX_TEXT_LENGTH),'B',-1]], ['source','target','value']);
    assert.equal(parseGraph(valid).status,'ready');
    valid.table.rows.push(['x'.repeat(MAX_TEXT_LENGTH+1),'B',-2]);
    const graph = parseGraph(valid);
    assert.equal(graph.status,'invalid'); assert.equal(graph.edges.length,0);
    assert.match(graph.message,/4096/);
    const total = dataView(Array.from({length:300},(_,i)=>['A','B',i,'key'+i,'x'.repeat(MAX_TEXT_LENGTH)]));
    assert.ok(300 * MAX_TEXT_LENGTH > MAX_TEXT_CHARACTERS);
    assert.match(parseGraph(total).message,/text budget/);
});

for (const [kind,count] of stressCases) test(`bounded, deterministic ${kind} layout at ${count} edges`, {timeout:15000}, () => {
    const data = stressData(kind,count);
    const graph = parseGraph(data);
    assert.equal(graph.status,'ready'); assert.equal(graph.edges.length,count);
    for (const orthogonalEdges of [false,true]) {
        const {readSettings} = require('../.tmp/tests/formatting.js');
        const layout = layoutGraph(graph,'en-US',{...readSettings(),orthogonalEdges});
        assert.equal(layout.nodes.length,graph.nodes.length);
        assert.equal(layout.edges.length,count);
        assert.ok(Number.isFinite(layout.width) && layout.width > 0);
        assert.ok(Number.isFinite(layout.height) && layout.height > 0);
        for (const node of layout.nodes) assert.ok([node.x,node.y,node.width,node.height].every(Number.isFinite));
        for (const edge of layout.edges) {
            assert.doesNotMatch(edge.path,/NaN|Infinity|undefined/);
            assert.ok([edge.labelX,edge.labelY,edge.labelWidth,edge.labelHeight].every(Number.isFinite));
            assert.ok(edge.labelX + edge.labelWidth/2 <= layout.width);
            assert.ok(edge.labelY + edge.labelHeight/2 <= layout.height);
        }
        const again = layoutGraph(parseGraph({...data,table:{...data.table,rows:[...data.table.rows].reverse()}}),'en-US',{...readSettings(),orthogonalEdges});
        assert.deepEqual(again.nodes,layout.nodes);
        assert.deepEqual(again.edges.map(e=>e.path),layout.edges.map(e=>e.path));
    }
});

test('complex mixed graph retains cycles, self-loops, disconnected and duplicate edges and safely renders hostile Unicode text', () => {
    const data = dataView([
        ['A','B',-1,'same','😀漢字 <script>'.repeat(200)], ['B','C',2,'T2'], ['C','A',0,'T3'],
        ['A','A',-2,'T4'], ['A','B',-1,'same'], ['X','Y',-3,'T5']
    ]);
    const graph = parseGraph(data); assert.equal(graph.nodes.length,5); assert.equal(graph.edges.length,6);
    const dom = new JSDOM('<div></div>');
    const root = dom.window.document.querySelector('div');
    for (let i=0;i<3;i++) renderGraph(root,graph,{width:800,height:400,accent:'#123456',markerId:'test'});
    assert.equal(root.querySelectorAll('svg').length,1);
    assert.equal(root.querySelectorAll('.process-flow-edge').length,6);
    assert.equal(root.querySelectorAll('script').length,0);
    assert.ok(root.textContent.length < 1000);
});

test('host errors clear stale interaction context, render a recovery message, and permit the next update', () => {
    const dom = new JSDOM('<div></div>'), root = dom.window.document.querySelector('div');
    const selection = selectionHost();
    const host = {colorPalette:{getColor:()=>({value:'#123456'})},
        createSelectionManager:()=>selection.manager,createSelectionIdBuilder:selection.createSelectionIdBuilder,
        eventService:{renderingStarted(){},renderingFinished(){},renderingFailed(){}}};
    const view = new ProcessFlowView({element:root,host});
    const data = stressData('chain',25);
    const update = () => view.update({dataViews:[data],type:2,viewport:{width:800,height:400}});
    update();
    const original = selection.manager.getSelectionIds;
    selection.manager.getSelectionIds = () => {throw Error('host failure');};
    assert.doesNotThrow(update);
    assert.match(root.textContent,/refresh the visual/);
    assert.equal(root.querySelector('svg'),null);
    selection.restore([]); // stale host callbacks must not inspect failed rows
    selection.manager.getSelectionIds = original;
    update(); assert.equal(root.querySelectorAll('.process-flow-edge').length,25);
    view.update({viewport:{width:Infinity,height:400},type:4});
    assert.equal(root.querySelector('[role=alert]') !== null,true);
    update(); assert.ok(root.querySelector('svg'));
});

test('tooltip service exceptions during hover and cleanup cannot crash updates or leave duplicate listeners', () => {
    const dom = new JSDOM('<div></div>'), root = dom.window.document.querySelector('div');
    const errors=[]; dom.window.addEventListener('error',event=>errors.push(event.error));
    let fail=true, shown=0;
    const host={colorPalette:{getColor:()=>({value:'#123456'})},
        eventService:{renderingStarted(){},renderingFinished(){},renderingFailed(){}},
        tooltipService:{enabled:()=>true,show(){if(fail)throw Error('show');shown++;},move(){throw Error('move');},hide(){throw Error('hide');}}};
    const view=new ProcessFlowView({element:root,host});
    const update=()=>view.update({dataViews:[sample()],type:2,viewport:{width:800,height:400}});
    const hover=()=>root.querySelector('.process-flow-edge').dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));
    update(); hover(); assert.match(root.textContent,/temporarily unavailable/);
    fail=false; hover(); assert.equal(root.querySelector('.process-flow-tooltip-error'),null);
    update(); hover(); assert.equal(shown,2); // exactly one listener per update
    assert.equal(errors.length,0);
    assert.doesNotThrow(()=>view.destroy()); assert.equal(root.children.length,0);
    assert.equal(edgeTooltipItems({source:'A',target:'B',value:-1},'bad_locale')[2].value,'-1');
});
