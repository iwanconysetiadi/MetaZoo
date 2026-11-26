import { writeFile, mkdir } from 'node:fs/promises';
const tabs = await (await fetch('http://127.0.0.1:9225/json/list')).json();
const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
  if (msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params);
});
const send = (method, params = {}) => new Promise((resolve,reject) => { const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params})); });
const evaluate = async expression => (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
const delay = ms => new Promise(r => setTimeout(r,ms));
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await mkdir('screenshots/sky-world',{recursive:true});
const scenarios = [
 ['01_sphere_natural_clean','function=sphere&bare=1'],
 ['02_sphere_simulation','function=sphere',"window.metazoo.simEngine.initialize({optimizerId:'test-swarm',seed:42,populationSize:30,maxEvaluations:5000,maxIterations:500,boundaryPolicy:'reflect'});window.metazoo.agentRenderer.setTrailsEnabled(true);for(let i=0;i<5;i++){window.metazoo.simEngine.stepOnce();window.metazoo.agentRenderer.update(window.metazoo.simEngine.getRenderFrame());}"],
 ['03_rastrigin_natural','function=rastrigin'],
 ['04_rastrigin_scientific','function=rastrigin&mode=scientific'],
 ['05_rosenbrock_natural','function=rosenbrock'],
 ['06_himmelblau_topographic','function=himmelblau&mode=topographic',"window.metazoo.cameraRig.setPreset('top-down');"],
 ['07_twilight','function=sphere',"document.querySelector('.atmosphere-toggle').click()"],
 ['08_world_atlas','function=sphere&selector=1'],
 ['09_desktop_controls','function=sphere',"window.metazoo.simEngine.initialize({optimizerId:'random-search',seed:42,populationSize:30,maxEvaluations:5000,maxIterations:500,boundaryPolicy:'reflect'});document.querySelector('.sim-dock-btn').click();"],
 ['10_presentation','function=sphere&present=1'],
 ['11_underside','function=sphere',"window.metazoo.cameraRig.setPreset('underside');"],
];
const results = [];
for (const [name,query,action] of scenarios) {
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:3000/?debug=1&'+query});
  for(let i=0;i<40;i++){await delay(200);if(await evaluate('!!window.metazoo'))break;}
  if(action) { const result = await send('Runtime.evaluate',{expression:action,returnByValue:true});if(result.exceptionDetails)errors.push(result.exceptionDetails); }
  await delay(name==='07_twilight'?4500:1500);
  const state = await evaluate(`(()=>{const a=window.metazoo;const renderer=a.sceneManager.getRenderer();return {function:a.world.getConfig().functionId,mode:a.world.getConfig().viewMode,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cloudInstances:a.sceneManager.cloudSystem.instanceCount,grassInstances:renderer.getContext()?a.sceneManager.getTerrainGroup().children.find(x=>x.name==='presentation-grass')?.count:0,shadowSize:a.sceneManager.sunLight.shadow.mapSize.width,fps:document.querySelector('#perf-readout')?.textContent,fatal:document.querySelector('#fatal-error')?.textContent,horizontalOverflow:document.documentElement.scrollWidth>innerWidth}})()`);
  await evaluate("document.getElementById('perf-readout')?.remove();document.querySelector('#ui-hint')?.classList.remove('show')");
  const capture = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('screenshots/sky-world/'+name+'.png',Buffer.from(capture.data,'base64'));
  results.push({name,...state}); console.log(name,JSON.stringify(state));
}
await writeFile('screenshots/sky-world/qa-results.json',JSON.stringify({environment:'Local headless Chrome; results reflect this machine and headless rendering only',results,errors},null,2));
console.log('Errors:',JSON.stringify(errors));ws.close();
