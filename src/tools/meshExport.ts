// Serialises built THREE scenes into the compact binary mesh format read by
// the Unreal Engine port (LBSceneMesh.cpp). Only used by
// scripts/export-unreal.mjs through the ?test=1 hooks.
//
// Format (little endian):
//   'LBM1' u32 partCount
//   part: u16 nameLen, utf8 name, u8 visible, f32 x y z (cm, Unreal axes), f32 yawDeg, f32 scale,
//         u32 sectionCount
//   section: u8 kind (0 lit, 1 unlit, 2 translucent, 3 additive; +0x80 = instanced), u8 castShadow,
//            u32 vertCount, vertCount * { f32 x y z (cm), i8 nx ny nz, u8 pad, u8 r g b a }
//            instanced only: u32 instanceCount, instanceCount * { f32 m[12] (3x3 row-major, then
//            translation in cm), u8 r g b a tint } - the vertices are a template placed once per instance
// Every three vertices form a triangle already ordered for Unreal's front-face
// convention (three.js front faces are reversed; back-side materials are not;
// double-sided materials are written twice). Named objects become their own
// parts so the game can move, hide or recolour them; part geometry is relative
// to the object's world position and yaw.

import * as THREE from 'three';

type Kind = 0 | 1 | 2 | 3;

interface Section {
  kind: Kind;
  cast: boolean;
  pos: number[];
  nrm: number[];
  col: number[];
  /** Instanced sections: 12 floats per instance (Unreal-space affine transform). */
  inst?: number[];
  tints?: number[];
}

interface Part {
  name: string;
  visible: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  frameInv: THREE.Matrix4;
  sections: Map<string, Section>;
  instanced: Section[];
}

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();

function classify(mat: THREE.Material): { kind: Kind; color: THREE.Color; alpha: number } {
  const m = mat as THREE.MeshToonMaterial & THREE.MeshBasicMaterial;
  const color = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  const alpha = mat.transparent ? mat.opacity : 1;
  if (mat.transparent && mat.blending === THREE.AdditiveBlending) return { kind: 3, color, alpha };
  if (mat.transparent) return { kind: 2, color, alpha };
  if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return { kind: 1, color, alpha };
  const emissive = m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
  const glow = Math.max(emissive.r, emissive.g, emissive.b);
  if (glow > 0.35) {
    // Strongly emissive toon materials read as self-lit; brighten into the unlit range.
    return { kind: 1, color: color.clone().multiplyScalar(0.5).add(emissive).multiplyScalar(0.8), alpha };
  }
  return { kind: 0, color: color.add(emissive.multiplyScalar(0.5)), alpha };
}

function q(v: number): number {
  return Math.max(-127, Math.min(127, Math.round(v * 127)));
}

function c8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function worldYaw(o: THREE.Object3D): number {
  const qt = new THREE.Quaternion();
  o.getWorldQuaternion(qt);
  return new THREE.Euler().setFromQuaternion(qt, 'YXZ').y;
}

function makePart(name: string, o: THREE.Object3D | null): Part {
  const p = new THREE.Vector3();
  let yaw = 0;
  let scale = 1;
  if (o) {
    o.getWorldPosition(p);
    yaw = worldYaw(o);
    const s = new THREE.Vector3();
    o.getWorldScale(s);
    scale = (s.x + s.y + s.z) / 3;
  }
  const frame = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale));
  return {
    name,
    visible: o ? o.visible : true,
    x: p.z * 100,
    y: -p.x * 100,
    z: p.y * 100,
    yaw: -THREE.MathUtils.radToDeg(yaw),
    scale,
    frameInv: frame.invert(),
    sections: new Map(),
    instanced: [],
  };
}

function hiddenBelow(o: THREE.Object3D, stop: THREE.Object3D | null): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== stop; p = p.parent) if (!p.visible) return true;
  return false;
}

function addGeometry(part: Part, geo: THREE.BufferGeometry, world: THREE.Matrix4, mat: THREE.Material, cast: boolean, tint: THREE.Color | null, outline: boolean, template?: Section) {
  const { kind, color, alpha } = outline ? { kind: 1 as Kind, color: (mat as THREE.MeshBasicMaterial).color.clone(), alpha: 1 } : classify(mat);
  if (tint) color.multiply(tint);
  const key = `${kind}|${cast ? 1 : 0}`;
  let sec = template ?? part.sections.get(key);
  if (template) {
    template.kind = kind;
    template.cast = cast && kind === 0;
  } else if (!sec) {
    sec = { kind, cast: cast && kind === 0, pos: [], nrm: [], col: [] };
    part.sections.set(key, sec);
  }
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const vcol = (mat as THREE.MeshStandardMaterial).vertexColors ? g.attributes.color : undefined;
  const local = template ? world : new THREE.Matrix4().multiplyMatrices(part.frameInv, world);
  const nmat = new THREE.Matrix3().getNormalMatrix(local);
  const side = mat.side;
  const emit = (i: number, flipNormal: boolean) => {
    tmpV.fromBufferAttribute(pos, i).applyMatrix4(local);
    tmpN.fromBufferAttribute(nrm, i).applyMatrix3(nmat).normalize();
    if (flipNormal) tmpN.negate();
    sec!.pos.push(tmpV.z * 100, -tmpV.x * 100, tmpV.y * 100);
    sec!.nrm.push(q(tmpN.z), q(-tmpN.x), q(tmpN.y));
    let r = color.r;
    let gg = color.g;
    let b = color.b;
    if (vcol) {
      r *= vcol.getX(i);
      gg *= vcol.getY(i);
      b *= vcol.getZ(i);
    }
    sec!.col.push(c8(r), c8(gg), c8(b), c8(alpha));
  };
  // A negative determinant (mirrored transform) flips the winding of the source triangles.
  const mirrored = local.determinant() < 0;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const front = side !== THREE.BackSide && !outline;
    const back = side === THREE.BackSide || side === THREE.DoubleSide || outline;
    // three.js front faces are counter-clockwise; after the axis change they must be reversed.
    if (front) {
      if (!mirrored) {
        emit(t, false);
        emit(t + 2, false);
        emit(t + 1, false);
      } else {
        emit(t, false);
        emit(t + 1, false);
        emit(t + 2, false);
      }
    }
    if (back) {
      if (!mirrored) {
        emit(t, true);
        emit(t + 1, true);
        emit(t + 2, true);
      } else {
        emit(t, true);
        emit(t + 2, true);
        emit(t + 1, true);
      }
    }
  }
}

/** Collects meshes under `root` into parts: one for unnamed scenery, one per named object. */
export function collectParts(root: THREE.Object3D, skip: (o: THREE.Object3D) => boolean = () => false): Part[] {
  root.updateMatrixWorld(true);
  const parts = new Map<THREE.Object3D | null, Part>();
  parts.set(null, makePart('', null));
  const partFor = (o: THREE.Object3D): Part => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
      if (p.name) {
        let part = parts.get(p);
        if (!part) {
          part = makePart(p.name, p);
          parts.set(p, part);
        }
        return part;
      }
    }
    return parts.get(null)!;
  };
  const instMat = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const tint = new THREE.Color();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip(m) || m.userData.batched) return;
    if (Array.isArray(m.material)) return;
    const part = partFor(m);
    const owner = [...parts.entries()].find(([, v]) => v === part)?.[0] ?? null;
    // Invisible below the part root means "never shown"; the part root's own visibility is stored.
    if (hiddenBelow(m, owner)) return;
    if (owner && owner !== m && hiddenBelow(owner.parent ?? owner, root)) return;
    const outline = !!m.userData.isOutline;
    const inst = m as unknown as THREE.InstancedMesh;
    if (inst.isInstancedMesh && inst.count > 4) {
      // Template geometry in mesh-local space plus one transform per instance.
      const sec: Section = { kind: 0, cast: false, pos: [], nrm: [], col: [], inst: [], tints: [] };
      addGeometry(part, m.geometry, new THREE.Matrix4(), m.material as THREE.Material, m.castShadow, null, outline, sec);
      const e = new THREE.Matrix4().multiplyMatrices(part.frameInv, m.matrixWorld);
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, instMat);
        world.multiplyMatrices(e, instMat);
        const a = world.elements; // column-major game-space affine
        // Unreal = P * A * P^T with P: (x, y, z) -> (z, -x, y).
        const g = (r: number, c: number) => a[c * 4 + r];
        const map = [2, 0, 1];
        const sign = [1, -1, 1];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) sec.inst!.push(sign[r] * sign[c] * g(map[r], map[c]));
        sec.inst!.push(a[14] * 100, -a[12] * 100, a[13] * 100);
        if (inst.instanceColor) {
          inst.getColorAt(i, tint);
          sec.tints!.push(c8(tint.r), c8(tint.g), c8(tint.b), 255);
        } else sec.tints!.push(255, 255, 255, 255);
      }
      part.instanced.push(sec);
    } else if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, instMat);
        world.multiplyMatrices(m.matrixWorld, instMat);
        let t: THREE.Color | null = null;
        if (inst.instanceColor) {
          inst.getColorAt(i, tint);
          t = tint.clone();
        }
        addGeometry(part, m.geometry, world, m.material as THREE.Material, m.castShadow, t, outline);
      }
    } else addGeometry(part, m.geometry, m.matrixWorld, m.material as THREE.Material, m.castShadow, null, outline);
  });
  return [...parts.values()].filter((p) => p.sections.size > 0 || p.instanced.length > 0 || p.name);
}

export function encodeParts(parts: Part[]): Uint8Array {
  const enc = new TextEncoder();
  let size = 8;
  const names = parts.map((p) => enc.encode(p.name));
  for (let i = 0; i < parts.length; i++) {
    size += 2 + names[i].length + 1 + 20 + 4;
    for (const s of allSections(parts[i])) size += 6 + (s.pos.length / 3) * 20 + (s.inst ? 4 + (s.inst.length / 12) * 52 : 0);
  }
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;
  u8.set(enc.encode('LBM1'), 0);
  o = 4;
  dv.setUint32(o, parts.length, true);
  o += 4;
  parts.forEach((p, i) => {
    dv.setUint16(o, names[i].length, true);
    o += 2;
    u8.set(names[i], o);
    o += names[i].length;
    dv.setUint8(o++, p.visible ? 1 : 0);
    for (const v of [p.x, p.y, p.z, p.yaw, p.scale]) {
      dv.setFloat32(o, v, true);
      o += 4;
    }
    const secs = allSections(p);
    dv.setUint32(o, secs.length, true);
    o += 4;
    for (const s of secs) {
      const n = s.pos.length / 3;
      dv.setUint8(o++, s.kind | (s.inst ? 0x80 : 0));
      dv.setUint8(o++, s.cast ? 1 : 0);
      dv.setUint32(o, n, true);
      o += 4;
      for (let v = 0; v < n; v++) {
        dv.setFloat32(o, s.pos[v * 3], true);
        dv.setFloat32(o + 4, s.pos[v * 3 + 1], true);
        dv.setFloat32(o + 8, s.pos[v * 3 + 2], true);
        dv.setInt8(o + 12, s.nrm[v * 3]);
        dv.setInt8(o + 13, s.nrm[v * 3 + 1]);
        dv.setInt8(o + 14, s.nrm[v * 3 + 2]);
        dv.setUint8(o + 15, 0);
        u8[o + 16] = s.col[v * 4];
        u8[o + 17] = s.col[v * 4 + 1];
        u8[o + 18] = s.col[v * 4 + 2];
        u8[o + 19] = s.col[v * 4 + 3];
        o += 20;
      }
      if (s.inst) {
        const count = s.inst.length / 12;
        dv.setUint32(o, count, true);
        o += 4;
        for (let k = 0; k < count; k++) {
          for (let j = 0; j < 12; j++) {
            dv.setFloat32(o, s.inst[k * 12 + j], true);
            o += 4;
          }
          for (let j = 0; j < 4; j++) u8[o++] = s.tints![k * 4 + j];
        }
      }
    }
  });
  return u8;
}

function allSections(p: Part): Section[] {
  return [...p.sections.values(), ...p.instanced];
}

export function toBase64(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(s);
}

/** Point lights placed in a scene (position in Unreal cm). */
export function collectLights(root: THREE.Object3D): { Name: string; X: number; Y: number; Z: number; Color: number; Intensity: number; Distance: number }[] {
  root.updateMatrixWorld(true);
  const out: { Name: string; X: number; Y: number; Z: number; Color: number; Intensity: number; Distance: number }[] = [];
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const l = o as THREE.PointLight;
    if (!l.isPointLight) return;
    l.getWorldPosition(p);
    out.push({ Name: l.name, X: p.z * 100, Y: -p.x * 100, Z: p.y * 100, Color: l.color.getHex(), Intensity: l.intensity, Distance: l.distance });
  });
  return out;
}
