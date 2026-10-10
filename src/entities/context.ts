// The interface entities use to talk to the game. Keeps entity modules
// decoupled from the Game class (and makes the dependency direction clear).

import type * as THREE from 'three';
import type { AudioEngine, Sfx } from '../core/audio';
import type { Rng } from '../core/rng';
import type { Settings } from '../core/settings';
import type { Effects, FloatingText } from '../render/effects';
import type { GameData } from '../systems/state';
import type { DerivedStats } from '../systems/stats';
import type { World } from '../world/world';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { Projectiles } from './projectiles';
import type { Hazards } from './hazards';

export interface HitInfo {
  /** Damage multiplier of the player's attack stat. */
  mult: number;
  poise: number;
  knockback: number;
  forceCrit?: boolean;
  bleed?: number;
  fromX: number;
  fromZ: number;
  heavy?: boolean;
  /** Ability / projectile hits do not trigger hit-stop. */
  noHitstop?: boolean;
  stun?: number;
  source?: string;
  /** Exact damage (damage-over-time ticks), bypassing the attack formula. */
  fixedDamage?: number;
}

export interface EnemyHit {
  damage: number; // raw damage before defense
  fromX: number;
  fromZ: number;
  knockback: number;
  status?: { type: 'burn' | 'slow'; time: number };
  source: string;
  /** Unavoidable hits ignore i-frames (none currently). */
  unblockable?: boolean;
}

export interface GameCtx {
  world: World;
  effects: Effects;
  floating: FloatingText;
  audio: AudioEngine;
  rng: Rng;
  data: GameData;
  settings: Settings;
  scene: THREE.Scene;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectiles;
  hazards: Hazards;
  time: number;
  readonly stats: DerivedStats;
  /** Player hits an enemy. Returns damage dealt (0 if ignored). */
  hitEnemy(e: Enemy, hit: HitInfo): number;
  /** An enemy attack hits the player (respects i-frames). Returns true if it landed. */
  hitPlayer(hit: EnemyHit): boolean;
  hitstop(seconds: number): void;
  shake(amount: number): void;
  sfx(name: Sfx, x?: number, z?: number, volume?: number): void;
  caption(text: string, speaker?: string, seconds?: number): void;
  spawnEnemy(id: string, x: number, z: number, level: number, summoned?: boolean): Enemy | null;
  questEvent(type: 'event', target: string): void;
  /** Attack token system so only a few enemies attack at once. */
  requestToken(e: Enemy): boolean;
  releaseToken(e: Enemy): void;
  enemyDifficulty(): { damage: number; health: number };
  lockTarget(): Enemy | null;
  onWeaponSwapped(): void;
}
