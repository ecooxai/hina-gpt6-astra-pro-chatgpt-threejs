import * as THREE from 'three';

// Original sculpted surfaces. Coordinates are metres in the character's world.
// No external textures, meshes, fonts, or illustration assets are used here.
const PI = Math.PI;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const EYE_WIDTH = .044;
const EYE_CENTRE_X = .0418;
const FACE = [
  [1.339, .002, .075, .071], [1.343, .012, .082, .061],
  [1.350, .024, .088, .043], [1.360, .037, .093, .020],
  [1.376, .056, .098, -.013], [1.397, .075, .101, -.047],
  [1.423, .092, .104, -.081], [1.458, .109, .106, -.108],
  [1.491, .116, .105, -.121],
  [1.527, .120, .101, -.124], [1.560, .112, .088, -.120],
  [1.595, .089, .062, -.103], [1.626, .052, .025, -.065],
  [1.641, .015, -.006, -.025], [1.644, .001, -.016, -.016]
];

function smoothRow(y) {
  let i = 0;
  while (i < FACE.length - 2 && y > FACE[i + 1][0]) i++;
  const a = FACE[i], b = FACE[i + 1];
  const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  const out = [y];
  for (let j = 1; j < 4; j++) {
    const previous = FACE[Math.max(0, i - 1)];
    const next = FACE[Math.min(FACE.length - 1, i + 2)];
    const m0 = (b[j] - previous[j]) / (b[0] - previous[0]);
    const m1 = (next[j] - a[j]) / (next[0] - a[0]);
    out[j] = (2*t*t*t - 3*t*t + 1)*a[j] + (t*t*t - 2*t*t + t)*(b[0]-a[0])*m0 + (-2*t*t*t + 3*t*t)*b[j] + (t*t*t-t*t)*(b[0]-a[0])*m1;
  }
  return out;
}

function faceEnvelopeZ(x, y) {
  const [, width, front, back] = smoothRow(y);
  const xx = clamp(x / Math.max(.001, width), -.9999, .9999);
  const c = Math.sqrt(Math.max(0, 1 - xx * xx));
  const side = mix(back, front, .49);
  return side + (front - side) * Math.pow(c, .70);
}

// A continuous front surface shared by the face, eyes, eyebrows, and smile.
function faceZ(x, y) {
  let z = faceEnvelopeZ(x, y);
  z += .0094 * Math.exp(-Math.pow(x / .0103, 2) - Math.pow((y - 1.4195) / .0145, 2));
  z += .0015 * Math.exp(-Math.pow(x / .008, 2) - Math.pow((y - 1.4455) / .029, 2));
  z += .0025 * Math.exp(-Math.pow(x / .030, 2) - Math.pow((y - 1.394) / .017, 2));
  return z;
}

function surfaceMesh(positions, indices, uvs, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function addMesh(group, name, geometry, material, shadows = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  group.add(mesh);
  return mesh;
}

function curve(points) {
  return new THREE.CatmullRomCurve3(points.map(p => V(...p)), false, 'centripetal');
}

function tube(group, name, points, radius, material, segments = 40) {
  return addMesh(group, name, new THREE.TubeGeometry(curve(points), segments, radius, 5, false), material, false);
}

function toonRamp() {
  const t = new THREE.DataTexture(new Uint8Array([120,120,120,255, 173,173,173,255, 217,217,217,255, 255,255,255,255]), 4, 1, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function buildFace(group, skin) {
  const pos = [], ids = [], uv = [], col = [];
  const rings = 116, around = 128;
  for (let r = 0; r <= rings; r++) {
    const y = mix(1.339, 1.644, r / rings);
    const [, width, front, back] = smoothRow(y);
    const side = mix(back, front, .49);
    for (let s = 0; s <= around; s++) {
      const theta = s / around * PI * 2;
      const x = Math.max(.0004, width) * Math.sin(theta);
      const c = Math.cos(theta);
      let z;
      if (c >= 0) z = faceZ(x, y);
      else z = side + (back - side) * Math.pow(-c, .90);
      pos.push(x, y, z);
      uv.push(s / around, r / rings);
      const frontness = Math.pow(Math.max(0, c), 2);
      const cheeks = Math.exp(-Math.pow((Math.abs(x) - .077) / .029, 2) - Math.pow((y - 1.430) / .021, 2)) * frontness;
      const nose = Math.exp(-Math.pow(x / .018, 2) - Math.pow((y - 1.4195) / .015, 2)) * frontness;
      col.push(1, 1 - cheeks * .059 - nose * .021, 1 - cheeks * .044 - nose * .015);
      if (r < rings && s < around) {
        const a = r * (around + 1) + s, b = a + around + 1;
        ids.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const material = skin.clone();
  material.vertexColors = true;
  const geometry=surfaceMesh(pos,ids,uv,col);
  // Animation-style faces use broad cheek/forehead lighting across their tiny
  // nose geometry. Preserve the nose profile while smoothing its shading
  // normals into the surrounding face, avoiding a dark circular nose spot.
  const normals=geometry.attributes.normal;
  const delta=.00015;
  for(let r=0;r<=rings;r++)for(let s=0;s<=around;s++) {
    if(Math.cos(s/around*PI*2)<=0)continue;
    const i=r*(around+1)+s,x=pos[i*3],y=pos[i*3+1];
    const strength=.97*Math.exp(-Math.pow(x/.025,2)-Math.pow((y-1.425)/.038,2));
    if(strength<.002)continue;
    const dx=(faceEnvelopeZ(x+delta,y)-faceEnvelopeZ(x-delta,y))/(2*delta);
    const dy=(faceEnvelopeZ(x,y+delta)-faceEnvelopeZ(x,y-delta))/(2*delta);
    const broad=V(-dx,-dy,1).normalize();
    const n=V(normals.getX(i),normals.getY(i),normals.getZ(i)).lerp(broad,strength).normalize();
    normals.setXYZ(i,n.x,n.y,n.z);
  }
  normals.needsUpdate=true;
  const mesh = addMesh(group, 'Hina / continuous sculpted face and cranium', geometry, material);
  mesh.userData.originalGeometry = true;
  // A real back-facing hull supplies a restrained silhouette at any camera
  // angle. It is geometry, not a camera-facing drawn jaw decal.
  const contour=geometry.clone(),cp=contour.attributes.position;
  for(let i=0;i<cp.count;i++) {
    const y=cp.getY(i),weight=1-clamp((y-1.425)/.035,0,1);
    cp.setXYZ(i,cp.getX(i)+normals.getX(i)*.00044*weight,cp.getY(i)+normals.getY(i)*.00044*weight,cp.getZ(i)+normals.getZ(i)*.00044*weight);
  }
  addMesh(group,'Hina / jaw silhouette ink flow',contour,new THREE.MeshBasicMaterial({color:'#906e5d',side:THREE.BackSide}),false);
  // The rounded mandible rises toward the ear. Its underside blends into an
  // upper throat loft, with the lower ring tucked inside the body's neck.
  const throat=[],ti=[];
  const neckRows=[[1.330,.0295,.0275,-.0035,-.0015],[1.353,.0305,.0288,-.004,-.002],[1.391,.034,.029,-.005,-.004],[1.416,.036,.029,-.005,-.004]];
  for(let r=0;r<neckRows.length;r++)for(let j=0;j<=48;j++) {
    const [y,rx,rz,cx,cz]=neckRows[r],a=j/48*2*PI;
    throat.push(cx+rx*Math.sin(a),y,cz+rz*Math.cos(a));
    if(r<neckRows.length-1&&j<48){const n=r*49+j;ti.push(n,n+1,n+49,n+1,n+50,n+49);}
  }
  addMesh(group,'Hina / sculpted upper throat transition',surfaceMesh(throat,ti),skin);
  return mesh;
}

function buildEar(group, side, skin, inner) {
  const p = [], ix = [];
  const rows = 16, steps = 48;
  for (let r = 0; r <= rows; r++) {
    const rr = r / rows;
    for (let i = 0; i <= steps; i++) {
      const a = i / steps * 2 * PI;
      const y = 1.442 + .029 * Math.sin(a) * rr;
      const x = side * (.112 + .018 * Math.cos(a) * rr + .002 * Math.sin(a));
      const z = -.003 + .012 * Math.sqrt(Math.max(0, 1 - rr * rr)) + .006 * rr * rr;
      p.push(x, y, z);
      if (r < rows && i < steps) {
        const n = r * (steps + 1) + i;
        ix.push(n, n + 1, n + steps + 1, n + 1, n + steps + 2, n + steps + 1);
      }
    }
  }
  const ear = addMesh(group, `Hina / ${side < 0 ? 'left' : 'right'} sculpted ear`, surfaceMesh(p, ix), skin);
  ear.material = skin.clone();
  ear.material.side = THREE.DoubleSide;
  tube(group, `Hina / ear inner fold ${side}`, [[side*.121,1.458,.011],[side*.126,1.445,.013],[side*.122,1.433,.013],[side*.117,1.434,.012]], .0017, inner, 24);
}

// An original painted iris generated mathematically, with radial fibres and
// multiple light reflections. The almond mesh, rather than alpha, clips it.
function eyeTexture() {
  const width = 512, height = 320;
  const pixels = new Uint8Array(width * height * 4);
  const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const blend = (a,b,t) => a.map((v,i) => mix(v,b[i],t));
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = (i / (width - 1) - .5) * EYE_WIDTH;
    const y = (j / (height - 1) - .5) * .065;
    const dx = (x + .0028) / .0148, dy = (y - .0071) / .0271;
    const radial = Math.hypot(dx,dy), angle = Math.atan2(dy,dx);
    const shade = smooth(.001,.022,y) * .095;
    let c = [250-shade*110, 249-shade*160, 244-shade*110];
    if (radial < 1.016) {
      const vertical = clamp((1-dy)*.5,0,1);
      c = blend([17,43,62],[65,148,195], Math.pow(vertical,.88));
      const fibre = (Math.sin(angle*37 + radial*14) + .45*Math.sin(angle*71-radial*18)) * .026 * smooth(.38,.60,radial);
      c = c.map((v,n) => v + fibre * [110,210,255][n]);
      const band = Math.exp(-Math.pow((radial-.73)/.11,2)) * .15 * vertical;
      c = blend(c,[120,212,238],band);
      c = blend(c,[14,32,48],smooth(.86,1.0,radial));
      const pupil = Math.hypot((x+.0029)/.0068,(y-.0083)/.0143);
      c = blend([8,26,42],c,smooth(.89,1.05,pupil));
      const topShadow = smooth(.008,.022,y) * .24;
      c = blend(c,[9,21,32],topShadow);
      const light1 = Math.hypot((x+.0073)/.0030,(y-.0195)/.0059);
      c = blend(c,[255,255,250],1-smooth(.82,1.04,light1));
      const light2 = Math.hypot((x-.0039)/.0016,(y+.0130)/.0021);
      c = blend(c,[229,255,255],.98*(1-smooth(.72,1.1,light2)));
      const light3 = Math.hypot((x+.0102)/.00105,(y+.007)/.0010);
      c = blend(c,[154,226,246],.78*(1-smooth(.7,1.1,light3)));
    }
    const k = (j * width + i) * 4;
    pixels[k] = clamp(c[0],0,255); pixels[k+1] = clamp(c[1],0,255); pixels[k+2] = clamp(c[2],0,255); pixels[k+3] = 255;
  }
  const texture = new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function eyeBoundary(t, side, top) {
  const cx = side * EYE_CENTRE_X;
  const x = cx + (t - .5) * EYE_WIDTH;
  const base = 1.469 + side * .0037 * (t - .5);
  const outerBias=1+side*.23*(t-.5);
  const y = base + (top ? .0278*outerBias : -.0207) * Math.pow(Math.max(0,Math.sin(PI*t)), top ? .83 : .68);
  return [x,y];
}

function facialRibbon(group,name,getPoint,width,material,segments=64) {
  const p=[], ids=[];
  for(let i=0;i<=segments;i++) {
    const t=i/segments;
    const [x,y,zadd=.004]=getPoint(t);
    const [nx,ny]=getPoint(Math.min(1,t+.0001));
    const [px,py]=getPoint(Math.max(0,t-.0001));
    const tangent=V(nx-px,ny-py,0).normalize();
    const w=typeof width==='function'?width(t):width;
    for(const s of [-1,1]) {
      const xx=x-tangent.y*w*s*.5, yy=y+tangent.x*w*s*.5;
      p.push(xx,yy,faceZ(xx,yy)+zadd);
    }
    if(i<segments) {const a=i*2;ids.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const mesh=addMesh(group,name,surfaceMesh(p,ids),material,false);
  mesh.material.side=THREE.DoubleSide;
  return mesh;
}

function buildEyes(group,outline,crease) {
  const texture=eyeTexture();
  const eyeMat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  const lowerInk=new THREE.MeshBasicMaterial({color:'#987d6c',side:THREE.DoubleSide});
  for(const side of [-1,1]) {
    const p=[],ids=[],uv=[];
    const across=72,rows=24;
    for(let i=0;i<=across;i++) {
      const t=i/across;
      const [x,top]=eyeBoundary(t,side,true), [,bottom]=eyeBoundary(t,side,false);
      for(let r=0;r<=rows;r++) {
        const q=r/rows, y=mix(bottom,top,q);
        const lift=.0010+.0007*Math.sin(PI*t)*Math.sin(PI*q);
        p.push(x,y,faceZ(x,y)+lift);
        uv.push(t,.5+(y-1.469)/.065);
        if(i<across&&r<rows) {const a=i*(rows+1)+r,b=a+rows+1;ids.push(a,b,a+1,b,b+1,a+1);}
      }
    }
    addMesh(group,`Hina / blue eye ${side}`,surfaceMesh(p,ids,uv),eyeMat,false);
    facialRibbon(group,`Hina / expressive upper eyelid ${side}`,t=>[...eyeBoundary(t,side,true),.0020],t=>.00045+.00265*Math.pow(Math.sin(PI*t),.55),outline);
    facialRibbon(group,`Hina / partial soft lower eyelid ${side}`,t=>[...eyeBoundary(side<0?mix(.10,.70,t):mix(.30,.90,t),side,false),.0018],t=>.00006+.00033*Math.pow(Math.sin(PI*t),.90),lowerInk);
    facialRibbon(group,`Hina / eyelid crease ${side}`,t=>{const [x,y]=eyeBoundary(mix(.14,.91,t),side,true);return[x,y+.0052,.0012];},t=>.00010+.00040*Math.sin(PI*t),crease,36);
    const outer=side>0?1:0;
    const [ox,oy]=eyeBoundary(outer,side,true);
    facialRibbon(group,`Hina / outer lash flick ${side}`,t=>[ox+side*.0033*t,oy+.0028*t+.0004*Math.sin(PI*t),.0022],t=>.0013*Math.pow(1-t,.72)+.0001,outline,16);
    facialRibbon(group,`Hina / tapered brow ${side}`,t=>[side*EYE_CENTRE_X+(t-.5)*.048,1.512+.0061*Math.sin(PI*t)+side*.0015*(t-.5),.0014],t=>.00035+.00100*Math.sin(PI*t),outline,40);
  }
}

function hairEnvelopeZ(x,y) {
  const ellipsoid=1-Math.pow(x/.130,2)-Math.pow((y-1.507)/.159,2);
  const skull=-.021+.127*Math.sqrt(Math.max(0,ellipsoid));
  const face=y<=1.644?faceZ(x,y)+.0012:-.03;
  // Smooth maximum avoids a normal crease where the broad anime forehead
  // meets the round scalp; both the cap and its fringe use this envelope.
  return .5*(skull+face+Math.sqrt((skull-face)*(skull-face)+.000001));
}

// Closed, flattened, tapered clumps. Individual clumps remain real geometry
// from side and rear cameras, with a ridge, dark seams, and tapered tips.
function hairLock(group,name,points,width,depth,material,options={}) {
  const path=curve(points), p=[],ids=[],cols=[];
  const segments=options.segments||40, radial=12;
  const base=new THREE.Color(options.color||'#273641');
  const outward=options.outward?V(...options.outward):null;
  const minTip=options.blunt?.075:.009;
  for(let i=0;i<=segments;i++) {
    const t=i/segments, c=path.getPoint(t), tangent=path.getTangent(t).normalize();
    let normal=outward?outward.clone():V(c.x*.85,Math.max(0,c.y-1.50)*.70,c.z+.03);
    normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();
    if(normal.length()<.2) normal=V(0,0,1).addScaledVector(tangent,-tangent.z).normalize();
    const lateral=new THREE.Vector3().crossVectors(tangent,normal).normalize();
    const rootBlend=options.rootFull?1:Math.max(.025,Math.min(1,Math.pow(t/.19,.72)));
    const taper=((.69+.40*Math.sin(PI*t))*Math.pow(1-t,options.taper||.56)+minTip)*rootBlend;
    let widthShape=taper;
    if(options.widthProfile) {
      const v=options.widthProfile,sample=t*(v.length-1),lo=Math.floor(sample),f=sample-lo;
      const a=v[Math.max(0,lo-1)],b=v[lo],c=v[Math.min(lo+1,v.length-1)],d=v[Math.min(lo+2,v.length-1)];
      widthShape=Math.max(.006,b+.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a))));
    }
    const w=width*widthShape*(1+.018*Math.sin(t*PI*5+(options.phase||0)));
    for(let j=0;j<=radial;j++) {
      const a=j/radial*2*PI;
      const across=Math.cos(a), top=Math.sin(a);
      const ridge=Math.pow(Math.abs(top),.96)*Math.sign(top);
      const point=c.clone().addScaledVector(lateral,across*w).addScaledVector(normal,ridge*depth*taper);
      if(options.conformHead) {
        const conform=clamp((point.y-1.470)/.055,0,1);
        const lift=.0003+.0017*clamp((1.615-point.y)/.075,0,1)+.0038*t*t;
        point.z=mix(point.z,hairEnvelopeZ(point.x,point.y)+lift+ridge*depth*taper,conform);
      }
      p.push(point.x,point.y,point.z);
      const crest=.91+.12*Math.max(0,top)+.045*Math.sin(t*PI);
      cols.push(base.r*crest,base.g*crest,base.b*crest);
      if(i<segments&&j<radial) {const a0=i*(radial+1)+j,b=a0+radial+1;ids.push(a0,b,a0+1,b,b+1,a0+1);}
    }
  }
  const geometry=surfaceMesh(p,ids,null,cols);
  if(options.conformHead) {
    const norm=geometry.attributes.normal,delta=.00012;
    for(let i=0;i<norm.count;i++) {
      const x=p[i*3],y=p[i*3+1],strength=.96*clamp((y-1.535)/.070,0,1);
      if(strength===0||norm.getZ(i)<0)continue;
      const dx=(hairEnvelopeZ(x+delta,y)-hairEnvelopeZ(x-delta,y))/(2*delta);
      const dy=(hairEnvelopeZ(x,y+delta)-hairEnvelopeZ(x,y-delta))/(2*delta);
      const n=V(norm.getX(i),norm.getY(i),norm.getZ(i)).lerp(V(-dx,-dy,1).normalize(),strength).normalize();
      norm.setXYZ(i,n.x,n.y,n.z);
    }
  }
  const mesh=addMesh(group,name,geometry,material);
  if(options.sheen) {
    const h=[];
    for(let j=0;j<=18;j++) {
      const t=mix(.17,.68,j/18), c=path.getPoint(t), tangent=path.getTangent(t).normalize();
      let n=outward?outward.clone():V(c.x*.85,Math.max(0,c.y-1.50)*.70,c.z+.03);
      n.addScaledVector(tangent,-n.dot(tangent)).normalize();
      const scale=(.69+.40*Math.sin(PI*t))*Math.pow(1-t,options.taper||.56)+minTip;
      c.addScaledVector(n,depth*scale+.00018);
      if(options.conformHead) {
        const conform=clamp((c.y-1.470)/.055,0,1);
        const lift=.0003+.0017*clamp((1.615-c.y)/.075,0,1)+.0038*t*t;
        c.z=mix(c.z,hairEnvelopeZ(c.x,c.y)+lift+depth*scale+.00018,conform);
      }
      h.push(c.toArray());
    }
    tube(group,`${name} / subtle lustre`,h,options.sheenWidth||.00056,options.sheen,28);
  }
  return mesh;
}

function scalp(theta,t,offset=0) {
  const front=Math.max(0,Math.cos(theta));
  const bottom=1.391+.139*Math.pow(front,1.50);
  const phimax=Math.acos(clamp((bottom-1.507)/.158,-1,1));
  const phi=phimax*t;
  const x=(.129+offset)*Math.sin(phi)*Math.sin(theta);
  const y=1.507+(.158+offset)*Math.cos(phi);
  let z=-.021+(.126+offset)*Math.sin(phi)*Math.cos(theta);
  if(Math.cos(theta)>0)z=mix(z,Math.max(z,hairEnvelopeZ(x,y)+offset),clamp(Math.cos(theta)/.20,0,1));
  return V(x,y,z);
}

function buildTempleSweep(group,material) {
  const rows=[[1.604,-.105,-.052],[1.557,-.115,-.059],[1.510,-.120,-.061],[1.476,-.112,-.065],[1.445,-.085,-.067],[1.418,-.077,-.067],[1.391,-.064,-.056],[1.372,-.054,-.048],[1.359,-.0442,-.0440]];
  const sample=(column,t)=>{const s=t*(rows.length-1),i=Math.floor(s),f=s-i,a=rows[Math.max(0,i-1)][column],b=rows[i][column],c=rows[Math.min(i+1,rows.length-1)][column],d=rows[Math.min(i+2,rows.length-1)][column];return b+.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)));};
  const p=[],ids=[],col=[],along=80,across=24,layer=(along+1)*(across+1),base=new THREE.Color('#29353e');
  for(let side=0;side<2;side++)for(let r=0;r<=along;r++) {
    const t=r/along,y=sample(0,t),l=sample(1,t),rr=Math.max(l+.0001,sample(2,t)),feather=clamp(t/.18,0,1),thin=clamp((rr-l)/.020,0,1);
    for(let j=0;j<=across;j++) {
      const u=j/across,x=mix(l,rr,u);
      const release=.010*Math.pow(clamp((1.430-y)/.071,0,1),2);
      const lift=mix(-.0015,.0018,feather)+release+.0014*Math.sin(PI*u)*feather*thin;
      const free=clamp((1.445-y)/.040,0,1),freeDepth=.084-.007*clamp((1.410-y)/.051,0,1);
      const z=mix(hairEnvelopeZ(x,y)+lift,freeDepth+.0014*Math.sin(PI*u)*thin,free);
      p.push(x,y,z-side*.0020*thin);
      const shade=.96+.065*Math.sin(PI*u);col.push(base.r*shade,base.g*shade,base.b*shade);
      if(r<along&&j<across) {
        const n=side*layer+r*(across+1)+j,k=n+across+1;
        side?ids.push(n,n+1,k,n+1,k+1,k):ids.push(n,k,n+1,n+1,k,k+1);
      }
    }
  }
  // Connect all four perimeter edges into a thin, closed shell.
  for(let r=0;r<along;r++)for(const j of [0,across]) {
    const a=r*(across+1)+j,b=a+across+1;
    j===0?ids.push(a,a+layer,b,a+layer,b+layer,b):ids.push(a,b,a+layer,b,b+layer,a+layer);
  }
  for(const r of [0,along])for(let j=0;j<across;j++) {
    const a=r*(across+1)+j,b=a+1;
    r===0?ids.push(a,b,a+layer,b,b+layer,a+layer):ids.push(a,a+layer,b,a+layer,b+layer,b);
  }
  addMesh(group,'Hina / continuous swept left temple and cheek edge',surfaceMesh(p,ids,null,col),material);
}

function buildHair(group, ramp) {
  const hairMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,metalness:0,side:THREE.DoubleSide});
  hairMat.userData.smoothHairSurface=true;
  const seam=new THREE.MeshBasicMaterial({color:'#1c2a36'});
  const sheen=new THREE.MeshBasicMaterial({color:'#41586a'});
  const subtle=new THREE.MeshBasicMaterial({color:'#34495a'});
  const p=[],ids=[],cols=[],uv=[];
  const around=128,rows=64,base=new THREE.Color('#29353e');
  for(let j=0;j<=rows;j++) {
    const t=j/rows;
    for(let i=0;i<=around;i++) {
      const a=i/around*PI*2, c=scalp(a,t);
      const ripple=.0007*Math.sin(a*18+t*3)*Math.sin(t*PI);
      c.x+=Math.sin(a)*ripple;c.z+=Math.cos(a)*ripple;
      p.push(c.x,c.y,c.z);uv.push(i/around,t);
      const mod=.96+.045*Math.sin(a*8+t*2)+.025*Math.cos(a*16-t*3);
      cols.push(base.r*mod,base.g*mod,base.b*mod);
      if(j<rows&&i<around) {const n=j*(around+1)+i,b=n+around+1;ids.push(n,n+1,b,n+1,b+1,b);}
    }
  }
  addMesh(group,'Hina / closed swept hair cap',surfaceMesh(p,ids,uv,cols),hairMat);
  // The crown remains one smooth coherent mass. Fine embedded flow lines
  // describe its growth without adding raised rope-like geometry.
  for(let i=0;i<19;i++) {
    const a=mix(.98,PI*2-.98,i/18), pts=[];
    for(let k=0;k<=8;k++) {
      const t=mix(.19,.965,k/8), twist=.09*Math.sin(t*PI);
      pts.push(scalp(a+twist,t,.0008).toArray());
    }
    tube(group,`Hina / subtle rear growth line ${i+1}`,pts,.00022,i%5===0?subtle:seam,40);
  }
  // Broad foreground sections establish the asymmetrical Hina fringe.
  const bangs=[
    {p:[[.069,1.623,.080],[.052,1.603,.108],[.026,1.572,.126],[-.012,1.538,.130],[-.041,1.514,.118]],w:.024,d:.0025,c:'#28343e'},
    {p:[[.056,1.642,.062],[.036,1.616,.108],[.008,1.578,.131],[-.030,1.541,.132],[-.069,1.487,.106]],w:.029,d:.0030,c:'#28343e'},
    {p:[[.028,1.650,.048],[.003,1.626,.105],[-.028,1.582,.132],[-.059,1.534,.127],[-.089,1.470,.092]],w:.029,d:.0032,c:'#27333d'},
    {p:[[-.001,1.650,.043],[-.043,1.618,.103],[-.074,1.572,.112],[-.091,1.512,.092],[-.106,1.430,.059]],w:.028,d:.0035,c:'#29353e'},
    {p:[[-.034,1.642,.033],[-.077,1.608,.079],[-.111,1.553,.072],[-.126,1.475,.024],[-.106,1.397,.019]],w:.025,d:.0040,c:'#2a363f'},
    {p:[[.088,1.602,.078],[.081,1.578,.108],[.061,1.549,.122],[.032,1.527,.129],[-.003,1.511,.126]],w:.021,d:.0022,c:'#29363f'},
    {p:[[.106,1.575,.061],[.110,1.541,.067],[.112,1.495,.060],[.105,1.437,.057],[.092,1.376,.057]],w:.010,d:.0030,c:'#2a363f'}
  ];
  bangs.forEach((b,i)=>{
    const points=b.p.map(([x,y],k)=>{
      const t=k/(b.p.length-1);
      // Every root now grows from the head; only the descending fringe lifts
      // slightly away from skin. This eliminates detached shelf-like crowns.
      const separation=.0009+.0030*Math.sin(PI*t)+.0045*t;
      return [x,y,hairEnvelopeZ(x,y)+separation];
    });
    hairLock(group,`Hina / swept fringe ${i+1}`,points,b.w,b.d,hairMat,{color:b.c,outward:[0,.14,1],conformHead:true,sheen:i===0||i===2||i===6?subtle:null,sheenWidth:.00036});
  });
  // A broad quiet underlayer closes the exposed triangular temple gap.
  // It stays behind the tapered foreground locks and follows the skull.
  buildTempleSweep(group,hairMat);
  // The opposite isolated strand also begins inside the scalp, never in air.
  hairLock(group,'Hina / right cheek isolated long wisp',[[.092,1.601,hairEnvelopeZ(.092,1.601)-.002],[.111,1.548,hairEnvelopeZ(.111,1.548)],[.119,1.493,.055],[.111,1.430,.054],[.104,1.370,.051]],.0058,.0025,hairMat,{outward:[.4,0,1],color:'#263641',conformHead:true});
  const tie=new THREE.MeshToonMaterial({color:'#202d37',gradientMap:ramp});
  for(const side of [-1,1]) {
    const x=side*.092;
    const tieMesh=addMesh(group,`Hina / low hair tie ${side}`,new THREE.TorusGeometry(.0105,.0024,8,32),tie);
    tieMesh.position.set(x,1.396,-.021);
    tieMesh.rotation.set(PI/2+.28,0,side*.20);
    const left=side<0;
    const root=[x,1.406,-.028];
    const shorten=q=>left?q:q.map((v,k)=>root[k]+(v-root[k])*.77);
    const main=(left?
      [root,[-.113,1.356,.007],[-.137,1.308,.050],[-.127,1.257,.086],[-.071,1.209,.112]]:
      [root,[.107,1.360,-.011],[.123,1.309,.040],[.118,1.265,.080],[.125,1.224,.096]]).map(shorten);
    // The near tail spreads over the shoulder before converging into points;
    // the far tail is shorter and fuller at the collar, matching the source.
    hairLock(group,`Hina / ${left?'left':'right'} integrated low pigtail`,main,left?.030:.024,left?.0135:.0125,hairMat,{color:'#2a3842',outward:[side*.22,0,1],taper:.36,rootFull:true,widthProfile:left?[.37,.52,.85,1.03,.69,.24,.009]:[.43,.65,.88,1,.92,.60,.008]});
    // Only four quiet surface ribbons preserve a broad natural silhouette.
    for(let i=0;i<4;i++) {
      const spread=(i-1.5)*(left?.010:.0072);
      const pts=main.map((q,k)=>[q[0]+spread*Math.sin(k/4*PI*.85),q[1]+(k===4?(i%2?-.009:.005):0),q[2]+.009*Math.sin(k/4*PI)]);
      if(i===0){pts[4][0]+=side*.008;pts[4][1]-=.008;}
      if(i===3){pts[4][0]-=side*.006;pts[4][1]-=.006;}
      hairLock(group,`Hina / pigtail surface flow ${side} ${i}`,pts,.0059,.0018,hairMat,{color:i%2?'#2b3943':'#273640',outward:[side*.2,0,1],taper:.42,rootFull:true,sheen:i===2?subtle:null,sheenWidth:.00026});
    }
    const tip=(left?[[-.129,1.324,.052],[-.144,1.284,.077],[-.128,1.251,.099],[-.097,1.211,.120]]:[[.119,1.324,.050],[.135,1.285,.067],[.135,1.255,.085],[.117,1.220,.107]]).map(shorten);
    hairLock(group,`Hina / fine shoulder hair tip ${side}`,tip,.0044,.0017,hairMat,{outward:[side*.3,0,1],color:'#283741'});
  }
  return hairMat;
}

export function createHead({materials={}}={}) {
  const group=new THREE.Group();
  group.name='Hina / original face, eyes, and navy twin-tail hair';
  const ramp=toonRamp();
  const skin=materials.skin||new THREE.MeshToonMaterial({color:'#f3cdb3',gradientMap:ramp});
  const ink=new THREE.MeshBasicMaterial({color:'#26313b',side:THREE.DoubleSide});
  const feature=new THREE.MeshBasicMaterial({color:'#896052',side:THREE.DoubleSide});
  const crease=new THREE.MeshBasicMaterial({color:'#bb937d',side:THREE.DoubleSide});
  const inner=new THREE.MeshToonMaterial({color:'#d59e88',gradientMap:ramp});
  buildFace(group,skin);
  buildEar(group,-1,skin,inner);buildEar(group,1,skin,inner);
  buildEyes(group,ink,crease);
  facialRibbon(group,'Hina / gentle closed smile',t=>{const x=(t-.5)*.038;return[x,1.389+.0035*Math.pow((t-.5)*2,2)+.00055*t,.0015];},t=>.00042+.00059*Math.sin(PI*t),feature,40);
  // Tiny partial nostril and nose-side line; the nose volume is in the face.
  facialRibbon(group,'Hina / delicate nose accent',t=>[.0063+.0031*t-.0014*Math.sin(PI*t),1.4275-.0080*t,.0010],t=>.00014+.00050*Math.sin(PI*t),feature,20);
  facialRibbon(group,'Hina / nose soft base',t=>[.0055+.004*t,1.4145+.0031*Math.sin(PI*t*.72),.0009],t=>.00012+.00035*Math.sin(PI*t),feature,16);
  buildHair(group,ramp);
  // Final reference proportions: crown 1.650, chin 1.385, eyes 1.491.
  const verticalScale=(1.650-1.385)/(1.665-1.339);
  const fit=new THREE.Matrix4().compose(V(0,1.385-1.339*verticalScale,0),new THREE.Quaternion(),V(.965,verticalScale,.965));
  // Bake the fit so the exported group keeps an identity transform and can
  // be rotated by the viewer without losing its absolute world heights.
  for(const mesh of group.children) {
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(fit.clone().multiply(mesh.matrix));
    mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);mesh.updateMatrix();
  }
  group.userData={originalProceduralModel:true,coordinateSystem:'+Y up / +Z face front',reference:'Hina only',highestPoint:1.650,chinHeight:1.385};
  return group;
}
