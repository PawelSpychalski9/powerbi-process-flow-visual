const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {layoutGraph,layoutFlatGraph} = require('../.tmp/tests/layout.js');
const {readSettings,resolveAppearance,buildFormattingModel} = require('../.tmp/tests/formatting.js');
const {renderGraph,createZoomState} = require('../.tmp/tests/renderer.js');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {dataView,sample} = require('./fixture.cjs');

const selectedRoles = ['source','target','value','flowGroup'];
const graph = rows => parseGraph(dataView(rows,selectedRoles));
const overlaps = (a,b)=>a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
const contains = (a,b)=>b.x>=a.x && b.y>=a.y && b.x+b.width<=a.x+a.width && b.y+b.height<=a.y+a.height;

test('null, empty, whitespace, and absent Flow Group create no containers and keep the exact flat layout', () => {
    for (const value of [null,'','   ',undefined]) {
        const result=graph([['A','B',-1,value],['B','C',0,value]]);
        assert.ok(result.nodes.every(node=>node.flowGroup === undefined));
        assert.deepEqual(layoutGraph(result),layoutFlatGraph(result));
        assert.equal(layoutGraph(result).groups,undefined);
    }
    const old=parseGraph(dataView([['A','B',-1],['B','C',0]],['source','target','value']));
    assert.deepEqual(layoutGraph(old),layoutFlatGraph(old));
});

test('one group contains all source members; target-only nodes remain outside', () => {
    const result=graph([['A','B',-1,'One'],['B','C',0,'One']]);
    const layout=layoutGraph(result);
    assert.equal(layout.groups.length,1);
    assert.deepEqual(layout.groups[0].nodeIds,['A','B']);
    assert.equal(result.nodes.find(node=>node.id==='C').flowGroup,undefined);
    for(const node of layout.nodes) assert.equal(contains(layout.groups[0],node),node.id!=='C');
    const all=layoutGraph(graph([['A','B',1,'One'],['B','A',2,'One']]));
    assert.equal(all.groups.length,1);
    assert.ok(all.nodes.every(node=>contains(all.groups[0],node)));
});

test('sample has two groups, ungrouped A/H, internal edges, and both kinds of boundary connection', () => {
    const result=parseGraph(sample());
    const layout=layoutGraph(result);
    assert.deepEqual(layout.groups.map(group=>group.id),['Output','Processing']);
    assert.equal(result.nodes.length,8);
    assert.equal(result.edges.length,9);
    const byId=new Map(layout.nodes.map(node=>[node.id,node]));
    for(const group of layout.groups) {
        for(const node of layout.nodes) assert.equal(contains(group,node),node.flowGroup===group.id);
        assert.ok(group.nodeIds.every(id=>byId.get(id).y>group.y+readSettings().flowGroupPadding+readSettings().flowGroupTitleSize));
    }
    assert.ok(!overlaps(layout.groups[0],layout.groups[1]));
    assert.equal(result.edges.find(edge=>edge.source==='B').group,'Processing');
    assert.equal(result.nodes.find(node=>node.id==='B').flowGroup,'Processing');
});

test('conceptual compound chain progresses left-to-right with endpoints on actual nodes', () => {
    const result=graph([['A','K',1,null],['K','I',-2,'Flow XYZ'],['I','J',3,'Flow XYZ'],
        ['J','L',-4,'Flow XYZ'],['L','X',5,'Flow XYZ'],['X','Z',6,null],['Z','Y',7,'Flow ABC'],['Y','Y',0,'Flow ABC']]);
    const layout=layoutGraph(result);
    const nodes=new Map(layout.nodes.map(node=>[node.id,node]));
    const chain=['A','K','I','J','L','X','Z','Y'];
    for(let i=1;i<chain.length;i++) assert.ok(nodes.get(chain[i]).x>nodes.get(chain[i-1]).x);
    for(const edge of layout.edges) {
        const coordinates=edge.path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
        const source=nodes.get(edge.source),target=nodes.get(edge.target);
        assert.ok(Math.abs(coordinates[0]-source.x-source.width)<1e-7);
        assert.ok(Math.abs(coordinates[1]-source.y-source.height/2)<1e-7);
        const [x,y]=coordinates.slice(-2);
        const onVertical=(Math.abs(x-target.x)<1e-7 || Math.abs(x-target.x-target.width)<1e-7) && y>=target.y-1e-7 && y<=target.y+target.height+1e-7;
        const onHorizontal=(Math.abs(y-target.y)<1e-7 || Math.abs(y-target.y-target.height)<1e-7) && x>=target.x-1e-7 && x<=target.x+target.width+1e-7;
        assert.ok(onVertical||onHorizontal,`Edge ${edge.source}->${edge.target} missed its target`);
        assert.doesNotMatch(edge.path,/NaN|Infinity/);
    }
});

test('conflicts including blank versus assigned membership warn and leave only that node ungrouped', () => {
    for(const conflicting of ['Other','',null]) {
        const rows=[['A','B',1,'One'],['A','C',2,conflicting],['B','C',3,'One']];
        const first=graph(rows),second=graph([...rows].reverse());
        assert.equal(first.nodes.find(node=>node.id==='A').flowGroup,undefined);
        assert.equal(first.nodes.find(node=>node.id==='B').flowGroup,'One');
        assert.match(first.warnings.join(' '),/Conflicting Flow Group assignments for node A/);
        assert.deepEqual(first.nodes,second.nodes);
        assert.equal(first.edges.length,3);
    }
    assert.equal(graph([['A','B',1,' One '],['A','C',2,'One']]).nodes[0].flowGroup,'One');
});

test('edge Group never assigns nodes to containers and invalid Flow Group types are reported', () => {
    const result=parseGraph(dataView([['A','B',-1,'Edge category']],['source','target','value','group']));
    assert.equal(layoutGraph(result).groups,undefined);
    assert.equal(result.edges[0].group,'Edge category');
    assert.match(graph([['A','B',1,123]]).warnings.join(' '),/Non-text Flow Group/);
});

test('cycles across groups, disconnected groups, self-loops, and parallel edges are finite and non-overlapping', () => {
    const rows=[['A','B',1,'First'],['B','A',-1,'Second'],['A','A',0,'First'],
        ['A','B',2,'First'],['X','Y',1,'Third'],['Y','X',1,'Third']];
    const layout=layoutGraph(graph(rows));
    assert.equal(layout.groups.length,3);
    assert.equal(layout.edges.length,6);
    assert.equal(new Set(layout.edges.map(edge=>edge.path)).size,6);
    for(let i=0;i<layout.groups.length;i++) for(let j=i+1;j<layout.groups.length;j++) assert.ok(!overlaps(layout.groups[i],layout.groups[j]));
    assert.ok(Number.isFinite(layout.width)&&Number.isFinite(layout.height));
    const reversed=layoutGraph(graph([...rows].reverse()));
    assert.deepEqual(layout.nodes,reversed.nodes);
    assert.deepEqual(layout.groups,reversed.groups);
});

test('exterior routes avoid unrelated group rectangles and keep labels outside those containers', () => {
    const result=graph([['A','B',1,'First'],['B','C',2,'First'],['A','X',3,'First'],
        ['X','Y',4,'Second'],['Y','A',5,'Second'],['Z','W',6,'Third'],['W','Z',7,'Third']]);
    const layout=layoutGraph(result);
    const nodes=new Map(layout.nodes.map(node=>[node.id,node]));
    for(const edge of layout.edges) {
        const sourceGroup=nodes.get(edge.source).flowGroup,targetGroup=nodes.get(edge.target).flowGroup;
        if(sourceGroup===targetGroup) continue;
        const numbers=edge.path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
        const points=Array.from({length:numbers.length/2},(_,i)=>({x:numbers[2*i],y:numbers[2*i+1]}));
        for(const container of layout.groups.filter(group=>group.id!==sourceGroup&&group.id!==targetGroup)) {
            assert.ok(!overlaps(container,{x:edge.labelX-edge.labelWidth/2,y:edge.labelY-edge.labelHeight/2,width:edge.labelWidth,height:edge.labelHeight}));
            for(let i=1;i<points.length;i++) {
                const a=points[i-1],b=points[i];
                const vertical=a.x===b.x && a.x>container.x && a.x<container.x+container.width && Math.min(a.y,b.y)<container.y+container.height && Math.max(a.y,b.y)>container.y;
                const horizontal=a.y===b.y && a.y>container.y && a.y<container.y+container.height && Math.min(a.x,b.x)<container.x+container.width && Math.max(a.x,b.x)>container.x;
                assert.equal(vertical||horizontal,false,`Route ${edge.source}->${edge.target} entered ${container.id}`);
            }
        }
    }
});

test('long titles, padding, labels, and configured font sizes contribute to bounded container dimensions', () => {
    const result=graph([['A','B',-1,'Very long group '.repeat(40)],['B','A',2,'Very long group '.repeat(40)]]);
    const defaults=layoutGraph(result);
    const settings={...readSettings(),flowGroupPadding:80,flowGroupTitleSize:30,fontSize:24};
    const large=layoutGraph(result,'en-US',settings);
    assert.ok(large.groups[0].width>defaults.groups[0].width);
    assert.ok(large.groups[0].height>defaults.groups[0].height);
    for(const node of large.nodes) assert.ok(contains(large.groups[0],node));
    for(const edge of large.edges) assert.ok(contains(large.groups[0],{x:edge.labelX-edge.labelWidth/2,y:edge.labelY-edge.labelHeight/2,width:edge.labelWidth,height:edge.labelHeight}));
});

test('SVG groups sit behind connections, custom styling works, hidden backgrounds preserve borders/titles', () => {
    const dom=new JSDOM('<div id="root"></div>');const root=dom.window.document.getElementById('root');
    const settings={...readSettings(),flowGroupUseTheme:false,flowGroupBackground:'#ffddee',flowGroupBorder:'#123456',flowGroupRadius:20,flowGroupBorderWidth:4,flowGroupTitleColor:'#543210'};
    const options={width:1000,height:500,accent:'#1670a5',markerId:'arrow',settings,appearance:resolveAppearance(settings)};
    renderGraph(root,parseGraph(sample()),options);
    const rect=root.querySelector('.process-flow-group rect');
    assert.equal(root.querySelectorAll('.process-flow-group').length,2);
    assert.equal(rect.getAttribute('fill'),'#ffddee');
    assert.equal(rect.getAttribute('stroke'),'#123456');
    assert.equal(rect.getAttribute('rx'),'20');
    assert.equal(rect.getAttribute('stroke-width'),'4');
    assert.equal(root.querySelector('.process-flow-group-title').getAttribute('fill'),'#543210');
    assert.ok(root.querySelector('.process-flow-groups').compareDocumentPosition(root.querySelector('.process-flow-edges')) & 4);
    renderGraph(root,parseGraph(sample()),{...options,settings:{...settings,flowGroupShowBackground:false}});
    assert.equal(root.querySelector('.process-flow-group rect').getAttribute('fill-opacity'),'0');
    assert.equal(root.querySelectorAll('.process-flow-group-title').length,2);
    const contrast=resolveAppearance(settings,{isHighContrast:true,foreground:{value:'#ffff00'},background:{value:'#000000'}});
    renderGraph(root,parseGraph(sample()),{...options,appearance:contrast});
    assert.equal(root.querySelector('.process-flow-group rect').getAttribute('fill'),'#000000');
    assert.equal(root.querySelector('.process-flow-group rect').getAttribute('stroke'),'#ffff00');
    assert.equal(root.querySelector('.process-flow-group-title').getAttribute('fill'),'#ffff00');
});

test('Fit, zoom, and host resize contain group rectangles without duplicating containers', () => {
    const dom=new JSDOM('<div id="root"></div>');const root=dom.window.document.getElementById('root');
    const view=new ProcessFlowView({element:root,host:{colorPalette:{getColor:()=>({value:'#1670a5'})},
        eventService:{renderingStarted(){},renderingFinished(){},renderingFailed(_options,reason){throw new Error(reason);}}}});
    view.update({dataViews:[sample()],viewport:{width:1000,height:500},type:2});
    root.querySelector('[aria-label="Fit graph to view"]').click();
    const before=Number(root.querySelector('svg').getAttribute('width'));
    view.update({viewport:{width:500,height:250},type:4});
    assert.equal(root.querySelectorAll('.process-flow-group').length,2);
    assert.ok(Number(root.querySelector('svg').getAttribute('width'))<before);
    const bounds=layoutGraph(parseGraph(sample()));
    assert.ok(bounds.groups.every(group=>contains({x:0,y:0,width:bounds.width,height:bounds.height},group)));
    root.querySelector('[aria-label="Zoom in"]').click();
    assert.equal(root.querySelectorAll('.process-flow-group').length,2);
    assert.equal(buildFormattingModel(readSettings()).cards.at(-1).displayName,'Flow Groups');
});

test('untrusted group names are plain text and a 500-node grouped graph stays finite', () => {
    const payload='<script>alert(1)</script>';
    const result=graph([['A','B',1,payload],['B','A',1,payload]]);
    const dom=new JSDOM('<div id="root"></div>');const root=dom.window.document.getElementById('root');
    renderGraph(root,result,{width:1000,height:500,accent:'#1670a5',markerId:'arrow',zoom:createZoomState()});
    assert.equal(root.querySelector('script'),null);
    assert.equal(root.querySelector('.process-flow-group').getAttribute('data-flow-group'),payload);
    const large=layoutGraph(graph(Array.from({length:499},(_,i)=>[`N${i}`,`N${i+1}`,1,`G${Math.floor(i/10)}`])));
    assert.equal(large.nodes.length,500);
    assert.equal(large.groups.length,50);
    assert.ok(Number.isFinite(large.width)&&Number.isFinite(large.height));
});
