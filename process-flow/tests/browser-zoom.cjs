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
            const timeout = setTimeout(() => {pending.delete(id); reject(new Error(`Timed out: ${method}`));}, process.argv.includes('--profile') ? 120000 : 10000);
            pending.set(id, {resolve, reject, timeout});
            socket.send(JSON.stringify({id, method, params}));
        });
        const evaluate = async expression => {
            const result = await command('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await command('Page.navigate', {url: pathToFileURL(path.resolve('.tmp/sample-preview.html')).href});
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate('typeof window.resizePreview === "function"')) break;
            await delay(100);
        }
        if (process.argv.includes('--profile')) {
            const report = await evaluate('window.profileGraphs()');
            const os = require('node:os');
            report.environment = {date:new Date().toISOString(),node:process.version,platform:process.platform,
                cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length};
            fs.writeFileSync('.tmp/performance.json', JSON.stringify(report,null,2));
            const {stressData,stressCases}=require('./stress-fixtures.cjs');
            fs.mkdirSync('.tmp/stress-data',{recursive:true});
            const header='Source,Target,Value,Tooltip ID,Node Title,Node Description,Label,Group,Flow Group';
            const cell=value=>typeof value==='string' ? '"'+value.replace(/"/g,'""')+'"' : value ?? '';
            for (const [kind,count] of stressCases) fs.writeFileSync(`.tmp/stress-data/${kind}-${count}.csv`,
                header+'\n'+stressData(kind,count).table.rows.map(row=>row.map(cell).join(',')).join('\n')+'\n');
            console.table(report.results.map(row=>({kind:row.kind,nodes:row.nodes,edges:row.edges,
                ...Object.fromEntries(Object.entries(row.median).map(([k,v])=>[k,Number(v.toFixed(2))]))})));
            console.log('Saved .tmp/performance.json. Mock host; frameMs includes two animation-frame waits, not a GPU paint measurement.');
            return;
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
        const groupBounds = await evaluate(`(() => {
            const viewport=document.querySelector('.process-flow-viewport').getBoundingClientRect();
            return [...document.querySelectorAll('.process-flow-group rect')].map(rect=>{
                const box=rect.getBoundingClientRect();
                return {inside:box.left>=viewport.left-1 && box.top>=viewport.top-1 && box.right<=viewport.right+1 && box.bottom<=viewport.bottom+1};
            });
        })()`);
        assert.equal(groupBounds.length,2);
        assert.ok(groupBounds.every(group=>group.inside));
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
        await evaluate(`window.resizePreview(1000, 520); window.setPreviewObjects({
            nodes:{useTheme:false,fill:{solid:{color:'#fff3d6'}},border:{solid:{color:'#784600'}},borderWidth:3},
            edges:{useTheme:false,color:{solid:{color:'#006b50'}},width:4},
            labels:{fontSize:20,automaticValues:false,decimalPlaces:2,thousandsSeparator:false},
            layout:{horizontalSpacing:300,verticalSpacing:150},
            canvas:{useTheme:false,background:{solid:{color:'#f5f7ff'}},textColor:{solid:{color:'#242448'}}},
            flowGroups:{useTheme:false,background:{solid:{color:'#ddeeff'}},border:{solid:{color:'#3848a0'}},borderWidth:3,radius:16,padding:40,titleSize:20,titleColor:{solid:{color:'#3848a0'}}}
        }); document.querySelector('[aria-label="Fit graph to view"]').click()`);
        const custom = await evaluate(`(() => ({
            fill:document.querySelector('.process-flow-node rect').getAttribute('fill'),
            edge:document.querySelector('.process-flow-edge').getAttribute('stroke'),
            width:document.querySelector('.process-flow-edge').getAttribute('stroke-width'),
            textSize:getComputedStyle(document.querySelector('.process-flow-value')).fontSize,
            background:getComputedStyle(document.querySelector('.process-flow')).backgroundColor,
            values:[...document.querySelectorAll('.process-flow-value')].map(text=>text.textContent),
            cards:window.getPreviewFormattingModel().cards.length,
            groupFill:document.querySelector('.process-flow-group rect').getAttribute('fill'),
            groupBorder:document.querySelector('.process-flow-group rect').getAttribute('stroke'),
            groupTitleSize:getComputedStyle(document.querySelector('.process-flow-group-title')).fontSize
        }))()`);
        assert.equal(custom.fill,'#fff3d6');
        assert.equal(custom.edge,'#006b50');
        assert.equal(custom.width,'4');
        assert.equal(custom.textSize,'20px');
        assert.equal(custom.background,'rgb(245, 247, 255)');
        assert.ok(custom.values.includes('-18.00'));
        assert.equal(custom.cards,6);
        assert.equal(custom.groupFill,'#ddeeff');
        assert.equal(custom.groupBorder,'#3848a0');
        assert.equal(custom.groupTitleSize,'20px');
        const customScreenshot = await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/m03-custom.png',Buffer.from(customScreenshot.data,'base64'));
        fs.writeFileSync('.tmp/flow-groups.png',Buffer.from(customScreenshot.data,'base64'));
        await evaluate(`window.setPreviewTheme('#ffff00','#000000','#ff0000',true)`);
        const contrast = await evaluate(`(() => ({
            fill:document.querySelector('.process-flow-node rect').getAttribute('fill'),
            stroke:document.querySelector('.process-flow-node rect').getAttribute('stroke'),
            edge:document.querySelector('.process-flow-edge').getAttribute('stroke'),
            text:getComputedStyle(document.querySelector('.process-flow-value')).fill,
            background:getComputedStyle(document.querySelector('.process-flow')).backgroundColor,
            buttonBackground:getComputedStyle(document.querySelector('button')).backgroundColor,
            groupFill:document.querySelector('.process-flow-group rect').getAttribute('fill'),
            groupBorder:document.querySelector('.process-flow-group rect').getAttribute('stroke'),
            groupTitle:getComputedStyle(document.querySelector('.process-flow-group-title')).fill
        }))()`);
        assert.equal(contrast.fill,'#000000');
        assert.equal(contrast.stroke,'#ffff00');
        assert.equal(contrast.edge,'#ffff00');
        assert.equal(contrast.text,'rgb(255, 255, 0)');
        assert.equal(contrast.background,'rgb(0, 0, 0)');
        assert.equal(contrast.buttonBackground,'rgb(0, 0, 0)');
        assert.equal(contrast.groupFill,'#000000');
        assert.equal(contrast.groupBorder,'#ffff00');
        assert.equal(contrast.groupTitle,'rgb(255, 255, 0)');
        const contrastScreenshot = await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/m03-high-contrast.png',Buffer.from(contrastScreenshot.data,'base64'));
        await evaluate('window.setPreviewInteractions(false)');
        assert.equal(await evaluate('document.querySelector("button") === null'),true);
        size = await fits();
        assert.ok(size.scrollWidth <= size.width + 1,JSON.stringify(size));
        assert.ok(size.scrollHeight <= size.height + 1,JSON.stringify(size));
        await evaluate('window.setPreviewInteractions(true);window.setPreviewObjects({});window.setPreviewTheme("#202830","#f0f3ff","#3f5299")');
        assert.equal(await evaluate('document.querySelector(".process-flow-edge").getAttribute("stroke")'),'#3f5299');
        await evaluate('window.setPreviewState("landing")');
        assert.equal(await evaluate('document.querySelector("svg") === null'),true);
        assert.match(await evaluate('document.body.textContent'),/Build a process graph/);
        const landingScreenshot = await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/m03-landing.png',Buffer.from(landingScreenshot.data,'base64'));
        await evaluate('window.setPreviewState("empty")');
        assert.match(await evaluate('document.body.textContent'),/No connections match/);
        await evaluate('window.setPreviewState("invalid")');
        assert.equal(await evaluate('document.querySelector("[role=alert]") !== null'),true);
        await evaluate('window.setPreviewState("ready")');
        assert.equal(await evaluate('document.querySelectorAll(".process-flow-node").length'),8);
        await evaluate('window.setPreviewObjects({edges:{rightAngles:true}})');
        const angularPaths=await evaluate('[...document.querySelectorAll(".process-flow-edge")].map(edge=>edge.getAttribute("d"))');
        assert.ok(angularPaths.every(path=>!/[CQ]/.test(path)));
        assert.equal(await evaluate('document.querySelectorAll(".process-flow-group").length'),2);
        const angularScreenshot=await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/right-angle-connections.png',Buffer.from(angularScreenshot.data,'base64'));
        await evaluate('window.setPreviewObjects({edges:{rightAngles:false}})');
        const smoothPaths=await evaluate('[...document.querySelectorAll(".process-flow-edge")].map(edge=>edge.getAttribute("d"))');
        assert.ok(smoothPaths.some(path=>/[CQ]/.test(path)));
        // Real browser pointer hit-testing; the host tooltip service itself is mocked.
        await evaluate(`document.querySelector('[aria-label="Fit graph to view"]').click()`);
        for (const rightAngles of [false, true]) {
            await evaluate(`window.setPreviewObjects({edges:{rightAngles:${rightAngles}}})`);
            for (const [target, key, row] of [['C', 'T002', 1], ['D', 'T003', 2]]) {
                const point = await evaluate(`(() => {
                    const path = document.querySelector('.process-flow-edge[data-source="B"][data-target="${target}"]');
                    const label = [...document.querySelectorAll('.process-flow-edge-label')].find(e=>e.dataset.edgeId===path.dataset.edgeId);
                    const box = label.getBoundingClientRect();
                    return {x:box.x+box.width/2,y:box.y+box.height/2};
                })()`);
                await command('Input.dispatchMouseEvent', {type:'mouseMoved', x:point.x, y:point.y});
                const payload = await evaluate('window.previewTooltipCalls.filter(c=>c.type!=="hide").at(-1)');
                assert.equal(payload.dataItems.find(i=>i.displayName==='Tooltip ID').value,key);
                assert.equal(payload.identities[0].key,`preview-row-${row}`);
                assert.ok(Math.abs(payload.coordinates[0]-point.x)<1);
                assert.ok(Math.abs(payload.coordinates[1]-point.y)<1);
            }
        }
        await command('Input.dispatchMouseEvent', {type:'mouseMoved',x:1,y:1});
        assert.equal(await evaluate('window.previewTooltipCalls.at(-1).type'),'hide');
        const pointFor = async selector => evaluate(`(() => {
            const e=document.querySelector(${JSON.stringify(selector)}), b=e.getBoundingClientRect();
            return {x:b.x+b.width/2,y:b.y+b.height/2};
        })()`);
        const clickPoint = async (point, modifiers = 0, button = 'left') => {
            await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button,clickCount:1,modifiers});
            await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button,clickCount:1,modifiers});
        };
        const badgeFor = target => evaluate(`(() => {
            const path=document.querySelector('.process-flow-edge[data-source="B"][data-target="${target}"]');
            const e=[...document.querySelectorAll('.process-flow-edge-label')].find(e=>e.dataset.edgeId===path.dataset.edgeId);
            const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2};
        })()`);
        const selectedCount = () => evaluate('document.querySelectorAll(".process-flow-edge[data-selected=true]").length');
        await clickPoint(await badgeFor('C'));
        assert.equal(await selectedCount(),1);
        assert.equal(await evaluate('window.previewSelectionCalls.at(-1).keys[0]'),'preview-row-1');
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".process-flow-edge[data-selected=true]")).strokeDasharray'),'6px, 3px');
        await clickPoint(await badgeFor('D'),2);
        assert.equal(await selectedCount(),2);
        await clickPoint(await badgeFor('C'),2);
        assert.equal(await selectedCount(),1);
        await clickPoint(await pointFor('[aria-label="Fit graph to view"]'));
        assert.equal(await selectedCount(),1);
        await clickPoint(await badgeFor('C'),0,'right');
        assert.equal(await evaluate('window.previewSelectionCalls.at(-1).type'),'contextmenu');
        assert.equal(await evaluate('window.previewSelectionCalls.at(-1).key'),'preview-row-1');
        await clickPoint(await pointFor('[data-node-id="H"] rect'));
        assert.equal(await selectedCount(),2);
        await evaluate('window.setPreviewTheme("#ffff00","#000000","#ff0000",true)');
        assert.equal(await selectedCount(),2);
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".process-flow-edge[data-selected=true]")).stroke'),'rgb(0, 255, 255)');
        const selectedScreenshot=await command('Page.captureScreenshot');
        fs.writeFileSync('.tmp/m05-selection.png',Buffer.from(selectedScreenshot.data,'base64'));
        await evaluate('window.restorePreviewSelection(["preview-row-1"])');
        assert.equal(await selectedCount(),1);
        await evaluate('window.resizePreview(800,450)');
        assert.equal(await selectedCount(),1);
        const backgroundPoint=await evaluate(`(() => {const b=document.querySelector('svg').getBoundingClientRect();return {x:b.x+1,y:b.y+1};})()`);
        await clickPoint(backgroundPoint);
        assert.equal(await selectedCount(),0);
        assert.equal(await evaluate('window.previewSelectionCalls.at(-1).type'),'clear');
        await evaluate('window.setPreviewInteractions(false)');
        const callsBefore=await evaluate('window.previewSelectionCalls.length');
        await clickPoint(await badgeFor('C'));
        await clickPoint(await badgeFor('C'),0,'right');
        assert.equal(await evaluate('window.previewSelectionCalls.length'),callsBefore);
        await evaluate(`window.setPreviewInteractions(true);window.setPreviewTheme('#202830','#ffffff','#1670a5');
            window.setPreviewObjects({flowGroups:{opacity:40,$instances:{
                ['flowGroup:'+JSON.stringify('Processing')]:{useTheme:false,background:{solid:{color:'#ffcc00'}},border:{solid:{color:'#a03010'}},titleColor:{solid:{color:'#401000'}}}
            }}})`);
        assert.equal(await evaluate(`document.querySelector('[data-flow-group="Processing"] rect').getAttribute('fill')`),'#ffcc00');
        assert.equal(await evaluate(`document.querySelector('[data-flow-group="Output"] rect').getAttribute('fill')`),'#1670a5');
        assert.equal(await evaluate(`window.getPreviewFormattingModel().cards.find(c=>c.uid==='flowGroups-card').groups.length`),3);
        await evaluate(`window.setPreviewTheme('#ffff00','#000000','#ff0000',true)`);
        assert.equal(await evaluate(`document.querySelector('[data-flow-group="Processing"] rect').getAttribute('fill')`),'#000000');
        await evaluate(`window.setPreviewTheme('#202830','#ffffff','#1670a5');window.resizePreview(900,400)`);
        assert.equal(await evaluate(`document.querySelector('[data-flow-group="Processing"] rect').getAttribute('fill')`),'#ffcc00');
        console.log('Browser checks passed: formatting, routing, zoom/Fit, tooltips, selection, context menus, host restoration, high contrast, interaction permissions and individual Flow Group colors (mock host).');
    } finally {
        if (command && socket?.readyState === WebSocket.OPEN) await command('Browser.close').catch(() => {});
        socket?.close();
        if (browser.exitCode === null) browser.kill();
    }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
