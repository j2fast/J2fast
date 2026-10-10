// Player arrows and enemy orbs.

import * as THREE from 'three';
import { basic } from '../render/toon';
import type { Enemy } from './enemy';
import type { GameCtx, HitInfo } from './context';

interface Projectile {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  life: number;
  team: 'player' | 'enemy';
  pierce: boolean;
  hit: Set<Enemy>;
  info?: HitInfo;
  damage?: number;
  status?: { type: 'burn' | 'slow'; time: number };
  source?: string;
  dead: boolean;
  color: number;
}

const orbGeo = new THREE.SphereGeometry(0.28, 10, 8);
const haloGeo = new THREE.SphereGeometry(0.55, 10, 8);
const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5);
const arrowTipGeo = new THREE.ConeGeometry(0.09, 0.3, 6);

export class Projectiles {
  readonly group = new THREE.Group();
  private list: Projectile[] = [];

  spawnArrow(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, radius: number, pierce: boolean, info: HitInfo) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(arrowGeo, basic(0xfff0c0));
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(arrowTipGeo, basic(pierce ? 0x9ad8ff : 0xffd27a, { additive: true, transparent: true }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.5;
    g.add(tip);
    const glow = new THREE.Mesh(haloGeo, basic(pierce ? 0x6ab8ff : 0xffb050, { transparent: true, opacity: 0.35, additive: true }));
    glow.scale.setScalar(pierce ? 0.9 : 0.5);
    glow.position.z = 0.4;
    g.add(glow);
    g.position.copy(pos);
    g.lookAt(pos.clone().add(dir));
    this.group.add(g);
    this.list.push({ mesh: g, pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(speed), radius, life: 1.4, team: 'player', pierce, hit: new Set(), info, dead: false, color: pierce ? 0x9ad8ff : 0xffd27a });
  }

  spawnOrb(pos: THREE.Vector3, yaw: number, speed: number, damage: number, status: Projectile['status'], color: number, source: string) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbGeo, basic(0xffffff)));
    const halo = new THREE.Mesh(haloGeo, basic(color, { transparent: true, opacity: 0.6, additive: true }));
    g.add(halo);
    g.position.copy(pos);
    this.group.add(g);
    this.list.push({
      mesh: g,
      pos: pos.clone(),
      vel: new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed),
      radius: 0.4,
      life: 4,
      team: 'enemy',
      pierce: false,
      hit: new Set(),
      damage,
      status,
      source,
      dead: false,
      color,
    });
  }

  update(dt: number, ctx: GameCtx) {
    const area = ctx.world.area;
    for (const p of this.list) {
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.team === 'enemy') {
        // Orbs hover at a fixed height above the ground.
        const gy = ctx.world.groundY(p.pos.x, p.pos.z) + 1.1;
        p.pos.y += (gy - p.pos.y) * Math.min(1, dt * 4);
        p.mesh.scale.setScalar(1 + Math.sin(p.life * 20) * 0.1);
      }
      if (p.life <= 0) p.dead = true;
      // Walls
      if (area?.walkable && !area.walkable(p.pos.x, p.pos.z)) p.dead = true;
      for (const c of area?.colliders ?? []) {
        if (c.disabled || (c.h ?? 3) < 1.5) continue;
        if (c.kind === 'circle' ? (p.pos.x - c.x) ** 2 + (p.pos.z - c.z) ** 2 < c.r * c.r : p.pos.x > c.minX && p.pos.x < c.maxX && p.pos.z > c.minZ && p.pos.z < c.maxZ) {
          p.dead = true;
          break;
        }
      }
      if (p.team === 'player' && p.pos.y < ctx.world.heightAt(p.pos.x, p.pos.z) - 0.2) p.dead = true;
      if (p.dead) continue;

      if (p.team === 'player') {
        for (const e of ctx.enemies) {
          if (!e.alive || !e.targetable || p.hit.has(e)) continue;
          const ey = e.pos.y + e.aimHeight;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < e.radius + p.radius && Math.abs(ey - p.pos.y) < e.model.height * 0.7 + 0.5) {
            p.hit.add(e);
            ctx.hitEnemy(e, { ...p.info!, fromX: p.pos.x - p.vel.x * 0.05, fromZ: p.pos.z - p.vel.z * 0.05 });
            if (!p.pierce) {
              p.dead = true;
              break;
            }
          }
        }
      } else {
        const pl = ctx.player;
        if (pl.alive && Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z) < pl.radius + p.radius) {
          const landed = ctx.hitPlayer({ damage: p.damage!, fromX: p.pos.x, fromZ: p.pos.z, knockback: 0.8, status: p.status, source: p.source ?? 'orb' });
          if (landed || !pl.invulnerable) p.dead = true;
        }
      }
      if (p.dead) ctx.effects.burst(p.pos.x, p.pos.y, p.pos.z, { count: 8, color: p.color, speed: 3, life: 0.3, size: 's' });
    }
    for (const p of this.list.filter((x) => x.dead)) this.group.remove(p.mesh);
    this.list = this.list.filter((x) => !x.dead);
  }

  clear() {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list = [];
  }

  get count() {
    return this.list.length;
  }
}
