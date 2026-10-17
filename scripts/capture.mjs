import { launchReviewBrowser } from './browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2),base=process.env.HINA_URL||'http://127.0.0.1:4177';
const requestedShot=args.find(a=>a.startsWith('--shot='))?.slice(7);
if(!process.env.HINA_URL)await import('./serve.mjs');
const browser=await launchReviewBrowser();
const page=await browser.newPage({viewport:{width:1200,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR: '+e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE: '+m.text());}});page.on('response',r=>{if(r.status()>=400)console.log('HTTP '+r.status()+' '+r.url());});
await fs.mkdir('qa',{recursive:true});await fs.mkdir('exports',{recursive:true});
const shots=args.includes('--quick')?[['front',850,1200,'?capture=1&view=front'],['portrait',1000,1000,'?capture=1&portrait=1'],['four_views',1500,1500,'?capture=1&quad=1']]:[['front',850,1200,'?capture=1&view=front'],['left',850,1200,'?capture=1&view=left'],['back',850,1200,'?capture=1&view=back'],['right',850,1200,'?capture=1&view=right'],['portrait',1000,1000,'?capture=1&portrait=1'],['four_views',1600,1600,'?capture=1&quad=1'],['desktop',1440,1040,''],['mobile',390,844,'']];
await page.goto(base+'/?capture=1',{waitUntil:'networkidle',timeout:60000});await page.waitForFunction(()=>window.__HINA_READY__,undefined,{timeout:60000});
shots.push(['body_detail',1100,1100,'?capture=1&torso=1'],['back_detail',900,1200,'?capture=1&view=back&umbrella=0'],['feet_detail',1100,800,'?capture=1&feet=1']);
for(const[name,width,height,query]of shots.filter(s=>!requestedShot||s[0]===requestedShot)){
  await page.setViewportSize({width,height});
  await page.evaluate(query=>{const q=new URLSearchParams(query);document.body.classList.toggle('capture',q.has('capture'));const s=window.HinaStudio;s.setFraming(q.get('portrait')==='1'||q.has('torso')||q.has('feet')?'portrait':'full');s.setView(q.get('view')||'front');s.setQuad(q.get('quad')==='1');if(q.has('torso')){s.camera.position.set(.13,1.10,3.8);s.controls.target.set(.055,1.10,.04);s.camera.zoom=.65;s.camera.updateProjectionMatrix();s.controls.update();}if(q.has('feet')){s.camera.position.set(.10,1.39,3.8);s.controls.target.set(.025,.15,.045);s.camera.zoom=.9;s.camera.updateProjectionMatrix();s.controls.update();}s.umbrella.visible=q.get('umbrella')!=='0';s.renderer.shadowMap.needsUpdate=true;s.renderNow();},query);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:`qa/${name}.png`,fullPage:name==='mobile',timeout:90000});console.log(`Captured ${name}`);
}
const metrics=await page.evaluate(()=>window.HinaStudio.metrics());await fs.writeFile('qa/metrics.json',JSON.stringify({metrics,errors,renderer:browser.hinaRenderer},null,2));console.log(JSON.stringify({metrics,errors}));
if(!requestedShot){await page.setViewportSize({width:1600,height:1600});await page.evaluate(()=>{document.body.classList.add('capture');const s=window.HinaStudio;s.setFraming('full');s.setQuad(true);s.umbrella.visible=false;s.renderer.shadowMap.needsUpdate=true;s.renderNow();});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:'qa/four_views_character.png',timeout:90000});console.log('Captured four_views_character');}
if(args.includes('--export')){const downloadEvent=page.waitForEvent('download',{timeout:90000});const bytes=await page.evaluate(async()=>{const buffer=await window.HinaStudio.exportGLB();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buffer],{type:'model/gltf-binary'}));a.download='Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb';a.click();return buffer.byteLength;});const download=await downloadEvent;await download.saveAs('exports/Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb');console.log(`GLB written: ${bytes} bytes`);}
await browser.close();process.exit(0);
