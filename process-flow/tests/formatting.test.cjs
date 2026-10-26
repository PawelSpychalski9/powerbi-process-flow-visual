const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {readSettings, buildFormattingModel, resolveAppearance, formattingCards} = require('../.tmp/tests/formatting.js');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {layoutGraph} = require('../.tmp/tests/layout.js');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {dataView, sample} = require('./fixture.cjs');

function palette(overrides = {}) {
    return {getColor: () => ({value:'#3f5299'}), foreground:{value:'#202830'}, background:{value:'#f0f3ff'},
        foregroundSelected:{value:'#00ffff'}, isHighContrast:false, ...overrides};
}

function viewFixture() {
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    const root = dom.window.document.getElementById('root');
    const host = {colorPalette:palette(), hostCapabilities:{allowInteractions:true},
        eventService:{renderingStarted(){},renderingFinished(){},renderingFailed(_options, reason){throw new Error(reason);}}};
    const view = new ProcessFlowView({element:root,host});
    const update = (data, type = 2) => view.update({dataViews:data ? [data] : [], type, viewport:{width:1100,height:500}});
    return {root,host,view,update};
}

test('format cards expose every capabilities property with matching typed controls and reset descriptors', () => {
    const capabilities = JSON.parse(fs.readFileSync('capabilities.json','utf8'));
    const model = buildFormattingModel(readSettings());
    assert.equal(model.cards.length,5);
    const uids = [];
    for (const card of model.cards) {
        uids.push(card.uid);
        const slices = card.groups.flatMap(group=>group.slices);
        for (const slice of slices) {
            uids.push(slice.uid);
            const {objectName,propertyName} = slice.control.properties.descriptor;
            const property = capabilities.objects[objectName].properties[propertyName];
            assert.ok(property);
            const expected = slice.control.type === 'ColorPicker' ? 'fill' : slice.control.type === 'ToggleSwitch' ? 'bool' : null;
            if (expected) assert.ok(property.type[expected]);
            else assert.ok(property.type.numeric || property.type.formatting.fontSize);
        }
        assert.deepEqual(card.revertToDefaultDescriptors,slices.map(slice=>slice.control.properties.descriptor));
    }
    assert.equal(new Set(uids).size,uids.length);
    assert.equal(model.cards.reduce((count,card)=>count+card.groups[0].slices.length,0),
        Object.values(capabilities.objects).reduce((count,object)=>count+Object.keys(object.properties).length,0));
    assert.equal(formattingCards.length,5);
});

test('metadata values are clamped and malformed colors and non-finite settings safely fall back', () => {
    const settings = readSettings({nodes:{useTheme:false,fill:{solid:{color:'#123456'}},borderWidth:-9},
        edges:{width:Infinity,color:{solid:{color:'url(https://bad.example)'}}},
        labels:{fontSize:1000,decimalPlaces:3.7},layout:{horizontalSpacing:NaN,verticalSpacing:-8}});
    assert.equal(settings.nodeUseTheme,false);
    assert.equal(settings.nodeFill,'#123456');
    assert.equal(settings.nodeBorderWidth,0);
    assert.equal(settings.edgeWidth,1.8);
    assert.equal(settings.edgeColor,'#1670a5');
    assert.equal(settings.fontSize,24);
    assert.equal(settings.decimalPlaces,4);
    assert.equal(settings.horizontalSpacing,180);
    assert.equal(settings.verticalSpacing,40);
});

test('theme colors update defaults; explicit colors work only with theme toggles disabled', () => {
    const settings = readSettings();
    const theme = resolveAppearance(settings,palette(),'#3f5299');
    assert.equal(theme.nodeBorder,'#3f5299');
    assert.equal(theme.nodeFill,'#f0f3ff');
    assert.equal(theme.foreground,'#202830');
    const custom = resolveAppearance({...settings,nodeUseTheme:false,edgeUseTheme:false,canvasUseTheme:false,
        nodeFill:'#abc',nodeBorder:'#def',edgeColor:'#123',background:'#456',textColor:'#789'},palette(),'#000');
    assert.equal(custom.nodeFill,'#abc');
    assert.equal(custom.edgeColor,'#123');
    assert.equal(custom.background,'#456');
    assert.equal(custom.foreground,'#789');
});

test('high contrast overrides all custom colors and disables color editing without losing saved values', () => {
    const settings = {...readSettings(),nodeUseTheme:false,edgeUseTheme:false,canvasUseTheme:false,nodeFill:'#ff0000'};
    const appearance = resolveAppearance(settings,palette({isHighContrast:true,foreground:{value:'#ffff00'},background:{value:'#000000'}}));
    assert.equal(appearance.nodeFill,'#000000');
    assert.equal(appearance.nodeBorder,'#ffff00');
    assert.equal(appearance.edgeColor,'#ffff00');
    assert.equal(appearance.foreground,'#ffff00');
    for (const card of buildFormattingModel(settings,true).cards) {
        for (const slice of card.groups[0].slices) if(slice.control.type === 'ColorPicker') assert.equal(slice.disabled,true);
    }
    assert.equal(settings.nodeFill,'#ff0000');
});

test('precision, grouping, locale, spacing, and font size affect actual graph output without changing signs', () => {
    const graph = parseGraph(dataView([['A','B',-1234.5,'T1','Long sample title',null,'Connection label']]));
    const defaults = layoutGraph(graph);
    const settings = {...readSettings(),automaticValues:false,decimalPlaces:3,thousandsSeparator:false,
        horizontalSpacing:400,verticalSpacing:160,fontSize:24};
    const layout = layoutGraph(graph,'de-DE',settings);
    assert.equal(layout.edges[0].valueText,'-1234,500');
    assert.ok(layout.width > defaults.width);
    assert.ok(layout.nodes[0].height > defaults.nodes[0].height);
    assert.ok(layout.edges[0].labelHeight > defaults.edges[0].labelHeight);
    assert.equal(graph.edges[0].value,-1234.5);
    const branch = parseGraph(sample());
    const wide = layoutGraph(branch,'en-US',settings);
    const before = layoutGraph(branch);
    const distance = (result)=>Math.abs(result.nodes.find(node=>node.id==='C').y-result.nodes.find(node=>node.id==='D').y);
    assert.ok(distance(wide)>distance(before));
});

test('format-only updates and resize retain settings; resetting metadata restores defaults', () => {
    const {root,view,update} = viewFixture();
    const data = sample();
    data.metadata.objects = {nodes:{useTheme:false,fill:{solid:{color:'#ffddee'}}},edges:{width:4},labels:{fontSize:20}};
    update(data);
    assert.equal(root.querySelector('.process-flow-node rect').getAttribute('fill'),'#ffddee');
    assert.equal(root.querySelector('.process-flow-edge').getAttribute('stroke-width'),'4');
    update(undefined,4);
    assert.equal(root.querySelector('.process-flow-node rect').getAttribute('fill'),'#ffddee');
    assert.equal(root.querySelector('.process-flow').style.getPropertyValue('--flow-font-size'),'20px');
    update({metadata:{columns:data.metadata.columns,objects:{edges:{width:5}}}},16);
    assert.equal(root.querySelectorAll('.process-flow-node').length,8);
    assert.equal(root.querySelector('.process-flow-edge').getAttribute('stroke-width'),'5');
    update(sample());
    assert.equal(root.querySelector('.process-flow-node rect').getAttribute('fill'),'#f0f3ff');
    assert.equal(view.getFormattingModel().cards.length,5);
});

test('host theme and high-contrast changes recolor live SVG and enforce visible outlines', () => {
    const {root,host,update} = viewFixture();
    update(sample());
    host.colorPalette = palette({isHighContrast:true,foreground:{value:'#ffff00'},background:{value:'#000000'}});
    update(undefined,16);
    assert.equal(root.querySelector('.process-flow').style.getPropertyValue('--flow-bg'),'#000000');
    assert.equal(root.querySelector('.process-flow-node rect').getAttribute('stroke'),'#ffff00');
    assert.equal(root.querySelector('.process-flow-node rect').getAttribute('stroke-width'),'2');
    assert.equal(root.querySelector('.process-flow-edge').getAttribute('stroke'),'#ffff00');
    assert.equal(root.querySelector('marker path').getAttribute('fill'),'#ffff00');
    assert.equal(root.querySelector('.process-flow-edge-label rect').getAttribute('fill'),'#000000');
    host.colorPalette = palette();
    update(undefined,16);
    assert.equal(root.querySelector('.process-flow-edge').getAttribute('stroke'),'#3f5299');
});

test('disallowed interactions fit the graph and suppress controls; permissions can be restored', () => {
    const {root,host,update} = viewFixture();
    host.hostCapabilities.allowInteractions = false;
    update(sample());
    assert.equal(root.querySelector('.process-flow-zoom'),null);
    assert.ok(Number(root.querySelector('svg').getAttribute('width')) <= 1100);
    assert.equal(root.querySelector('.process-flow-viewport').style.overflow,'hidden');
    assert.equal(root.querySelector('.process-flow-viewport').tabIndex,-1);
    host.hostCapabilities.allowInteractions = true;
    update(undefined,4);
    assert.equal(root.querySelector('output').textContent,'100%');
    assert.equal(root.querySelectorAll('.process-flow-zoom').length,1);
});

test('landing page, missing roles, no rows, invalid rows, and recovery display actionable states', () => {
    const {root,update} = viewFixture();
    update(undefined);
    assert.match(root.textContent,/Build a process graph/);
    assert.match(root.textContent,/Source and Target/);
    assert.equal(root.querySelector('button'),null);
    update(dataView([['A']],['source']));
    assert.match(root.textContent,/required fields/);
    update(dataView([]));
    assert.match(root.textContent,/No connections match/);
    update(dataView([['A','B',NaN]],['source','target','value']));
    assert.match(root.querySelector('[role="alert"]').textContent,/Check your data/);
    assert.equal(root.querySelector('svg'),null);
    update(sample());
    assert.equal(root.querySelectorAll('.process-flow-node').length,8);
    assert.equal(root.querySelector('.process-flow-state'),null);
});

test('sample node and label boxes remain separate at large font sizes and minimum requested spacing', () => {
    const graph = parseGraph(sample());
    for (const fontSize of [10,13,24]) {
        const layout = layoutGraph(graph,'en-US',{...readSettings(),fontSize,horizontalSpacing:180,verticalSpacing:40});
        const boxes = [...layout.nodes,...layout.edges.map(edge=>({x:edge.labelX-edge.labelWidth/2,y:edge.labelY-edge.labelHeight/2,width:edge.labelWidth,height:edge.labelHeight}))];
        for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
            const a=boxes[i],b=boxes[j];
            assert.equal(a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y,false,`Overlap at font size ${fontSize}`);
        }
    }
});
