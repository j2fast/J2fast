// Derived character stats and damage formulas.

import { ITEMS, RARITY_STAT_MULT, StatKey } from '../data/items';
import { SKILL_BY_ID } from '../data/skills';
import type { Rng } from '../core/rng';
import type { GameData, ItemInstance } from './state';
import { findItem } from './inventory';

export interface DerivedStats {
  maxHp: number;
  atk: number;
  atkPct: number;
  def: number;
  crit: number;
  critDmg: number;
  staminaRegen: number;
  spiritGain: number;
  moveSpeed: number;
  lifesteal: number;
  burnChance: number;
  maxStamina: number;
  maxSpirit: number;
}

export const MAX_LEVEL = 20;

export function baseStats(level: number): DerivedStats {
  const l = Math.max(1, Math.min(MAX_LEVEL, level)) - 1;
  return {
    maxHp: 120 + 14 * l,
    atk: 8 + 2 * l,
    atkPct: 0,
    def: 2 + Math.floor(l / 2),
    crit: 0.05,
    critDmg: 0.5,
    staminaRegen: 0,
    spiritGain: 0,
    moveSpeed: 0,
    lifesteal: 0,
    burnChance: 0,
    maxStamina: 100 + 2 * l,
    maxSpirit: 100,
  };
}

/** Upgrade levels raise base stats by 12% each. */
export function upgradeMult(level: number): number {
  return 1 + 0.12 * level;
}

/** All stat contributions from one equipment instance. */
export function itemStats(inst: ItemInstance): Partial<Record<StatKey, number>> {
  const def = ITEMS[inst.id];
  const out: Partial<Record<StatKey, number>> = {};
  if (!def) return out;
  const mult = RARITY_STAT_MULT[Math.max(0, Math.min(4, inst.rarity))] * upgradeMult(inst.level);
  for (const [k, v] of Object.entries(def.baseStats ?? {})) {
    const key = k as StatKey;
    // Flat stats scale with rarity/upgrade; percentage-style base stats only with upgrade.
    const scaled = key === 'atk' || key === 'def' || key === 'maxHp' ? (v as number) * mult : (v as number) * upgradeMult(inst.level);
    out[key] = (out[key] ?? 0) + scaled;
  }
  for (const a of inst.affixes) out[a.stat] = (out[a.stat] ?? 0) + a.value;
  return out;
}

function addStats(target: DerivedStats, add: Partial<Record<StatKey, number>>) {
  for (const [k, v] of Object.entries(add)) {
    const key = k as keyof DerivedStats;
    if (key in target && typeof v === 'number') target[key] += v;
  }
}

export function computeStats(data: GameData): DerivedStats {
  const s = baseStats(data.player.level);
  const eq = data.player.equipment;
  const weaponUid = data.player.activeWeapon === 0 ? eq.weapon1 : eq.weapon2;
  for (const uid of [weaponUid, eq.armor, eq.charm]) {
    if (!uid) continue;
    const inst = findItem(data, uid);
    if (inst) addStats(s, itemStats(inst));
  }
  for (const [id, rank] of Object.entries(data.player.skills)) {
    const sk = SKILL_BY_ID[id];
    if (!sk || rank <= 0) continue;
    const r = Math.min(rank, sk.maxRank);
    const scaled: Partial<Record<StatKey, number>> = {};
    for (const [k, v] of Object.entries(sk.perRank)) scaled[k as StatKey] = (v as number) * r;
    addStats(s, scaled);
  }
  s.maxHp = Math.round(s.maxHp);
  s.atk = Math.round(s.atk * 10) / 10;
  s.def = Math.round(s.def);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

export function hasSpecial(data: GameData, special: string): boolean {
  for (const [id, rank] of Object.entries(data.player.skills)) {
    if (rank > 0 && SKILL_BY_ID[id]?.special === special) return true;
  }
  return false;
}

/** Fraction of incoming damage that gets through a given defense value. */
export function defenseFactor(def: number): number {
  return 100 / (100 + Math.max(0, def) * 3);
}

export interface DamageInput {
  atk: number;
  mult: number;
  atkPct?: number;
  buff?: number;
  crit?: number;
  critDmg?: number;
  forceCrit?: boolean;
  targetDef: number;
  rng: Rng;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
}

export function computeDamage(i: DamageInput): DamageResult {
  const crit = i.forceCrit || i.rng.next() < (i.crit ?? 0);
  let raw = i.atk * i.mult * (1 + (i.atkPct ?? 0) + (i.buff ?? 0));
  if (crit) raw *= 1 + (i.critDmg ?? 0.5);
  const variance = 0.92 + i.rng.next() * 0.16;
  const amount = Math.max(1, Math.round(raw * variance * defenseFactor(i.targetDef)));
  return { amount, crit };
}
