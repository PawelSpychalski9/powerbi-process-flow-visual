const {ProcessFlowView} = require('../.tmp/tests/view.js');
const dataView = JSON.parse(document.getElementById('preview-data').textContent);
const host = {
    locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
    eventService: {
        renderingStarted() {}, renderingFinished() {},
        renderingFailed(_options, reason) {throw new Error(reason);}
    }
};
const view = new ProcessFlowView({element: document.getElementById('root'), host});
const initialSize = {width: Math.min(1960, window.innerWidth), height: Math.min(540, window.innerHeight)};
view.update({dataViews: [dataView], viewport: initialSize, type: 2});
window.resizePreview = (width, height) => view.update({viewport: {width, height}, type: 4});
