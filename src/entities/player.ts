// The Lantern Warden: movement, dodge, combos, heavy attacks, abilities,
// healing, weapon swapping and lock-on.

import * as THREE from 'three';
import type { InputFrame } from '../core/input';
import { angleDiff, approachAngle, clamp, damp, wrapAngle, yawTo } from '../core/math';
import { ITEMS } from '../data/items';
import { AttackDef, WEAPON_FAMILIES, WeaponFamily, WeaponType, attackDuration } from '../data/weapons';
import { POSES, Pose, Rig, addPose, applyPose, locomotionPose, setFlash } from '../render/rig';
import { buildPlayerRig } from '../render/creatures';
import { Trail } from '../render/effects';
import { WeaponModel, buildWeapon } from '../render/weaponModels';
import { activeWeapon, countItem, removeItem } from '../systems/inventory';
import { hasSpecial } from '../systems/stats';
import type { Enemy } from './enemy';
import type { GameCtx } from './context';

export type PlayerState = 'normal' | 'attack' | 'dodge' | 'hit' | 'dead' | 'heal' | 'ability' | 'frozen';

const BASE_SPEED = 6.2;
const SPRINT_MULT = 1.5;
const DODGE_TIME = 0.42;
const DODGE_COST = 22;
const IFRAME_START = 0.03;
const IFRAME_END = 0.34;

const WEAPON_TRAIL: Record<WeaponType, number> = {
  katana: 0xbfe6ff,
  naginata: 0x9affd8,
  tanto: 0xd8a0ff,
  kanabo: 0xffb070,
  bow: 0xffe08a,
};

export class Player {
  readonly rig: Rig;
  readonly root: THREE.Group;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  readonly vel = new THREE.Vector3();
  readonly radius = 0.45;
  hp = 100;
  stamina = 100;
  spirit = 0;
  state: PlayerState = 'normal';
  stateT = 0;

  weaponType: WeaponType = 'katana';
  family: WeaponFamily = WEAPON_FAMILIES.katana;
  private weaponModel: WeaponModel | null = null;
  readonly trail = new Trail(0xbfe6ff);

  attack: AttackDef | null = null;
  attackIsHeavy = false;
  comboIndex = 0;
  private comboResetT = 0;
  private attackHit = new Set<Enemy>();
  private firedProjectile = false;
  private buffered: { action: 'attack' | 'heavy' | 'dodge' | 'ability'; t: number } | null = null;

  private dodgeDirX = 0;
  private dodgeDirZ = 1;
  dodgeStartTime = -10;
  invulnT = 0;
  private staminaDelay = 0;

  abilityCd: Record<WeaponType, number> = { katana: 0, naginata: 0, tanto: 0, kanabo: 0, bow: 0 };
  private abilityKind: string | null = null;
  private abilityHit = new Set<Enemy>();
  private abilityTick = 0;
  private abilityTarget = new THREE.Vector3();
  private stepTarget: Enemy | null = null;
  private abilityFired = false;

  private healApplied = false;
  burnT = 0;
  slowT = 0;
  private burnTick = 0;
  buffAtk = 0;
  buffT = 0;
  secondWindUsed = false;
  lockTarget: Enemy | null = null;
  private moveSpeed = 0;
  private phase = 0;
  private spinYaw = 0;
  private flashT = 0;
  readonly lantern: THREE.PointLight;
  private stepT = 0;
  /** Set by the game when the player stands in water. */
  inWater = false;
  /** Movement intention this frame (for the companion / tests). */
  readonly moveIntent = new THREE.Vector2();
  private swapT = 0;
  parryT = 0;

  constructor() {
    this.rig = buildPlayerRig();
    this.root = this.rig.root;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline) m.castShadow = true;
    });
    this.lantern = new THREE.PointLight(0xffb060, 2, 12, 1.5);
    this.lantern.position.set(0.3, 1.1, 0);
    this.root.add(this.lantern);
    this.trail.mesh.renderOrder = 3;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get invulnerable(): boolean {
    if (this.invulnT > 0) return true;
    if (this.state === 'dodge') return this.stateT >= IFRAME_START && this.stateT <= IFRAME_END;
    if (this.state === 'ability' && (this.abilityKind === 'iaiDash' || this.abilityKind === 'shadowStep')) return true;
    return false;
  }

  /** Rebuild the weapon in hand from the equipped item. */
  equipWeapon(ctx: GameCtx): void {
    const inst = activeWeapon(ctx.data);
    const def = inst ? ITEMS[inst.id] : null;
    const type = (def?.weaponType ?? 'katana') as WeaponType;
    if (this.weaponModel) {
      this.weaponModel.group.removeFromParent();
      this.weaponModel.offhand?.removeFromParent();
    }
    this.weaponType = type;
    this.family = WEAPON_FAMILIES[type];
    this.weaponModel = buildWeapon(type, inst?.rarity ?? 0);
    this.rig.handR.add(this.weaponModel.group);
    if (this.weaponModel.offhand) this.rig.handL.add(this.weaponModel.offhand);
    if (type === 'bow') {
      // Bow in the left hand: the right hand holds an arrow pointing forward.
      this.weaponModel.group.rotation.x = -Math.PI / 2;
    }
    this.trail.setColor(WEAPON_TRAIL[type]);
    this.comboIndex = 0;
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  resetCombatState(): void {
    this.state = 'normal';
    this.stateT = 0;
    this.attack = null;
    this.abilityKind = null;
    this.buffered = null;
    this.trail.active = false;
    this.burnT = 0;
    this.slowT = 0;
    this.lockTarget = null;
    this.spinYaw = 0;
    this.rig.spinner.rotation.set(0, 0, 0);
    this.rig.spinner.position.y = 0.55;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  // ------------------------------------------------------------------ Update

  update(dt: number, input: InputFrame, camYaw: number, ctx: GameCtx): void {
    const stats = ctx.stats;
    this.stateT += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    for (const k of Object.keys(this.abilityCd) as WeaponType[]) this.abilityCd[k] = Math.max(0, this.abilityCd[k] - dt);
    if (this.buffT > 0) {
      this.buffT -= dt;
      if (this.buffT <= 0) this.buffAtk = 0;
    }
    if (this.buffered) {
      this.buffered.t -= dt;
      if (this.buffered.t <= 0) this.buffered = null;
    }
    this.comboResetT -= dt;
    if (this.comboResetT <= 0 && this.state !== 'attack') this.comboIndex = 0;
    if (this.lockTarget && (!this.lockTarget.alive || this.lockTarget.pos.distanceTo(this.pos) > 30)) this.lockTarget = null;

    // Status effects
    if (this.burnT > 0 && this.alive) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        const dmg = Math.max(1, Math.round(stats.maxHp * 0.012));
        this.hp = Math.max(1, this.hp - dmg);
        ctx.floating.spawn(this.pos.clone().setY(this.pos.y + 2), `${dmg}`, 'dmg burn', 0.6);
        ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 4, color: 0xff7a2a, speed: 1.5, life: 0.5, gravity: -2, size: 's' });
      }
    }
    this.slowT = Math.max(0, this.slowT - dt);

    // Stamina regeneration
    this.staminaDelay -= dt;
    const sprinting = input.down.sprint && this.state === 'normal' && (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.1);
    if (sprinting && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 16 * dt);
      this.staminaDelay = 0.5;
    } else if (this.staminaDelay <= 0 && this.state !== 'dodge') {
      this.stamina = Math.min(stats.maxStamina, this.stamina + 38 * (1 + stats.staminaRegen) * dt);
    }

    // Movement intent relative to the camera.
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw);
    const rz = Math.sin(camYaw);
    let mx = fx * input.moveY + rx * input.moveX;
    let mz = fz * input.moveY + rz * input.moveX;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) {
      mx /= mlen;
      mz /= mlen;
    }
    this.moveIntent.set(mx, mz);

    if (this.state === 'frozen' || this.state === 'dead') {
      if (this.state === 'dead') this.animate(dt, 0, ctx);
      else this.animate(dt, 0, ctx);
      this.applyKnockback(dt, ctx);
      this.syncTransform(ctx);
      return;
    }

    // Input buffering
    if (input.pressed.attack) this.buffered = { action: 'attack', t: 0.35 };
    if (input.pressed.heavy) this.buffered = { action: 'heavy', t: 0.35 };
    if (input.pressed.dodge) this.buffered = { action: 'dodge', t: 0.25 };
    if (input.pressed.ability) this.buffered = { action: 'ability', t: 0.25 };

    if (input.pressed.swapWeapon) {
      // Swapping is allowed while idle/moving or to cancel an attack's recovery.
      const a = this.attack;
      if (this.state === 'attack' && a && this.stateT >= a.windup + a.active) {
        this.state = 'normal';
        this.attack = null;
        this.trail.active = false;
      }
      if (this.state === 'normal') this.trySwap(ctx);
    }
    if (input.pressed.heal && this.state === 'normal') this.tryHeal(ctx);

    let speed = 0;
    switch (this.state) {
      case 'normal': {
        if (this.consumeBuffered(ctx)) break;
        const slow = (this.slowT > 0 ? 0.6 : 1) * (this.inWater ? 0.72 : 1);
        const target = BASE_SPEED * this.family.moveSpeed * (1 + stats.moveSpeed) * slow * (sprinting && this.stamina > 0 ? SPRINT_MULT : 1) * Math.min(1, mlen);
        this.moveSpeed += (target - this.moveSpeed) * damp(14, dt);
        if (mlen > 0.05) {
          const desired = Math.atan2(mx, mz);
          const lockFace = this.lockTarget && !sprinting;
          const faceYaw = lockFace ? yawTo(this.pos.x, this.pos.z, this.lockTarget!.pos.x, this.lockTarget!.pos.z) : desired;
          this.yaw = approachAngle(this.yaw, faceYaw, 14 * dt);
          this.moveBy(Math.sin(desired) * this.moveSpeed * dt, Math.cos(desired) * this.moveSpeed * dt, ctx);
          speed = this.moveSpeed;
        } else {
          this.moveSpeed = 0;
          if (this.lockTarget) this.yaw = approachAngle(this.yaw, yawTo(this.pos.x, this.pos.z, this.lockTarget.pos.x, this.lockTarget.pos.z), 10 * dt);
        }
        break;
      }
      case 'attack':
        this.updateAttack(dt, ctx);
        break;
      case 'dodge': {
        const p = this.stateT / DODGE_TIME;
        const sp = 13 * (1 - p) + 3;
        this.moveBy(this.dodgeDirX * sp * dt, this.dodgeDirZ * sp * dt, ctx);
        speed = sp;
        if (this.stateT >= DODGE_TIME) {
          this.state = 'normal';
          this.stateT = 0;
        } else if (this.stateT > 0.3 && this.buffered && this.buffered.action !== 'dodge') {
          this.state = 'normal';
          this.consumeBuffered(ctx);
        }
        break;
      }
      case 'hit':
        if (this.stateT >= 0.32) {
          this.state = 'normal';
          this.stateT = 0;
        } else if (this.stateT > 0.18 && this.buffered?.action === 'dodge') {
          this.state = 'normal';
          this.consumeBuffered(ctx);
        }
        break;
      case 'heal': {
        const dur = hasSpecial(ctx.data, 'teaMastery') ? 0.45 : 0.9;
        const mv = BASE_SPEED * 0.4 * Math.min(1, mlen);
        if (mlen > 0.05) {
          const desired = Math.atan2(mx, mz);
          this.yaw = approachAngle(this.yaw, desired, 8 * dt);
          this.moveBy(Math.sin(desired) * mv * dt, Math.cos(desired) * mv * dt, ctx);
          speed = mv;
        }
        if (!this.healApplied && this.stateT >= dur * 0.6) this.applyHeal(ctx);
        if (this.stateT >= dur) {
          this.state = 'normal';
          this.stateT = 0;
        }
        break;
      }
      case 'ability':
        speed = this.updateAbility(dt, mx, mz, mlen, ctx);
        break;
    }

    // Footsteps
    if (speed > 1 && this.state === 'normal') {
      this.stepT -= dt * speed;
      if (this.stepT <= 0) {
        this.stepT = 2.2;
        ctx.sfx(this.inWater ? 'splash' : 'step', this.pos.x, this.pos.z, this.inWater ? 0.5 : 0.6);
        if (this.inWater) ctx.effects.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, { count: 4, color: 0xbfe8ff, speed: 2, life: 0.4, gravity: 8, upBias: 1.5, size: 's' });
      }
    }

    this.applyKnockback(dt, ctx);
    this.animate(dt, speed, ctx);
    this.syncTransform(ctx);
  }

  private applyKnockback(dt: number, ctx: GameCtx) {
    if (this.vel.lengthSq() > 0.0001) {
      this.moveBy(this.vel.x * dt, this.vel.z * dt, ctx);
      this.vel.multiplyScalar(Math.exp(-8 * dt));
    }
  }

  private syncTransform(ctx: GameCtx) {
    this.pos.y = ctx.world.groundY(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + this.spinYaw;
    this.inWater = ctx.world.inWater(this.pos.x, this.pos.z);
  }

  moveBy(dx: number, dz: number, ctx: GameCtx): void {
    const r = ctx.world.move(this.pos.x, this.pos.z, dx, dz, this.radius);
    this.pos.x = r.x;
    this.pos.z = r.z;
  }

  // ------------------------------------------------------------------ Actions

  private consumeBuffered(ctx: GameCtx): boolean {
    const b = this.buffered;
    if (!b) return false;
    if (b.action === 'dodge') {
      if (this.tryDodge(ctx)) {
        this.buffered = null;
        return true;
      }
      this.buffered = null;
      return false;
    }
    if (b.action === 'ability') {
      this.buffered = null;
      return this.tryAbility(ctx);
    }
    const heavy = b.action === 'heavy';
    let def: AttackDef;
    if (heavy) def = this.family.heavy;
    else {
      def = this.family.light[this.comboIndex % this.family.light.length];
    }
    const cost = def.stamina;
    if (this.stamina < cost * 0.5) {
      this.buffered = null;
      ctx.sfx('uiError', undefined, undefined, 0.4);
      return false;
    }
    this.buffered = null;
    this.startAttack(def, heavy, ctx);
    return true;
  }

  private tryDodge(ctx: GameCtx): boolean {
    const cost = DODGE_COST * (1 - 0.08 * (ctx.data.player.skills.fleet ?? 0));
    if (this.stamina < cost * 0.6) {
      ctx.sfx('uiError', undefined, undefined, 0.4);
      return false;
    }
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaDelay = 0.6;
    const ml = this.moveIntent.length();
    if (ml > 0.1) {
      this.dodgeDirX = this.moveIntent.x / ml;
      this.dodgeDirZ = this.moveIntent.y / ml;
    } else {
      // Backstep when no direction is held.
      this.dodgeDirX = -Math.sin(this.yaw);
      this.dodgeDirZ = -Math.cos(this.yaw);
    }
    if (ml > 0.1) this.yaw = Math.atan2(this.dodgeDirX, this.dodgeDirZ);
    this.state = 'dodge';
    this.stateT = 0;
    this.attack = null;
    this.trail.active = false;
    this.dodgeStartTime = ctx.time;
    ctx.sfx('dodge', this.pos.x, this.pos.z);
    ctx.effects.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 8, color: 0xd8c8b0, speed: 2, life: 0.5, gravity: 1, size: 'm' });
    ctx.questEvent('event', 'tut_dodge');
    return true;
  }

  /** Choose which way to face at the start of an attack. */
  private aimYaw(ctx: GameCtx, maxDist = 4.5): number {
    if (this.lockTarget) return yawTo(this.pos.x, this.pos.z, this.lockTarget.pos.x, this.lockTarget.pos.z);
    const ml = this.moveIntent.length();
    const inputYaw = ml > 0.2 ? Math.atan2(this.moveIntent.x, this.moveIntent.y) : this.yaw;
    if (ctx.settings.autoFaceTarget) {
      let best: Enemy | null = null;
      let bestScore = Infinity;
      for (const e of ctx.enemies) {
        if (!e.alive || !e.targetable) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius;
        if (d > maxDist) continue;
        const a = Math.abs(angleDiff(inputYaw, yawTo(this.pos.x, this.pos.z, e.pos.x, e.pos.z)));
        if (a > 1.9) continue;
        const score = d + a * 2;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (best) return yawTo(this.pos.x, this.pos.z, best.pos.x, best.pos.z);
    }
    return inputYaw;
  }

  private startAttack(def: AttackDef, heavy: boolean, ctx: GameCtx) {
    this.attack = def;
    this.attackIsHeavy = heavy;
    this.state = 'attack';
    this.stateT = 0;
    this.attackHit.clear();
    this.firedProjectile = false;
    this.stamina = Math.max(0, this.stamina - def.stamina);
    this.staminaDelay = 0.5;
    this.yaw = this.aimYaw(ctx, def.kind === 'projectile' ? 28 : 4.5);
    if (!heavy) {
      this.comboIndex = (this.comboIndex + 1) % this.family.light.length;
    } else {
      this.comboIndex = 0;
    }
    this.comboResetT = attackDuration(def) + 0.5;
    if (def.kind === 'melee') ctx.sfx(heavy || def.damage > 2 ? 'swingHeavy' : 'swing', this.pos.x, this.pos.z, 0.8);
  }

  private updateAttack(dt: number, ctx: GameCtx) {
    const a = this.attack!;
    const t = this.stateT;
    const activeStart = a.windup;
    const activeEnd = a.windup + a.active;
    const total = attackDuration(a);
    // Lunge during the end of the wind-up and the active window.
    const lungeStart = a.windup * 0.5;
    if (t >= lungeStart && t <= activeEnd && a.lunge !== 0) {
      const lungeDur = activeEnd - lungeStart;
      let step = (a.lunge / lungeDur) * dt;
      // Don't push through a locked target.
      if (this.lockTarget && step > 0) {
        const d = Math.hypot(this.lockTarget.pos.x - this.pos.x, this.lockTarget.pos.z - this.pos.z) - this.lockTarget.radius - this.radius;
        step = Math.min(step, Math.max(0, d - 0.3));
      }
      this.moveBy(Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, ctx);
    }
    // Slight aim correction during wind-up.
    if (t < activeStart && this.lockTarget) {
      this.yaw = approachAngle(this.yaw, yawTo(this.pos.x, this.pos.z, this.lockTarget.pos.x, this.lockTarget.pos.z), 8 * dt);
    }
    if (a.kind === 'melee') {
      this.trail.active = t >= activeStart - 0.03 && t <= activeEnd + 0.04;
      if (t >= activeStart && t <= activeEnd) this.meleeHits(a, ctx);
      if (a.shockwave && t >= activeEnd && !this.firedProjectile) {
        this.firedProjectile = true;
        const fx = this.pos.x + Math.sin(this.yaw) * 1.8;
        const fz = this.pos.z + Math.cos(this.yaw) * 1.8;
        ctx.effects.shockwave(fx, this.pos.y, fz, a.shockwave.radius, 0xffc070);
        ctx.effects.burst(fx, this.pos.y + 0.2, fz, { count: 20, color: 0xc8a878, speed: 5, life: 0.6, gravity: 9, size: 'm', upBias: 1 });
        ctx.shake(0.35);
        ctx.sfx('explosion', fx, fz, 0.6);
        for (const e of ctx.enemies) {
          if (!e.alive || !e.targetable) continue;
          if (Math.hypot(e.pos.x - fx, e.pos.z - fz) <= a.shockwave.radius + e.radius) {
            ctx.hitEnemy(e, { mult: a.shockwave.damage, poise: a.poise * 0.5, knockback: a.knockback, fromX: fx, fromZ: fz, noHitstop: true, heavy: true });
          }
        }
      }
    } else if (a.kind === 'projectile' && t >= activeStart && !this.firedProjectile) {
      this.firedProjectile = true;
      this.fireArrows(a, ctx);
    }
    // Combo / cancel windows
    const cancelAt = activeEnd + a.recovery * 0.3;
    if (t >= cancelAt && this.buffered) {
      const b = this.buffered.action;
      if (b === 'dodge' || b === 'ability' || b === 'heavy' || (b === 'attack' && !this.attackIsHeavy) || (b === 'attack' && t >= activeEnd + a.recovery * 0.6)) {
        this.state = 'normal';
        this.trail.active = false;
        if (this.attackIsHeavy && b === 'attack') this.comboIndex = 0;
        this.consumeBuffered(ctx);
        return;
      }
    }
    if (t >= total) {
      this.state = 'normal';
      this.stateT = 0;
      this.attack = null;
      this.trail.active = false;
    }
  }

  private meleeHits(a: AttackDef, ctx: GameCtx) {
    const halfArc = ((a.arc * Math.PI) / 180) / 2;
    for (const e of ctx.enemies) {
      if (!e.alive || !e.targetable || this.attackHit.has(e)) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > a.range) continue;
      if (a.arc < 360) {
        const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
        // Allow a little extra angle for very close enemies.
        const slack = d < 1.2 ? 0.6 : 0;
        if (ang > halfArc + slack) continue;
      }
      this.attackHit.add(e);
      const dealt = ctx.hitEnemy(e, {
        mult: a.damage,
        poise: a.poise,
        knockback: a.knockback,
        bleed: a.bleed,
        fromX: this.pos.x,
        fromZ: this.pos.z,
        heavy: this.attackIsHeavy || a.damage >= 1.8,
      });
      if (dealt > 0) {
        if (e.def.id === 'training_dummy') {
          ctx.questEvent('event', 'tut_attack');
          if (this.attackIsHeavy) ctx.questEvent('event', 'tut_heavy');
        }
      }
    }
  }

  private fireArrows(a: AttackDef, ctx: GameCtx) {
    const p = a.projectile!;
    const ox = this.pos.x + Math.sin(this.yaw) * 0.6;
    const oz = this.pos.z + Math.cos(this.yaw) * 0.6;
    const oy = this.pos.y + 1.35;
    let baseYaw = this.yaw;
    let pitch = 0;
    const target = this.lockTarget;
    if (target) {
      baseYaw = yawTo(ox, oz, target.pos.x, target.pos.z);
      const d = Math.hypot(target.pos.x - ox, target.pos.z - oz);
      pitch = Math.atan2(target.pos.y + target.aimHeight - oy, d);
    }
    for (let i = 0; i < p.count; i++) {
      const yaw = baseYaw + (p.count > 1 ? (i - (p.count - 1) / 2) * p.spread : 0);
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      ctx.projectiles.spawnArrow(new THREE.Vector3(ox, oy, oz), dir, p.speed, p.radius, p.pierce, {
        mult: a.damage,
        poise: a.poise,
        knockback: a.knockback,
        fromX: ox,
        fromZ: oz,
        heavy: this.attackIsHeavy,
        noHitstop: true,
      });
    }
    ctx.sfx('arrow', this.pos.x, this.pos.z);
  }

  private trySwap(ctx: GameCtx) {
    const eq = ctx.data.player.equipment;
    if (!eq.weapon2 || this.swapT > 0) return;
    ctx.data.player.activeWeapon = ctx.data.player.activeWeapon === 0 ? 1 : 0;
    this.equipWeapon(ctx);
    this.swapT = 0.3;
    ctx.sfx('swap');
    ctx.effects.burst(this.pos.x, this.pos.y + 1.2, this.pos.z, { count: 10, color: WEAPON_TRAIL[this.weaponType], speed: 3, life: 0.4, size: 's' });
    ctx.questEvent('event', 'tut_swap');
    ctx.onWeaponSwapped();
  }

  private tryHeal(ctx: GameCtx) {
    if (countItem(ctx.data, 'dango') <= 0) {
      ctx.caption('You have no Healing Dango.', '', 1.5);
      ctx.sfx('uiError');
      return;
    }
    if (this.hp >= ctx.stats.maxHp) {
      ctx.caption('Already at full health.', '', 1.2);
      return;
    }
    this.state = 'heal';
    this.stateT = 0;
    this.healApplied = false;
  }

  private applyHeal(ctx: GameCtx) {
    this.healApplied = true;
    if (!removeItem(ctx.data, 'dango', 1)) return;
    const mult = hasSpecial(ctx.data, 'teaMastery') ? 1.5 : 1;
    const amount = Math.round(ctx.stats.maxHp * 0.45 * mult);
    this.hp = Math.min(ctx.stats.maxHp, this.hp + amount);
    ctx.floating.spawn(this.pos.clone().setY(this.pos.y + 2.2), `+${amount}`, 'heal', 1);
    ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 24, color: 0x8aff9a, speed: 2.5, life: 0.9, gravity: -2, size: 'm', spread: 0.8 });
    ctx.sfx('heal');
    this.burnT = 0;
  }

  // ------------------------------------------------------------------ Abilities

  private tryAbility(ctx: GameCtx): boolean {
    const ab = this.family.ability;
    if (this.abilityCd[this.weaponType] > 0) {
      ctx.sfx('uiError', undefined, undefined, 0.4);
      return false;
    }
    if (this.spirit < ab.cost) {
      ctx.caption(`Not enough spirit for ${ab.name}.`, '', 1.2);
      ctx.sfx('uiError', undefined, undefined, 0.4);
      return false;
    }
    if (ab.kind === 'shadowStep') {
      const target = this.lockTarget ?? this.nearestEnemy(ctx, ab.radius);
      if (!target) {
        ctx.caption('No target for Shadow Step.', '', 1.2);
        return false;
      }
      this.stepTarget = target;
    }
    this.spirit -= ab.cost;
    this.abilityCd[this.weaponType] = ab.cooldown;
    this.state = 'ability';
    this.stateT = 0;
    this.abilityKind = ab.kind;
    this.abilityHit.clear();
    this.abilityFired = false;
    this.abilityTick = 0;
    this.trail.active = false;
    ctx.sfx('ability', this.pos.x, this.pos.z);
    if (ab.kind !== 'shadowStep') this.yaw = this.aimYaw(ctx, 12);
    if (ab.kind === 'emberRain') {
      const t = this.lockTarget ?? this.nearestEnemy(ctx, 18);
      if (t) this.abilityTarget.copy(t.pos);
      else this.abilityTarget.set(this.pos.x + Math.sin(this.yaw) * 8, 0, this.pos.z + Math.cos(this.yaw) * 8);
      this.abilityTarget.y = ctx.world.groundY(this.abilityTarget.x, this.abilityTarget.z);
      ctx.hazards.emberRain(this.abilityTarget.clone(), ab.radius, ab.duration, ab.damage);
    }
    return true;
  }

  private nearestEnemy(ctx: GameCtx, maxDist: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist;
    for (const e of ctx.enemies) {
      if (!e.alive || !e.targetable) continue;
      const d = e.pos.distanceTo(this.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private abilityStrike(e: Enemy, mult: number, ctx: GameCtx, extra: Partial<Parameters<GameCtx['hitEnemy']>[1]> = {}) {
    ctx.hitEnemy(e, { mult, poise: 40, knockback: 3, fromX: this.pos.x, fromZ: this.pos.z, noHitstop: true, heavy: true, source: 'ability', ...extra });
  }

  private updateAbility(dt: number, mx: number, mz: number, mlen: number, ctx: GameCtx): number {
    const ab = this.family.ability;
    const t = this.stateT;
    let speed = 0;
    switch (ab.kind) {
      case 'iaiDash': {
        const dashSpeed = 7.5 / ab.duration;
        if (t < ab.duration) {
          this.moveBy(Math.sin(this.yaw) * dashSpeed * dt, Math.cos(this.yaw) * dashSpeed * dt, ctx);
          speed = dashSpeed;
          this.trail.active = true;
          ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 3, color: 0xbfe6ff, speed: 1, life: 0.4, size: 'm' });
          for (const e of ctx.enemies) {
            if (!e.alive || !e.targetable || this.abilityHit.has(e)) continue;
            if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < ab.radius + e.radius) {
              this.abilityHit.add(e);
              this.abilityStrike(e, ab.damage, ctx);
            }
          }
        } else this.trail.active = false;
        if (t >= ab.duration + 0.25) this.endAbility();
        break;
      }
      case 'whirlwind': {
        if (mlen > 0.05) {
          const sp = BASE_SPEED * 0.6;
          this.moveBy(mx * sp * dt, mz * sp * dt, ctx);
          speed = sp;
        }
        this.spinYaw = wrapAngle(this.spinYaw + dt * 16);
        this.trail.active = true;
        this.abilityTick -= dt;
        if (this.abilityTick <= 0) {
          this.abilityTick = 0.25;
          ctx.sfx('swing', this.pos.x, this.pos.z, 0.6);
          for (const e of ctx.enemies) {
            if (!e.alive || !e.targetable) continue;
            if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < ab.radius + e.radius) this.abilityStrike(e, ab.damage, ctx, { knockback: 1, poise: 12 });
          }
        }
        if (t >= ab.duration) {
          this.spinYaw = 0;
          this.endAbility();
        }
        break;
      }
      case 'shadowStep': {
        const target = this.stepTarget;
        if (t < 0.12) {
          this.rig.root.visible = Math.floor(t * 40) % 2 === 0;
        } else if (!this.abilityFired && target) {
          this.rig.root.visible = true;
          this.abilityFired = true;
          const dir = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
          const behind = target.radius + 1.0;
          const nx = target.pos.x + Math.sin(dir) * behind;
          const nz = target.pos.z + Math.cos(dir) * behind;
          ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 16, color: 0x8a4aff, speed: 3, life: 0.5, size: 'm' });
          const r = ctx.world.move(this.pos.x, this.pos.z, nx - this.pos.x, nz - this.pos.z, this.radius);
          this.pos.x = r.x;
          this.pos.z = r.z;
          this.yaw = yawTo(this.pos.x, this.pos.z, target.pos.x, target.pos.z);
          ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 16, color: 0x8a4aff, speed: 3, life: 0.5, size: 'm' });
          if (target.alive) this.abilityStrike(target, ab.damage, ctx, { forceCrit: true, bleed: 1 });
          this.trail.active = true;
        }
        if (t >= 0.45) {
          this.rig.root.visible = true;
          this.endAbility();
        }
        break;
      }
      case 'earthshaker': {
        const jumpH = Math.sin(clamp(t / ab.duration, 0, 1) * Math.PI) * 1.6;
        this.rig.spinner.position.y = 0.55 + jumpH;
        if (t < ab.duration * 0.8) this.moveBy(Math.sin(this.yaw) * 3 * dt, Math.cos(this.yaw) * 3 * dt, ctx);
        if (t >= ab.duration && !this.abilityFired) {
          this.abilityFired = true;
          ctx.effects.shockwave(this.pos.x, this.pos.y, this.pos.z, ab.radius, 0xffa040, 0.6);
          ctx.effects.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 40, color: 0xc8a878, speed: 8, life: 0.8, gravity: 10, size: 'm', upBias: 1.2 });
          ctx.shake(0.8);
          ctx.sfx('explosion', this.pos.x, this.pos.z);
          for (const e of ctx.enemies) {
            if (!e.alive || !e.targetable) continue;
            if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < ab.radius + e.radius) this.abilityStrike(e, ab.damage, ctx, { stun: 2, poise: 120, knockback: 5 });
          }
        }
        if (t >= ab.duration + 0.35) {
          this.rig.spinner.position.y = 0.55;
          this.endAbility();
        }
        break;
      }
      case 'emberRain':
        if (t >= 0.45) this.endAbility();
        break;
    }
    return speed;
  }

  private endAbility() {
    this.state = 'normal';
    this.stateT = 0;
    this.abilityKind = null;
    this.trail.active = false;
  }

  // ------------------------------------------------------------------ Damage

  /** Apply already-mitigated damage. Returns true if the player died. */
  takeDamage(amount: number, fromX: number, fromZ: number, knockback: number, ctx: GameCtx): boolean {
    this.hp -= amount;
    this.flash();
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / d) * knockback * 3;
    this.vel.z += (dz / d) * knockback * 3;
    if (this.hp <= 0) {
      if (!this.secondWindUsed && hasSpecial(ctx.data, 'secondWind')) {
        this.secondWindUsed = true;
        this.hp = Math.round(ctx.stats.maxHp * 0.3);
        this.invulnT = 1.5;
        ctx.caption('Second Wind!', '', 1.5);
        ctx.effects.burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 30, color: 0xffe08a, speed: 4, life: 0.8, size: 'm' });
        return false;
      }
      this.hp = 0;
      this.state = 'dead';
      this.stateT = 0;
      this.attack = null;
      this.trail.active = false;
      return true;
    }
    // Abilities and heavy-weapon heavies have hyper armour.
    if (this.state !== 'ability' && !(this.state === 'attack' && this.attackIsHeavy && this.weaponType === 'kanabo')) {
      this.state = 'hit';
      this.stateT = 0;
      this.attack = null;
      this.trail.active = false;
    }
    this.invulnT = 0.35;
    return false;
  }

  // ------------------------------------------------------------------ Animation

  private basePose(): Pose {
    switch (this.weaponType) {
      case 'bow':
        return POSES.idleBow;
      case 'tanto':
        return POSES.idleTwin;
      case 'kanabo':
        return POSES.idleHeavy;
      default:
        return POSES.idle;
    }
  }

  private animate(dt: number, speed: number, ctx: GameCtx) {
    this.phase += dt * Math.max(2, speed * 1.5);
    let pose: Pose = this.basePose();
    let rate = 16;
    const rig = this.rig;
    let spinnerX = 0;
    switch (this.state) {
      case 'normal':
        if (speed > 0.5) pose = addPose(pose, locomotionPose(this.phase, Math.min(1.2, speed / 6)));
        else pose = addPose(pose, { torso: [Math.sin(ctx.time * 1.8) * 0.03, 0, 0] });
        break;
      case 'attack': {
        const a = this.attack!;
        const prefix = a.pose;
        const wind = POSES[`${prefix}_wind`] ?? pose;
        const hit = POSES[`${prefix}_hit`] ?? pose;
        if (this.stateT < a.windup) {
          pose = wind;
          rate = 12 / Math.max(0.3, a.windup * 3);
          rate = Math.max(rate, 10);
        } else {
          pose = hit;
          rate = 40;
        }
        if (prefix === 'spin') {
          const p = clamp((this.stateT - a.windup) / (a.active + a.recovery * 0.5), 0, 1);
          this.spinYaw = this.stateT >= a.windup ? p * Math.PI * 2 : 0;
          if (p >= 1) this.spinYaw = 0;
        }
        break;
      }
      case 'dodge':
        pose = POSES.roll;
        rate = 30;
        spinnerX = clamp(this.stateT / (DODGE_TIME * 0.85), 0, 1) * Math.PI * 2;
        break;
      case 'hit':
        pose = POSES.hit;
        rate = 25;
        break;
      case 'dead':
        pose = POSES.dead;
        rate = 6;
        break;
      case 'heal':
        pose = POSES.heal;
        rate = 12;
        break;
      case 'ability':
        if (this.abilityKind === 'iaiDash') pose = POSES.slashR_hit;
        else if (this.abilityKind === 'whirlwind') pose = POSES.spin_hit;
        else if (this.abilityKind === 'shadowStep') pose = POSES.thrust_hit;
        else if (this.abilityKind === 'earthshaker') pose = this.stateT < this.family.ability.duration * 0.6 ? POSES.overhead_wind : POSES.overhead_hit;
        else pose = POSES.cast;
        rate = 25;
        break;
      case 'frozen':
        pose = addPose(pose, { torso: [Math.sin(ctx.time * 1.8) * 0.03, 0, 0] });
        break;
    }
    if (this.state !== 'attack' && this.state !== 'ability') this.spinYaw = 0;
    applyPose(rig, pose, dt, rate);
    if (this.state === 'dead') {
      rig.spinner.rotation.x += (-Math.PI / 2 - rig.spinner.rotation.x) * Math.min(1, dt * 5);
      rig.spinner.position.y += (0.25 - rig.spinner.position.y) * Math.min(1, dt * 5);
    } else {
      rig.spinner.rotation.x = spinnerX;
      if (this.abilityKind !== 'earthshaker') rig.spinner.position.y = 0.55 - (this.state === 'dodge' ? 0.25 : 0);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      setFlash(rig.flashMats, 0xff4040, this.flashT > 0 ? 0.9 : 0);
    } else if (this.parryT > 0) setFlash(rig.flashMats, 0x6ab8ff, 0.6);
    else if (this.invulnT > 0 && this.state !== 'dodge') setFlash(rig.flashMats, 0xffffff, Math.floor(ctx.time * 20) % 2 ? 0.25 : 0);
    else setFlash(rig.flashMats, 0, 0);
    // Cape sway
    const cape = rig.hips.getObjectByName('cape');
    if (cape) cape.rotation.x = 0.15 + Math.min(0.9, speed * 0.08) + Math.sin(ctx.time * 3) * 0.05;
  }

  /** Update the weapon trail from the blade's world position (call after matrices update). */
  updateTrail(dt: number): void {
    const wm = this.weaponModel;
    if (wm && this.trail.active) {
      const base = wm.trailBase.clone();
      const tip = wm.trailTip.clone();
      wm.group.localToWorld(base);
      wm.group.localToWorld(tip);
      this.trail.push(base, tip);
    }
    this.trail.update(dt);
  }
}
