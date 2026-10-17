import * as THREE from 'three';

/**
 * glTF stores FrontSide or DoubleSide, but has no BackSide material flag.
 * Reverse a back-facing surface in the export clone so that its appearance
 * survives GLTFLoader and other viewers. The live geometry/materials are never
 * edited, including when several meshes share one back-facing material.
 */
export function prepareGLTFBackFaces(root) {
  const frontMaterials = new WeakMap();
  const frontCopy = material => {
    if (material.side !== THREE.BackSide) return material;
    if (!frontMaterials.has(material)) {
      const copy = material.clone();
      copy.side = THREE.FrontSide;
      frontMaterials.set(material, copy);
    }
    return frontMaterials.get(material);
  };

  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    // Inspect the original exported material references before assigning any
    // front-facing clones. Never change the shared original material in place.
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const back = new Set(materials.map((material, index) => material.side === THREE.BackSide ? index : -1).filter(index => index >= 0));
    if (!back.size) return;
    const mixed = back.size !== materials.length;
    if (mixed && !mesh.geometry.groups.length) throw new Error('Mixed front/back export materials require geometry groups: ' + mesh.name);
    // Separate shared vertices only when front- and back-facing groups coexist,
    // so reversing the latter cannot change the former's vertex normals.
    const geometry = mixed && mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const positions = geometry.getAttribute('position');
    if (!geometry.index) {
      const indices = positions.count > 65535 ? new Uint32Array(positions.count) : new Uint16Array(positions.count);
      for (let index = 0; index < indices.length; index++) indices[index] = index;
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    const indices = geometry.index.array;
    const ranges = mixed ? geometry.groups.filter(group => back.has(group.materialIndex)) : [{ start: 0, count: indices.length }];
    const reversedTriangles = new Set(), reversedVertices = new Set();
    for (const { start, count } of ranges) {
      const end = Math.min(indices.length, start + count);
      if (start % 3 || (end - start) % 3) throw new Error('Non-triangle material group in export: ' + mesh.name);
      for (let index = start; index < end; index += 3) {
        if (reversedTriangles.has(index)) continue;
        reversedTriangles.add(index);
        reversedVertices.add(indices[index]); reversedVertices.add(indices[index + 1]); reversedVertices.add(indices[index + 2]);
        const swap = indices[index + 1]; indices[index + 1] = indices[index + 2]; indices[index + 2] = swap;
      }
    }
    geometry.index.needsUpdate = true;
    const reverseNormals = attribute => {
      if (!attribute) return;
      for (const index of reversedVertices) attribute.setXYZ(index, -attribute.getX(index), -attribute.getY(index), -attribute.getZ(index));
      attribute.needsUpdate = true;
    };
    reverseNormals(geometry.getAttribute('normal'));
    for (const attribute of geometry.morphAttributes.normal || []) reverseNormals(attribute);
    mesh.geometry = geometry;
    mesh.material = Array.isArray(mesh.material) ? materials.map(frontCopy) : frontCopy(materials[0]);
  });
  return root;
}
