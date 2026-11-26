import { writeFile, mkdir } from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9225/json/list')).json();
const ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const k=++id;pending.set(k,{resolve,reject});ws.send(JSON.stringify({id:k,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+JSON.stringify(r.exceptionDetails.exception));return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
await send('Runtime.enable');await send('Page.enable');await mkdir('screenshots/ui-system',{recursive:true});
await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:3000/?function=sphere'});
for(let i=0;i<60;i++){await delay(250);if(await ev('!!window.metazoo'))break;}
await delay(800);await ev("document.querySelector('#ui-hint')?.classList.remove('show')");
const capture=async name=>{await delay(350);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('screenshots/ui-system/'+name+'.png',Buffer.from(r.data,'base64'));};

const checks=[];
const check=async(name,expression)=>{const pass=await ev(expression);checks.push({name,pass});if(!pass)throw Error('Failed: '+name);};
for(const [width,height] of [[1920,1080],[1440,900],[1280,720]]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 await ev("window.metazoo.ui.closeWorldModal();window.metazoo.ui.closeFunctionDrawer();window.metazoo.ui.closeTool();window.metazoo.simUI.closePanel();window.metazoo.customLab?.close()");
 await capture('desktop-'+width);
 await check('World identity is one line '+width,"(()=>{const a=document.querySelector('.fn-title .name').getBoundingClientRect(),b=document.querySelector('.fn-title .story').getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<3})()");
 await check('Bottom instruments aligned '+width,"(()=>{const a=document.querySelector('#ui-dock').getBoundingClientRect(),b=document.querySelector('#ui-telemetry').getBoundingClientRect();return Math.abs(a.bottom-b.bottom)<2&&b.right<a.left})()");
 await check('No horizontal overflow '+width,'document.documentElement.scrollWidth <= innerWidth');
 await check('Header groups do not overlap '+width,`(()=>{const title=document.querySelector('.fn-title').getBoundingClientRect(),right=document.querySelector('.top-right').getBoundingClientRect(),brand=document.querySelector('.brand').getBoundingClientRect();return title.right<right.left&&title.left>brand.right})()`);
 await ev("document.querySelector('[data-tool=camera]').click()"); await capture('camera-'+width);
 await check('Cinematic is a primary camera control '+width,"!!document.querySelector('.camera-cinematic[data-preset=cinematic]')&&!document.querySelector('.camera-advanced').open");
 await ev("window.metazoo.ui.openWorldModal()");await capture('atlas-'+width);
 await check('Atlas fits viewport '+width,"(()=>{const r=document.querySelector('.world-modal-inner').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");
 await ev("document.querySelectorAll('.atlas-tabs button')[1].click()");await check('My Worlds tab '+width,"document.querySelectorAll('.atlas-tabs button')[1].getAttribute('aria-selected')==='true' && document.querySelector('.world-cards').hidden");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await check('Escape closes Atlas '+width,"!document.querySelector('#ui-world-modal').classList.contains('open')");
 await ev("document.querySelector('.sim-dock-btn').click()");await capture('simulation-'+width);
 await ev("document.querySelector('#ui-sim-panel .ui-select-trigger').click()");await check('Dark dropdown '+width,"!!document.querySelector('.ui-listbox') && getComputedStyle(document.querySelector('.ui-listbox')).backgroundColor !== 'rgb(255, 255, 255)'");await capture('dropdown-'+width);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await ev("document.querySelector('[aria-label=Settings]').click()");await check('One active contextual panel '+width,"!document.querySelector('#ui-sim-panel').classList.contains('open')&&document.querySelector('#ui-panel-host').classList.contains('open')");await capture('settings-'+width);
 await ev("window.metazoo.ui.openFunctionDrawer()");await capture('info-'+width);
 await ev("window.metazoo.ui.closeFunctionDrawer(); window.metazoo.ui.callbacks.onCreateWorld()");await capture('editor-'+width);
 await check('Live math preview '+width,"!!document.querySelector('.ui-math-preview sup')");
 await ev("document.querySelector('#ui-lab .icon-btn').click()");
}
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await ev("window.metazoo.simEngine.initialize({optimizerId:'random-search',seed:42,populationSize:30,maxEvaluations:5000,maxIterations:500,boundaryPolicy:'reflect'});window.metazoo.simUI.setupOpen=false;window.metazoo.simUI.openPanel();window.metazoo.simEngine.stepOnce()");await capture('run-controls');
await check('SVG controls and run status',"!!document.querySelector('[data-sim-action=play] svg')&&!!document.querySelector('#sim-strip-status[data-status]')");
await ev("window.metazoo.ui.setViewMode('scientific')");await capture('scientific');await check('Mode active state',"document.querySelector('[data-mode=scientific]').getAttribute('aria-pressed')==='true'");
await ev("window.metazoo.ui.setViewMode('topographic')");await capture('topographic');
await ev("window.metazoo.ui.togglePresentation()");await capture('presentation');
await check('Presentation hides instruments',"getComputedStyle(document.querySelector('#ui-dock')).display==='none'");
await writeFile('screenshots/ui-system/qa-results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));ws.close();
