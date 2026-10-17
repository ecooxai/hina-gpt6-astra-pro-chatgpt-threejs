import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createHead } from './head.js';
import { createBody } from './body.js';
import { createUmbrella } from './umbrella.js';
import { batchStaticGroup } from './optimize.js';
import { prepareGLTFBackFaces } from './export-compat.js';

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const capture=query.has('capture');
if(capture)document.body.classList.add('capture');
if(query.has('clean'))document.body.classList.add('clean');
const canvas=$('scene'),stage=canvas.parentElement;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.00;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
const scene=new THREE.Scene();
scene.background=new THREE.Color(query.has('clean')?'#ffffff':'#c7e0f3');
const hemi=new THREE.HemisphereLight('#e8f4ff','#b5a299',1.30);scene.add(hemi);
const key=new THREE.DirectionalLight('#fff6e9',1.75);key.position.set(-2.6,4.6,5);key.castShadow=true;key.shadow.mapSize.set(1536,1536);key.shadow.camera.left=-1.3;key.shadow.camera.right=1.3;key.shadow.camera.top=2.5;key.shadow.camera.bottom=-.3;key.shadow.camera.near=.1;key.shadow.camera.far=11;key.shadow.bias=-.00012;key.shadow.normalBias=.005;key.shadow.radius=3;scene.add(key);scene.add(key.target);
const fill=new THREE.DirectionalLight('#e6f3ff',.65);fill.position.set(3,2.1,2.5);scene.add(fill);
const rim=new THREE.DirectionalLight('#fffaf0',.75);rim.position.set(-2,3,-3);scene.add(rim);
const character=new THREE.Group();character.name='Hina | GPT-6 Astra Pro | ChatGPT | Three.js';scene.add(character);
const skin=new THREE.MeshStandardMaterial({color:'#eec5ad',roughness:.84,metalness:0});
const materials={skin};
const body=createBody({materials});character.add(body);
const head=createHead({materials});character.add(head);
let umbrella=createUmbrella({materials});character.add(umbrella);
character.traverse(o=>{if(o.isMesh){const detail=/eye|iris|pupil|lid|brow|lash|smile|lip|nose accent|nose soft|ear inner|lustre|ink flow/i.test(o.name);const smoothHair=(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.userData?.smoothHairSurface);o.castShadow=!detail;o.receiveShadow=!detail&&!smoothHair&&!o.userData.transmittedCloth&&!/continuous sculpted face/i.test(o.name);}});
const optimization=query.has('unbatched')?null:{body:batchStaticGroup(body),head:batchStaticGroup(head),umbrella:batchStaticGroup(umbrella)};

// Soft contact shadow is painted procedurally; no raster asset is imported.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=256;shadowCanvas.height=256;
const ctx=shadowCanvas.getContext('2d');const gradient=ctx.createRadialGradient(128,128,4,128,128,123);gradient.addColorStop(0,'rgba(57,86,108,.30)');gradient.addColorStop(.4,'rgba(67,103,128,.15)');gradient.addColorStop(1,'rgba(70,113,146,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
const shadowTexture=new THREE.CanvasTexture(shadowCanvas);shadowTexture.colorSpace=THREE.SRGBColorSpace;
const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(.91,.65),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));contactShadow.rotation.x=-Math.PI/2;contactShadow.position.set(.03,-.007,.035);scene.add(contactShadow);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:'#7497af',opacity:.14}));floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);

const camera=new THREE.PerspectiveCamera(31.45,1,.01,100);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.4;controls.maxDistance=10;controls.maxPolarAngle=Math.PI*.88;controls.minPolarAngle=.06;controls.enablePan=true;controls.screenSpacePanning=true;controls.autoRotateSpeed=.7;
const views={front:[.16,1.0,5],left:[-5,1.0,0],back:[0,1.0,-5],right:[5,1.0,0],threequarter:[2.7,1.05,4.2]};
let framing='full',currentView='front',quad=false,spin=false,needsRender=true;
let review={iterations:0,targetIterations:10000,visualScore:null,fitScore:null,visualReviews:0};
const quadCameras=Array.from({length:4},()=>new THREE.OrthographicCamera(-1,1,1,-1,.01,100));
function frameCamera(cam,view,aspect,portrait=false){const mobile=stage.clientWidth<600&&!document.body.classList.contains('capture');const target=portrait?new THREE.Vector3(0,1.475,.015):new THREE.Vector3(-.055,mobile?.88:.95,0);const v=views[view]||views.front;const span=portrait?.48:quad?2.25:mobile?2.5:2.14;if(cam.isPerspectiveCamera){const distance=3.8,scale=distance/Math.hypot(v[0],v[2]);cam.position.set(v[0]*scale+target.x,target.y+(portrait?.018:.44),v[2]*scale+target.z);cam.aspect=aspect;cam.fov=THREE.MathUtils.radToDeg(2*Math.atan(span/(2*distance)));}else{cam.position.set(v[0]+target.x,v[1]-1+target.y,v[2]);cam.left=-span*aspect/2;cam.right=span*aspect/2;cam.top=span/2;cam.bottom=-span/2;}cam.up.set(0,1,0);cam.lookAt(target);cam.zoom=1;cam.updateProjectionMatrix();return target;}
function setView(view='front'){
  currentView=view;setQuad(false);
  // Drain pending orbit/pan inertia before assigning a precise preset camera.
  const damping=controls.enableDamping,autoRotate=controls.autoRotate;
  controls.enableDamping=false;controls.autoRotate=false;controls.update();
  const target=frameCamera(camera,view,stage.clientWidth/stage.clientHeight,framing==='portrait');
  controls.target.copy(target);controls.update();
  controls.enableDamping=damping;controls.autoRotate=autoRotate;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));needsRender=true;
}
function setQuad(enabled){quad=Boolean(enabled);$('quad-btn').classList.toggle('active',quad);$('quad-btn').setAttribute('aria-pressed',String(quad));$('quad-labels').hidden=!quad;controls.enabled=!quad;resize();needsRender=true;}
function setFraming(mode){framing=mode;$('full-btn').classList.toggle('selected',mode==='full');$('portrait-btn').classList.toggle('selected',mode==='portrait');setView(currentView);}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);const mobile=w<600&&!document.body.classList.contains('capture');const span=framing==='portrait'?.48:mobile?2.5:2.14;camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(span/7.6));camera.updateProjectionMatrix();['front','left','back','right'].forEach((view,i)=>frameCamera(quadCameras[i],view,w/h));needsRender=true;}
new ResizeObserver(resize).observe(stage);
let frameCount=0,startTime=performance.now(),lastMetric=performance.now(),fps=0;
function drawScene(){renderer.setScissorTest(false);renderer.setViewport(0,0,stage.clientWidth,stage.clientHeight);if(quad){const w=stage.clientWidth/2,h=stage.clientHeight/2;renderer.setScissorTest(true);quadCameras.forEach((cam,i)=>{const x=(i%2)*w,y=i<2?h:0;renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.render(scene,cam);});renderer.setScissorTest(false);}else renderer.render(scene,camera);needsRender=false;}
function render(){if(document.hidden&&!capture){requestAnimationFrame(render);return;}controls.autoRotate=spin&&!quad&&!capture;const changed=controls.update();if(needsRender||changed||spin){drawScene();frameCount++;}const now=performance.now();if(now-lastMetric>1500){fps=Math.round(frameCount*1000/(now-lastMetric));frameCount=0;lastMetric=now;}requestAnimationFrame(render);}
controls.addEventListener('change',()=>{needsRender=true;});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('quad-btn').addEventListener('click',()=>setQuad(!quad));
$('spin-btn').addEventListener('click',()=>{spin=!spin;$('spin-btn').classList.toggle('active',spin);$('spin-btn').setAttribute('aria-pressed',String(spin));needsRender=true;});
$('umbrella-btn').addEventListener('click',()=>{umbrella.visible=!umbrella.visible;$('umbrella-btn').classList.toggle('active',umbrella.visible);$('umbrella-btn').setAttribute('aria-pressed',String(umbrella.visible));renderer.shadowMap.needsUpdate=true;needsRender=true;});
$('full-btn').addEventListener('click',()=>setFraming('full'));
$('portrait-btn').addEventListener('click',()=>setFraming('portrait'));
$('reset-btn').addEventListener('click',()=>{framing='full';spin=false;$('spin-btn').classList.remove('active');$('spin-btn').setAttribute('aria-pressed','false');setFraming('full');setView('front');});
$('reference-btn')?.addEventListener('click',()=>$('reference-dialog').showModal());
$('reference-dialog')?.addEventListener('click',e=>{if(e.target===$('reference-dialog'))$('reference-dialog').close();});
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
function download(data,name,type){const a=document.createElement('a');const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportScene(showcase=false){const clone=character.clone(true),cache=new WeakMap();const convert=m=>{if(cache.has(m))return cache.get(m);const out=m.isMeshStandardMaterial||m.isMeshBasicMaterial?m.clone():new THREE.MeshStandardMaterial({color:m.color||'#ffffff',map:m.map||null,roughness:.83,metalness:0,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest||0,vertexColors:m.vertexColors});cache.set(m,out);return out;};clone.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);if(!Array.isArray(o.material)&&!o.material.vertexColors&&o.geometry.hasAttribute('color')){o.geometry=o.geometry.clone();o.geometry.deleteAttribute('color');}});if(showcase){const plinth=new THREE.Mesh(new THREE.BoxGeometry(1.10,.19,.62),new THREE.MeshStandardMaterial({color:'#0a1016',roughness:.8}));plinth.name='Showcase / black creator plinth';plinth.position.y=-.098;clone.add(plinth);const label=document.createElement('canvas');label.width=2048;label.height=320;const c=label.getContext('2d');c.fillStyle='#0a1016';c.fillRect(0,0,label.width,label.height);c.fillStyle='white';c.textAlign='center';c.textBaseline='middle';c.font='650 103px system-ui';c.fillText('GPT-6 ASTRA PRO',1024,118);c.font='500 67px system-ui';c.fillText('CHATGPT · THREE.JS',1024,234);const map=new THREE.CanvasTexture(label);map.colorSpace=THREE.SRGBColorSpace;const plaque=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.164),new THREE.MeshBasicMaterial({map}));plaque.name='Showcase / white creator credit on black';plaque.position.set(0,-.10,.311);clone.add(plaque);}return prepareGLTFBackFaces(clone);}
async function exportGLB({showcase=false}={}){const exporter=new GLTFExporter();return exporter.parseAsync(exportScene(showcase),{binary:true,onlyVisible:false,trs:false,maxTextureSize:2048});}
$('download-btn').addEventListener('click',async()=>{const btn=$('download-btn');btn.disabled=true;toast('Preparing the original 3D model…');try{const model=await exportGLB();download(model,'Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb','model/gltf-binary');toast('Hina is ready. GLB download started.');}catch(err){console.error(err);toast('The export could not finish. Please try again.');}finally{btn.disabled=false;}});
$('snapshot-btn').addEventListener('click',()=>{drawScene();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height+Math.round(canvas.width*.055);const c=out.getContext('2d');c.drawImage(canvas,0,0);c.fillStyle='#102636';c.fillRect(0,canvas.height,out.width,out.height-canvas.height);c.fillStyle='white';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${Math.max(12,Math.round(out.width*.016))}px system-ui`;c.fillText('GPT-6 ASTRA PRO · CHATGPT · THREE.JS',out.width/2,canvas.height+(out.height-canvas.height)/2);out.toBlob(blob=>download(blob,'Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS_showcase.png','image/png'));});
function metrics(){let meshes=0,vertices=0,triangles=0;const bounds=new THREE.Box3().setFromObject(character,true);let invalid=0;character.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position;vertices+=p.count;triangles+=(o.geometry.index?.count||p.count)/3;for(let i=0;i<p.array.length;i++){if(!Number.isFinite(p.array[i]))invalid++;}});return{meshes,vertices,triangles,invalidVertices:invalid,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},drawCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,fps,geometryCount:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:renderer.getPixelRatio(),version:THREE.REVISION};}
function updateReview(data){review={...review,...data};$('quality-label').textContent=`VISUAL PASS ${review.acceptedVisualIteration||review.visualReviews||0}`;$('visual-score').textContent=review.visualScore===null?'In progress':`${review.visualScore} / 100`;$('iteration-label').textContent='Fit iterations';$('iteration-count').textContent=(review.cumulativeParameterEvaluations||review.iterations).toLocaleString();$('fit-score').textContent=review.fitScore===null?'Pending':`${review.fitScore.toFixed(2)} / 100`;}
let headYaw=.23,headRoll=0;
function setParams(p={}){if(p.umbrella){character.remove(umbrella);umbrella.traverse(o=>{if(o.isMesh)o.geometry.dispose();});umbrella=createUmbrella({materials,pose:p.umbrella});character.add(umbrella);if(optimization)optimization.umbrella=batchStaticGroup(umbrella);}if(p.headRotation!==undefined||p.headRoll!==undefined){headYaw=p.headRotation??headYaw;headRoll=p.headRoll??headRoll;const pivot=new THREE.Vector3(0,1.39,0);const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),headRoll).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),headYaw));head.quaternion.copy(rotation);head.position.copy(pivot).sub(pivot.clone().applyQuaternion(rotation));}if(p.exposure!==undefined)renderer.toneMappingExposure=p.exposure;if(p.light!==undefined){key.intensity=p.light;fill.intensity=p.light*.42;hemi.intensity=p.light*.77;}renderer.shadowMap.needsUpdate=true;needsRender=true;}
function projectPoint(point,view='front'){const cam=new THREE.OrthographicCamera();frameCamera(cam,view,490/1252);cam.updateMatrixWorld();const p=new THREE.Vector3(...point).project(cam);return[(p.x+1)*245,(1-p.y)*626];}
window.HinaStudio={scene,character,body,head,get umbrella(){return umbrella;},renderer,camera,controls,optimization,setView,setQuad,setFraming,setParams,exportGLB,metrics,updateReview,projectPoint,renderNow(){needsRender=true;},drawScene,get state(){return{view:currentView,framing,quad,spin,review,headYaw,headRoll};}};
setParams({headRotation:.45,headRoll:-.12});resize();setView(query.get('view')||'front');if(query.get('portrait')==='1')setFraming('portrait');if(query.get('quad')==='1')setQuad(true);if(query.get('umbrella')==='0')umbrella.visible=false;
Promise.all(['iteration-summary.json','visual-review.json'].map(name=>fetch('./exports/'+name).then(r=>r.ok?r.json():{}).catch(()=>({})))).then(([fit,visual])=>updateReview({...fit,...visual}));
const m=metrics();$('mesh-stats').textContent=`${Math.round(m.triangles/1000)}K TRIANGLES · ORIGINAL PROCEDURAL GEOMETRY`;
$('loading').remove();window.__HINA_READY__=true;render();
