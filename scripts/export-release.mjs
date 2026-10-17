import { launchReviewBrowser } from './browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(project, 'exports');
const origin = process.env.HINA_URL || 'http://127.0.0.1:4186';
const expectedBounds = {
  min: [-0.4102482795715332, 0.003000000026077032, -0.4858396649360657],
  max: [0.28364279866218567, 1.8280856609344482, 0.21993406116962433],
};
const primaryName = 'Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb';
const showcaseName = 'Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS_showcase.glb';
const sourcePaths = ['src/body.js', 'src/head.js', 'src/umbrella.js', 'src/main.js', 'src/optimize.js', 'src/export-compat.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async name => [name, sha256(await fs.readFile(path.join(project, name)))])));
const sourceHashes = await hashes();
assert.equal(sourceHashes['src/body.js'], '140d1e20e60a29e1e4529a91fcce23ab771eccc4c041c899c564338e5fa89d27', 'Accepted raised-collar body source');
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS ' + name); };
const exact = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS ' + name); };
let server, browser;
const errors = [], requests = [];

function inspectGLB(bytes) {
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF', 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared length');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB JSON chunk');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942, 'GLB binary chunk');
  const binaryStart = binaryHeader + 8;
  const textureDetails = (json.textures || []).map((texture, index) => {
    const imageIndex = texture.source;
    const image = json.images[imageIndex];
    assert.ok(image.bufferView !== undefined && !image.uri, 'Embedded image');
    const view = json.bufferViews[image.bufferView];
    const start = binaryStart + (view.byteOffset || 0);
    const data = bytes.subarray(start, start + view.byteLength);
    return { index, imageIndex, mimeType: image.mimeType, embedded: true, bytes: data.length, sha256: sha256(data) };
  });
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.mode === undefined || primitive.mode === 4, 'Triangle primitives');
    triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  return { json, triangles, textureDetails };
}

try {
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(path.join(project, 'qa'), { recursive: true });
  if (!process.env.HINA_URL) {
    let log = '';
    server = spawn(process.execPath, ['scripts/serve.mjs'], {
      cwd: project, env: { ...process.env, PORT: '4186' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log += String(chunk); });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error('Isolated export server exited: ' + log.slice(-2000));
      if (log.includes('Hina studio listening')) {
        try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Own port4186 server must become ready; no existing server is stopped');
  }
  browser = await launchReviewBrowser();
  check('Native hardware renderer is active', browser.hinaRenderer.mode === 'native' && browser.hinaRenderer.hardwareAccelerated);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  page.on('requestfailed', request => errors.push(request.failure()?.errorText + ' ' + request.url()));
  page.on('request', request => requests.push(request.url()));
  await page.goto(origin + '/?capture=1&view=front', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__HINA_READY__, undefined, { timeout: 60000 });
  const sourceMetrics = await page.evaluate(async () => {
    const THREE = await import('three');
    window.__releaseBackFaces = [];
    window.HinaStudio.character.traverse(mesh => {
      if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.side !== THREE.BackSide) return;
      window.__releaseBackFaces.push({ mesh, geometry: mesh.geometry, material: mesh.material, indices: Array.from(mesh.geometry.index.array), normals: Array.from(mesh.geometry.attributes.normal.array) });
    });
    return window.HinaStudio.metrics();
  });
  exact('Live primary triangle count is the accepted 343720', sourceMetrics.triangles, 343720);
  exact('Live primary bounds are exactly the accepted bounds', sourceMetrics.bounds, expectedBounds);
  check('Live primary has finite vertices', sourceMetrics.invalidVertices === 0);

  const records = [];
  for (const [name, showcase] of [[primaryName, false], [showcaseName, true]]) {
    const downloadEvent = page.waitForEvent('download', { timeout: 90000 });
    const byteLength = await page.evaluate(async ({ name, showcase }) => {
      const buffer = await window.HinaStudio.exportGLB({ showcase });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.__releaseDownloadURL = url;
      return buffer.byteLength;
    }, { name, showcase });
    const download = await downloadEvent;
    await download.saveAs(path.join(output, name));
    assert.equal(await download.failure(), null, 'Native browser download completed');
    await page.evaluate(() => { URL.revokeObjectURL(window.__releaseDownloadURL); delete window.__releaseDownloadURL; });
    const bytes = await fs.readFile(path.join(output, name));
    exact(name + ': downloaded byte length', bytes.length, byteLength);
    const { json, triangles, textureDetails } = inspectGLB(bytes);
    check(name + ': all buffers and images are embedded', json.buffers.every(buffer => !buffer.uri) && json.images.every(image => !image.uri && image.bufferView !== undefined));
    exact(name + ': binary triangle count', triangles, 343720 + (showcase ? 14 : 0));
    exact(name + ': mesh count', json.meshes.length, 49 + (showcase ? 2 : 0));
    exact(name + ': embedded image count', json.images.length, showcase ? 2 : 1);
    const roundtrip = await page.evaluate(async ({ name, showcase }) => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync('/exports/' + name);
      const stats = root => {
        let meshes = 0, triangles = 0, vertices = 0, invalidVertices = 0;
        root.traverse(object => {
          if (!object.isMesh) return;
          meshes++; const position = object.geometry.attributes.position;
          vertices += position.count; triangles += (object.geometry.index?.count || position.count) / 3;
          for (const value of position.array) if (!Number.isFinite(value)) invalidVertices++;
        });
        const bounds = new THREE.Box3().setFromObject(root, true);
        return { meshes, triangles, vertices, invalidVertices, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
      };
      const backFaceCompatibility = window.__releaseBackFaces.map(snapshot => {
        const source = snapshot.mesh;
        const loaded = gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(source.name));
        const indices = loaded?.geometry.index?.array, normals = loaded?.geometry.attributes.normal?.array;
        let reversed = Boolean(indices && indices.length === snapshot.indices.length), maxNormalDelta = 0, degenerateSourceNormals = 0, degenerateNormalsAreUnit = true;
        if (reversed) for (let index = 0; index < indices.length; index += 3) {
          if (indices[index] !== snapshot.indices[index] || indices[index + 1] !== snapshot.indices[index + 2] || indices[index + 2] !== snapshot.indices[index + 1]) { reversed = false; break; }
        }
        if (!normals || normals.length !== snapshot.normals.length) maxNormalDelta = 1e9;
        else for (let index = 0; index < normals.length; index += 3) {
          const length = Math.hypot(snapshot.normals[index], snapshot.normals[index + 1], snapshot.normals[index + 2]);
          if (length < 1e-12) {
            // Collapsed seam/tip triangles have no defined surface direction.
            // GLTFExporter replaces these zero vectors with a legal unit normal.
            degenerateSourceNormals++;
            if (Math.abs(Math.hypot(normals[index], normals[index + 1], normals[index + 2]) - 1) > .000001) degenerateNormalsAreUnit = false;
          } else for (let component = 0; component < 3; component++) maxNormalDelta = Math.max(maxNormalDelta, Math.abs(normals[index + component] + snapshot.normals[index + component] / length));
        }
        const sourceUnchanged = source.geometry === snapshot.geometry && source.material === snapshot.material && source.material.side === THREE.BackSide && snapshot.indices.every((value, index) => value === source.geometry.index.array[index]) && snapshot.normals.every((value, index) => value === source.geometry.attributes.normal.array[index]);
        return { name: source.name, materialIsFrontSide: loaded?.material.side === THREE.FrontSide, triangleWindingReversed: reversed, maxNormalDelta, degenerateSourceNormals, degenerateNormalsAreUnit, liveSourceUnchanged: sourceUnchanged };
      });
      const whole = stats(gltf.scene);
      if (!showcase) return { ...whole, original: whole, backFaceCompatibility };
      const additions = [];
      gltf.scene.traverse(object => { if (object.isMesh && /^Showcase/.test(object.name)) additions.push(object); });
      const credit = additions.find(object => /white.*creator.*credit/i.test(object.name));
      const plinth = additions.find(object => /black.*creator.*plinth/i.test(object.name));
      const original = gltf.scene.clone(true);
      const remove = [];
      original.traverse(object => { if (object.isMesh && /^Showcase/.test(object.name)) remove.push(object); });
      for (const object of remove) object.removeFromParent();
      window.__releaseShowcase = gltf.scene;
      const texture = credit?.material.map;
      return {
        ...whole, original: stats(original), backFaceCompatibility,
        additions: additions.map(object => ({ name: object.name, triangles: (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 })),
        creditTexture: texture ? { width: texture.image.width, height: texture.image.height, unlit: Boolean(credit.material.isMeshBasicMaterial) } : null,
        plinthExists: Boolean(plinth),
      };
    }, { name, showcase });
    exact(name + ': reload triangles match', roundtrip.triangles, triangles);
    exact(name + ': original geometry retains exact bounds', roundtrip.original.bounds, expectedBounds);
    exact(name + ': original triangles retained', roundtrip.original.triangles, 343720);
    exact(name + ': original mesh count retained', roundtrip.original.meshes, 49);
    check(name + ': reloaded vertices are finite', roundtrip.invalidVertices === 0);
    console.log('BACK FACE ' + JSON.stringify(roundtrip.backFaceCompatibility));
    check(name + ': back-facing surfaces reload with equivalent front-facing winding and normals', roundtrip.backFaceCompatibility.length > 0 && roundtrip.backFaceCompatibility.every(item => item.materialIsFrontSide && item.triangleWindingReversed && item.maxNormalDelta <= .000001 && item.degenerateNormalsAreUnit));
    check(name + ': live back-facing geometry and shared materials remain untouched', roundtrip.backFaceCompatibility.every(item => item.liveSourceUnchanged));
    let creditTexture;
    if (showcase) {
      check('Showcase plinth and creator plaque reload as two meshes', roundtrip.plinthExists && roundtrip.additions.length === 2);
      exact('Showcase additions contain twelve box and two plaque triangles', roundtrip.additions.map(item => item.triangles).sort((a, b) => a - b), [2, 12]);
      exact('Showcase creator texture retains 2048x320 pixels and unlit lettering', roundtrip.creditTexture, { width: 2048, height: 320, unlit: true });
      const node = json.nodes.find(node => node.name === 'Showcase / white creator credit on black');
      assert.ok(node, 'Credit node is named in the GLB');
      const material = json.materials[json.meshes[node.mesh].primitives[0].material];
      const textureIndex = material.pbrMetallicRoughness.baseColorTexture.index;
      creditTexture = { ...textureDetails[textureIndex], ...roundtrip.creditTexture, text: ['GPT-6 ASTRA PRO', 'CHATGPT · THREE.JS'] };
      check('Creator credit texture is embedded inside the showcase GLB', creditTexture.embedded && creditTexture.mimeType === 'image/png');
    }
    records.push({ file: name, bytes: bytes.length, sha256: sha256(bytes), meshes: json.meshes.length, materials: json.materials.length, textures: json.textures.length, images: json.images.length, triangles, bounds: roundtrip.bounds, textureDetails, ...(creditTexture ? { creditTexture } : {}), reload: roundtrip });
    console.log('EXPORTED ' + name + ' ' + bytes.length + ' bytes sha256=' + records.at(-1).sha256);
  }

  const capture = await page.evaluate(async () => {
    const THREE = await import('three');
    const studio = window.HinaStudio, loaded = window.__releaseShowcase;
    studio.setView('front'); studio.setQuad(false);
    studio.controls.enableDamping = false; studio.controls.autoRotate = false; studio.controls.update();
    studio.controls.enabled = false;
    const shadowFlags = new Map();
    studio.character.traverse(object => {
      if (object.isMesh) shadowFlags.set(THREE.PropertyBinding.sanitizeNodeName(object.name), { cast: object.castShadow, receive: object.receiveShadow });
    });
    loaded.traverse(object => {
      if (!object.isMesh) return;
      const flags = shadowFlags.get(object.name);
      object.castShadow = flags?.cast ?? /black.*plinth/i.test(object.name);
      object.receiveShadow = flags?.receive ?? /black.*plinth/i.test(object.name);
    });
    studio.character.visible = false;
    studio.scene.add(loaded);
    const bounds = new THREE.Box3().setFromObject(loaded, true);
    // Move existing ground/shadow planes beneath the plinth for the capture only.
    const groundY = bounds.min.y - .004;
    for (const object of studio.scene.children) if (object.isMesh && object.geometry.type === 'PlaneGeometry') object.position.y = groundY;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(.035, .105, 1).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    const camera = studio.camera;
    camera.fov = 30; camera.zoom = 1; camera.aspect = studio.renderer.domElement.clientWidth / studio.renderer.domElement.clientHeight;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(center), depth = offset.dot(direction);
      distance = Math.max(distance, depth + Math.abs(offset.dot(right)) * 1.10 / tanH, depth + Math.abs(offset.dot(up)) * 1.10 / tanV);
    }
    camera.position.copy(center).addScaledVector(direction, distance);
    studio.controls.target.copy(center); camera.lookAt(center); camera.updateProjectionMatrix(); studio.controls.update();
    studio.renderer.shadowMap.needsUpdate = true; studio.drawScene();
    const gl = studio.renderer.getContext(), pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(studio.renderer.domElement.width / 2), Math.floor(studio.renderer.domElement.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return { file: 'qa/showcase_model.png', loadedFrom: '/exports/Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS_showcase.glb', originalCharacterHidden: !studio.character.visible, camera: { position: camera.position.toArray(), target: center.toArray(), fov: camera.fov, aspect: camera.aspect }, groundY, dimensions: [studio.renderer.domElement.width, studio.renderer.domElement.height], glError: gl.getError(), contextLost: gl.isContextLost() };
  });
  await page.locator('#scene').screenshot({ path: path.join(project, 'qa/showcase_model.png'), timeout: 90000 });
  check('Loaded showcase capture hides the original character', capture.originalCharacterHidden);
  check('Loaded showcase renderer has no WebGL error or lost context', capture.glError === 0 && !capture.contextLost);
  check('No browser or resource errors during export and reload', errors.length === 0);
  exact('Frozen model source hashes remain unchanged', await hashes(), sourceHashes);
  const report = {
    schemaVersion: 1, createdAt: new Date().toISOString(), title: 'Hina — original procedural 3D character',
    creator: { model: 'GPT-6 Astra Pro', agent: 'ChatGPT', renderer: 'Three.js' },
    sourceHashes, expectedPrimaryTriangles: 343720, expectedPrimaryBounds: expectedBounds,
    exportMethod: 'HinaStudio.exportGLB, native browser Blob download, GLTFLoader reload from downloaded file',
    units: 'meters', files: records, renderer: browser.hinaRenderer, capture,
    checks, errors, networkOrigins: [...new Set(requests.filter(url => /^https?:/.test(url)).map(url => new URL(url).origin))],
  };
  await fs.writeFile(path.join(project, 'qa/export-release-report.json'), JSON.stringify(report, null, 2) + '\n');
  // The distributable manifest contains model facts, not private QA locations
  // or local browser/server addresses. The detailed report stays under qa/.
  const manifest = {
    schemaVersion: report.schemaVersion, createdAt: report.createdAt, title: report.title, creator: report.creator,
    sourceHashes, expectedPrimaryTriangles: 343720, expectedPrimaryBounds: expectedBounds,
    exportMethod: report.exportMethod, units: report.units, files: records,
    validation: {
      result: 'passed', checks: checks.length, errors: errors.length,
      exactPrimaryBounds: true, originalGeometryRetained: true, embeddedImagesOnly: true,
      liveModelUnchanged: true, backFacingOutlinesPreserved: true,
      nativeHardwareRenderer: browser.hinaRenderer.hardwareAccelerated,
      glError: capture.glError, contextLost: capture.contextLost,
      showcaseCapture: { source: showcaseName, dimensions: capture.dimensions, originalCharacterHidden: capture.originalCharacterHidden },
    },
  };
  await fs.writeFile(path.join(output, 'model-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ manifest: 'exports/model-manifest.json', checks: checks.length, files: records.map(({ file, bytes, sha256, meshes, triangles, textures }) => ({ file, bytes, sha256, meshes, triangles, textures })), capture }));
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
}
