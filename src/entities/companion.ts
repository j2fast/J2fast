// Kohaku, the fox-spirit companion. Follows the Warden, harries enemies and
// occasionally comments. Not targetable by enemies (it is a spirit).

import * as THREE from 'three';
import { approachAngle, yawTo } from '../core/math';
import { Model, buildKohaku } from '../render/creatures';
import type { Enemy } from './enemy';
import type { GameCtx } from './context';

type CState = 'follow' | 'attack' | 'windup' | 'recover';

const BARKS = {
  lowHp: ['Warden! Eat something before you fall over!', 'You look terrible. Heal up!'],
  boss: ["That's a big one. I'll go for its ankles.", 'Here we go. Stay light on your feet!'],
  kill: ['Ha! Another one crosses over.', 'Nicely done.', 'That one smelled awful.'],
};

export class Companion {
  readonly model: Model;
  readonly root: THREE.Group;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private state: CState = 'follow';
  private stateT = 0;
  private target: Enemy | null = null;
  private cd = 0;
  private t = 0;
  private speedNow = 0;
  private barkCd = 10;
  private lowHpBarked = false;

  constructor() {
    this.model = buildKohaku();
    this.root = this.model.root;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline) m.castShadow = true;
    });
  }

  place(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.root.position.copy(this.pos);
    this.state = 'follow';
    this.target = null;
  }

  bark(ctx: GameCtx, kind: keyof typeof BARKS) {
    if (this.barkCd > 0) return;
    this.barkCd = 14;
    const lines = BARKS[kind];
    ctx.caption(lines[Math.floor(ctx.rng.next() * lines.length)], 'Kohaku', 2.5);
  }

  update(dt: number, ctx: GameCtx) {
    this.t += dt;
    this.stateT += dt;
    this.cd -= dt;
    this.barkCd -= dt;
    const p = ctx.player;
    const hpFrac = p.hp / ctx.stats.maxHp;
    if (hpFrac < 0.3 && !this.lowHpBarked && p.alive) {
      this.lowHpBarked = true;
      this.bark(ctx, 'lowHp');
    }
    if (hpFrac > 0.6) this.lowHpBarked = false;

    const distToPlayer = this.pos.distanceTo(p.pos);
    if (distToPlayer > 22) {
      // Spirits can simply reappear beside their friend.
      const x = p.pos.x - Math.sin(p.yaw) * 1.5;
      const z = p.pos.z - Math.cos(p.yaw) * 1.5;
      ctx.effects.burst(x, ctx.world.groundY(x, z) + 0.5, z, { count: 12, color: 0xffd27a, speed: 2, life: 0.6, size: 'm' });
      this.pos.set(x, 0, z);
      this.state = 'follow';
    }

    if (this.target && (!this.target.alive || !this.target.targetable)) this.target = null;
    if (!this.target && this.state === 'follow' && this.cd <= 0) {
      const lock = ctx.lockTarget();
      if (lock && lock.def.behavior !== 'dummy') this.target = lock;
      else {
        let best: Enemy | null = null;
        let bd = 9;
        for (const e of ctx.enemies) {
          if (!e.alive || !e.targetable || !e.aggro || e.def.behavior === 'dummy') continue;
          const d = e.pos.distanceTo(p.pos);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        this.target = best;
      }
      if (this.target) this.state = 'attack';
    }

    this.speedNow = 0;
    switch (this.state) {
      case 'follow': {
        const fx = p.pos.x - Math.sin(p.yaw + 0.8) * 2;
        const fz = p.pos.z - Math.cos(p.yaw + 0.8) * 2;
        const d = Math.hypot(fx - this.pos.x, fz - this.pos.z);
        if (d > 0.6) this.moveToward(fx, fz, Math.min(9, 3 + d * 1.5), dt, ctx);
        else this.yaw = approachAngle(this.yaw, p.yaw, 3 * dt);
        break;
      }
      case 'attack': {
        const e = this.target;
        if (!e) {
          this.state = 'follow';
          break;
        }
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius;
        if (d > 1.3) this.moveToward(e.pos.x, e.pos.z, 8, dt, ctx);
        else {
          this.state = 'windup';
          this.stateT = 0;
        }
        if (this.stateT > 4) this.state = 'follow';
        break;
      }
      case 'windup':
        if (this.target) this.yaw = approachAngle(this.yaw, yawTo(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z), 10 * dt);
        if (this.stateT > 0.3) {
          const e = this.target;
          if (e && e.alive && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius < 2) {
            ctx.hitEnemy(e, { mult: 0.45, poise: 6, knockback: 0.5, fromX: this.pos.x, fromZ: this.pos.z, noHitstop: true, source: 'companion' });
            ctx.effects.burst(e.pos.x, e.pos.y + 0.8, e.pos.z, { count: 8, color: 0xffd27a, speed: 3, life: 0.3, size: 's' });
          }
          this.state = 'recover';
          this.stateT = 0;
        }
        break;
      case 'recover':
        if (this.stateT > 0.5) {
          this.cd = 1.4;
          this.state = 'follow';
          this.target = null;
          this.stateT = 0;
        }
        break;
    }
    const gy = ctx.world.groundY(this.pos.x, this.pos.z);
    this.pos.y = gy;
    this.root.position.set(this.pos.x, gy + 0.05 + Math.sin(this.t * 2) * 0.04, this.pos.z);
    this.root.rotation.y = this.yaw;
    const mode = this.state === 'windup' ? 'windup' : this.state === 'recover' && this.stateT < 0.2 ? 'active' : this.speedNow > 0.3 ? 'move' : 'idle';
    this.model.animate({ mode, t: this.t, speed: this.speedNow, progress: 0 }, dt);
  }

  private moveToward(x: number, z: number, speed: number, dt: number, ctx: GameCtx) {
    const yaw = yawTo(this.pos.x, this.pos.z, x, z);
    this.yaw = approachAngle(this.yaw, yaw, 10 * dt);
    const r = ctx.world.move(this.pos.x, this.pos.z, Math.sin(yaw) * speed * dt, Math.cos(yaw) * speed * dt, 0.35);
    this.pos.x = r.x;
    this.pos.z = r.z;
    this.speedNow = speed;
  }
}
