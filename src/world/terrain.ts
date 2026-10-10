// Height-field terrain, ground mesh generation and simple 2D collision.

import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math';
import { fbm } from '../core/rng';
import { toonGradient } from '../render/toon';

export interface Flat {
  x: number;
  z: number;
  r: number;
  h: number;
  fall: number;
}

export interface PathSpec {
  points: [number, number][];
  width: number;
}

export interface TerrainSpec {
  size: number;
  segments: number;
  seed: number;
  amp: number;
  freq: number;
  base: number;
  flats: Flat[];
  paths: PathSpec[];
  /** Additional height contribution (e.g. slopes up a mountain). */
  extra?: (x: number, z: number) => number;
  colorA: number;
  colorB: number;
  pathColor: number;
  /** Flatten terrain under paths toward this blend (0..1). */
  pathFlatten?: number;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t - px;
  const cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export function pathDistance(paths: PathSpec[], x: number, z: number): { d: number; w: number } {
  let best = Infinity;
  let w = 1;
  for (const p of paths) {
    for (let i = 0; i < p.points.length - 1; i++) {
      const a = p.points[i];
      const b = p.points[i + 1];
      const d = distToSegment(x, z, a[0], a[1], b[0], b[1]);
      if (d < best) {
        best = d;
        w = p.width;
      }
    }
  }
  return { d: best, w };
}

export function makeHeightFn(spec: TerrainSpec): (x: number, z: number) => number {
  return (x, z) => {
    let h = spec.base + (fbm(x * spec.freq, z * spec.freq, spec.seed, 4) - 0.5) * 2 * spec.amp;
    if (spec.extra) h += spec.extra(x, z);
    // Paths are gently smoothed so they read as walkable.
    if (spec.pathFlatten && spec.paths.length) {
      const pd = pathDistance(spec.paths, x, z);
      const t = 1 - smoothstep(pd.w * 0.5, pd.w * 1.5, pd.d);
      const smooth = spec.base + (spec.extra ? spec.extra(x, z) : 0);
      h = h + (smooth - h) * t * spec.pathFlatten;
    }
    for (const f of spec.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.fall) {
        const t = 1 - smoothstep(f.r, f.r + f.fall, d);
        h = h + (f.h - h) * t;
      }
    }
    return h;
  };
}

export function buildGround(spec: TerrainSpec, heightAt: (x: number, z: number) => number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(spec.size, spec.size, spec.segments, spec.segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(spec.colorA);
  const cb = new THREE.Color(spec.colorB);
  const cp = new THREE.Color(spec.pathColor);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const n = fbm(x * 0.08, z * 0.08, spec.seed + 99, 3);
    tmp.copy(ca).lerp(cb, smoothstep(0.35, 0.65, n));
    if (spec.paths.length) {
      const pd = pathDistance(spec.paths, x, z);
      const t = 1 - smoothstep(pd.w * 0.45, pd.w * 0.75, pd.d);
      tmp.lerp(cp, t * 0.9);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// ------------------------------------------------------------------ Collision

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; h?: number; id?: string; disabled?: boolean }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number; h?: number; id?: string; disabled?: boolean };

export function boxCollider(cx: number, cz: number, w: number, d: number, h = 3, id?: string): Collider {
  return { kind: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, id };
}

/** Push a circle (x,z,radius) out of all colliders. Returns corrected position. */
export function resolveCircle(colliders: Collider[], x: number, z: number, r: number): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      if (c.disabled) continue;
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const min = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
          hit = true;
        }
      } else {
        const cx = clamp(x, c.minX, c.maxX);
        const cz = clamp(z, c.minZ, c.maxZ);
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the axis of least penetration.
            const pl = x - c.minX;
            const pr = c.maxX - x;
            const pb = z - c.minZ;
            const pf = c.maxZ - z;
            const m = Math.min(pl, pr, pb, pf);
            if (m === pl) x = c.minX - r;
            else if (m === pr) x = c.maxX + r;
            else if (m === pb) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
      }
    }
  }
  return { x, z, hit };
}

/** True if the segment from a to b passes through any tall collider (for camera / line of sight). */
export function segmentBlocked(colliders: Collider[], ax: number, az: number, bx: number, bz: number, minHeight = 2): number {
  // Returns the fraction along the segment of the first hit (1 = clear).
  let best = 1;
  const steps = 16;
  for (const c of colliders) {
    if (c.disabled || (c.h ?? 3) < minHeight) continue;
    // Thin props (posts, trunks) should not yank the camera around.
    if (c.kind === 'circle' && c.r < 0.8) continue;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (t >= best) break;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      let inside: boolean;
      if (c.kind === 'circle') inside = (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r;
      else inside = x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ;
      if (inside) {
        best = Math.max(0, t - 1 / steps);
        break;
      }
    }
  }
  return best;
}
