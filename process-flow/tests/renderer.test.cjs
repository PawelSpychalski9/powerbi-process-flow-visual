const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {parseGraph} = require('../.tmp/tests/graph.js');
const {renderGraph} = require('../.tmp/tests/renderer.js');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {dataView, sample} = require('./fixture.cjs');

test('zoom controls scale the graph, fit both dimensions, and retain scrollable SVG dimensions', () => {
    const {container, options} = fixture();
    renderGraph(container, parseGraph(sample()), {...options, width: 900, height: 400});
    const output = container.querySelector('[aria-label="Zoom level"]');
    const svg = container.querySelector('svg');
    const originalWidth = Number(svg.getAttribute('width'));
    assert.equal(output.textContent, '100%');
    container.querySelector('[aria-label="Zoom in"]').click();
    assert.equal(output.textContent, '125%');
    assert.equal(Number(svg.getAttribute('width')), originalWidth * 1.25);
    container.querySelector('[aria-label="Zoom out"]').click();
    assert.equal(output.textContent, '100%');
    container.querySelector('[aria-label="Fit graph to view"]').click();
    assert.ok(Number(svg.getAttribute('width')) <= 900);
    assert.ok(Number(svg.getAttribute('height')) <= 330);
    assert.equal(container.querySelector('[aria-label="Fit graph to view"]').getAttribute('aria-pressed'), 'true');
    assert.equal(container.querySelector('.process-flow-viewport').scrollLeft, 0);
    assert.equal(container.querySelectorAll('.process-flow-node').length, 8);
    for (let i = 0; i < 40; i++) container.querySelector('[aria-label="Zoom in"]').click();
    assert.equal(output.textContent, '400%');
    assert.equal(container.querySelector('[aria-label="Zoom in"]').disabled, true);
    for (let i = 0; i < 40; i++) container.querySelector('[aria-label="Zoom out"]').click();
    assert.equal(output.textContent, '10%');
    assert.equal(container.querySelector('[aria-label="Zoom out"]').disabled, true);
});

test('manual zoom survives host updates; fit mode recalculates on resize without duplicating controls', () => {
    const {container} = fixture();
    const host = {
        colorPalette: {getColor: () => ({value: '#1670a5'})},
        eventService: {renderingStarted() {}, renderingFinished() {}, renderingFailed() {}}
    };
    const view = new ProcessFlowView({element: container, host});
    view.update({dataViews: [sample()], viewport: {width: 1000, height: 500}, type: 2});
    container.querySelector('[aria-label="Zoom in"]').click();
    view.update({viewport: {width: 900, height: 400}, type: 4});
    assert.equal(container.querySelector('output').textContent, '125%');
    container.querySelector('[aria-label="Fit graph to view"]').click();
    const fitWidth = Number(container.querySelector('svg').getAttribute('width'));
    view.update({viewport: {width: 450, height: 200}, type: 4});
    assert.ok(Number(container.querySelector('svg').getAttribute('width')) < fitWidth);
    assert.ok(Number(container.querySelector('svg').getAttribute('width')) <= 450);
    assert.equal(container.querySelectorAll('.process-flow-zoom').length, 1);
    assert.equal(container.querySelectorAll('svg').length, 1);
    assert.equal(container.querySelector('[aria-label="Fit graph to view"]').getAttribute('aria-pressed'), 'true');
    view.destroy();
});

test('fit remains meaningful for very large graphs and zoom can increase from a sub-10% fit', () => {
    const {container, options} = fixture();
    const graph = parseGraph(dataView(Array.from({length: 499}, (_, i) => [`N${i}`, `N${i+1}`, i]), ['source', 'target', 'value']));
    renderGraph(container, graph, {...options, width: 500, height: 300});
    container.querySelector('[aria-label="Fit graph to view"]').click();
    const width = Number(container.querySelector('svg').getAttribute('width'));
    assert.ok(width <= 500);
    assert.notEqual(container.querySelector('output').textContent, '0%');
    assert.equal(container.querySelector('[aria-label="Zoom out"]').disabled, true);
    container.querySelector('[aria-label="Zoom in"]').click();
    assert.ok(Number(container.querySelector('svg').getAttribute('width')) > width);
});

function fixture() {
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    const container = dom.window.document.getElementById('root');
    return {dom, container, options: {width: 1200, height: 650, accent: '#1670a5', markerId: 'test-arrow'}};
}

test('SVG has eight nodes, nine directed paths, separate signed labels, and optional titles', () => {
    const {container, options} = fixture();
    renderGraph(container, parseGraph(sample()), options);
    assert.equal(container.querySelectorAll('svg').length, 1);
    assert.equal(container.querySelectorAll('.process-flow-node').length, 8);
    assert.equal(container.querySelectorAll('.process-flow-edge').length, 9);
    assert.equal(container.querySelectorAll('.process-flow-value').length, 9);
    assert.equal(container.querySelectorAll('.process-flow-label').length, 9);
    assert.equal(container.querySelector('marker').id, 'test-arrow');
    assert.equal(container.querySelector('.process-flow-edge').getAttribute('marker-end'), 'url(#test-arrow)');
    assert.match(container.textContent, /-18/);
    assert.match(container.textContent, /Ingestion/);
    assert.match(container.querySelector('[role="status"]').textContent, /8 nodes · 9 edges/);
});

test('repeated render, resize, changed data, and empty state replace prior SVG instead of duplicating it', () => {
    const {container, options} = fixture();
    for (const width of [1200, 800, 360, 1600]) renderGraph(container, parseGraph(sample()), {...options, width});
    assert.equal(container.querySelectorAll('svg').length, 1);
    assert.equal(container.querySelectorAll('.process-flow-node').length, 8);
    assert.equal(container.style.width, '1600px');
    renderGraph(container, parseGraph(dataView([['A', 'B', 0]], ['source', 'target', 'value'])), options);
    assert.equal(container.querySelectorAll('.process-flow-node').length, 2);
    assert.equal(container.querySelectorAll('.process-flow-value').length, 1);
    assert.match(container.textContent, /0/);
    renderGraph(container, parseGraph(), options);
    assert.equal(container.querySelectorAll('svg').length, 0);
    assert.match(container.textContent, /Assign Source/);
});

test('dataset markup is rendered only as text and never creates executable elements', () => {
    const {container, options} = fixture();
    const payload = '<script>alert(1)</script>';
    const result = parseGraph(dataView([['A', 'B', 1, null, payload, null, '<img src=x onerror=alert(1)>']]));
    renderGraph(container, result, options);
    assert.equal(container.querySelector('script, img, foreignObject'), null);
    assert.ok(container.textContent.includes('<script>'));
    assert.equal(container.querySelector('[data-node-id="A"]').getAttribute('aria-label'), `${payload} (A)`);
});

test('warnings and invalid data are accessible text states; zero viewport avoids rendering', () => {
    const {container, options} = fixture();
    const result = parseGraph(dataView([['A', 'B', 1], [null, 'B', 1]], ['source', 'target', 'value']));
    renderGraph(container, result, options);
    assert.equal(container.querySelectorAll('.process-flow-warning[role="status"]').length, 1);
    renderGraph(container, result, {...options, width: 0});
    assert.equal(container.querySelectorAll('svg').length, 0);
    renderGraph(container, parseGraph(dataView([['A', 'B', null]], ['source', 'target', 'value'])), options);
    assert.equal(container.querySelectorAll('svg').length, 0);
    assert.match(container.textContent, /No valid connections/);
});

test('host lifecycle preserves data on resize, clears on empty data update, and cleans up', () => {
    const {container} = fixture();
    const events = [];
    const host = {
        locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
        eventService: {
            renderingStarted: () => events.push('start'), renderingFinished: () => events.push('finish'),
            renderingFailed: () => events.push('failed')
        }
    };
    const view = new ProcessFlowView({element: container, host});
    view.update({dataViews: [sample()], viewport: {width: 1200, height: 600}, type: 2});
    view.update({viewport: {width: 500, height: 400}, type: 4});
    assert.equal(container.querySelectorAll('.process-flow-node').length, 8);
    assert.equal(container.querySelector('.process-flow').style.width, '500px');
    assert.deepEqual(events, ['start', 'finish', 'start', 'finish']);
    view.update({dataViews: [], viewport: {width: 500, height: 400}, type: 2});
    assert.equal(container.querySelectorAll('svg').length, 0);
    assert.equal(view.getFormattingModel().cards.length,6);
    view.destroy();
    assert.equal(container.children.length, 0);
});

test('separate visual instances use distinct arrow marker IDs and recover from an exception', () => {
    const {container, dom} = fixture();
    const other = dom.window.document.createElement('div');
    container.appendChild(other);
    const host = {
        colorPalette: {getColor: () => ({value: '#1670a5'})},
        eventService: {renderingStarted() {}, renderingFinished() {}, renderingFailed() {}}
    };
    const first = new ProcessFlowView({element: container, host});
    const second = new ProcessFlowView({element: other, host});
    const update = {dataViews: [sample()], viewport: {width: 1200, height: 600}, type: 2};
    first.update(update);
    second.update(update);
    assert.equal(new Set([...container.querySelectorAll('marker')].map(marker => marker.id)).size, 2);
    const original = host.colorPalette.getColor;
    host.colorPalette.getColor = () => {throw new Error('Test host error');};
    second.update(update);
    assert.match(other.textContent, /Unable to display/);
    host.colorPalette.getColor = original;
    second.update(update);
    assert.equal(other.querySelector('[role="alert"]'), null);
    assert.equal(other.querySelectorAll('.process-flow-node').length, 8);
});
