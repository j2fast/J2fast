// Static batching: merges non-moving meshes that share a material into one
// mesh per material, cutting draw calls dramatically. Anything named (or under
// a named parent) is treated as dynamic and left alone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function isDynamic(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.name || p.userData.dynamic) return true;
  }
  return false;
}

export function batchStatic(root: THREE.Group): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    before++;
    if (Array.isArray(m.material) || isDynamic(m, root)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent) return;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      g = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] };
      groups.set(key, g);
    }
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    // Only keep the attributes every primitive has.
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    geo = geo.applyMatrix4(m.matrixWorld);
    g.geos.push(geo);
    g.meshes.push(m);
  });
  let merged = 0;
  for (const g of groups.values()) {
    if (g.geos.length < 2) continue;
    const geo = mergeGeometries(g.geos, false);
    if (!geo) continue;
    for (const m of g.meshes) {
      m.visible = false;
      m.userData.batched = true;
    }
    const mesh = new THREE.Mesh(geo, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    mesh.userData.batchedMesh = true;
    // Geometry is in world space; the root is expected to sit at the origin.
    root.add(mesh);
    merged += g.meshes.length;
    for (const sub of g.geos) sub.dispose();
  }
  // Remove the hidden originals so they cost nothing.
  const dead: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.batched) dead.push(o);
  });
  for (const o of dead) {
    // Keep children that were not batched (e.g. dynamic parts) by re-parenting.
    for (const c of [...o.children]) if (!c.userData.batched) o.parent?.attach(c);
    o.removeFromParent();
  }
  let after = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) after++;
  });
  void merged;
  return { before, after };
}
