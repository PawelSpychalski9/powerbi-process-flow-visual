const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Ajv = require('ajv');
const {parseGraph, roles, MAX_EDGES, MAX_NODES} = require('../.tmp/tests/graph.js');
const {dataView, sample} = require('./fixture.cjs');

test('sample retains eight nodes, nine signed edges, branches, merges, and unique Tooltip IDs', () => {
    const graph = parseGraph(sample());
    assert.equal(graph.status, 'ready');
    assert.equal(graph.nodes.length, 8);
    assert.equal(graph.edges.length, 9);
    assert.equal(new Set(graph.edges.map(edge => edge.tooltipId)).size, 9);
    assert.equal(graph.edges.find(edge => edge.source === 'B' && edge.target === 'C').value, -18);
    assert.equal(graph.edges.filter(edge => edge.source === 'B').length, 2);
    assert.equal(graph.edges.filter(edge => edge.target === 'E').length, 2);
    assert.equal(graph.nodes.find(node => node.id === 'H').title, 'H');
    assert.equal(graph.warnings.length, 0);
});

test('roles and table mapping conform to the installed SDK schema', () => {
    const capabilities = JSON.parse(fs.readFileSync('capabilities.json', 'utf8'));
    const schema = JSON.parse(fs.readFileSync('node_modules/powerbi-visuals-api/schema.capabilities.json', 'utf8'));
    const validate = new Ajv({strict: false}).compile(schema);
    assert.equal(validate(capabilities), true, JSON.stringify(validate.errors));
    assert.deepEqual(capabilities.dataRoles.map(role => role.name), [...roles]);
    assert.deepEqual(capabilities.dataViewMappings[0].table.rows.select.map(item => item.for.in), [...roles]);
    for (const condition of capabilities.dataViewMappings[0].conditions) {
        assert.ok(Object.values(condition).filter(range => range.min >= 1).length <= 1);
    }
});

test('optional fields may be omitted and required roles are identified by role, not position', () => {
    const graph = parseGraph(dataView([[0, 'B', 'A']], ['value', 'target', 'source']));
    assert.equal(graph.status, 'ready');
    assert.equal(graph.edges[0].value, 0);
    assert.equal(graph.edges[0].source, 'A');
    assert.equal(graph.nodes[0].title, 'A');
});

test('missing roles, empty views, empty tables, and duplicate assignments have readable states', () => {
    assert.equal(parseGraph().status, 'empty');
    assert.match(parseGraph(dataView([], ['source'])).message, /target, value/);
    assert.equal(parseGraph(dataView([])).status, 'empty');
    assert.equal(parseGraph(dataView([['A', 'B', 1]], ['source', 'source', 'value'])).status, 'invalid');
});

test('invalid IDs and non-finite values are skipped with warnings; valid zero survives', () => {
    const graph = parseGraph(dataView([
        [null, 'B', 2], ['A', '', 2], ['A', 'B', null], ['A', 'B', NaN],
        ['A', 'B', Infinity], ['A', 'B', '2'], [123, 'B', 2], [' ', 'B', 2], ['A', 'B', 0]
    ], ['source', 'target', 'value']));
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.skippedRows, 8);
    assert.match(graph.warnings.join(' '), /8 invalid/);
    assert.equal(parseGraph(dataView([['A', 'B', null]], ['source', 'target', 'value'])).status, 'invalid');
});

test('raw IDs remain distinct, and untrusted text stays in the graph as plain text', () => {
    const graph = parseGraph(dataView([['A', ' A', -1, null, '<script>alert(1)</script>']]));
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.nodes.find(node => node.id === 'A').title, '<script>alert(1)</script>');
});

test('parallel rows and repeated keys remain separate and have distinct edge identities', () => {
    const graph = parseGraph(dataView([
        ['A', 'B', -1, 'T1'], ['A', 'B', -1, 'T1'], ['A', 'B', -2, 'T2']
    ]));
    assert.equal(graph.edges.length, 3);
    assert.equal(new Set(graph.edges.map(edge => edge.id)).size, 3);
    assert.match(graph.warnings.join(' '), /Repeated Tooltip IDs/);
});

test('metadata policy and edge ordering are independent of input row order', () => {
    const rows = [['A', 'B', 1, 'T1', 'Zulu', 'Z'], ['A', 'C', -1, 'T2', 'Alpha', 'A']];
    const first = parseGraph(dataView(rows));
    const reversed = parseGraph(dataView([...rows].reverse()));
    assert.deepEqual(first.nodes, reversed.nodes);
    assert.deepEqual(first.edges.map(edge => edge.id), reversed.edges.map(edge => edge.id));
    assert.equal(first.nodes[0].title, 'Alpha');
    assert.match(first.warnings.join(' '), /Conflicting/);
});

test('cycles, self-loops, and disconnected components are retained', () => {
    const graph = parseGraph(dataView([['A', 'B', 1], ['B', 'A', -2], ['A', 'A', 0], ['X', 'Y', 3]], ['source', 'target', 'value']));
    assert.equal(graph.nodes.length, 4);
    assert.equal(graph.edges.length, 4);
});

test('oversized and segmented results fail explicitly without displaying partial edges', () => {
    const row = ['A', 'B', 1];
    assert.equal(parseGraph(dataView(Array(MAX_EDGES + 1).fill(row), ['source', 'target', 'value'])).status, 'invalid');
    const large = parseGraph(dataView(Array.from({length: MAX_NODES}, (_, i) => [`N${i}`, `N${i + 1}`, 1]), ['source', 'target', 'value']));
    assert.equal(large.status, 'invalid');
    assert.equal(large.edges.length, 0);
    const segmented = dataView([row], ['source', 'target', 'value']);
    segmented.metadata.segment = {};
    assert.match(parseGraph(segmented).message, /incomplete/);
});
