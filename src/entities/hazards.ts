// Timed area effects: expanding shockwave rings (enemy) and ember rain (player).

import * as THREE from 'three';
import { fxRng } from '../core/rng';
import { basic } from '../render/toon';
import type { GameCtx } from './context';

interface Ring {
  kind: 'ring';
  center: THREE.Vector3;
  radius: number;
  maxRadius: number;
  speed: number;
  damage: number;
  hit: boolean;
  mesh: THREE.Mesh;
  source: string;
}

interface Rain {
  kind: 'rain';
  center: THREE.Vector3;
  radius: number;
  t: number;
  duration: number;
  tick: number;
  damage: number;
  mesh: THREE.Mesh;
}

type Hazard = Ring | Rain;

export class Hazards {
  readonly group = new THREE.Group();
  private list: Hazard[] = [];

  ring(center: THREE.Vector3, maxRadius: number, speed: number, damage: number, color: number, source: string) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), basic(color, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, additive: true, depthWrite: false }).clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, center.y + 0.25, center.z);
    // A short wall so the ring reads clearly as something to dodge through.
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 48, 1, true), basic(color, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, additive: true, depthWrite: false }));
    wall.rotation.x = Math.PI / 2;
    wall.position.z = -0.6;
    mesh.add(wall);
    this.group.add(mesh);
    this.list.push({ kind: 'ring', center: center.clone(), radius: 1, maxRadius, speed, damage, hit: false, mesh, source });
  }

  emberRain(center: THREE.Vector3, radius: number, duration: number, damageMult: number) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.2, radius, 48), basic(0xffc060, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, additive: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, center.y + 0.1, center.z);
    this.group.add(mesh);
    this.list.push({ kind: 'rain', center: center.clone(), radius, t: 0, duration, tick: 0.2, damage: damageMult, mesh });
  }

  update(dt: number, ctx: GameCtx) {
    for (const h of this.list) {
      if (h.kind === 'ring') {
        h.radius += h.speed * dt;
        h.mesh.scale.setScalar(h.radius);
        (h.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - h.radius / h.maxRadius) + 0.15;
        const p = ctx.player;
        const d = Math.hypot(p.pos.x - h.center.x, p.pos.z - h.center.z);
        if (!h.hit && p.alive && Math.abs(d - h.radius) < 0.7 + p.radius) {
          if (ctx.hitPlayer({ damage: h.damage, fromX: h.center.x, fromZ: h.center.z, knockback: 2, source: h.source })) h.hit = true;
        }
      } else {
        h.t += dt;
        h.tick -= dt;
        for (let i = 0; i < 3; i++) {
          const a = fxRng.next() * Math.PI * 2;
          const r = Math.sqrt(fxRng.next()) * h.radius;
          ctx.effects.burst(h.center.x + Math.cos(a) * r, h.center.y + 6, h.center.z + Math.sin(a) * r, { count: 1, color: 0xffa040, speed: 0.5, life: 0.5, gravity: 30, size: 'm' });
        }
        if (h.tick <= 0) {
          h.tick = 0.25;
          for (const e of ctx.enemies) {
            if (!e.alive || !e.targetable) continue;
            if (Math.hypot(e.pos.x - h.center.x, e.pos.z - h.center.z) < h.radius + e.radius) {
              ctx.hitEnemy(e, { mult: h.damage, poise: 6, knockback: 0.3, fromX: h.center.x, fromZ: h.center.z, noHitstop: true, source: 'ability' });
            }
          }
          ctx.effects.burst(h.center.x, h.center.y + 0.2, h.center.z, { count: 6, color: 0xffc060, speed: 3, life: 0.4, size: 's', spread: h.radius });
        }
      }
    }
    const done = this.list.filter((h) => (h.kind === 'ring' ? h.radius >= h.maxRadius : h.t >= h.duration));
    for (const h of done) {
      this.group.remove(h.mesh);
      h.mesh.geometry.dispose();
    }
    this.list = this.list.filter((h) => !done.includes(h));
  }

  clear() {
    for (const h of this.list) this.group.remove(h.mesh);
    this.list = [];
  }
}
