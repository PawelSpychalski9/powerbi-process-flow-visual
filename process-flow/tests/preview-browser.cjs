const {ProcessFlowView} = require('../.tmp/tests/view.js');
const dataView = JSON.parse(document.getElementById('preview-data').textContent);
const host = {
    locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
    hostCapabilities: {allowInteractions: true},
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
