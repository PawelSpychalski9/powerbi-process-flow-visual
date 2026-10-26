const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
    const browserPath = [process.env.PROCESS_FLOW_BROWSER_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    ].find(candidate => candidate && fs.existsSync(candidate));
    if (!browserPath) throw new Error('Set PROCESS_FLOW_BROWSER_PATH to a Chrome or Edge executable.');
    const profile = path.resolve(`.tmp/zoom-browser-${process.pid}`);
    const browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1100,650', 'about:blank'
    ], {windowsHide: true, stdio: 'ignore'});
    let socket;
    let command;
    try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        for (let attempt = 0; !fs.existsSync(portFile) && attempt < 150; attempt++) await delay(100);
        if (!fs.existsSync(portFile)) throw new Error('Browser debugging endpoint did not start.');
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {socket.addEventListener('open', resolve); socket.addEventListener('error', reject);});
        let sequence = 0;
        const pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            const callback = pending.get(message.id);
            if (callback) {
                pending.delete(message.id);
                clearTimeout(callback.timeout);
                if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
                else callback.resolve(message.result);
            }
        });
        command = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timeout = setTimeout(() => {pending.delete(id); reject(new Error(`Timed out: ${method}`));}, 10000);
            pending.set(id, {resolve, reject, timeout});
            socket.send(JSON.stringify({id, method, params}));
        });
        const evaluate = async expression => {
            const result = await command('Runtime.evaluate', {expression, returnByValue: true});
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await command('Page.navigate', {url: pathToFileURL(path.resolve('.tmp/sample-preview.html')).href});
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate('typeof window.resizePreview === "function"')) break;
            await delay(100);
        }
        await evaluate('window.resizePreview(900, 400)');
        assert.equal(await evaluate('document.querySelector("output").textContent'), '100%');
        await evaluate(`document.querySelector('[aria-label="Fit graph to view"]').click()`);
        const fits = () => evaluate(`(() => {
            const viewport = document.querySelector('.process-flow-viewport');
            return {width: viewport.clientWidth, height: viewport.clientHeight,
                scrollWidth: viewport.scrollWidth, scrollHeight: viewport.scrollHeight};
        })()`);
        let size = await fits();
        assert.ok(size.scrollWidth <= size.width + 1, JSON.stringify(size));
        assert.ok(size.scrollHeight <= size.height + 1, JSON.stringify(size));
        await evaluate('window.resizePreview(500, 250)');
        size = await fits();
        assert.ok(size.scrollWidth <= size.width + 1, JSON.stringify(size));
        assert.ok(size.scrollHeight <= size.height + 1, JSON.stringify(size));
        const fitScreenshot = await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/zoom-fit.png', Buffer.from(fitScreenshot.data, 'base64'));
        await evaluate(`document.querySelector('[aria-label="Zoom in"]').click()`);
        size = await fits();
        assert.ok(size.scrollWidth > size.width, JSON.stringify(size));
        await evaluate('document.querySelector(".process-flow-viewport").scrollLeft = 80');
        assert.ok(await evaluate('document.querySelector(".process-flow-viewport").scrollLeft > 0'));
        const toolbar = await evaluate(`(() => {
            const root = document.querySelector('.process-flow').getBoundingClientRect();
            const toolbar = document.querySelector('.process-flow-zoom').getBoundingClientRect();
            return {rootBottom: root.bottom, toolbarBottom: toolbar.bottom, toolbarLeft: toolbar.left, rootLeft: root.left};
        })()`);
        assert.equal(toolbar.rootBottom, toolbar.toolbarBottom);
        assert.equal(toolbar.rootLeft, toolbar.toolbarLeft);
        const zoomScreenshot = await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/zoom-scroll.png', Buffer.from(zoomScreenshot.data, 'base64'));
        console.log('Browser zoom checks passed: Fit, resize, zoom, real overflow/scrolling, and bottom-left controls.');
    } finally {
        if (command && socket?.readyState === WebSocket.OPEN) await command('Browser.close').catch(() => {});
        socket?.close();
        if (browser.exitCode === null) browser.kill();
    }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
