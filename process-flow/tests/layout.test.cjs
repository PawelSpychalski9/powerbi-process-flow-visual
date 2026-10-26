const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {layoutGraph, shorten} = require('../.tmp/tests/layout.js');
const {dataView, sample} = require('./fixture.cjs');

function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('sample layout progresses left to right and keeps branches and merges distinct', () => {
    const layout = layoutGraph(parseGraph(sample()));
    const nodes = new Map(layout.nodes.map(node => [node.id, node]));
    for (const edge of layout.edges) assert.ok(nodes.get(edge.source).x < nodes.get(edge.target).x);
    assert.equal(nodes.get('C').rank, nodes.get('D').rank);
    assert.notEqual(nodes.get('C').y, nodes.get('D').y);
    assert.equal(nodes.get('F').rank, nodes.get('G').rank);
    assert.ok(nodes.get('E').rank > nodes.get('D').rank);
    assert.equal(layout.edges.find(edge => edge.value === -18).valueText, '-18');
});

test('sample node and edge-label boxes do not overlap', () => {
    const layout = layoutGraph(parseGraph(sample()));
    const labels = layout.edges.map(edge => ({x: edge.labelX - edge.labelWidth / 2, y: edge.labelY - edge.labelHeight / 2, width: edge.labelWidth, height: edge.labelHeight}));
    const boxes = [...layout.nodes, ...labels];
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) assert.equal(intersects(boxes[i], boxes[j]), false, `Boxes ${i} and ${j}`);
    }
});

test('layout is stable across repeated updates and reordered input rows', () => {
    const first = sample();
    const reversed = {...first, table: {...first.table, rows: [...first.table.rows].reverse()}};
    const a = layoutGraph(parseGraph(first));
    const b = layoutGraph(parseGraph(reversed));
    assert.deepEqual(a.nodes, b.nodes);
    assert.deepEqual(a.edges.map(({rowIndex, ...edge}) => edge), b.edges.map(({rowIndex, ...edge}) => edge));
});

test('cycles, self-loops, disconnected graphs, and parallel edges terminate with distinct routes', () => {
    const graph = parseGraph(dataView([
        ['A', 'B', 1], ['B', 'A', -1], ['A', 'A', 0], ['A', 'A', 2],
        ['X', 'Y', 1], ['X', 'Y', 2], ['Y', 'Z', 3], ['X', 'Z', 4]
    ], ['source', 'target', 'value']));
    const layout = layoutGraph(graph);
    assert.equal(layout.nodes.length, 5);
    assert.equal(layout.edges.length, 8);
    assert.equal(new Set(layout.edges.map(edge => edge.path)).size, 8);
    for (const edge of layout.edges) {
        assert.doesNotMatch(edge.path, /NaN|Infinity|undefined/);
        assert.ok(edge.labelY - edge.labelHeight / 2 >= 0);
        assert.ok(edge.labelY + edge.labelHeight / 2 <= layout.height);
    }
});

test('long text is bounded without splitting Unicode code points; locale changes number labels', () => {
    const graph = parseGraph(dataView([['A', 'B', -1234.5, null, 'A very long title '.repeat(20), null, 'A very long label '.repeat(20)]]));
    const layout = layoutGraph(graph, 'de-DE');
    assert.match(layout.edges[0].valueText, /-1\.234,5/);
    assert.ok(layout.nodes.every(node => node.lines.every(line => Array.from(line).length <= 16)));
    assert.ok(layout.edges[0].labelWidth <= 166);
    assert.equal(shorten('😀😀😀😀', 3), '😀😀…');
    assert.doesNotThrow(() => layoutGraph(graph, 'invalid_locale'));
});

test('wide characters and extreme numbers stay within bounded label boxes and preserve signs', () => {
    const graph = parseGraph(dataView([
        ['A', 'B', -Number.MAX_VALUE, 'T1', 'W'.repeat(100), null, 'W'.repeat(100)],
        ['B', 'C', Number.MIN_VALUE, 'T2', '界'.repeat(100)]
    ]));
    const layout = layoutGraph(graph);
    assert.ok(layout.nodes.every(node => node.lines.every(line => Array.from(line).length <= 10)));
    assert.ok(layout.edges.every(edge => edge.labelWidth <= 166));
    assert.match(layout.edges.find(edge => edge.value < 0).valueText, /^-/);
    assert.ok(layout.edges.every(edge => /E/.test(edge.valueText)));
});

test('empty layout and a 500-node chain are bounded and finite', () => {
    assert.equal(layoutGraph({nodes: [], edges: []}).width, 0);
    const graph = parseGraph(dataView(Array.from({length: 499}, (_, i) => [`N${i}`, `N${i+1}`, i]), ['source', 'target', 'value']));
    const layout = layoutGraph(graph);
    assert.equal(layout.nodes.length, 500);
    assert.equal(layout.edges.length, 499);
    assert.ok(Number.isFinite(layout.width));
    assert.ok(Number.isFinite(layout.height));
});
