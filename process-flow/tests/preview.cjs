const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {sample} = require('./fixture.cjs');
const toolkitDirectory = path.dirname(require.resolve('powerbi-visuals-tools'));
const less = require(require.resolve('less', {paths: [toolkitDirectory]}));
const webpack = require(require.resolve('webpack', {paths: [toolkitDirectory]}));

async function main() {
    const dom = new JSDOM('<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Process Flow sample preview</title></head><body><div id="root"></div></body></html>');
    const {document} = dom.window;
    const {css} = await less.render(fs.readFileSync('style/visual.less', 'utf8'));
    const style = document.createElement('style');
    style.textContent = css + '\nbody {margin: 0;}';
    document.head.appendChild(style);
    await new Promise((resolve, reject) => {
        const compiler = webpack({
            mode: 'production', devtool: false, entry: path.resolve('tests/preview-browser.cjs'),
            output: {path: path.resolve('.tmp'), filename: 'preview-browser.js'}
        });
        compiler.run((error, stats) => compiler.close(closeError => {
            if (error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString()));
            else resolve();
        }));
    });
    const data = document.createElement('script');
    data.id = 'preview-data';
    data.type = 'application/json';
    data.textContent = JSON.stringify(sample()).replace(/</g, '\\u003c');
    document.body.appendChild(data);
    const script = document.createElement('script');
    script.src = './preview-browser.js';
    document.body.appendChild(script);
    const output = path.resolve('.tmp/sample-preview.html');
    fs.writeFileSync(output, dom.serialize());
    console.log(output);
}

main().catch(error => {console.error(error); process.exitCode = 1;});
