// Helper for laying out area content.

import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Collider, boxCollider } from './terrain';
import { palisade, rock, tree } from './props';

export class AreaBuilder {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly lights: THREE.Light[] = [];
  readonly animators: ((t: number, dt: number) => void)[] = [];
  readonly rng: Rng;

  constructor(
    public heightAt: (x: number, z: number) => number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  place<T extends THREE.Object3D>(obj: T, x: number, z: number, yaw = 0, yOff = 0): T {
    obj.position.set(x, this.heightAt(x, z) + yOff, z);
    obj.rotation.y = yaw;
    this.group.add(obj);
    return obj;
  }

  circle(x: number, z: number, r: number, h = 3, id?: string): Collider {
    const c: Collider = { kind: 'circle', x, z, r, h, id };
    this.colliders.push(c);
    return c;
  }

  box(cx: number, cz: number, w: number, d: number, h = 3, id?: string): Collider {
    const c = boxCollider(cx, cz, w, d, h, id);
    this.colliders.push(c);
    return c;
  }

  /** Place an axis-aligned building with a box collider (yaw must be a multiple of 90°). */
  building(obj: THREE.Object3D, x: number, z: number, yaw: number, w: number, d: number, pad = 0.6): void {
    this.place(obj, x, z, yaw);
    const rotated = Math.abs(Math.sin(yaw)) > 0.5;
    this.box(x, z, (rotated ? d : w) + pad, (rotated ? w : d) + pad, 6);
  }

  /** A palisade wall from a to b with circle colliders along it. */
  wall(ax: number, az: number, bx: number, bz: number, height = 3.2): void {
    const len = Math.hypot(bx - ax, bz - az);
    const mesh = palisade(len, height);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    mesh.position.set(mx, Math.min(this.heightAt(ax, az), this.heightAt(bx, bz)) - 0.2, mz);
    mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    this.group.add(mesh);
    const n = Math.ceil(len / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.circle(ax + (bx - ax) * t, az + (bz - az) * t, 0.55, height);
    }
  }

  tree(kind: 'pine' | 'sakura' | 'maple' | 'dead' | 'willow', x: number, z: number, scale = 1, collide = true): void {
    const t = tree(kind, this.rng, scale);
    this.place(t, x, z, this.rng.next() * 6);
    if (collide) this.circle(x, z, 0.45 * scale, 5);
  }

  rock(x: number, z: number, size: number, color?: number, collide = true): THREE.Mesh {
    const r = rock(this.rng, size, color);
    this.place(r, x, z, 0, size * 0.25);
    if (collide && size > 0.6) this.circle(x, z, size * 0.85, size * 1.5);
    return r;
  }

  pointLight(x: number, y: number, z: number, color: number, intensity: number, distance: number): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, this.heightAt(x, z) + y, z);
    this.group.add(l);
    this.lights.push(l);
    return l;
  }

  /** Scatter points in a region, rejecting points where `reject` returns true. */
  scatter(count: number, minX: number, maxX: number, minZ: number, maxZ: number, reject: (x: number, z: number) => boolean, fn: (x: number, z: number) => void, maxTries = 20): void {
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < maxTries; k++) {
        const x = this.rng.range(minX, maxX);
        const z = this.rng.range(minZ, maxZ);
        if (reject(x, z)) continue;
        fn(x, z);
        break;
      }
    }
  }
}
