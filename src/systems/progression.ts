// Experience, levels and skill training.

import { SKILL_BY_ID } from '../data/skills';
import type { GameData } from './state';
import { MAX_LEVEL } from './stats';

export function xpToNext(level: number): number {
  return 30 + 30 * level;
}

/** Add XP and return the number of levels gained. */
export function addXp(data: GameData, amount: number): number {
  const p = data.player;
  if (p.level >= MAX_LEVEL || amount <= 0) return 0;
  p.xp += Math.round(amount);
  let gained = 0;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.skillPoints++;
    gained++;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return gained;
}

export type TrainResult = 'ok' | 'no_points' | 'max_rank' | 'level_too_low' | 'unknown';

export function canTrain(data: GameData, skillId: string): TrainResult {
  const sk = SKILL_BY_ID[skillId];
  if (!sk) return 'unknown';
  const rank = data.player.skills[skillId] ?? 0;
  if (rank >= sk.maxRank) return 'max_rank';
  if (sk.requiresLevel && data.player.level < sk.requiresLevel) return 'level_too_low';
  if (data.player.skillPoints <= 0) return 'no_points';
  return 'ok';
}

export function trainSkill(data: GameData, skillId: string): TrainResult {
  const r = canTrain(data, skillId);
  if (r !== 'ok') return r;
  data.player.skills[skillId] = (data.player.skills[skillId] ?? 0) + 1;
  data.player.skillPoints--;
  return 'ok';
}

/** Refund all skill points (offered by the shrine keeper for a fee). */
export function resetSkills(data: GameData): number {
  let refunded = 0;
  for (const rank of Object.values(data.player.skills)) refunded += rank;
  data.player.skills = {};
  data.player.skillPoints += refunded;
  return refunded;
}
