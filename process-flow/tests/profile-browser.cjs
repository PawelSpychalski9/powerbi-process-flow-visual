const {parseGraph} = require('../.tmp/tests/graph.js');
const {layoutGraph} = require('../.tmp/tests/layout.js');
const {ProcessFlowView} = require('../.tmp/tests/view.js');
const {selectionHost, identity} = require('./selection-host.cjs');
const {stressCases, stressData} = require('./stress-fixtures.cjs');

window.profileGraphs = async () => {
    const results = [];
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (const [kind, count] of stressCases) {
        const data = stressData(kind, count);
        const root = document.getElementById('root');
        root.replaceChildren();
        const selection = selectionHost();
        const host = {locale: 'en-US', colorPalette: {getColor: () => ({value: '#1670a5'})},
            eventService: {renderingStarted() {}, renderingFinished() {}, renderingFailed(_o, reason) {throw Error(reason);}},
            createSelectionManager: () => selection.manager, createSelectionIdBuilder: selection.createSelectionIdBuilder};
        const view = new ProcessFlowView({element: root, host});
        const samples = [];
        for (let repeat = 0; repeat < 6; repeat++) {
            let start = performance.now();
            const graph = parseGraph(data);
            if (graph.status !== 'ready') throw Error(graph.message);
            const parseMs = performance.now() - start;
            start = performance.now();
            const layout = layoutGraph(graph);
            const layoutMs = performance.now() - start;
            start = performance.now();
            view.update({dataViews: [data], type: 2, viewport: {width: 1000,height: 600}});
            root.querySelector('svg').getBoundingClientRect();
            const updateMs = performance.now() - start;
            await frame(); await frame();
            const frameMs = performance.now() - start;
            start = performance.now();
            selection.restore(data.table.identity.map(row => identity(row.key)));
            root.querySelector('svg').getBoundingClientRect();
            const selectAllMs = performance.now() - start;
            if (repeat) samples.push({parseMs, layoutMs, updateMs, frameMs, selectAllMs});
            selection.restore([]);
            if (repeat === 5) results.push({kind,nodes:graph.nodes.length,edges:graph.edges.length,
                width:layout.width,height:layout.height,domElements:root.querySelectorAll('*').length,
                samples,median:Object.fromEntries(Object.keys(samples[0]).map(key =>
                    [key, samples.map(sample => sample[key]).sort((a,b)=>a-b)[2]]))});
        }
        view.destroy();
    }
    return {userAgent: navigator.userAgent, viewport:{width:1000,height:600}, repeats:5, results};
};
