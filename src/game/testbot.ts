// A scripted "player" used only by automated tests (enabled with ?test).
// It plays through fights with the same inputs a person has: it reads the
// on-screen attack warnings, moves out of them or dodges through them,
// heals when low and attacks its locked target.

import type { VirtualInput } from '../core/input';
import type { Enemy } from '../entities/enemy';
import { countItem } from '../systems/inventory';
import type { Game } from './game';

export interface BotOptions {
  includeDummies?: boolean;
  /** Only fight enemies within this distance. */
  range?: number;
  useAbility?: boolean;
}

export class TestBot {
  private press: Record<string, boolean> = {};
  private dodgeCd = 0;
  private healCd = 0;
  private swing = 0;
  private strafe = 1;
  private strafeT = 0;
  dodges = 0;
  heals = 0;
  attacks = 0;

  constructor(private opts: BotOptions = {}) {}

  target(g: Game): Enemy | null {
    if (g.bossActive && g.boss?.alive) return g.boss;
    let best: Enemy | null = null;
    let bd = this.opts.range ?? 30;
    for (const e of g.enemies) {
      if (!e.alive || !e.targetable || e.dormant) continue;
      if (e.def.behavior === 'dummy' && !this.opts.includeDummies) continue;
      const d = e.pos.distanceTo(g.player.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Compute the virtual input for one simulation step. */
  tick(g: Game, dt: number): VirtualInput {
    const p = g.player;
    const down: Record<string, boolean> = {};
    let moveX = 0;
    let moveY = 0;
    this.dodgeCd -= dt;
    this.healCd -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 1.5;
      this.strafe = -this.strafe;
    }
    const camYaw = g.camRig.yaw;
    const toInput = (wx: number, wz: number) => {
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
      // forward = (sin, cos); right = (-cos, sin)
      moveY = wx * Math.sin(camYaw) + wz * Math.cos(camYaw);
      moveX = wx * -Math.cos(camYaw) + wz * Math.sin(camYaw);
    };
    const tgt = this.target(g);
    if (tgt && p.lockTarget !== tgt) p.lockTarget = tgt;

    const tele = g.effects.telegraphs.dangerAt(p.pos.x, p.pos.z, 0.9);
    const proj = g.projectiles.incoming(p.pos.x, p.pos.z, 3.5);
    const ring = g.hazards.ringThreat(p.pos.x, p.pos.z);
    const danger = tele ?? proj ?? ring;
    const hpFrac = p.hp / g.stats.maxHp;

    if (danger && p.state !== 'dodge') {
      let ax = p.pos.x - danger.x;
      let az = p.pos.z - danger.z;
      if (Math.hypot(ax, az) < 0.3) {
        ax = Math.sin(p.yaw + Math.PI / 2);
        az = Math.cos(p.yaw + Math.PI / 2);
      }
      if (ring) {
        // Roll *into* an expanding ring so the i-frames carry you through it.
        ax = -ax;
        az = -az;
      }
      toInput(ax, az);
      const urgent = ring || proj || (tele && tele.progress > 0.55);
      if (urgent && this.dodgeCd <= 0 && p.stamina > 20) {
        down.dodge = !this.press.dodge;
        if (down.dodge) {
          this.dodgeCd = 0.55;
          this.dodges++;
        }
      }
    } else if (hpFrac < 0.45 && countItem(g.data, 'dango') > 0 && this.healCd <= 0 && p.state === 'normal') {
      const far = !tgt || tgt.pos.distanceTo(p.pos) > 5;
      if (far) {
        down.heal = true;
        this.healCd = 2.5;
        this.heals++;
      } else if (tgt) toInput(p.pos.x - tgt.pos.x, p.pos.z - tgt.pos.z);
    } else if (tgt) {
      const dist = Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z) - tgt.radius;
      const reach = p.weaponType === 'bow' ? 14 : p.weaponType === 'naginata' ? 2.8 : 1.9;
      const busy = tgt.state === 'windup' || tgt.state === 'active';
      if (dist > reach) toInput(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
      else if (busy && tgt.boss && dist < reach) {
        // Back off and circle while a boss is mid-attack.
        moveY = -0.6;
        moveX = this.strafe * 0.8;
      } else {
        const ab = p.family.ability;
        if (this.opts.useAbility !== false && p.spirit >= ab.cost && p.abilityCd[p.weaponType] <= 0 && this.swing % 7 === 6) down.ability = !this.press.ability;
        else if (this.swing % 5 === 4) down.heavy = !this.press.heavy;
        else down.attack = !this.press.attack;
        if (down.attack || down.heavy || down.ability) {
          this.swing++;
          this.attacks++;
        }
      }
    }
    this.press = down;
    return { moveX, moveY, down };
  }
}
