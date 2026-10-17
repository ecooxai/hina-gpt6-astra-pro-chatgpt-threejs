import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Bake final static meshes into their enclosing group's coordinate system.
 *
 * Call after sculpting/pose edits and shadow setup. The enclosing group's
 * transform, visibility and later rotations remain live. Materials/textures are
 * reused, and existing vertex normals are transformed, never recomputed.
 * Transparent, deformable and custom-shader meshes retain their original nodes.
 */
export function batchStaticGroup(group) {
  if (!group?.isObject3D) throw new TypeError('batchStaticGroup needs a Three.js group');
  group.updateWorldMatrix(true, true);
  if (Math.abs(group.matrixWorld.determinant()) < 1e-12) throw new Error('Cannot batch a group with a singular world transform');
  const inverse = group.matrixWorld.clone().invert();
  const before = measure(group);
  const buckets = new Map();
  const skipped = {};
  const materialKeys = new WeakMap();
  const referenceIds = new WeakMap();
  let nextReference = 1;
  const referenceId = value => {
    if (!referenceIds.has(value)) referenceIds.set(value, nextReference++);
    return referenceIds.get(value);
  };
  const ignoredMaterialKeys = new Set(['id', 'uuid', 'name', 'version', 'userData', '_listeners']);

  // Texture identity is intentional: separately allocated textures are never
  // assumed equivalent. Plain render-state objects, colors and vectors compare
  // by value; unknown classes/functions compare by identity, conservatively.
  function serialize(value, stack = new Set()) {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'number') return Number.isFinite(value) ? String(value) : `number:${value}`;
    if (type === 'string' || type === 'boolean') return JSON.stringify(value);
    if (type === 'undefined') return 'undefined';
    if (type === 'function') return `function:${referenceId(value)}`;
    if (value.isTexture) return `texture:${referenceId(value)}`;
    if (stack.has(value)) return `reference:${referenceId(value)}`;
    if (value.isColor) return `color:${value.r},${value.g},${value.b}`;
    if (value.isVector2 || value.isVector3 || value.isVector4 || value.isMatrix3 || value.isMatrix4 || value.isQuaternion || value.isEuler) {
      return `${value.constructor.name}:${value.toArray().join(',')}`;
    }
    if (value.isPlane) return `plane:${serialize(value.normal)}:${value.constant}`;
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}:[${Array.from(value).join(',')}]`;
    if (Array.isArray(value)) {
      stack.add(value);
      const result = `[${value.map(v => serialize(v, stack)).join(',')}]`;
      stack.delete(value);
      return result;
    }
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      stack.add(value);
      const result = `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${serialize(value[k], stack)}`).join(',')}}`;
      stack.delete(value);
      return result;
    }
    return `object:${referenceId(value)}`;
  }
  function materialKey(material) {
    if (materialKeys.has(material)) return materialKeys.get(material);
    const key = `${referenceId(material.constructor)}|${Object.keys(material).filter(k => !ignoredMaterialKeys.has(k)).sort()
      .map(k => `${k}:${serialize(material[k])}`).join('|')}`;
    materialKeys.set(material, key);
    return key;
  }
  function reject(reason) { skipped[reason] = (skipped[reason] || 0) + 1; }
  const sources = [];
  group.traverse(object => { if (object.isMesh) sources.push(object); });
  for (const mesh of sources) {
    const reason = unsupported(mesh, group);
    if (reason) { reject(reason); continue; }
    const relative = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    if (Math.abs(relative.determinant()) < 1e-12) { reject('singular transform'); continue; }
    if (relative.determinant() < 0 && mesh.geometry.hasAttribute('tangent')) {
      reject('mirrored tangent frame'); continue;
    }
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(relative);
    const vertices = geometry.getAttribute('position').count;
    if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices * 2), 2));
    if (!geometry.hasAttribute('color')) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vertices * 3).fill(1), 3));
    if (!geometry.index) {
      const indices = vertices > 65535 ? new Uint32Array(vertices) : new Uint16Array(vertices);
      for (let i = 0; i < vertices; i++) indices[i] = i;
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    // BufferGeometry.drawRange is not carried by mergeGeometries. Restrict the
    // index explicitly so unseen source triangles do not suddenly become visible.
    const start = Math.max(0, Math.floor(geometry.drawRange.start));
    const end = Math.min(geometry.index.count, start + geometry.drawRange.count);
    const length = Math.max(0, Math.floor((end - start) / 3) * 3);
    if (start !== 0 || length !== geometry.index.count) {
      geometry.setIndex(new THREE.BufferAttribute(geometry.index.array.slice(start, start + length), 1));
    }
    geometry.setDrawRange(0, Infinity);
    geometry.clearGroups();
    // Three flips face winding for a mirrored model matrix. Once the transform
    // is baked, reproduce that flip in the indices to preserve front/back sides.
    if (relative.determinant() < 0) {
      const index = geometry.index.array;
      for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    }
    const attributes = Object.keys(geometry.attributes).sort().map(name => {
      const a = geometry.attributes[name];
      return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}:${a.gpuType ?? ''}`;
    }).join('|');
    const order = inheritedGroupOrder(mesh, group);
    const key = [materialKey(mesh.material), mesh.castShadow, mesh.receiveShadow,
      mesh.renderOrder, order, mesh.layers.mask, mesh.frustumCulled, attributes,
      // Source data can encode subsequent application behavior (e.g. transmitted
      // cloth). Only merge equal metadata; preserve it on the resulting mesh.
      serialize(mesh.userData)].join('::');
    if (!buckets.has(key)) buckets.set(key, { material: mesh.material, meshes: [], geometries: [], order });
    const bucket = buckets.get(key);
    bucket.meshes.push(mesh); bucket.geometries.push(geometry);
  }

  // Prepare first, mutate second. If an incompatible geometry escapes the
  // conservative layout key, its original meshes remain untouched.
  const replacements = [];
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) { bucket.geometries.forEach(g => g.dispose()); continue; }
    let merged;
    try { merged = mergeGeometries(bucket.geometries, false); }
    catch { merged = null; }
    bucket.geometries.forEach(g => g.dispose());
    if (!merged) { skipped['merge rejected'] = (skipped['merge rejected'] || 0) + bucket.meshes.length; continue; }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const first = bucket.meshes[0];
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.name = `${group.name || 'Static group'} / batch ${replacements.length + 1} / ${first.material.name || first.material.type}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.layers.mask = first.layers.mask;
    mesh.frustumCulled = first.frustumCulled;
    mesh.userData = { ...first.userData,
      originalMeshNames: bucket.meshes.map(source => source.name),
      staticBatch: true,
      sourceMeshCount: bucket.meshes.length,
    };
    replacements.push({ ...bucket, replacement: mesh });
  }
  const retired = new Set();
  const wrappers = new Map();
  for (const bucket of replacements) {
    bucket.meshes.forEach(mesh => { retired.add(mesh.geometry); mesh.removeFromParent(); });
    let parent = group;
    if (bucket.order !== group.renderOrder) {
      if (!wrappers.has(bucket.order)) {
        const wrapper = new THREE.Group();
        wrapper.name = `Static render order ${bucket.order}`;
        wrapper.renderOrder = bucket.order;
        wrappers.set(bucket.order, wrapper); group.add(wrapper);
      }
      parent = wrappers.get(bucket.order);
    }
    parent.add(bucket.replacement);
  }
  // Do not dispose a source buffer that another live object still shares.
  // Texture/material lifetimes remain entirely with the application.
  let root = group;
  while (root.parent) root = root.parent;
  root.traverse(object => { if (object.geometry) retired.delete(object.geometry); });
  retired.forEach(geometry => geometry.dispose());
  group.updateWorldMatrix(false, true);
  const after = measure(group);
  const stats = { before, after, mergedBatches: replacements.length,
    sourceMeshesMerged: replacements.reduce((n, b) => n + b.meshes.length, 0),
    disposedSourceGeometries: retired.size, skipped,
    normalsRecomputed: false, texturesCopied: 0, materialsCopied: 0,
  };
  group.userData.staticBatchStats = stats;
  return stats;
}

function inheritedGroupOrder(mesh, root) {
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    if (parent.isGroup || parent === root) return parent.renderOrder;
  }
  return 0;
}

function unsupported(mesh, root) {
  if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) return 'deformable or instanced mesh';
  if (mesh.geometry?.morphAttributes && Object.keys(mesh.geometry.morphAttributes).length) return 'morph attributes';
  if (!mesh.geometry?.isBufferGeometry || !mesh.geometry.hasAttribute('position')) return 'unsupported geometry';
  if (Object.values(mesh.geometry.attributes).some(a => a.isInterleavedBufferAttribute || a.isGLBufferAttribute)) return 'interleaved or GPU-only attributes';
  if (!mesh.geometry.hasAttribute('normal')) return 'missing authored normals';
  if (Array.isArray(mesh.material) || !mesh.material?.isMaterial) return 'multiple or missing materials';
  if (mesh.material.transparent || mesh.material.transmission > 0) return 'transparent or transmissive material';
  if (mesh.material.isShaderMaterial || mesh.material.isRawShaderMaterial) return 'custom shader material';
  if (mesh.material.displacementMap || (mesh.material.normalMap && mesh.material.normalMapType === THREE.ObjectSpaceNormalMap)) return 'object-space texture deformation';
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return 'custom shadow material';
  if (mesh.material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mesh.material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return 'custom material callback';
  if (mesh.material.onBeforeRender !== THREE.Material.prototype.onBeforeRender) return 'custom material render callback';
  for (const callback of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) {
    if (mesh[callback] !== THREE.Mesh.prototype[callback]) return 'custom mesh callback';
  }
  for (let object = mesh; object && object !== root; object = object.parent) {
    if (!object.visible) return 'hidden descendant';
    if (object.animations?.length) return 'animated descendant';
  }
  return null;
}

function measure(root) {
  let meshes = 0, triangles = 0, vertices = 0, draws = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    vertices += geometry.getAttribute('position')?.count || 0;
    const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    const rendered = Math.max(0, Math.min(count - geometry.drawRange.start, geometry.drawRange.count));
    triangles += Math.floor(rendered / 3) * (object.isInstancedMesh ? object.count : 1);
    draws += Array.isArray(object.material) ? geometry.groups.length : 1;
  });
  return { meshes, triangles, vertices, estimatedBaseDrawCalls: draws };
}

