const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {selectionHost, identity} = require('./selection-host.cjs');
const selection = selectionHost();
window.previewSelectionCalls = selection.calls;
window.restorePreviewSelection = keys => selection.restore(keys.map(key => identity(key)));
const dataView = JSON.parse(document.getElementById('preview-data').textContent);
dataView.table.identity = dataView.table.rows.map((_, i) => ({key: `preview-row-${i}`}));
window.previewTooltipCalls = [];
const host = {
    locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
    hostCapabilities: {allowInteractions: true},
    tooltipService: {
        enabled: () => true,
        show: options => window.previewTooltipCalls.push({type: 'show', ...options}),
        move: options => window.previewTooltipCalls.push({type: 'move', ...options}),
        hide: options => window.previewTooltipCalls.push({type: 'hide', ...options})
    },
    createSelectionManager: () => selection.manager,
    createSelectionIdBuilder: selection.createSelectionIdBuilder,
    eventService: {
        renderingStarted() {}, renderingFinished() {},
        renderingFailed(_options, reason) {throw new Error(reason);}
    }
};
const view = new ProcessFlowView({element: document.getElementById('root'), host});
const initialSize = {width: Math.min(1960, window.innerWidth), height: Math.min(540, window.innerHeight)};
view.update({dataViews: [dataView], viewport: initialSize, type: 2});
let viewport = initialSize;
window.resizePreview = (width, height) => {
    viewport = {width, height};
    view.update({viewport, type: 4});
};
window.setPreviewObjects = objects => {
    dataView.metadata.objects = objects;
    view.update({dataViews: [dataView], viewport, type: 2});
};
window.setPreviewTheme = (foreground, background, accent, isHighContrast = false) => {
    host.colorPalette = {getColor: () => ({value: accent}), foreground: {value: foreground},
        background: {value: background}, foregroundSelected: {value: '#00ffff'}, isHighContrast};
    view.update({viewport, type: 16});
};
window.setPreviewInteractions = allowed => {
    host.hostCapabilities.allowInteractions = allowed;
    view.update({viewport, type: 16});
};
window.setPreviewState = state => {
    const data = state === 'landing' ? undefined : state === 'empty' ?
        {...dataView,table:{...dataView.table,rows:[]}} : state === 'invalid' ?
        {...dataView,table:{...dataView.table,rows:[['A','B',null]]}} : dataView;
    view.update({dataViews: data ? [data] : [], viewport, type: 2});
};
window.getPreviewFormattingModel = () => view.getFormattingModel();
