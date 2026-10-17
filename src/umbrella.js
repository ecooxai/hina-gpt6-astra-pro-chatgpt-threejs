import * as THREE from 'three';

/**
 * Hina's umbrella — original parametric cloth, eight ribs and a hooked grip.
 * All dimensions are metres. +Z faces the portrait camera; feet sit at Y = 0.
 * No external meshes, textures, or generated images are used by this module.
 */
export const UMBRELLA_POSE = Object.freeze({
  hub: [-0.140, 1.590, -0.220],
  upperGrip: [0.180, 1.200, 0.125],
  lowerGrip: [0.222, 1.149, 0.170],
  shaftEnd: [0.216, 1.156, 0.164],
  radius: 0.420,
  apex: 0.102,
  rim: -0.145,
  runnerDrop: 0.080,
  rotation: 0.14,
});

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function vec(value) {
  return value?.isVector3 ? value.clone() : new THREE.Vector3(...value);
}

function metalMaterial(color, roughness = 0.45) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.32 });
}

function curveTube(points, radius, material, name, tubular = 32, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubular, radius, radial, false), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function rodBetween(a, b, radius, material, name, radialSegments = 9) {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), radialSegments, 1), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function ring(radius, tube, material, name, y) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 18), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  mesh.name = name;
  return mesh;
}

/**
 * The optional pose values leave the hands fixed while allowing canopy fitting.
 * `hub`, `normal`, `radius`, `apex`, `rim`, `runnerDrop`, `rotation`, `offset` are accepted.
 * A pose offset translates the complete prop, including its handle.
 * Example: createUmbrella({ pose: { radius: .49, hub: [-.14,1.59,-.24] } }).
 */
export function createUmbrella({ materials = {}, pose = {}, ...overrides } = {}) {
  const cfg = { ...UMBRELLA_POSE, ...overrides, ...pose };
  const group = new THREE.Group();
  group.name = 'Hina · handcrafted eight-panel umbrella';

  const hub = vec(cfg.hub);
  const grip = vec(cfg.upperGrip);
  const shaftEnd = vec(cfg.shaftEnd);
  const axis = cfg.normal ? vec(cfg.normal).normalize() : hub.clone().sub(grip).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(UP, axis);
  const toWorld = (v) => v.clone().applyQuaternion(orientation).add(hub);
  const radius = cfg.radius;
  const apex = cfg.apex;
  const rim = cfg.rim;
  const runnerY = apex - 0.013 - cfg.runnerDrop;
  const panelCount = 8;
  const radialSteps = 30;
  const angularSteps = 12;
  const azimuth = cfg.rotation;

  const outsideMat = materials.umbrellaOutside || new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0,
    side: THREE.FrontSide,
  });
  const insideMat = materials.umbrellaInside || new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.90, metalness: 0,
    // A diffuse blue transmission term keeps the underside luminous under
    // an opaque canopy, matching the airy blue in the source illustration.
    emissive: 0x729ac4, emissiveIntensity: 0.48,
    side: THREE.BackSide,
  });
  const ribMat = materials.umbrellaRibs || new THREE.MeshStandardMaterial({
    color: 0x97aebb, roughness: 0.86, metalness: 0.08,
    emissive: 0x8199aa, emissiveIntensity: 0.28,
  });
  const strutMat = materials.umbrellaStruts || new THREE.MeshStandardMaterial({
    color: 0xa5b7c0, roughness: 0.88, metalness: 0.06,
    emissive: 0x8199aa, emissiveIntensity: 0.23,
  });
  const poleMat = materials.umbrellaShaft || metalMaterial(0xb1bbc0, 0.33);
  const jointMat = materials.umbrellaJoints || metalMaterial(0x7e919a, 0.67);
  const hemMat = materials.umbrellaHem || new THREE.MeshStandardMaterial({
    color: 0xcbd4d3, roughness: 0.97, metalness: 0,
  });
  const seamMat = materials.umbrellaSeams || new THREE.MeshStandardMaterial({
    color: 0xc8cbc5, roughness: 0.95, metalness: 0,
  });
  const handleMat = materials.umbrellaHandle || new THREE.MeshStandardMaterial({
    color: 0xe3e0d8, roughness: 0.57, metalness: 0,
  });
  const handleTrim = materials.umbrellaHandleTrim || new THREE.MeshStandardMaterial({
    color: 0xc8c9c4, roughness: 0.68, metalness: 0.04,
  });

  // The hub frame uses local Y as the umbrella shaft. Cloth is a curved dome,
  // with the shallow centre tightening progressively toward each hanging tip.
  const canopy = new THREE.Group();
  canopy.name = 'Angled canopy and folding frame';
  canopy.position.copy(hub);
  canopy.quaternion.copy(orientation);
  group.add(canopy);

  function profile(s) {
    return apex + (rim - apex) * (0.30 * s * s + 0.70 * s * s * s);
  }

  function clothPoint(s, u, panel, inset = 0) {
    const theta = azimuth + (panel + u) * TAU / panelCount;
    const scallop = 1 - 0.065 * Math.sin(Math.PI * u) ** 2 * s ** 6;
    const r = radius * s * scallop;
    // A small tensioned fullness sits between ribs, without exaggerated lobes.
    const fullness = 0.0075 * Math.sin(Math.PI * u) ** 2 * Math.sin(Math.PI * s * 0.94);
    const edgeLift = 0.003 * Math.sin(Math.PI * u) ** 2 * s ** 8;
    return new THREE.Vector3(r * Math.cos(theta), profile(s) + fullness + edgeLift + inset, r * Math.sin(theta));
  }

  function panelGeometry(panel, underside = false) {
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const base = new THREE.Color(underside ? 0xa3bfdc : 0xe8e5df);
    const tint = new THREE.Color();
    const sectorTone = [0.995, 1.016, 1.005, 0.985, 0.98, 0.993, 1.009, 1.018][panel];
    for (let r = 0; r <= radialSteps; r++) {
      const s = r / radialSteps;
      for (let a = 0; a <= angularSteps; a++) {
        const u = a / angularSteps;
        const p = clothPoint(s, u, panel, underside ? -0.0010 : 0);
        positions.push(p.x, p.y, p.z);
        uvs.push(u, s);
        const centreShadow = underside ? 0.973 + 0.027 * s : 1.0;
        const panelSoftness = 1 + 0.008 * Math.sin(Math.PI * u) * Math.sin(Math.PI * s);
        tint.copy(base).multiplyScalar(sectorTone * centreShadow * panelSoftness);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
    for (let r = 0; r < radialSteps; r++) {
      for (let a = 0; a < angularSteps; a++) {
        const i = r * (angularSteps + 1) + a;
        const j = i + angularSteps + 1;
        // Vertex order is +Y/outside; BackSide renders the blue interior.
        indices.push(i, i + 1, j + 1, i, j + 1, j);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  for (let panel = 0; panel < panelCount; panel++) {
    const outside = new THREE.Mesh(panelGeometry(panel, false), outsideMat);
    outside.name = `Ivory canopy panel ${panel + 1}`;
    outside.castShadow = true;
    outside.receiveShadow = true;
    canopy.add(outside);
    const inside = new THREE.Mesh(panelGeometry(panel, true), insideMat);
    inside.name = `Powder blue lining ${panel + 1}`;
    inside.castShadow = true;
    inside.receiveShadow = false;
    inside.userData.transmittedCloth = true;
    canopy.add(inside);

    const theta = azimuth + panel * TAU / panelCount;
    const seam = [];
    const rib = [];
    for (let step = 0; step <= 27; step++) {
      const s = step / 27;
      seam.push(clothPoint(s, 0, panel, 0.0012));
      const p = clothPoint(s, 0, panel, -0.0050);
      if (step === 0) p.y -= 0.007;
      rib.push(p);
    }
    canopy.add(curveTube(seam, 0.00073, seamMat, `Stitched outer seam ${panel + 1}`, 30, 5));
    canopy.add(curveTube(rib, 0.00175, ribMat, `Spring steel rib ${panel + 1}`, 34, 6));

    // Eight independent stretchers meet each curved main rib at a real hinge.
    const attachS = 0.59;
    const attach = clothPoint(attachS, 0, panel, -0.0078);
    const inner = new THREE.Vector3(0.009 * Math.cos(theta), runnerY, 0.009 * Math.sin(theta));
    const braceMid = inner.clone().lerp(attach, 0.58);
    braceMid.y -= 0.002;
    canopy.add(curveTube([inner, braceMid, attach], 0.00145, strutMat, `Folding stretcher ${panel + 1}`, 8, 6));

    const tang = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
    const hingeA = attach.clone().addScaledVector(tang, -0.0045);
    const hingeB = attach.clone().addScaledVector(tang, 0.0045);
    canopy.add(rodBetween(hingeA, hingeB, 0.0024, jointMat, `Rib hinge ${panel + 1}`, 6));

    // The ferrule protects the exposed tip and extends a few millimetres past
    // the fabric, with a softly rounded cap rather than a sharp open tube.
    const tip = clothPoint(1, 0, panel, -0.003);
    const nearTip = clothPoint(0.972, 0, panel, -0.003);
    const tangent = tip.clone().sub(nearTip).normalize();
    const ferruleEnd = tip.clone().addScaledVector(tangent, 0.009);
    canopy.add(rodBetween(nearTip, ferruleEnd, 0.0026, ribMat, `Covered tip ${panel + 1}`, 8));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0027, 8, 5), ribMat);
    cap.position.copy(ferruleEnd);
    cap.name = `Rounded rib end ${panel + 1}`;
    canopy.add(cap);

    const hem = [];
    for (let a = 0; a <= 26; a++) hem.push(clothPoint(1, a / 26, panel, -0.0002));
    canopy.add(curveTube(hem, 0.0013, hemMat, `Bound scalloped hem ${panel + 1}`, 28, 6));
  }

  // Crown, runner and ferrule make the mechanism coherent from rear and side.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0100, 0.012, 16), ribMat);
  crown.position.y = apex - 0.013;
  crown.name = 'Crown holding all eight ribs';
  canopy.add(crown);
  const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0070, 0.022, 14), jointMat);
  runner.position.y = runnerY;
  runner.name = 'Sliding runner';
  canopy.add(runner);
  canopy.add(ring(0.0087, 0.00115, ribMat, 'Runner shoulder', runnerY + 0.010));
  canopy.add(ring(0.0080, 0.0009, ribMat, 'Runner lower rim', runnerY - 0.013));

  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0040, 0.030, 11), poleMat);
  ferrule.position.y = apex + 0.0115;
  ferrule.name = 'Small top ferrule';
  canopy.add(ferrule);
  const crownPatch = new THREE.Mesh(new THREE.SphereGeometry(0.012, 18, 9), handleMat);
  crownPatch.scale.set(1, 0.25, 1);
  crownPatch.position.y = apex + 0.0005;
  crownPatch.name = 'Reinforced fabric apex';
  canopy.add(crownPatch);

  const shaftTop = toWorld(new THREE.Vector3(0, apex - 0.007, 0));
  group.add(rodBetween(shaftEnd, shaftTop, 0.00365, poleMat, 'Slender diagonal metal shaft', 12));

  // Slightly warm ivory J handle. The lower hand grasps its straight stem;
  // the open return branch rises on the viewer's right, as in the reference.
  // The first stem segment is collinear with the shaft and sits inside the grip.
  const lowerGrip = vec(cfg.lowerGrip);
  const handleNodes = [
    shaftEnd.clone(),
    lowerGrip.clone(),
    lowerGrip.clone().add(new THREE.Vector3(0.011, -0.016, 0.012)),
    lowerGrip.clone().add(new THREE.Vector3(0.022, -0.020, 0.006)),
    lowerGrip.clone().add(new THREE.Vector3(0.032, -0.014, -0.007)),
    lowerGrip.clone().add(new THREE.Vector3(0.034, 0.002, -0.017)),
    lowerGrip.clone().add(new THREE.Vector3(0.031, 0.020, -0.023)),
    lowerGrip.clone().add(new THREE.Vector3(0.017, 0.038, -0.025)),
    lowerGrip.clone().add(new THREE.Vector3(0.003, 0.050, -0.025)),
  ];
  const handle = curveTube(handleNodes, 0.0073, handleMat, 'Ivory curved J handle', 70, 14);
  group.add(handle);
  const bottomCap = new THREE.Mesh(new THREE.SphereGeometry(0.00728, 14, 9), handleMat);
  bottomCap.position.copy(handleNodes[handleNodes.length - 1]);
  bottomCap.name = 'Smooth closed handle tip';
  group.add(bottomCap);
  const collarBottom = shaftEnd.clone().addScaledVector(axis, -0.001);
  const collarTop = shaftEnd.clone().addScaledVector(axis, 0.009);
  group.add(rodBetween(shaftEnd.clone().addScaledVector(axis, -0.0011), shaftEnd.clone().addScaledVector(axis, 0.0007), 0.0072, handleMat, 'Closed molded handle shoulder', 14));
  group.add(rodBetween(collarBottom, collarTop, 0.0060, handleTrim, 'Handle to shaft collar', 14));

  if (cfg.offset) group.position.copy(vec(cfg.offset));
  group.userData = {
    source: 'Original procedural geometry',
    panelCount,
    radius,
    hub: hub.toArray(),
    axis: axis.toArray(),
    upperGrip: grip.toArray(),
    lowerGrip: lowerGrip.toArray(),
    localPoseOptions: ['hub', 'normal', 'radius', 'apex', 'rim', 'rotation', 'offset'],
  };
  return group;
}


