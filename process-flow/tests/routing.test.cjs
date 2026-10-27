const {test} = require('node:test');
const assert = require('node:assert/strict');
const {layoutGraph} = require('../.tmp/tests/layout.js');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {readSettings,buildFormattingModel} = require('../.tmp/tests/formatting.js');
const {polylinePath} = require('../.tmp/tests/routing.js');
const {sample,dataView} = require('./fixture.cjs');

function endpoints(path) {
    const values=path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
    return [...values.slice(0,2),...values.slice(-2)];
}

function assertOrthogonal(path) {
    assert.doesNotMatch(path,/[CQ]/);
    const values=path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
    for(let i=2;i<values.length;i+=2) assert.ok(Math.abs(values[i]-values[i-2])<1e-7 || Math.abs(values[i+1]-values[i-1])<1e-7,`Diagonal segment: ${path}`);
}

test('right-angle format switch defaults off, reads saved metadata, and exposes a native toggle', () => {
    assert.equal(readSettings().orthogonalEdges,false);
    const settings=readSettings({edges:{rightAngles:true}});
    assert.equal(settings.orthogonalEdges,true);
    const card=buildFormattingModel(settings).cards.find(card=>card.displayName==='Connections');
    const control=card.groups[0].slices.find(slice=>slice.control.properties.descriptor.propertyName==='rightAngles');
    assert.equal(control.control.type,'ToggleSwitch');
    assert.equal(control.control.properties.value,true);
    assert.ok(card.revertToDefaultDescriptors.some(descriptor=>descriptor.propertyName==='rightAngles'));
});

test('switch changes flat and compound connections while preserving nodes, labels, values, and endpoints', () => {
    const flat=parseGraph(dataView([['A','B',-1],['A','C',-2],['B','D',0],['C','D',2]],['source','target','value']));
    for(const graph of [flat,parseGraph(sample())]) {
        const smooth=layoutGraph(graph);
        const angular=layoutGraph(graph,'en-US',{...readSettings(),orthogonalEdges:true});
        assert.ok(smooth.edges.some(edge=>/[CQ]/.test(edge.path)));
        assert.deepEqual(angular.nodes,smooth.nodes);
        assert.deepEqual(angular.groups,smooth.groups);
        for(let i=0;i<smooth.edges.length;i++) {
            assertOrthogonal(angular.edges[i].path);
            assert.deepEqual(endpoints(angular.edges[i].path),endpoints(smooth.edges[i].path));
            assert.deepEqual({...angular.edges[i],path:''},{...smooth.edges[i],path:''});
        }
    }
});

test('cycles, self-loops, long routes, and parallel edges support both styles without invalid coordinates', () => {
    const graph=parseGraph(dataView([['A','B',1],['B','A',-1],['A','A',0],['A','B',2],['X','Y',1],['Y','Z',1],['X','Z',2]],['source','target','value']));
    const angular=layoutGraph(graph,'en-US',{...readSettings(),orthogonalEdges:true});
    for(const edge of angular.edges) {assertOrthogonal(edge.path);assert.doesNotMatch(edge.path,/NaN|Infinity/);}
    assert.equal(new Set(angular.edges.map(edge=>edge.path)).size,angular.edges.length);
    assert.ok(layoutGraph(graph).edges.some(edge=>edge.path.includes(' Q ')));
});

test('rounded corners preserve corridor bounds and exact start/end ports, including short and repeated legs', () => {
    const points=[{x:0,y:0},{x:8,y:0},{x:8,y:0},{x:8,y:5},{x:30,y:5}];
    const smooth=polylinePath(points,false),angular=polylinePath(points,true);
    assert.match(smooth,/ Q /);
    assertOrthogonal(angular);
    assert.deepEqual(endpoints(smooth),[0,0,30,5]);
    assert.deepEqual(endpoints(angular),[0,0,30,5]);
    assert.doesNotMatch(smooth,/NaN|Infinity/);
});
