// Enemy and boss behaviour: perception, positioning, telegraphed attacks,
// poise/stagger, status effects and boss phases.

import * as THREE from 'three';
import { angleDiff, approachAngle, clamp, yawTo } from '../core/math';
import { BOSS_LINES } from '../data/dialogue';
import { ENEMIES, EnemyAttack, EnemyDef, scaleEnemy } from '../data/enemies';
import { AnimMode, Model, buildEnemyModel } from '../render/creatures';
import type { Telegraph } from '../render/effects';
import { setFlash } from '../render/rig';
import { basic } from '../render/toon';
import type { GameCtx, HitInfo } from './context';

export type EnemyState = 'idle' | 'chase' | 'strafe' | 'windup' | 'active' | 'recover' | 'hit' | 'stagger' | 'dead' | 'return' | 'intro' | 'phase';

const DEG = Math.PI / 180;

export class Enemy {
  readonly def: EnemyDef;
  readonly model: Model;
  readonly root: THREE.Group;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  yaw = 0;
  readonly radius: number;
  hp: number;
  maxHp: number;
  atk: number;
  defense: number;
  xp: number;
  coinMult: number;
  level: number;
  state: EnemyState = 'idle';
  stateT = 0;
  attack: EnemyAttack | null = null;
  private cooldowns = new Map<string, number>();
  private globalCd = 0.8;
  poise: number;
  aggro = false;
  hasToken = false;
  private telegraphs: Telegraph[] = [];
  readonly boss: boolean;
  phase = 1;
  private flashT = 0;
  bleedT = 0;
  private bleedDps = 0;
  burnT = 0;
  private burnDps = 0;
  private dotTick = 0;
  stunT = 0;
  deadT = 0;
  removed = false;
  summoned = false;
  spawnId: string;
  targetable = true;
  private strafeDir = 1;
  private strafeT = 0;
  private hitLanded = false;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private pillarPos: THREE.Vector3[] = [];
  private beamYaw = 0;
  private beam: THREE.Mesh | null = null;
  private spiralAngle = 0;
  private tick = 0;
  private animT = Math.random() * 10;
  private moveSpeedNow = 0;
  private wanderT = 0;
  private wanderTarget = new THREE.Vector3();
  private evadeT = 0;
  invulnerable = false;
  private poiseRegenT = 0;
  private staggerImmuneT = 0;
  private flinchCd = 0;
  /** Bosses wait in their arena until the fight is triggered. */
  dormant = false;
  /** Damage dealt to the boss since the last check (for bars). */
  recentDamage = 0;
  ghostT = 0;

  constructor(defId: string, level: number, spawnId: string, diffHealth = 1) {
    const def = ENEMIES[defId];
    if (!def) throw new Error(`Unknown enemy ${defId}`);
    this.def = def;
    this.level = level;
    this.spawnId = spawnId;
    const sc = scaleEnemy(def, level);
    this.maxHp = Math.round(sc.hp * (def.id === 'training_dummy' ? 1 : diffHealth));
    this.hp = this.maxHp;
    this.atk = sc.atk;
    this.defense = sc.def;
    this.xp = sc.xp;
    this.coinMult = sc.coinMult;
    this.radius = def.radius;
    this.poise = def.poise;
    this.boss = !!def.boss;
    this.model = buildEnemyModel(def.model);
    this.root = this.model.root;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline) m.castShadow = true;
    });
    // Model builders already apply each creature's scale.
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get aimHeight(): number {
    return this.def.flying ? 1.5 : this.model.height * 0.55;
  }

  place(x: number, y: number, z: number, yaw: number) {
    this.pos.set(x, y, z);
    this.home.set(x, y, z);
    this.yaw = yaw;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  // ------------------------------------------------------------------ Update

  update(dt: number, ctx: GameCtx): void {
    this.stateT += dt;
    this.animT += dt;
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);
    this.globalCd -= dt;
    this.evadeT -= dt;
    this.flinchCd -= dt;
    this.staggerImmuneT -= dt;
    this.poiseRegenT -= dt;
    if (this.poiseRegenT <= 0 && this.poise < this.def.poise) this.poise = this.def.poise;
    this.updateDots(dt, ctx);

    if (this.state === 'dead') {
      this.deadT += dt;
      this.model.animate({ mode: 'dead', t: this.animT, speed: 0, progress: clamp(this.deadT / 1.2, 0, 1) }, dt);
      if (this.deadT > 1.6) this.root.position.y -= dt * 1.2;
      if (this.deadT > 2.6) this.removed = true;
      return;
    }

    const player = ctx.player;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);

    if (this.def.behavior === 'dummy') {
      this.animateModel(dt, 0);
      this.syncTransform(ctx);
      return;
    }

    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.state !== 'stagger') this.setState('stagger');
    }

    // Perception
    if (this.dormant) {
      this.yaw = approachAngle(this.yaw, toPlayer, 1.5 * dt);
      this.animateModel(dt, 0);
      this.syncTransform(ctx);
      return;
    }
    if (!this.aggro && player.alive && dist < this.def.aggroRange && this.state !== 'return') {
      this.aggro = true;
      this.alertAllies(ctx);
    }
    if (!player.alive && this.aggro && !this.boss) {
      this.aggro = false;
      this.cancelAttack(ctx);
      this.setState('return');
    }

    switch (this.state) {
      case 'idle':
        this.updateIdle(dt, ctx);
        break;
      case 'return': {
        const hd = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
        this.moveToward(this.home.x, this.home.z, this.def.speed * 1.2, dt, ctx);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4 * dt);
        if (hd < 1) {
          this.hp = this.maxHp;
          this.setState('idle');
        }
        break;
      }
      case 'intro':
        this.yaw = approachAngle(this.yaw, toPlayer, 3 * dt);
        if (this.stateT > 2.6) {
          this.aggro = true;
          this.setState('chase');
        }
        break;
      case 'phase':
        this.yaw = approachAngle(this.yaw, toPlayer, 3 * dt);
        if (this.stateT > 1.8) {
          this.invulnerable = false;
          this.setState('chase');
        }
        break;
      case 'chase':
      case 'strafe':
        this.updateCombat(dt, dist, toPlayer, ctx);
        break;
      case 'windup':
        this.updateWindup(dt, dist, toPlayer, ctx);
        break;
      case 'active':
        this.updateActive(dt, ctx);
        break;
      case 'recover':
        if (this.stateT >= (this.attack?.recovery ?? 0.5)) this.finishAttack();
        break;
      case 'hit':
        if (this.stateT >= 0.28) this.setState(this.aggro ? 'chase' : 'idle');
        break;
      case 'stagger':
        if (this.stunT <= 0 && this.stateT >= (this.boss ? 2.4 : 1.2)) {
          this.poise = this.def.poise;
          this.staggerImmuneT = this.boss ? 6 : 3;
          this.globalCd = Math.min(this.globalCd, 0.2);
          this.setState('chase');
        }
        break;
    }

    // Leash
    if (this.aggro && !this.boss && !this.summoned && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > this.def.leash && this.state !== 'windup' && this.state !== 'active') {
      this.aggro = false;
      this.cancelAttack(ctx);
      this.setState('return');
    }

    // Knockback
    if (this.vel.lengthSq() > 0.001) {
      this.moveBy(this.vel.x * dt, this.vel.z * dt, ctx);
      this.vel.multiplyScalar(Math.exp(-7 * dt));
    }
    this.animateModel(dt, this.moveSpeedNow);
    this.syncTransform(ctx);
  }

  private syncTransform(ctx: GameCtx) {
    if (this.state === 'active' && this.attack?.kind === 'leap') return; // leap sets its own height
    const gy = ctx.world.groundY(this.pos.x, this.pos.z);
    this.pos.y = gy;
    this.root.position.set(this.pos.x, gy, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  private updateIdle(dt: number, ctx: GameCtx) {
    this.moveSpeedNow = 0;
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 3 + ctx.rng.next() * 4;
      const a = ctx.rng.next() * Math.PI * 2;
      const r = ctx.rng.next() * 3;
      this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
    }
    const d = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
    if (d > 0.5 && this.def.speed > 0) this.moveToward(this.wanderTarget.x, this.wanderTarget.z, this.def.speed * 0.3, dt, ctx);
    if (this.aggro) this.setState('chase');
  }

  private updateCombat(dt: number, dist: number, toPlayer: number, ctx: GameCtx) {
    const player = ctx.player;
    if (!player.alive) {
      this.moveSpeedNow = 0;
      return;
    }
    const b = this.def.behavior;
    const gap = dist - this.radius - player.radius;

    // Evasive enemies sidestep the player's swings.
    if (this.def.evade && player.state === 'attack' && player.stateT < 0.06 && gap < 2.5 && this.evadeT <= 0) {
      this.evadeT = 1.5;
      if (ctx.rng.next() < this.def.evade) {
        const side = ctx.rng.chance(0.5) ? 1 : -1;
        const a = toPlayer + Math.PI + side * 0.9;
        this.vel.set(Math.sin(a) * 9, 0, Math.cos(a) * 9);
        ctx.effects.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, { count: 8, color: 0x6a3a8a, speed: 2, life: 0.4, size: 'm' });
        return;
      }
    }

    // Pick an attack
    if (this.globalCd <= 0) {
      const atk = this.chooseAttack(gap, ctx);
      if (atk) {
        const needsToken = !this.boss && b !== 'swarm';
        if (!needsToken || this.hasToken || ctx.requestToken(this)) {
          if (needsToken) this.hasToken = true;
          this.beginAttack(atk, ctx);
          return;
        }
      }
    }

    // Positioning
    const pref = this.def.preferredRange;
    let speed = this.def.speed;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 1.2 + ctx.rng.next() * 1.5;
      this.strafeDir = ctx.rng.chance(0.5) ? 1 : -1;
    }
    if (pref) {
      if (dist < pref * 0.6) this.moveDir(toPlayer + Math.PI, speed * 0.9, dt, ctx);
      else if (dist > pref * 1.25) this.moveDir(toPlayer, speed, dt, ctx);
      else this.moveDir(toPlayer + this.strafeDir * Math.PI / 2, speed * 0.5, dt, ctx);
    } else {
      const holdOff = !this.boss && b !== 'swarm' && !this.hasToken && gap < 4.5;
      if (holdOff || (b === 'skirmisher' && gap < 3.5 && this.globalCd > 0)) {
        // Circle the player while waiting for an opening.
        const ang = toPlayer + Math.PI / 2 * this.strafeDir;
        this.moveDir(ang + (gap < 3 ? 0.6 * this.strafeDir : 0), speed * 0.45, dt, ctx);
      } else if (gap > this.preferredMelee()) {
        if (b === 'heavy') speed *= 0.9;
        this.moveDir(toPlayer, speed, dt, ctx);
      } else this.moveSpeedNow = 0;
    }
    this.yaw = approachAngle(this.yaw, toPlayer, 8 * dt);
  }

  private preferredMelee(): number {
    let best = 1.2;
    for (const a of this.def.attacks) if (a.kind === 'melee') best = Math.max(best, a.range * 0.75);
    return best;
  }

  private chooseAttack(gap: number, ctx: GameCtx): EnemyAttack | null {
    const options = this.def.attacks.filter((a) => {
      if ((this.cooldowns.get(a.id) ?? 0) > 0) return false;
      if ((a.phase ?? 1) > this.phase) return false;
      if (gap > a.range) return false;
      if (a.minRange !== undefined && gap < a.minRange) return false;
      if (a.kind === 'summon') {
        const minions = ctx.enemies.filter((e) => e.summoned && e.alive).length;
        if (minions >= 3) return false;
      }
      return true;
    });
    if (!options.length) return null;
    return ctx.rng.weighted(options.map((o) => ({ weight: o.weight, value: o })));
  }

  // ------------------------------------------------------------------ Attacks

  private beginAttack(a: EnemyAttack, ctx: GameCtx) {
    this.attack = a;
    this.setState('windup');
    this.hitLanded = false;
    this.tick = 0;
    const p = ctx.player;
    const tm = ctx.effects.telegraphs;
    const gy = this.pos.y;
    const self = this;
    const followSelf = () => (self.alive ? { x: self.pos.x, y: self.pos.y, z: self.pos.z, yaw: self.yaw } : null);
    if (a.callout) ctx.caption(a.callout, '', 2.2);
    if (this.boss || a.windup >= 0.8) ctx.sfx('enemyWindup', this.pos.x, this.pos.z, this.boss ? 1 : 0.6);
    switch (a.kind) {
      case 'melee': {
        const tg = tm.spawn({ kind: 'cone', radius: a.range + this.radius, arc: Math.min(359, a.arc ?? 90) }, this.pos.x, gy, this.pos.z, this.yaw, a.windup);
        tg.follow = followSelf;
        this.telegraphs.push(tg);
        break;
      }
      case 'charge': {
        const len = (a.speed ?? 10) * a.active + this.radius;
        const tg = tm.spawn({ kind: 'line', length: len, width: this.radius * 2 + 0.6 }, this.pos.x, gy, this.pos.z, this.yaw, a.windup);
        tg.follow = followSelf;
        this.telegraphs.push(tg);
        break;
      }
      case 'leap': {
        this.leapTo.copy(p.pos);
        const tg = tm.spawn({ kind: 'circle', radius: a.radius ?? 3 }, p.pos.x, p.pos.y, p.pos.z, 0, a.windup + a.active);
        tg.follow = () => (self.stateT < a.windup * 0.7 && self.state === 'windup' ? { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: 0 } : { x: self.leapTo.x, y: self.leapTo.y, z: self.leapTo.z, yaw: 0 });
        this.telegraphs.push(tg);
        break;
      }
      case 'slam': {
        const tg = tm.spawn({ kind: 'circle', radius: a.radius ?? 3 }, this.pos.x, gy, this.pos.z, 0, a.windup);
        tg.follow = followSelf;
        this.telegraphs.push(tg);
        break;
      }
      case 'pillars': {
        this.pillarPos = [];
        const n = a.count ?? 1;
        if (n === 1) this.pillarPos.push(p.pos.clone());
        else if (this.def.id === 'kuroganemaru') {
          // A fissure running from the Oni toward the player.
          const yaw = yawTo(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
          for (let i = 1; i <= n; i++) {
            const d = i * 2.8;
            const x = this.pos.x + Math.sin(yaw) * d;
            const z = this.pos.z + Math.cos(yaw) * d;
            this.pillarPos.push(new THREE.Vector3(x, ctx.world.groundY(x, z), z));
          }
        } else {
          this.pillarPos.push(p.pos.clone());
          for (let i = 1; i < n; i++) {
            const ang = ctx.rng.next() * Math.PI * 2;
            const r = 3 + ctx.rng.next() * 7;
            const x = p.pos.x + Math.cos(ang) * r;
            const z = p.pos.z + Math.sin(ang) * r;
            this.pillarPos.push(new THREE.Vector3(x, ctx.world.groundY(x, z), z));
          }
        }
        for (const pp of this.pillarPos) {
          const tg = tm.spawn({ kind: 'circle', radius: a.radius ?? 2 }, pp.x, pp.y, pp.z, 0, a.windup);
          this.telegraphs.push(tg);
        }
        // Single pillars track the player for the first half of the wind-up.
        if (n === 1) {
          const tg = this.telegraphs[this.telegraphs.length - 1];
          tg.follow = () => {
            if (self.stateT < a.windup * 0.5 && self.state === 'windup') self.pillarPos[0].copy(p.pos);
            const q = self.pillarPos[0];
            return { x: q.x, y: q.y, z: q.z, yaw: 0 };
          };
        }
        break;
      }
      case 'ring': {
        const tg = tm.spawn({ kind: 'ring', radius: 2.5 }, this.pos.x, gy, this.pos.z, 0, a.windup);
        tg.follow = followSelf;
        this.telegraphs.push(tg);
        break;
      }
      case 'beam': {
        this.beamYaw = yawTo(this.pos.x, this.pos.z, p.pos.x, p.pos.z) - 0.9;
        const tg = tm.spawn({ kind: 'line', length: a.radius ?? 20, width: 2.2 }, this.pos.x, gy, this.pos.z, this.beamYaw, a.windup);
        tg.follow = () => ({ x: self.pos.x, y: self.pos.y, z: self.pos.z, yaw: self.beamYaw });
        this.telegraphs.push(tg);
        break;
      }
      case 'dive': {
        this.targetable = false;
        this.root.visible = false;
        ctx.effects.burst(this.pos.x, this.pos.y + 2, this.pos.z, { count: 30, color: 0x6a4a8a, speed: 5, life: 0.8, size: 'm' });
        this.leapTo.copy(p.pos);
        const tg = tm.spawn({ kind: 'circle', radius: a.radius ?? 3 }, p.pos.x, p.pos.y, p.pos.z, 0, a.windup);
        tg.follow = () => {
          if (self.stateT < a.windup - 0.7 && self.state === 'windup') self.leapTo.copy(p.pos);
          return { x: self.leapTo.x, y: self.leapTo.y, z: self.leapTo.z, yaw: 0 };
        };
        this.telegraphs.push(tg);
        break;
      }
      default:
        break;
    }
  }

  private updateWindup(dt: number, dist: number, toPlayer: number, ctx: GameCtx) {
    const a = this.attack!;
    this.moveSpeedNow = 0;
    // Track the player, but commit to a direction for the last 35% of the wind-up.
    const commit = this.stateT > a.windup * 0.65;
    if (a.kind !== 'beam' && a.kind !== 'dive' && !commit) this.yaw = approachAngle(this.yaw, toPlayer, (this.boss ? 4 : 6) * dt);
    if (a.kind === 'beam') this.yaw = approachAngle(this.yaw, this.beamYaw + 0.9, 3 * dt);
    if (this.def.model === 'wisp' && this.stateT < a.windup) {
      ctx.effects.burst(this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 1, color: 0xffa040, speed: 1, life: 0.4, size: 's' });
    }
    if (this.stateT >= a.windup) {
      this.setState('active');
      this.onActiveStart(ctx);
    }
    void dist;
  }

  private onActiveStart(ctx: GameCtx) {
    const a = this.attack!;
    const p = ctx.player;
    const dmg = this.atk * a.damage * ctx.enemyDifficulty().damage;
    switch (a.kind) {
      case 'melee': {
        const dx = p.pos.x - this.pos.x;
        const dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const inArc = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) <= ((a.arc ?? 90) * DEG) / 2 + (d < 1.5 ? 0.5 : 0.1);
        if (d - p.radius <= a.range + this.radius && inArc) this.landHit(dmg, a, ctx);
        ctx.sfx(this.boss ? 'swingHeavy' : 'swing', this.pos.x, this.pos.z, 0.7);
        if (this.boss) {
          const fx = this.pos.x + Math.sin(this.yaw) * a.range * 0.8;
          const fz = this.pos.z + Math.cos(this.yaw) * a.range * 0.8;
          ctx.effects.burst(fx, this.pos.y + 0.2, fz, { count: 16, color: 0xc8a878, speed: 5, life: 0.6, gravity: 9, size: 'm' });
          ctx.shake(0.3);
        }
        break;
      }
      case 'slam': {
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d <= (a.radius ?? 3) + p.radius) this.landHit(dmg, a, ctx);
        ctx.effects.shockwave(this.pos.x, this.pos.y, this.pos.z, a.radius ?? 3, 0xffa070);
        ctx.effects.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 26, color: 0xb8a888, speed: 6, life: 0.7, gravity: 10, size: 'm', upBias: 1 });
        ctx.shake(0.5);
        ctx.sfx('explosion', this.pos.x, this.pos.z, 0.8);
        break;
      }
      case 'leap':
        this.leapFrom.copy(this.pos);
        break;
      case 'pillars': {
        for (const pp of this.pillarPos) {
          if (!this.hitLanded && Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z) <= (a.radius ?? 2) + p.radius * 0.5) this.landHit(dmg, a, ctx);
          ctx.effects.burst(pp.x, pp.y + 0.3, pp.z, { count: 22, color: this.def.id === 'kuroganemaru' ? 0xff7a3a : 0xb06aff, speed: 7, life: 0.7, gravity: 6, size: 'm', upBias: 2 });
          ctx.effects.shockwave(pp.x, pp.y, pp.z, a.radius ?? 2, this.def.id === 'kuroganemaru' ? 0xff7a3a : 0xb06aff, 0.35);
        }
        ctx.sfx('explosion', this.pillarPos[0]?.x, this.pillarPos[0]?.z, 0.7);
        ctx.shake(0.25);
        break;
      }
      case 'projectile': {
        const n = a.count ?? 1;
        const base = yawTo(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        const oy = this.pos.y + (this.def.flying ? 1.5 : this.model.height * 0.6);
        for (let i = 0; i < n; i++) {
          const yaw = base + (n > 1 ? (i - (n - 1) / 2) * ((a.spread ?? 0.3) / Math.max(1, (n - 1) / 2)) : 0);
          ctx.projectiles.spawnOrb(new THREE.Vector3(this.pos.x, oy, this.pos.z), yaw, a.speed ?? 10, dmg, a.status, this.orbColor(), this.def.id);
        }
        ctx.sfx('orb', this.pos.x, this.pos.z);
        break;
      }
      case 'ring':
        ctx.hazards.ring(this.pos.clone(), a.radius ?? 12, a.speed ?? 9, dmg, this.boss ? 0xff7a3a : 0xff7a3a, this.def.id);
        ctx.shake(0.4);
        ctx.sfx('explosion', this.pos.x, this.pos.z);
        break;
      case 'beam':
        this.createBeam(ctx, a.radius ?? 20);
        break;
      case 'summon': {
        const s = a.summon!;
        for (let i = 0; i < s.count; i++) {
          const ang = (i / s.count) * Math.PI * 2 + ctx.rng.next();
          const x = this.pos.x + Math.cos(ang) * 4;
          const z = this.pos.z + Math.sin(ang) * 4;
          const e = ctx.spawnEnemy(s.enemy, x, z, this.level, true);
          if (e) {
            e.aggro = true;
            e.state = 'chase';
            ctx.effects.burst(x, ctx.world.groundY(x, z) + 0.5, z, { count: 20, color: 0x6a4a8a, speed: 4, life: 0.7, size: 'm' });
          }
        }
        break;
      }
      case 'teleport': {
        const ang = ctx.rng.next() * Math.PI * 2;
        const r = this.boss ? 9 : a.range + 4;
        let nx = p.pos.x + Math.cos(ang) * r;
        let nz = p.pos.z + Math.sin(ang) * r;
        const area = ctx.world.area;
        if (area?.walkable && !area.walkable(nx, nz)) {
          nx = this.home.x;
          nz = this.home.z;
        }
        ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 20, color: 0x8a4aff, speed: 4, life: 0.6, size: 'm' });
        this.pos.x = nx;
        this.pos.z = nz;
        ctx.effects.burst(nx, ctx.world.groundY(nx, nz) + 1, nz, { count: 20, color: 0x8a4aff, speed: 4, life: 0.6, size: 'm' });
        this.yaw = yawTo(nx, nz, p.pos.x, p.pos.z);
        break;
      }
      case 'dive': {
        this.pos.x = this.leapTo.x;
        this.pos.z = this.leapTo.z;
        this.root.visible = true;
        this.targetable = true;
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d <= (a.radius ?? 3) + p.radius) this.landHit(dmg, a, ctx);
        ctx.effects.shockwave(this.pos.x, this.leapTo.y, this.pos.z, a.radius ?? 3, 0xb06aff);
        ctx.effects.burst(this.pos.x, this.leapTo.y + 0.3, this.pos.z, { count: 30, color: 0x6a5a6a, speed: 7, life: 0.8, gravity: 9, size: 'm', upBias: 1 });
        ctx.shake(0.7);
        ctx.sfx('explosion', this.pos.x, this.pos.z);
        break;
      }
      default:
        break;
    }
  }

  private orbColor(): number {
    if (this.def.id === 'itomaru') return 0xe8e0ff;
    if (this.def.model === 'acolyte' || this.def.id === 'yomikage') return 0xb06aff;
    return 0xff8a2a;
  }

  private updateActive(dt: number, ctx: GameCtx) {
    const a = this.attack!;
    const p = ctx.player;
    const dmg = this.atk * a.damage * ctx.enemyDifficulty().damage;
    switch (a.kind) {
      case 'charge': {
        const sp = a.speed ?? 10;
        this.moveBy(Math.sin(this.yaw) * sp * dt, Math.cos(this.yaw) * sp * dt, ctx);
        this.moveSpeedNow = sp;
        if (!this.hitLanded && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius + p.radius + 0.4) this.landHit(dmg, a, ctx);
        if (Math.floor(this.stateT * 20) % 2 === 0) ctx.effects.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 2, color: 0xa89878, speed: 2, life: 0.4, size: 'm' });
        break;
      }
      case 'leap': {
        const t = clamp(this.stateT / a.active, 0, 1);
        this.pos.x = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * t;
        this.pos.z = this.leapFrom.z + (this.leapTo.z - this.leapFrom.z) * t;
        const gy = ctx.world.groundY(this.pos.x, this.pos.z);
        this.root.position.set(this.pos.x, gy + Math.sin(t * Math.PI) * 4, this.pos.z);
        this.root.rotation.y = this.yaw;
        this.pos.y = gy;
        if (t >= 1 && !this.hitLanded) {
          this.hitLanded = true;
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          if (d <= (a.radius ?? 3) + p.radius) {
            this.hitLanded = false;
            this.landHit(dmg, a, ctx);
          }
          this.hitLanded = true;
          ctx.effects.shockwave(this.pos.x, gy, this.pos.z, a.radius ?? 3, 0xffa070);
          ctx.effects.burst(this.pos.x, gy + 0.2, this.pos.z, { count: 26, color: 0xb8a888, speed: 6, life: 0.7, gravity: 10, size: 'm', upBias: 1 });
          ctx.shake(this.boss ? 0.8 : 0.3);
          ctx.sfx('explosion', this.pos.x, this.pos.z, this.boss ? 1 : 0.5);
        }
        break;
      }
      case 'beam': {
        this.beamYaw += (1.8 / a.active) * dt;
        this.yaw = this.beamYaw;
        this.updateBeam(ctx);
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = a.interval ?? 0.25;
          const dx = p.pos.x - this.pos.x;
          const dz = p.pos.z - this.pos.z;
          const fx = Math.sin(this.beamYaw);
          const fz = Math.cos(this.beamYaw);
          const along = dx * fx + dz * fz;
          const perp = Math.abs(dx * fz - dz * fx);
          if (along > 0 && along < (a.radius ?? 20) && perp < 1.2 + p.radius) {
            this.hitLanded = false;
            this.landHit(dmg, a, ctx);
          }
        }
        break;
      }
      case 'spiral': {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = a.interval ?? 0.15;
          const n = a.count ?? 3;
          const oy = this.pos.y + (this.def.flying ? 2.5 : 1.2);
          for (let i = 0; i < n; i++) {
            ctx.projectiles.spawnOrb(new THREE.Vector3(this.pos.x, oy, this.pos.z), this.spiralAngle + (i / n) * Math.PI * 2, a.speed ?? 9, dmg, a.status, this.orbColor(), this.def.id);
          }
          this.spiralAngle += 0.33;
        }
        break;
      }
      default:
        break;
    }
    if (this.stateT >= a.active) {
      this.removeBeam(ctx);
      this.setState('recover');
    }
  }

  private landHit(dmg: number, a: EnemyAttack, ctx: GameCtx) {
    if (this.hitLanded) return;
    const landed = ctx.hitPlayer({ damage: dmg, fromX: this.pos.x, fromZ: this.pos.z, knockback: this.boss ? 2.5 : 1.2, status: a.status, source: this.def.name });
    if (landed) this.hitLanded = true;
  }

  private createBeam(ctx: GameCtx, len: number) {
    const geo = new THREE.BoxGeometry(1.6, 1.2, len);
    geo.translate(0, 0, len / 2);
    this.beam = new THREE.Mesh(geo, basic(0xc070ff, { transparent: true, opacity: 0.6, additive: true }));
    ctx.scene.add(this.beam);
    this.updateBeam(ctx);
  }

  private updateBeam(_ctx: GameCtx) {
    if (!this.beam) return;
    this.beam.position.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
    this.beam.rotation.y = this.beamYaw;
    this.beam.scale.x = 0.8 + Math.sin(this.animT * 30) * 0.2;
  }

  private removeBeam(ctx: GameCtx) {
    if (this.beam) {
      ctx.scene.remove(this.beam);
      this.beam.geometry.dispose();
      this.beam = null;
    }
  }

  private finishAttack() {
    const a = this.attack;
    if (a) this.cooldowns.set(a.id, a.cooldown);
    this.attack = null;
    this.globalCd = this.boss ? 0.25 + Math.random() * 0.5 : 0.5 + Math.random() * 0.7;
    this.setState('chase');
  }

  cancelAttack(ctx: GameCtx) {
    for (const tg of this.telegraphs) ctx.effects.telegraphs.remove(tg);
    this.telegraphs = [];
    this.removeBeam(ctx);
    if (this.attack) this.cooldowns.set(this.attack.id, this.attack.cooldown * 0.5);
    this.attack = null;
    if (!this.root.visible || !this.targetable) {
      this.root.visible = true;
      this.targetable = true;
    }
    if (this.hasToken) ctx.releaseToken(this);
    this.hasToken = false;
  }

  private setState(s: EnemyState) {
    if (s !== 'windup' && s !== 'active') this.telegraphs = this.telegraphs.filter((t) => !t.done);
    // Attack tokens are held only from wind-up through recovery.
    if (s === 'chase' || s === 'idle' || s === 'return' || s === 'stagger' || s === 'hit') this.hasToken = false;
    this.state = s;
    this.stateT = 0;
  }

  // ------------------------------------------------------------------ Movement

  private moveBy(dx: number, dz: number, ctx: GameCtx) {
    const r = ctx.world.move(this.pos.x, this.pos.z, dx, dz, this.radius);
    this.pos.x = r.x;
    this.pos.z = r.z;
  }

  private moveDir(yaw: number, speed: number, dt: number, ctx: GameCtx) {
    this.moveBy(Math.sin(yaw) * speed * dt, Math.cos(yaw) * speed * dt, ctx);
    this.moveSpeedNow = speed;
  }

  private moveToward(x: number, z: number, speed: number, dt: number, ctx: GameCtx) {
    const yaw = yawTo(this.pos.x, this.pos.z, x, z);
    this.yaw = approachAngle(this.yaw, yaw, 8 * dt);
    this.moveDir(yaw, speed, dt, ctx);
  }

  private alertAllies(ctx: GameCtx) {
    for (const e of ctx.enemies) {
      if (e !== this && e.alive && !e.aggro && e.def.behavior !== 'dummy' && e.pos.distanceTo(this.pos) < 10) {
        e.aggro = true;
      }
    }
  }

  // ------------------------------------------------------------------ Damage

  /** Called by the game after damage is computed. */
  receiveHit(amount: number, hit: HitInfo, ctx: GameCtx): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.recentDamage += amount;
    this.flashT = 0.1;
    if (!this.aggro && this.def.behavior !== 'dummy') {
      this.aggro = true;
      this.alertAllies(ctx);
      if (this.state === 'idle' || this.state === 'return') this.setState('chase');
    }
    const dx = this.pos.x - hit.fromX;
    const dz = this.pos.z - hit.fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const kbScale = this.boss ? 0.1 : this.def.superArmor ? 0.3 : 1;
    if (this.def.behavior !== 'dummy') {
      this.vel.x += (dx / d) * hit.knockback * 2.2 * kbScale;
      this.vel.z += (dz / d) * hit.knockback * 2.2 * kbScale;
    }
    if (hit.bleed && ctx.rng.next() < hit.bleed) {
      this.bleedT = 4;
      this.bleedDps = Math.max(1, ctx.stats.atk * 0.25);
    }
    if (ctx.stats.burnChance > 0 && ctx.rng.next() < ctx.stats.burnChance) {
      this.burnT = 3;
      this.burnDps = Math.max(1, ctx.stats.atk * 0.3);
    }
    if (this.hp <= 0) return;

    if (this.boss) this.checkPhase(ctx);
    if (this.state === 'phase' || this.state === 'intro') return;

    if (hit.stun) {
      this.cancelAttack(ctx);
      this.stunT = this.boss ? hit.stun * 0.4 : hit.stun;
      this.setState('stagger');
      return;
    }
    // Poise: enough poise damage in a short window causes a stagger. Enemies
    // keep winding up through light hits, so they cannot be stun-locked.
    this.poiseRegenT = 2.5;
    if (this.staggerImmuneT <= 0) this.poise -= hit.poise;
    if (this.poise <= 0) {
      this.poise = this.def.poise;
      this.cancelAttack(ctx);
      this.setState('stagger');
      ctx.sfx('stagger', this.pos.x, this.pos.z);
      ctx.effects.burst(this.pos.x, this.pos.y + this.model.height * 0.8, this.pos.z, { count: 14, color: 0xffe08a, speed: 3, life: 0.6, size: 'm' });
      return;
    }
    // Brief flinch when caught off guard (not while winding up or striking).
    if (!this.boss && !this.def.superArmor && this.flinchCd <= 0 && (this.state === 'chase' || this.state === 'strafe' || this.state === 'recover' || this.state === 'idle')) {
      this.flinchCd = 1.4;
      this.setState('hit');
    }
  }

  private checkPhase(ctx: GameCtx) {
    const th = this.def.boss!.phaseThresholds;
    const frac = this.hp / this.maxHp;
    if (this.phase - 1 < th.length && frac <= th[this.phase - 1]) {
      this.phase++;
      this.cancelAttack(ctx);
      this.invulnerable = true;
      this.setState('phase');
      const lines = BOSS_LINES[this.def.id]?.phase ?? [];
      lines.forEach((l, i) => setTimeout(() => ctx.caption(l, this.def.name, 2.6), i * 1400));
      ctx.sfx('bossRoar', this.pos.x, this.pos.z);
      ctx.effects.shockwave(this.pos.x, this.pos.y, this.pos.z, 8, 0xff5a3a, 0.7);
      ctx.shake(0.6);
      // Push the player away so the next phase starts fair.
      const p = ctx.player;
      const dx = p.pos.x - this.pos.x;
      const dz = p.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 7) p.vel.set((dx / d) * 14, 0, (dz / d) * 14);
    }
  }

  die(ctx: GameCtx) {
    this.cancelAttack(ctx);
    this.state = 'dead';
    this.stateT = 0;
    this.deadT = 0;
    this.targetable = false;
    this.root.visible = true;
  }

  startIntro() {
    this.dormant = false;
    this.setState('intro');
    this.aggro = true;
  }

  private updateDots(dt: number, ctx: GameCtx) {
    if (!this.alive || (this.bleedT <= 0 && this.burnT <= 0)) return;
    this.bleedT -= dt;
    this.burnT -= dt;
    this.dotTick -= dt;
    if (this.dotTick <= 0) {
      this.dotTick = 0.5;
      let dmg = 0;
      if (this.bleedT > 0) dmg += this.bleedDps * 0.5;
      if (this.burnT > 0) dmg += this.burnDps * 0.5;
      dmg = Math.max(1, Math.round(dmg));
      ctx.hitEnemy(this, { mult: 0, poise: 0, knockback: 0, fromX: this.pos.x, fromZ: this.pos.z, noHitstop: true, source: 'dot', fixedDamage: dmg });
      ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 4, color: this.bleedT > 0 ? 0xc02040 : 0xff7a2a, speed: 1.5, life: 0.5, gravity: 3, size: 's' });
    }
  }

  // ------------------------------------------------------------------ Animation

  private animateModel(dt: number, speed: number) {
    let mode: AnimMode = 'idle';
    let progress = 0;
    switch (this.state) {
      case 'chase':
      case 'strafe':
      case 'return':
        mode = speed > 0.2 ? 'move' : 'idle';
        break;
      case 'idle':
        mode = speed > 0.2 ? 'move' : 'idle';
        break;
      case 'windup':
        mode = 'windup';
        progress = this.attack ? clamp(this.stateT / this.attack.windup, 0, 1) : 0;
        break;
      case 'active':
        mode = this.attack?.kind === 'charge' ? 'move' : 'active';
        break;
      case 'recover':
        mode = 'recover';
        break;
      case 'hit':
        mode = 'hit';
        break;
      case 'stagger':
        mode = 'stagger';
        break;
      case 'intro':
      case 'phase':
        mode = 'windup';
        progress = 0.5;
        break;
    }
    const pose = this.attack ? this.poseFor(this.attack) : undefined;
    this.model.animate({ mode, t: this.animT, speed: mode === 'move' ? Math.max(speed, 2) : speed, progress, pose }, dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      setFlash(this.model.flashMats, 0xffffff, this.flashT > 0 ? 0.9 : 0);
    } else if (this.state === 'windup' && this.attack && this.stateT > this.attack.windup * 0.6 && Math.floor(this.animT * 16) % 2 === 0) {
      // Final warning flash just before the strike lands.
      setFlash(this.model.flashMats, 0xff3020, 0.5);
    } else if (this.state === 'stagger') {
      setFlash(this.model.flashMats, 0xffe08a, 0.25 + Math.sin(this.animT * 12) * 0.15);
    } else {
      setFlash(this.model.flashMats, 0, 0);
    }
  }

  private poseFor(a: EnemyAttack): string {
    const m = this.def.model;
    if (a.kind === 'projectile' || a.kind === 'pillars' || a.kind === 'summon' || a.kind === 'teleport' || a.kind === 'spiral' || a.kind === 'beam' || a.kind === 'ring') return 'cast';
    if (m === 'oni' || m === 'sentinel') return a.id === 'sweep' ? 'slashR' : 'smash';
    if (a.kind === 'slam') return 'smash';
    if (a.kind === 'charge') return 'thrust';
    return 'claw';
  }

  dispose(ctx: GameCtx) {
    this.cancelAttack(ctx);
    this.removeBeam(ctx);
  }
}
