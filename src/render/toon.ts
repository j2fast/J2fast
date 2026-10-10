// Cel-shaded material helpers and inverted-hull outlines.

import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-band lighting ramp for MeshToonMaterial. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  flat?: boolean;
}

export function toon(color: number, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `t${color}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.side ?? 0}`;
  let m = cache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    cache.set(key, m);
  }
  return m;
}

/** Unshared toon material (for per-entity flashes / fades). */
export function toonUnique(color: number, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}

export function basic(color: number, opts: { transparent?: boolean; opacity?: number; side?: THREE.Side; additive?: boolean; depthWrite?: boolean } = {}): THREE.MeshBasicMaterial {
  const key = `b${color}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.side ?? 0}|${opts.additive ? 1 : 0}|${opts.depthWrite ?? 1}`;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: opts.depthWrite ?? !opts.transparent,
    });
    cache.set(key, m);
  }
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14101a, side: THREE.BackSide });

/** Add dark inverted-hull outlines to every mesh under `root`. */
export function addOutlines(root: THREE.Object3D, thickness = 0.045): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noOutline && !m.userData.isOutline) meshes.push(m);
  });
  for (const m of meshes) {
    const geo = m.geometry;
    geo.computeBoundingSphere();
    const r = geo.boundingSphere?.radius ?? 1;
    const c = geo.boundingSphere?.center ?? new THREE.Vector3();
    const s = 1 + thickness / Math.max(0.05, r);
    const o = new THREE.Mesh(geo, outlineMat);
    o.scale.setScalar(s);
    // Scale about the geometry centre rather than the mesh origin.
    o.position.copy(c).multiplyScalar(1 - s);
    o.userData.isOutline = true;
    o.castShadow = false;
    o.receiveShadow = false;
    o.raycast = () => undefined;
    m.add(o);
  }
}

export function setShadows(root: THREE.Object3D, cast = true, receive = false): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.isOutline) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

/** Canvas-generated textures (no external image assets). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let softDot: THREE.Texture | null = null;
export function softDotTexture(): THREE.Texture {
  if (softDot) return softDot;
  softDot = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return softDot;
}

let petal: THREE.Texture | null = null;
export function petalTexture(): THREE.Texture {
  if (petal) return petal;
  petal = canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(16, 16, 13, 7, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  return petal;
}
