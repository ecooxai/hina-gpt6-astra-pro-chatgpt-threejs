import * as THREE from 'three';

// Original procedural tailoring and anatomy. +Z is the character's front.
export const BODY_POSE = {
  shoulderLeft: [-.11, 1.31, .005], shoulderRight: [.094, 1.308, -.025],
  upperGrip: [.18, 1.20, .125], lowerGrip: [.222, 1.149, .170],
  soles: 0, shortsHem: .78, neckTop: 1.40,
};

const fittingSources = new WeakMap();

/** Reversible, idempotent fitting in body coordinates. Defaults preserve the model. */
export function fitBodyProportions(body, { hipWidth=1, legWidth=1, rightLegInward=0, rightLegBack=0 }={}) {
  const fit={hipWidth:THREE.MathUtils.clamp(hipWidth,.65,1.25),legWidth:THREE.MathUtils.clamp(legWidth,.75,1.20),rightLegInward:THREE.MathUtils.clamp(rightLegInward,-.07,.07),rightLegBack:THREE.MathUtils.clamp(rightLegBack,-.25,.10)};
  body.updateWorldMatrix(true,true);
  if(!fittingSources.has(body)) {
    const entries=[],inverse=body.matrixWorld.clone().invert();
    body.traverse(o=>{
      if(!o.isMesh||!o.geometry.attributes.position)return;
      const toBody=inverse.clone().multiply(o.matrixWorld),fromBody=toBody.clone().invert();
      let parent=o,part=o.name;
      while(parent.parent&&parent.parent!==body){parent=parent.parent;part+=' '+parent.name;}
      entries.push({object:o,source:o.geometry.attributes.position.array.slice(),toBody,fromBody,part});
    });
    fittingSources.set(body,entries);
  }
  const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const axis=(rows,y)=>{for(let i=1;i<rows.length;i++)if(y<=rows[i][0]){const t=THREE.MathUtils.clamp((y-rows[i-1][0])/(rows[i][0]-rows[i-1][0]),0,1);return [THREE.MathUtils.lerp(rows[i-1][1],rows[i][1],t),THREE.MathUtils.lerp(rows[i-1][2],rows[i][2],t)];}return rows.at(-1).slice(1);};
  const leftAxis=[[.132,-.067,.015],[.170,-.067,.012],[.246,-.068,0],[.318,-.071,-.001],[.388,-.069,.002],[.456,-.060,.009],[.510,-.052,.013],[.555,-.052,.014],[.620,-.056,.010],[.696,-.062,.007],[.761,-.065,.002],[.812,-.067,-.006]];
  const rightAxis=[[.131,.035,-.020],[.169,.035,-.027],[.245,.030,-.030],[.319,.026,-.032],[.390,.026,-.029],[.455,.030,-.020],[.510,.028,-.013],[.553,.031,-.014],[.609,.039,-.014],[.686,.052,-.019],[.753,.061,-.020],[.810,.066,-.022]];
  const p=new THREE.Vector3();
  for(const {object,source,toBody,fromBody,part} of fittingSources.get(body)) {
    const isLeg=/^(left|right) (leg ·|kneecap)/.test(object.name),rightLeg=/^right (leg ·|kneecap)/.test(object.name),rightShoe=part.includes('right red canvas sneaker');
    const isClothing=/hood|pink|denim|shorts|cuff|pocket|fly|waist|hem|knit|collar.*fold|fabric crease|diagonal fold|gather above|armhole|neck binding/i.test(object.name);
    const positions=object.geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      p.fromArray(source,i*3).applyMatrix4(toBody);
      if(isLeg&&fit.legWidth!==1){const c=axis(rightLeg?rightAxis:leftAxis,p.y);p.x=c[0]+(p.x-c[0])*fit.legWidth;p.z=c[1]+(p.z-c[1])*fit.legWidth;}
      if((isLeg||isClothing)&&fit.hipWidth!==1){const w=smooth(.54,.81,p.y)*(1-smooth(1.06,1.255,p.y));p.x*=1+(fit.hipWidth-1)*w;}
      if(rightLeg){const w=1-smooth(.15,.81,p.y);p.x+=fit.rightLegInward*w;p.z+=fit.rightLegBack*w;}
      if(rightShoe){p.x+=fit.rightLegInward;p.z+=fit.rightLegBack;}
      p.applyMatrix4(fromBody);positions.setXYZ(i,p.x,p.y,p.z);
    }
    positions.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingSphere();object.geometry.computeBoundingBox();
  }
  body.userData.proportionFit=fit;
  return body;
}

const V = p => new THREE.Vector3(...p);
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b,x));
const mix = (a,b,t) => a+(b-a)*t;
function sample(values,t) {
  const k=clamp(t)*(values.length-1), i=Math.floor(k), f=k-i;
  const a=values[Math.max(0,i-1)], b=values[i], c=values[Math.min(values.length-1,i+1)], d=values[Math.min(values.length-1,i+2)];
  return b+.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)));
}
function interp(rows,y,k) {
  if(y<=rows[0][0])return rows[0][k];
  for(let i=1;i<rows.length;i++)if(y<=rows[i][0]) {
    const t=(y-rows[i-1][0])/(rows[i][0]-rows[i-1][0]);
    return mix(rows[i-1][k],rows[i][k],t*t*(3-2*t));
  }
  return rows.at(-1)[k];
}
function geo(pos,ind) {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(ind);g.computeVertexNormals();return g;
}
function mesh(g,m,name) {
  const o=new THREE.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;return o;
}
function curve(points) { return new THREE.CatmullRomCurve3(points.map(V),false,'centripetal'); }
function line(parent,points,r,mat,name='tailored seam',segments=32) {
  const o=mesh(new THREE.TubeGeometry(curve(points),segments,r,5,false),mat,name);parent.add(o);return o;
}
function loop(parent,points,r,mat,name) {
  const c=new THREE.CatmullRomCurve3(points.map(V),true,'centripetal');
  const o=mesh(new THREE.TubeGeometry(c,Math.max(48,points.length*3),r,5,true),mat,name);parent.add(o);return o;
}
function polygonSeam(parent,points,r,mat,name) {
  const c=new THREE.CurvePath();for(let i=0;i<points.length;i++)c.add(new THREE.LineCurve3(V(points[i]),V(points[(i+1)%points.length])));
  const o=mesh(new THREE.TubeGeometry(c,points.length*10,r,5,true),mat,name);parent.add(o);return o;
}
function sweep(parent,points,widths,depths,mat,name,{steps=72,sides=24,front=[0,0,1],cap=true}={}) {
  const path=curve(points), f=V(front), positions=[],indices=[];
  for(let i=0;i<=steps;i++) {
    const t=i/steps,c=path.getPoint(t),a=path.getTangent(t).normalize();
    const n=f.clone().addScaledVector(a,-f.dot(a)).normalize();
    const b=new THREE.Vector3().crossVectors(a,n).normalize();
    const rx=Math.max(.0003,sample(widths,t)),rz=Math.max(.0003,sample(depths,t));
    for(let j=0;j<=sides;j++) {
      const ph=j/sides*Math.PI*2,p=c.clone().addScaledVector(b,Math.cos(ph)*rx).addScaledVector(n,Math.sin(ph)*rz);
      positions.push(p.x,p.y,p.z);
      if(i<steps&&j<sides){const q=i*(sides+1)+j;indices.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}
    }
  }
  if(cap)for(const end of [0,steps]) {
    const c=path.getPoint(end/steps),ix=positions.length/3;positions.push(c.x,c.y,c.z);
    for(let j=0;j<sides;j++){const k=end*(sides+1)+j;end===0?indices.push(ix,k+1,k):indices.push(ix,k,k+1);}
  }
  const o=mesh(geo(positions,indices),mat,name);parent.add(o);return o;
}
function loft(parent,rows,mat,name,{segments=64,levels=48,deform=null,cap=false}={}) {
  const p=[],idx=[];
  for(let i=0;i<=levels;i++) {
    const y=mix(rows[0][0],rows.at(-1)[0],i/levels),rx=interp(rows,y,1),rz=interp(rows,y,2),cx=interp(rows,y,3),cz=interp(rows,y,4);
    for(let j=0;j<=segments;j++) {
      const a=j/segments*2*Math.PI,off=deform?deform(y,a):0;
      p.push(cx+(rx+off)*Math.cos(a),y,cz+(rz+off*.7)*Math.sin(a));
      if(i<levels&&j<segments){const k=i*(segments+1)+j;idx.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
  }
  if(cap)for(const end of [0,levels]) {
    const r=end===0?rows[0]:rows.at(-1),k=p.length/3;p.push(r[3],r[0],r[4]);
    for(let j=0;j<segments;j++){const q=end*(segments+1)+j;end===0?idx.push(k,q,q+1):idx.push(k,q+1,q);}
  }
  const o=mesh(geo(p,idx),mat,name);parent.add(o);return o;
}
function patch(parent,points,mat,name) {
  const p=points.flat(),span=[0,1,2].map(a=>Math.max(...points.map(v=>v[a]))-Math.min(...points.map(v=>v[a])));
  const omit=span.indexOf(Math.min(...span)),axes=[0,1,2].filter(a=>a!==omit);
  const outline=points.map(v=>new THREE.Vector2(v[axes[0]],v[axes[1]]));
  const idx=THREE.ShapeUtils.triangulateShape(outline,[]).flat();
  const o=mesh(geo(p,idx),mat,name);parent.add(o);return o;
}

export function createBody({materials={}}={}) {
  const body=new THREE.Group();body.name='Hina · sculpted body and tailored outfit';
  const mat=(key,color,rough=.88)=>materials[key]||new THREE.MeshToonMaterial({color,side:THREE.DoubleSide});
  const skin=mat('skin','#f3cdb3'),skinShade=mat('skinShade','#c58f89'),nail=mat('nail','#f8ded0');
  const cream=mat('cream','#e7e5dc'),creamFold=mat('creamFold','#c2babc'),creamLine=mat('creamLine','#aaa5a5');
  const rose=mat('rose','#e98599'),roseShadow=mat('roseShadow','#bd667a');
  const denim=mat('denim','#4f709b'),denimDark=materials.denimDark||new THREE.MeshBasicMaterial({color:'#405873'}),denimLight=mat('denimLight','#9db7cb');
  const stitch=materials.stitch||new THREE.MeshBasicMaterial({color:'#7c94ad'}),ink=materials.ink||new THREE.MeshBasicMaterial({color:'#677780'});
  const red=mat('shoeRed','#dd666e'),white=mat('shoeWhite','#ebe9df'),shoeGray=mat('shoeGray','#bcbcb3');
  const sole=mat('sole','#d1d2c9'),soleDark=mat('soleDark','#8c9491'),sock=mat('sock','#6caebb');
  const dark=mat('choker','#333d48'),silver=mat('silver','#c1c9c9'),blue=mat('pendant','#339bc0');

  // Smooth neck, collarbones and shoulder caps disappear naturally into the garment.
  loft(body,[[1.264,.047,.022,0,-.010],[1.297,.046,.027,0,-.003],[1.326,.034,.028,-.006,-.003],[1.35,.029,.027,-.005,0],[1.385,.029,.027,-.005,0],[1.40,.0225,.0215,-.005,0]],skin,'neck and upper chest',{cap:true});

  // Foreground arm is one continuous elliptical loft through the elbow, not joint beads.
  const leftArm=[[-.112,1.298,.018],[-.113,1.271,.035],[-.098,1.209,.047],[-.072,1.137,.065],[-.039,1.053,.096],[-.017,1.012,.116],[.012,1.019,.133],[.064,1.059,.151],[.120,1.104,.160],[.158,1.145,.155]];
  const leftWidths=[.030,.037,.035,.030,.024,.023,.0235,.0215,.018,.0135],leftDepths=[.031,.035,.033,.029,.024,.024,.023,.019,.016,.012];
  const rightArm=[[.094,1.297,-.027],[.116,1.26,-.019],[.131,1.194,-.011],[.137,1.111,.014],[.123,1.035,.052],[.140,1.050,.087],[.165,1.081,.120],[.185,1.111,.14]];
  const rightWidths=[.028,.030,.029,.025,.022,.023,.022,.014],rightDepths=[.027,.028,.027,.024,.022,.023,.019,.0125];

  function makeGrip(wrist,contact,axis,pipeRadius,name,armPoints,armWidths,armDepths) {
    const g=new THREE.Group();g.name=name;body.add(g);
    const C=V(contact),A=V(axis).normalize(),W=V(wrist),N=new THREE.Vector3(0,0,1).addScaledVector(A,-A.z).normalize();
    const U=new THREE.Vector3().crossVectors(A,N).normalize(),D=C.clone().sub(W).normalize();
    const P=C.clone().addScaledVector(N,-.007).addScaledVector(A,-.004).addScaledVector(U,-.002);
    const handPoints=[W.clone().addScaledVector(D,.014).toArray(),P.clone().addScaledVector(A,-.009).toArray(),P.clone().addScaledVector(A,.019).toArray()];
    sweep(g,[...armPoints,...handPoints],[...armWidths,.0155,.0175,.0115],[...armDepths,.0095,.009,.0075],skin,`${name} continuous shoulder elbow wrist and palm`,{steps:156,sides:32});
    const offsets=[.018,.006,-.006,-.017],sizes=[.0050,.0057,.0054,.0048];
    offsets.forEach((at,i)=>{
      const r=pipeRadius+sizes[i]*.89,points=[];
      for(let k=0;k<=9;k++) {
        const theta=mix(-.53,2.85,k/9),rad=r+(k<2?.004*(1-k/2):0);
        const p=C.clone().addScaledVector(A,at).addScaledVector(N,Math.cos(theta)*rad).addScaledVector(U,Math.sin(theta)*rad);
        if(k===0)p.addScaledVector(N,.005);points.push(p.toArray());
      }
      sweep(g,points,[sizes[i]*.89,sizes[i],sizes[i]*.92,sizes[i]*.72,sizes[i]*.16],[sizes[i]*.88,sizes[i],sizes[i]*.89,sizes[i]*.70,sizes[i]*.16],skin,`${name} ${['index','middle','ring','little'][i]} finger`,{steps:36,sides:14});
      const creasePoints=[-.18,.02,.22].map(theta=>C.clone().addScaledVector(A,at+sizes[i]*.72).addScaledVector(N,Math.cos(theta)*(r+sizes[i]*.76)).addScaledVector(U,Math.sin(theta)*(r+sizes[i]*.76)).toArray());
      line(g,creasePoints,.00043,skinShade,`${name} finger joint crease ${i+1}`,10);
      // Small curved nail plates on the terminal phalanges, no detached ornaments.
      const a=2.32,c=C.clone().addScaledVector(A,at).addScaledVector(N,Math.cos(a)*(r+sizes[i]*.82)).addScaledVector(U,Math.sin(a)*(r+sizes[i]*.82));
      const nm=mesh(new THREE.SphereGeometry(1,12,8),nail,`${name} fingernail ${i+1}`);
      nm.position.copy(c);nm.scale.set(sizes[i]*.52,sizes[i]*.77,.0006);nm.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),N.clone().multiplyScalar(Math.cos(a)).addScaledVector(U,Math.sin(a)));g.add(nm);
    });
    const tp=[W.clone().addScaledVector(D,.022).addScaledVector(U,-.013),C.clone().addScaledVector(A,-.019).addScaledVector(U,-.024).addScaledVector(N,.019),C.clone().addScaledVector(A,-.002).addScaledVector(U,-.020).addScaledVector(N,.026),C.clone().addScaledVector(A,.010).addScaledVector(U,-.002).addScaledVector(N,.023)];
    sweep(g,tp.map(p=>p.toArray()),[.007,.0075,.006,.0042,.0014],[.0065,.007,.0055,.0042,.0013],skin,`${name} opposed thumb`,{steps:36,sides:16});
    return g;
  }
  makeGrip([.158,1.145,.155],[.18,1.20,.125],[-.32,.39,-.345],.004,'upper hand gripping umbrella pole',leftArm,leftWidths,leftDepths);
  makeGrip([.185,1.111,.14],[.222,1.149,.170],[-.32,.39,-.345],.008,'lower hand gripping ivory stem',rightArm,rightWidths,rightDepths);

  // Original sleeveless hoodie: front/back panels leave genuine open armholes.
  loft(body,[[.936,.129,.056,0,-.016],[1.09,.108,.048,-.006,-.016],[1.18,.112,.046,-.010,-.016],[1.255,.106,.042,-.010,-.016]],rose,'recessed pink undershirt visible within armholes',{levels:42,segments:56});
  const shirtRows=[[.961,.146,.074,0,-.013],[.982,.154,.078,-.005,-.013],[1.012,.149,.080,-.005,-.013],[1.05,.134,.073,-.006,-.014],[1.073,.132,.071,-.006,-.013],[1.159,.120,.069,-.011,-.016],[1.218,.126,.067,-.014,-.018],[1.270,.133,.061,-.012,-.020],[1.300,.107,.046,-.011,-.015],[1.322,.046,.034,-.005,-.003]];
  const holeRows=[[.96,0],[1.177,0],[1.224,.58],[1.274,.43],[1.302,.19],[1.322,0]];
  function clothPoint(y,u,back=false,offset=0) {
    const ph=interp(holeRows,y,1),theta=ph+u*(Math.PI-2*ph),rx=interp(shirtRows,y,1),rz=interp(shirtRows,y,2);
    const t=(y-.961)/(1.322-.961),rawX=interp(shirtRows,y,3)+rx*Math.cos(theta);
    // Cotton gathers into the waistband. Broad ridges and narrow valleys are
    // part of the surface, so their shading follows the light from every view.
    const pin=clamp((y-.973)/.014),env=Math.exp(-Math.pow((y-1.018)/.047,4))*pin*pin*(3-2*pin);
    const d1=rawX-(-.099+.67*(y-.977)),d2=rawX-(.020+.84*(y-1.025));
    const tuck=.006*Math.exp(-Math.pow((d1-.006)/.011,2))-.0022*Math.exp(-Math.pow((d1+.002)/.0045,2))+.0028*Math.exp(-Math.pow((d2-.006)/.022,2))-.001*Math.exp(-Math.pow((d2+.010)/.010,2));
    const hemDistance=y-(.981+.010*Math.cos((rawX+.035)*11));
    const gather=.0032*Math.exp(-Math.pow((hemDistance-.003)/.006,2))-.0015*Math.exp(-Math.pow((hemDistance+.001)/.003,2));
    const folds=back?0:(tuck*env+gather*pin)*Math.sin(theta)**1.6;
    const f=(.0013*Math.sin(theta*8+y*34)+.0009*Math.cos(theta*15-y*47))*Math.sin(Math.PI*clamp(t))+folds;
    const x=interp(shirtRows,y,3)+(rx+f+offset)*Math.cos(theta),z=interp(shirtRows,y,4)+(back?-1:1)*(rz+f*.7+offset)*Math.sin(theta);
    const roundV=(Math.sqrt(1.0225)-Math.sqrt(Math.cos(theta)**2+.0225))/(Math.sqrt(1.0225)-.15);
    const neckline=back?.001:-.027*roundV*Math.pow(clamp(t),3);
    return [x,y+neckline,z];
  }
  for(const back of [false,true]) {
    const p=[],ids=[],nx=64,ny=74;
    for(let i=0;i<=ny;i++)for(let j=0;j<=nx;j++) {
      p.push(...clothPoint(mix(.961,1.322,i/ny),j/nx,back));
      if(i<ny&&j<nx){const k=i*(nx+1)+j;back?ids.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1):ids.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}
    }
    body.add(mesh(geo(p,ids),cream,back?'hoodie back panel':'hoodie front panel'));
    for(const u of [0,1]) {
      const edge=Array.from({length:30},(_,i)=>clothPoint(mix(1.177,1.322,i/29),u,back,.001));
      line(body,edge,.002,creamFold,`${back?'back':'front'} armhole turned edge`,40);
      const pink=edge.map(([x,y,z])=>[x+(u===0?-.001:.001),y-.006,z+(back?.001:-.001)]);
      line(body,pink,.0012,rose,'pink undershirt armhole binding',40);
    }
    const neck=Array.from({length:33},(_,i)=>clothPoint(1.322,i/32,back,.0004));
    line(body,neck,back?.0018:.0011,back?creamFold:cream,back?'back neck binding':'soft V neckline binding',40);
  }
  // Tailored horizontal folds and the broad ribbed bottom band.
  loft(body,[[.931,.140,.070,0,-.012],[.943,.142,.071,0,-.013],[.962,.151,.076,0,-.015],[.974,.146,.074,0,-.013]],cream,'hoodie wide ribbed waistband',{levels:28});
  loft(body,[[.913,.142,.068,0,-.014],[.918,.143,.068,0,-.014],[.936,.141,.069,0,-.014]],rose,'pink undershirt visible hem',{levels:16});
  for(const y of [.935,.968]) {
    const pts=Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[(y>.95?.149:.141)*Math.cos(a),y,-.014+(y>.95?.077:.071)*Math.sin(a)];});
    loop(body,pts,.0011,creamLine,'hoodie waistband fine seam');
  }
  for(let i=0;i<56;i++) {
    const a=i/56*Math.PI*2;
    line(body,[[.141*Math.cos(a),.938,-.012+.0715*Math.sin(a)],[.144*Math.cos(a),.955,-.014+.0735*Math.sin(a)]],.00036,creamFold,'knit waistband rib',3);
  }
  // A rounded turned band follows the actual cloth surface. Its free inner lip
  // rises only a few millimeters; the outside settles continuously into the torso.
  function collarPoint(u,s) {
    const width=.010+.018*Math.sin(Math.PI*u)**.75+.002*Math.sin(Math.PI*2*u);
    const p=clothPoint(1.322-width*s,u,false,.0007);
    const roll=Math.sin(Math.PI*s)*Math.sin(Math.PI*u)**.4;
    p[2]+=.0040*roll;p[1]-=.0015*roll;
    return p;
  }
  const cp=[],ci=[],cu=80,cv=20;
  for(let i=0;i<=cu;i++)for(let j=0;j<=cv;j++) {
    cp.push(...collarPoint(i/cu,j/cv));
    if(i<cu&&j<cv){const k=i*(cv+1)+j;ci.push(k,k+cv+1,k+1,k+1,k+cv+1,k+cv+2);}
  }
  body.add(mesh(geo(cp,ci),cream,'draped rounded V hood collar fold'));
  line(body,Array.from({length:49},(_,i)=>collarPoint(i/48,0)),.0011,cream,'soft rolled inner collar fold',56);
  line(body,Array.from({length:49},(_,i)=>collarPoint(i/48,.94)),.00035,creamFold,'settled outer collar fold seam',56);
  line(body,[[.093,1.160,.032],[.083,1.133,.043],[.091,1.112,.038]],.0009,creamFold,'right side soft fabric crease',22);

  // The collapsed hood has a round hanging pouch, rather than a planar flap.
  // The lower hem rests on the back while the middle rounds away from the cloth.
  const outer=curve([[-.063,1.321,-.009],[-.091,1.300,-.040],[-.104,1.266,-.061],[-.077,1.233,-.081],[-.016,1.218,-.087],[.057,1.230,-.082],[.091,1.260,-.065],[.078,1.301,-.037],[.048,1.325,-.008]]);
  const inner=curve([[-.063,1.321,-.009],[-.040,1.324,-.025],[-.020,1.330,-.034],[0,1.332,-.036],[.028,1.331,-.030],[.043,1.327,-.022],[.048,1.325,-.008]]);
  function hoodPoint(t,s) {
    const p=inner.getPoint(t).lerp(outer.getPoint(t),s),fullness=Math.sin(Math.PI*s)*Math.sin(Math.PI*t)**.7;
    p.z-=.042*fullness;p.y-=.006*fullness;
    p.x+=.003*Math.sin(Math.PI*s)*Math.sin(Math.PI*2*t);
    return p;
  }
  const hp=[],hi=[],hu=64,hv=28;
  for(let i=0;i<=hu;i++)for(let j=0;j<=hv;j++) {
    const p=hoodPoint(i/hu,j/hv);hp.push(p.x,p.y,p.z);
    if(i<hu&&j<hv){const k=i*(hv+1)+j;hi.push(k,k+hv+1,k+1,k+1,k+hv+1,k+hv+2);}
  }
  body.add(mesh(geo(hp,hi),cream,'softly rounded hanging hood'));
  line(body,Array.from({length:48},(_,i)=>outer.getPoint(i/47).toArray()),.0018,cream,'hood outside soft rolled edge',56);
  line(body,Array.from({length:48},(_,i)=>inner.getPoint(i/47).toArray()),.0014,creamFold,'hood inner neck edge',56);
  line(body,Array.from({length:26},(_,i)=>{const p=hoodPoint(.5,i/25);p.z-=.0006;return p.toArray();}),.0006,creamFold,'hood central stitched seam',32);

  // Denim shorts: shaped seat, two leg openings, turned hems, pocket construction.
  const shortsRows=[[.817,.138,.080,0,-.018],[.852,.141,.081,0,-.018],[.895,.141,.073,0,-.017],[.919,.137,.067,0,-.014]];
  const crotchY=.838;
  const pantsBlend=y=>{const t=clamp((y-.817)/(crotchY-.817));return t*t*(3-2*t);};
  function pantsPoint(side,y,a) {
    const b=pantsBlend(y),c=Math.cos(a),sn=Math.sin(a);
    return [side*mix(.070+.066*c,interp(shortsRows,y,1)*Math.max(0,c),b),y,mix(-.019,interp(shortsRows,y,4),b)+mix(.071,interp(shortsRows,y,2),b)*sn];
  }
  // Both leg openings are part of the same tailored pants surface. Each lower
  // ring exactly matches its cuff; the inseams join before the shared waist.
  for(const side of [-1,1]) {
    const p=[],ix=[],ns=64,ny=68;
    const heights=Array.from({length:ny+1},(_,i)=>i<=20?mix(.817,crotchY,i/20):mix(crotchY,.919,(i-20)/(ny-20)));
    for(let i=0;i<=ny;i++)for(let j=0;j<=ns;j++) {
      p.push(...pantsPoint(side,heights[i],j/ns*Math.PI*2));
      if(i<ny&&j<ns&&!(i>=20&&j>=ns/4&&j<ns*3/4)) {
        const k=i*(ns+1)+j;
        side>0?ix.push(k,k+ns+1,k+1,k+1,k+ns+1,k+ns+2):ix.push(k,k+1,k+ns+1,k+1,k+ns+2,k+ns+1);
      }
    }
    body.add(mesh(geo(p,ix),denim,`${side<0?'left':'right'} continuous denim shorts panel`));
  }
  function denimSurface(x,y,front,extra) {
    const b=pantsBlend(y),base=.070*(1-b),coef=mix(.066,interp(shortsRows,y,1),b),ax=Math.abs(x);
    const c=clamp(ax>=base?(ax-base)/coef:(ax/(1-b)-.070)/.066,-1,1);
    const z=mix(-.019,interp(shortsRows,y,4),b)+(front?1:-1)*(mix(.071,interp(shortsRows,y,2),b)*Math.sqrt(Math.max(0,1-c*c))+extra);
    return [x,y,z];
  }
  const denimFront=(x,y,extra=.0008)=>denimSurface(x,y,true,extra);
  const denimBack=(x,y,extra=.0012)=>denimSurface(x,y,false,extra);
  for(const side of [-1,1]) {
    const cx=side*.070,cz=-.019;
    loft(body,[[.777,.063,.069,cx,cz],[.782,.066,.072,cx,cz],[.808,.068,.073,cx,cz],[.817,.066,.071,cx,cz]],denimLight,`${side<0?'left':'right'} wide turned denim cuff`,{levels:24});
    for(const [y,rx,rz]of[[.779,.065,.071],[.817,.0662,.0712]])loop(body,Array.from({length:64},(_,j)=>{const a=j/64*Math.PI*2;return[cx+rx*Math.cos(a),y,cz+rz*Math.sin(a)];}),.0006,denimDark,'rolled denim cuff seam');
    line(body,[.906,.885,.865,.839,.820].map(y=>{const p=pantsPoint(side,y,0);p[0]+=side*.00065;return p;}),.0007,denimDark,'denim outer side seam',28);
    line(body,[[side*.126,.899],[side*.110,.877],[side*.083,.867],[side*.060,.857]].map(([x,y])=>denimFront(x,y)),.00095,denimDark,'front curved pocket opening',24);
    line(body,[[side*.128,.896],[side*.108,.872],[side*.081,.862]].map(([x,y])=>denimFront(x,y)),.00042,stitch,'pocket double topstitch',20);
    line(body,[[side*.114,.836],[side*.084,.841],[side*.046,.824]].map(([x,y])=>denimFront(x,y)),.00065,denimDark,'denim thigh fold',20);
    // Back pockets follow the rear volume; inset pocket faces sit just above cloth.
    const back=[[side*.034,.883],[side*.100,.883],[side*.100,.847],[side*.067,.837],[side*.034,.847]].map(([x,y])=>denimBack(x,y));
    const bp=[],bi=[],bn=16;
    for(let i=0;i<=bn;i++)for(let j=0;j<=bn;j++) {
      const u=i/bn,x=side*mix(.034,.100,u),bottom=.837+.020*Math.abs(u-.5),y=mix(bottom,.883,j/bn);bp.push(...denimBack(x,y,.0010));
      if(i<bn&&j<bn){const k=i*(bn+1)+j;bi.push(k,k+1,k+bn+1,k+1,k+bn+2,k+bn+1);}
    }
    body.add(mesh(geo(bp,bi),denim,'back patch pocket'));polygonSeam(body,back,.0006,stitch,'back pocket topstitch');
    line(body,[[side*.037,.873],[side*.065,.865],[side*.095,.876]].map(([x,y])=>denimBack(x,y,.0018)),.0005,denimDark,'back pocket chevron stitch',14);
  }
  line(body,[[.006,.910],[.007,.879],[.013,.855],[.008,.845],[0,.838]].map(([x,y])=>denimFront(x,y)),.00095,denimDark,'front fly and crotch seam',32);
  line(body,[[.015,.903],[.018,.879],[.020,.862],[.011,.850]].map(([x,y])=>denimFront(x,y)),.0004,stitch,'denim fly topstitch',22);
  line(body,[[0,.911],[0,.869],[0,.838]].map(([x,y])=>denimBack(x,y)),.0007,denimDark,'shorts back center seam',24);
  for(const x of [-.102,.105])line(body,[denimFront(x,.915),denimFront(x,.892)],.0016,denimDark,'waist belt loop',10);

  // Long, slender legs with quiet bony knees, tapered ankles and calf volumes.
  const leftLeg=[[-.067,.812,-.006],[-.065,.761,.002],[-.062,.696,.007],[-.056,.620,.010],[-.052,.555,.014],[-.052,.510,.013],[-.060,.456,.009],[-.069,.388,.002],[-.071,.318,-.001],[-.068,.246,.000],[-.067,.170,.012],[-.067,.132,.015],[-.067,.110,.015]];
  const rightLeg=[[.066,.810,-.022],[.061,.753,-.020],[.052,.686,-.019],[.039,.609,-.014],[.031,.553,-.014],[.028,.510,-.013],[.030,.455,-.020],[.026,.390,-.029],[.026,.319,-.032],[.030,.245,-.030],[.035,.169,-.027],[.035,.131,-.020],[.035,.110,-.0232]];
  sweep(body,leftLeg,[.051,.050,.046,.040,.032,.029,.031,.035,.032,.025,.020,.019,.017],[.049,.048,.044,.039,.032,.029,.030,.032,.030,.024,.019,.018,.0165],skin,'left leg · thigh knee calf ankle',{steps:128,sides:32});
  sweep(body,rightLeg,[.049,.048,.044,.038,.030,.027,.028,.032,.029,.024,.020,.019,.017],[.047,.046,.041,.036,.029,.026,.028,.030,.028,.023,.019,.018,.0165],skin,'right leg · contrapposto',{steps:128,sides:32});
  line(body,[[-.068,.516,.035],[-.055,.511,.041],[-.042,.518,.034]],.0007,skinShade,'left kneecap quiet crease',16);
  line(body,[[.018,.511,.011],[.028,.505,.015],[.041,.511,.010]],.00065,skinShade,'right kneecap quiet crease',16);

  function sneaker(ankle,yaw,name) {
    const g=new THREE.Group();g.name=name;g.position.set(ankle[0],0,ankle[2]);g.rotation.y=yaw;body.add(g);
    // The entire shoe, including sole perimeter and upper panels, is authored here.
    const fp=[[-.019,-.080],[-.034,-.070],[-.043,-.035],[-.044,.011],[-.047,.065],[-.041,.115],[-.029,.141],[0,.148],[.029,.141],[.041,.115],[.047,.065],[.044,.011],[.043,-.035],[.034,-.070],[.019,-.080]];
    const outline=new THREE.CatmullRomCurve3(fp.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
    function outsole(y0,y1,scale,material,label) {
      const p=[],ix=[],segs=96;
      for(let row=0;row<4;row++)for(let i=0;i<=segs;i++) {
        const c=outline.getPoint(i/segs),s=scale*(row===0||row===3?.988:1.012);p.push(c.x*s,mix(y0,y1,row/3),c.z*s);
        if(row<3&&i<segs){const k=row*(segs+1)+i;ix.push(k,k+1,k+segs+1,k+1,k+segs+2,k+segs+1);}
      }
      const ci=p.length/3;p.push(0,y0,.033);for(let i=0;i<segs;i++)ix.push(ci,i+1,i);
      g.add(mesh(geo(p,ix),material,label));
    }
    outsole(.003,.011,1.045,soleDark,'charcoal sneaker outsole');outsole(.010,.026,1.055,sole,'sculpted light rubber midsole');outsole(.025,.033,1.016,white,'upper foxing lip');
    for(const y of [.013,.023])loop(g,Array.from({length:60},(_,i)=>{const c=outline.getPoint(i/60);return[c.x*1.060,y,c.z*1.060];}),.00085,soleDark,'fine rubber sole line');
    const sections=[[-.080,.011,.067],[-.073,.029,.102],[-.049,.041,.115],[-.012,.044,.111],[.027,.046,.092],[.070,.046,.074],[.112,.038,.058],[.142,.022,.044],[.148,.002,.035]];
    function upperSurface(z,side,off=0) {
      const w=interp(sections,z,1),h=interp(sections,z,2),theta=(side+1)*Math.PI/2;
      return [Math.cos(theta)*(w+off),.030+(h-.030)*Math.sin(theta)+off,z];
    }
    const up=[],ui=[],nz=66,ns=32;
    for(let i=0;i<=nz;i++)for(let j=0;j<=ns;j++) {
      up.push(...upperSurface(mix(-.080,.148,i/nz),mix(-1,1,j/ns)));
      if(i<nz&&j<ns){const k=i*(ns+1)+j;ui.push(k,k+1,k+ns+1,k+1,k+ns+2,k+ns+1);}
    }
    g.add(mesh(geo(up,ui),white,'cream canvas sneaker upper'));
    // Toe panels sit just above the canvas surface instead of intersecting it.
    const rp=[],ri=[],nr=34;
    for(let i=0;i<=nr;i++)for(let j=0;j<=8;j++) {
      const z=mix(.084,.147,i/nr),u=mix(-1,1,j/8),p=upperSurface(z,u,.0015);rp.push(...p);
      if(i<nr&&j<8){const k=i*9+j;ri.push(k,k+1,k+9,k+1,k+10,k+9);}
    }
    g.add(mesh(geo(rp,ri),red,'coral toe bumper'));
    const tp=[],ti=[],rings=12,slices=40;
    for(let i=0;i<=rings;i++)for(let j=0;j<=slices;j++) {
      const r=i/rings,a=j/slices*Math.PI*2;
      tp.push(...upperSurface(.116+.022*r*Math.cos(a),.54*r*Math.sin(a),.0025));
      if(i<rings&&j<slices){const k=i*(slices+1)+j;ti.push(k,k+1,k+slices+1,k+1,k+slices+2,k+slices+1);}
    }
    g.add(mesh(geo(tp,ti),shoeGray,'off-white inset on coral toe'));
    function upperPanel(z0,z1,s,inner0,inner1,material,label,offset=.0016) {
      const p=[],ix=[],nz=24,nu=12;
      for(let i=0;i<=nz;i++)for(let j=0;j<=nu;j++) {
        const t=i/nz,z=mix(z0,z1,t),u=s*mix(mix(inner0,inner1,t),.988,j/nu);p.push(...upperSurface(z,u,offset));
        if(i<nz&&j<nu){const k=i*(nu+1)+j;ix.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);}
      }
      g.add(mesh(geo(p,ix),material,label));
      // The cream stripe lies over the panel stitch; do not draw a second dark
      // line on its free edge or allow the stitch to poke through the stripe.
      const ranges=label==='cream side stripe'?[]:label==='gray canvas side panel'?[[z0,-.018],[.001,z1]]:[[z0,z1]];
      for(const [a,b]of ranges) {
        const boundary=Array.from({length:24},(_,i)=>{const z=mix(a,b,i/23),t=(z-z0)/(z1-z0);return upperSurface(z,s*mix(inner0,inner1,t),offset+.00045);});
        line(g,boundary,.0005,ink,`${label} stitched seam`,28);
      }
    }
    for(const s of [-1,1]) {
      upperPanel(-.043,.072,s,.34,.59,shoeGray,'gray canvas side panel');
      upperPanel(-.078,-.036,s,.34,.50,red,'coral heel reinforcement',.0020);
      upperPanel(-.016,-.001,s,.39,.41,white,'cream side stripe',.0027);
    }
    // Tongue and lace beds rise above the upper in a soft continuous leather form.
    sweep(g,[[0,.064,.075],[0,.087,.043],[0,.109,.005],[0,.124,-.027]], [.025,.025,.024,.020],[.0025,.0035,.004,.0028],shoeGray,'padded shoe tongue',{steps:30,sides:18,front:[0,1,.3]});
    for(const s of [-1,1])line(g,[[s*.030,.061,.081],[s*.028,.083,.046],[s*.025,.105,.006],[s*.022,.123,-.025]],.0028,white,'cream lace facing',30);
    for(let i=0;i<6;i++) {
      const t=i/5,z=mix(.065,-.020,t),y=mix(.074,.122,t),x=mix(.028,.020,t);
      for(const s of [-1,1]) {
        const eye=mesh(new THREE.TorusGeometry(.0025,.0007,5,10),silver,'metal lace eyelet');eye.position.set(s*x,y,z);eye.rotation.x=-Math.PI/2;g.add(eye);
      }
      if(i<5) {
        const t2=(i+1)/5,z2=mix(.065,-.020,t2),y2=mix(.074,.122,t2),x2=mix(.028,.020,t2);
        line(g,[[-x,y+.002,z],[0,(y+y2)/2+.006,(z+z2)/2],[x2,y2+.002,z2]],.00155,white,'crossed cotton shoelace',10);
        line(g,[[x,y+.002,z],[0,(y+y2)/2+.009,(z+z2)/2],[-x2,y2+.002,z2]],.00155,white,'crossed cotton shoelace',10);
      }
    }
    line(g,[[0,.131,-.020],[-.021,.143,-.020],[-.029,.134,-.026],[-.015,.127,-.029],[0,.131,-.020],[.021,.143,-.019],[.028,.134,-.012],[.013,.129,-.011],[0,.131,-.020]],.0017,white,'tied shoelace bow',38);
    line(g,[[0,.131,-.021],[.007,.123,.006],[.015,.101,.028]],.00145,white,'loose lace end',14);
    line(g,[[0,.131,-.021],[-.010,.123,-.007],[-.022,.110,.003]],.00145,white,'loose lace end',14);
    // True collar rim wraps the ankle and maintains a natural side silhouette.
    loop(g,Array.from({length:48},(_,i)=>{const a=i/48*2*Math.PI;return[.029*Math.cos(a),.109+.006*Math.sin(a),-.046+.030*Math.sin(a)];}),.0041,shoeGray,'padded sneaker ankle collar');
    const ankleTarget=name.startsWith('left')?[-.067,.014]:[.03515,-.0232],dx=ankleTarget[0]-ankle[0],dz=ankleTarget[1]-ankle[2];
    const sockX=dx*Math.cos(yaw)-dz*Math.sin(yaw),sockZ=dx*Math.sin(yaw)+dz*Math.cos(yaw);
    const sockRows=[[.107,.020,.019,0,-.032],[.135,.022,.021,sockX*.55,mix(-.032,sockZ,.55)],[.150,.0225,.0215,sockX,sockZ],[.158,.0225,.0215,sockX,sockZ]];
    const sockHeight=y=>.107+(y-.107)*(.038/.051);
    loft(g,sockRows.map(([y,...shape])=>[sockHeight(y),...shape]),sock,'cyan ankle sock',{levels:24,segments:48});
    loop(g,Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2;return[sockX+.0224*Math.cos(a),sockHeight(.1573),sockZ+.0214*Math.sin(a)];}),.0012,sock,'sock folded rim');
    for(let i=0;i<20;i++) {
      const a=i/20*Math.PI*2;
      line(g,[.135,.144,.153].map(y=>[interp(sockRows,y,3)+(interp(sockRows,y,1)+.00015)*Math.cos(a),sockHeight(y),interp(sockRows,y,4)+(interp(sockRows,y,2)+.00015)*Math.sin(a)]),.00026,denimLight,'fine sock rib',6);
    }
    g.userData.sockLandmark=[sockX,sockHeight(.1573)-.010,sockZ];
    // Low canvas sneakers share a 20 mm sole stack. Apply the same continuous
    // height remap to every panel, lace and sock so all their joins stay intact.
    g.updateWorldMatrix(true,true);
    const toGroup=g.matrixWorld.clone().invert(),p=new THREE.Vector3();
    g.traverse(o=>{
      if(!o.isMesh)return;
      const toShoe=toGroup.clone().multiply(o.matrixWorld),fromShoe=toShoe.clone().invert(),a=o.geometry.attributes.position;
      for(let i=0;i<a.count;i++) {
        p.fromBufferAttribute(a,i).applyMatrix4(toShoe);
        p.y=p.y<=.033?.003+(p.y-.003)*2/3:p.y-.010;
        p.applyMatrix4(fromShoe);a.setXYZ(i,p.x,p.y,p.z);
      }
      a.needsUpdate=true;o.geometry.computeVertexNormals();
    });
    return g;
  }
  const nearShoe=sneaker([-.067,0,.047],-.12,'left red canvas sneaker · facing forward');
  // Rotate the far sneaker around its ankle, keeping its toe farther back while
  // the ankle itself stays close to the near ankle's depth, as in the reference.
  const farYaw=1.52,farOrigin=[.035+.032*Math.sin(farYaw),0,-.025+.032*Math.cos(farYaw)];
  const farShoe=sneaker(farOrigin,farYaw,'right red canvas sneaker · turned outward');

  // The double choker and little rain-colored pendant are individual modeled pieces.
  for(const y of [1.368,1.376]) {
    const pts=Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[-.005+.0305*Math.cos(a),y-.0025*Math.sin(a),.0287*Math.sin(a)];});
    loop(body,pts,.0016,dark,'double dark choker');
  }
  line(body,[[-.005,1.365,.029],[-.002,1.358,.032],[0,1.354,.035]],.0008,silver,'pendant suspension',12);
  const bail=mesh(new THREE.TorusGeometry(.0028,.00065,5,12),silver,'silver pendant bail');bail.position.set(0,1.354,.035);body.add(bail);
  const jewel=mesh(new THREE.SphereGeometry(1,18,12),blue,'blue raindrop pendant');jewel.position.set(.0008,1.346,.036);jewel.scale.set(.0035,.0075,.0023);body.add(jewel);
  const shine=mesh(new THREE.SphereGeometry(.0009,8,6),white,'pendant highlight');shine.position.set(-.0002,1.349,.038);body.add(shine);
  body.userData.originalGeometry=true;body.userData.pose=BODY_POSE;
  body.userData.shoes={near:{origin:[-.067,0,.047],yaw:-.12,sockLandmark:nearShoe.userData.sockLandmark},far:{origin:farOrigin,yaw:farYaw,sockLandmark:farShoe.userData.sockLandmark},soleBase:.003,soleTop:.023,sockTop:.135,sockLandmarkY:nearShoe.userData.sockLandmark[1]};
  body.userData.description='Original fitted anatomy, hollow cloth hood, open armholes, five articulated fingers per hand, pocket seams, turned denim cuffs, lace-up sneakers.';
  fitBodyProportions(body,{hipWidth:.87,legWidth:.98,rightLegInward:-.035,rightLegBack:-.010});
  return body;
}
