const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {groupColorKey,readGroupColors} = require('../.tmp/tests/groupColors.js');
const {readSettings,resolveAppearance} = require('../.tmp/tests/formatting.js');
const {sample} = require('./fixture.cjs');

function fixture() {
    const dom = new JSDOM('<div id="root"></div>'), root=dom.window.document.querySelector('#root');
    const palette = {getColor:()=>({value:'#1670a5'}),foreground:{value:'#202830'},background:{value:'#ffffff'}};
    const host = {colorPalette:palette,eventService:{renderingStarted(){},renderingFinished(){},renderingFailed(_o,r){throw Error(r);}}};
    const data=sample();
    const view=new ProcessFlowView({element:root,host});
    const update=(type=2,incoming=data)=>view.update({type,dataViews:incoming?[incoming]:undefined,viewport:{width:1100,height:500}});
    const group=name=>[...root.querySelectorAll('.process-flow-group')].find(e=>e.dataset.flowGroup===name);
    const card=()=>view.getFormattingModel().cards.find(c=>c.uid==='flowGroups-card');
    update(); return {root,host,data,view,update,group,card};
}
const fill=color=>({solid:{color}});
const override={useTheme:false,background:fill('#ffcc00'),border:fill('#a03010'),titleColor:fill('#401000')};

test('each group exposes independent native selectors and reset descriptors with shared defaults',()=>{
    const f=fixture(),card=f.card();
    assert.equal(card.groups.length,3);
    for(const name of ['Output','Processing']) {
        const group=card.groups.find(g=>g.displayName===name);
        assert.equal(group.slices.length,4);
        assert.equal(group.slices[0].control.properties.value,true);
        assert.ok(group.slices.slice(1).every(s=>s.disabled));
        for(const slice of group.slices) {
            const descriptor=slice.control.properties.descriptor;
            assert.equal(descriptor.objectName,'flowGroups');
            assert.deepEqual(descriptor.selector,{id:groupColorKey(name)});
            assert.ok(card.revertToDefaultDescriptors.some(d=>JSON.stringify(d)===JSON.stringify(descriptor)));
        }
    }
    const uids=card.groups.flatMap(g=>[g.uid,...g.slices.map(s=>s.uid)]);
    assert.equal(new Set(uids).size,uids.length);
});

test('per-group background, border and title change only that container and survive reorder and resize',()=>{
    const f=fixture();
    f.data.metadata.objects={flowGroups:{$instances:{[groupColorKey('Processing')]:override}}};f.update();
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#ffcc00');
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('stroke'),'#a03010');
    assert.equal(f.group('Processing').querySelector('text').getAttribute('fill'),'#401000');
    assert.equal(f.group('Output').querySelector('rect').getAttribute('fill'),'#1670a5');
    assert.ok(f.card().groups.find(g=>g.displayName==='Processing').slices.every(s=>!s.disabled));
    f.data.table.rows.reverse();f.update();f.update(4,undefined);
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#ffcc00');
    f.data.metadata.objects.flowGroups.$instances[groupColorKey('Output')]={...override,background:fill('#aaeecc')};f.update();
    assert.equal(f.group('Output').querySelector('rect').getAttribute('fill'),'#aaeecc');
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#ffcc00');
});

test('custom colors survive high contrast, temporary filtering and formatting-only updates',()=>{
    const f=fixture();
    f.data.metadata.objects={flowGroups:{$instances:{[groupColorKey('Processing')]:override}}};f.update();
    f.host.colorPalette.isHighContrast=true;f.host.colorPalette.foreground={value:'#ffff00'};f.host.colorPalette.background={value:'#000000'};
    f.update(16,undefined);
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#000000');
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('stroke'),'#ffff00');
    assert.ok(f.card().groups.find(g=>g.displayName==='Processing').slices.every(s=>s.disabled));
    assert.equal(f.card().groups.find(g=>g.displayName==='Processing').slices[1].control.properties.value.value,'#ffcc00');
    f.host.colorPalette.isHighContrast=false;
    f.update(16,{metadata:f.data.metadata});
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#ffcc00');
    const rows=f.data.table.rows;f.data.table.rows=rows.filter(row=>row[8]!=='Processing');f.update();
    assert.equal(f.card().groups.find(g=>g.displayName==='Processing'),undefined);
    f.data.table.rows=rows;f.update();
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#ffcc00');
});

test('shared toggle and deleting a group override restore inherited colors; malformed metadata is ignored',()=>{
    const f=fixture();
    f.data.metadata.objects={flowGroups:{useTheme:false,background:fill('#334455'),$instances:{[groupColorKey('Processing')]:override}}};f.update();
    f.data.metadata.objects.flowGroups.$instances[groupColorKey('Processing')].useTheme=true;f.update();
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#334455');
    delete f.data.metadata.objects.flowGroups.$instances;f.update();
    assert.equal(f.group('Processing').querySelector('rect').getAttribute('fill'),'#334455');
    const appearance=resolveAppearance(readSettings());
    const colors=readGroupColors([{flowGroup:'__proto__'},{flowGroup:'😀 <script>'}],{flowGroups:{$instances:{
        [groupColorKey('__proto__')]:{useTheme:false,background:fill('url(javascript:bad)'),border:fill('#xyz')}
    }}},appearance);
    assert.equal(colors[0].background,appearance.groupBackground);
    assert.equal(colors[0].border,appearance.groupBorder);
    assert.notEqual(groupColorKey(' A '),groupColorKey('A'));
    assert.equal(f.root.querySelector('script'),null);
});
