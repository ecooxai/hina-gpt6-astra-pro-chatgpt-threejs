import { launchReviewBrowser } from './browser.mjs';
import { fork } from 'node:child_process';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const port = 4179, origin = `http://127.0.0.1:${port}`;
const server = fork('./scripts/serve.mjs', [], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const percentile = (values,p) => [...values].sort((a,b)=>a-b)[Math.ceil((values.length-1)*p)];
const mean = values => values.reduce((sum,value)=>sum+value,0)/values.length;
let browser;
try {
  let ready=false;
  for(let i=0;i<30;i++) {
    if(server.exitCode!==null)throw new Error('Own4179 server exited. No existing server was stopped.');
    try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Own4179 server did not become ready.');
  browser=await launchReviewBrowser();
  if(!browser.hinaRenderer.hardwareAccelerated)throw new Error('This final native benchmark requires a confirmed hardware renderer; software fallback was not benchmarked again.');
  const cdp=await browser.newBrowserCDPSession();
  const processInfo=async()=>(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  const page=await browser.newPage({viewport:{width:1152,height:925},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const original=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>original(timestamp=>{window.__nativeOrbitRaf=timestamp;callback(timestamp);});
  });
  await page.goto(origin+'/?benchmark=native-orbit',{waitUntil:'networkidle',timeout:20000});
  await page.waitForFunction(()=>window.__HINA_READY__,undefined,{timeout:15000});
  const results=[];
  for(const viewport of [{width:1152,height:925},{width:390,height:633}]){
    await page.setViewportSize(viewport);
    await page.evaluate(async({width,height})=>{
      const s=window.HinaStudio;if(s.state.spin)document.getElementById('spin-btn').click();
      document.body.classList.add('capture');
      const stage=s.renderer.domElement.parentElement;
      stage.style.width=width+'px';stage.style.height=height+'px';stage.style.maxHeight='none';stage.style.border='0';
      s.setFraming('full');s.setView('front');s.setQuad(false);s.umbrella.visible=true;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const renderer=s.renderer,original=renderer.render;
      window.__nativeOrbitBench={original,warmup:0,recording:false,samples:[],resolve:null};
      renderer.render=function(...args){
        const b=window.__nativeOrbitBench,started=performance.now(),rafTimestamp=window.__nativeOrbitRaf;
        const returned=original.apply(this,args),submitted=performance.now();
        b.warmup++;
        if(b.recording){
          b.samples.push({started,submitted,rafTimestamp,camera:s.camera.position.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
          if(b.samples.length===60){b.recording=false;document.getElementById('spin-btn').click();b.resolve(b.samples);}
        }
        return returned;
      };
      document.getElementById('spin-btn').click();
    },viewport);
    await page.waitForFunction(()=>window.__nativeOrbitBench.warmup>=10,undefined,{timeout:12000});
    const before=await processInfo(),wallStart=performance.now();
    let timer;
    const completed=await Promise.race([
      page.evaluate(()=>new Promise(resolve=>{const b=window.__nativeOrbitBench;b.samples=[];b.recording=true;b.resolve=resolve;})),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),12000);}),
    ]);
    clearTimeout(timer);
    const samples=completed||await page.evaluate(()=>{const s=window.HinaStudio,b=window.__nativeOrbitBench;b.recording=false;if(s.state.spin)document.getElementById('spin-btn').click();return b.samples;});
    const wallMs=performance.now()-wallStart,after=await processInfo();
    if(samples.length<2)throw new Error('Native benchmark returned fewer than two active frames.');
    const old=new Map(before.map(p=>[p.id,p.cpuTime]));
    const cpuByProcess=after.map(p=>({id:p.id,type:p.type,cpuSecondsDelta:Math.max(0,p.cpuTime-(old.get(p.id)??p.cpuTime))}));
    const cpuSeconds=cpuByProcess.reduce((sum,p)=>sum+p.cpuSecondsDelta,0);
    const rss=await Promise.all(after.map(async p=>{try{return Number((await fs.readFile(`/proc/${p.id}/status`,'utf8')).match(/^VmRSS:\s+(\d+)/m)?.[1]||0);}catch{return 0;}}));
    const metadata=await page.evaluate(()=>{
      const s=window.HinaStudio,r=s.renderer,gl=r.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
      r.render=window.__nativeOrbitBench.original;
      return{canvas:[r.domElement.width,r.domElement.height],cssCanvas:[r.domElement.clientWidth,r.domElement.clientHeight],renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),visibilityState:document.visibilityState,documentHidden:document.hidden,glError:gl.getError(),contextLost:gl.isContextLost(),shadowMapAutoUpdate:r.shadowMap.autoUpdate,shadowMapNeedsUpdate:r.shadowMap.needsUpdate,metrics:s.metrics(),cameraTarget:s.controls.target.toArray()};
    });
    const intervals=samples.slice(1).map((sample,i)=>sample.started-samples[i].started);
    const rafIntervals=samples.slice(1).map((sample,i)=>sample.rafTimestamp-samples[i].rafTimestamp);
    const submission=samples.map(sample=>sample.submitted-sample.started);
    const direction=position=>{const d=position.map((v,i)=>v-metadata.cameraTarget[i]),length=Math.hypot(...d);return d.map(v=>v/length);};
    const d0=direction(samples[0].camera),d1=direction(samples.at(-1).camera);
    const orbitAngleRadians=Math.acos(Math.max(-1,Math.min(1,d0.reduce((sum,v,i)=>sum+v*d1[i],0))));
    if(orbitAngleRadians<1e-4)throw new Error('Camera did not move; idle timing cannot be labeled active cadence.');
    const raster=await page.evaluate(()=>{
      const s=window.HinaStudio,r=s.renderer,gl=r.getContext(),pixel=new Uint8Array(4);
      s.controls.enableDamping=false;s.setView('front');
      const target=s.controls.target.clone(),base=s.camera.position.clone().sub(target),radius=Math.hypot(base.x,base.z),angle=Math.atan2(base.x,base.z),height=base.y;
      s.drawScene();gl.readPixels(Math.floor(r.domElement.width/2),Math.floor(r.domElement.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const samples=[];
      for(let i=0;i<5;i++){
        const a=angle+.02*i;s.camera.position.set(target.x+radius*Math.sin(a),target.y+height,target.z+radius*Math.cos(a));s.camera.lookAt(target);s.camera.updateMatrixWorld();
        const started=performance.now();s.drawScene();const submitted=performance.now();
        gl.readPixels(Math.floor(r.domElement.width/2),Math.floor(r.domElement.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        samples.push({drawSubmissionMs:submitted-started,drawAndReadPixelsMs:performance.now()-started,pixelRGBA:Array.from(pixel),glError:gl.getError(),contextLost:gl.isContextLost(),shadowMapNeedsUpdate:r.shadowMap.needsUpdate});
      }
      s.controls.enableDamping=true;s.setView('front');
      return{method:'Five explicit drawScene + 1x1 RGBA readPixels completions after one completion warmup; five camera poses spaced .02 radians. Runs synchronously so no RAF callback interleaves.',samples};
    });
    raster.medianDrawAndReadPixelsMs=percentile(raster.samples.map(s=>s.drawAndReadPixelsMs),.5);
    raster.meanDrawAndReadPixelsMs=mean(raster.samples.map(s=>s.drawAndReadPixelsMs));
    const result={viewport,...metadata,frames:samples.length,targetFrames:60,warmupFrames:10,completion:completed?'60-frame target completed':'12-second limit; completed partial samples retained',wallMs,medianFrameIntervalMs:percentile(intervals,.5),p95FrameIntervalMs:percentile(intervals,.95),meanFrameIntervalMs:mean(intervals),effectiveActiveFps:1000/mean(intervals),medianRafIntervalMs:percentile(rafIntervals,.5),p95RafIntervalMs:percentile(rafIntervals,.95),medianDrawSubmissionMs:percentile(submission,.5),completedFramesPerWallSecond:samples.length/(wallMs/1000),orbitAngleRadians,browserCpuSeconds:cpuSeconds,browserCpuPercentOfOneCore:100*cpuSeconds/(wallMs/1000),browserResidentSetMiB:rss.reduce((sum,value)=>sum+value,0)/1024,cpuByProcess,rasterDiagnostic:raster,rawFrames:samples};
    results.push(result);
    console.log(JSON.stringify({canvas:result.canvas,frames:result.frames,medianFrameIntervalMs:result.medianFrameIntervalMs,p95FrameIntervalMs:result.p95FrameIntervalMs,effectiveActiveFps:result.effectiveActiveFps,medianRafIntervalMs:result.medianRafIntervalMs,medianCompletionMs:raster.medianDrawAndReadPixelsMs,browserCpuPercentOfOneCore:result.browserCpuPercentOfOneCore,browserResidentSetMiB:result.browserResidentSetMiB,glError:result.glError,contextLost:result.contextLost}));
  }
  const sourceHashes={};
  for(const file of ['src/main.js','src/head.js','src/body.js','src/umbrella.js','src/optimize.js','scripts/browser.mjs']){try{sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');}catch{sourceHashes[file]=null;}}
  const report={createdAt:new Date().toISOString(),port,browser:browser.hinaRenderer,method:'Real application turntable; 60 RAF-driven scene draws after10 warmup frames per viewport, atDPR1. Wall-clock start-to-start intervals and browser RAF timestamps are recorded independently. Five explicit readPixels completion samples establish actual framebuffer work after each cadence run.',cpuMethod:'Sum of only this isolated browser process CPU-time deltas from CDP SystemInfo.getProcessInfo, divided by Node wall time. 100% represents one core. Summed VmRSS may double-count shared pages.',limits:['This measures a visible headless Chromium session on Intel UHD620; it is not physical phone hardware.','Active app RAF cadence is recorded, not monitor presentation or a display refresh guarantee.','Five readPixels completions establish actual rendering completion separately from CPU draw submission.','Scene/shadow geometry remains fixed during orbit; static shadow map is reused.','Concurrent machine activity can affect short-run scheduling.'],environment:{node:process.version,cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,loadAverage:os.loadavg()},sourceHashes,errors,results};
  await fs.mkdir('qa/performance',{recursive:true});
  await fs.writeFile('qa/performance/native-active-orbit.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({file:'qa/performance/native-active-orbit.json',errors,renderer:browser.hinaRenderer.renderer}));
}finally{
  if(browser)await browser.close();server.kill('SIGTERM');
}
