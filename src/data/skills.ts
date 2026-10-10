// Passive skills trained at the shrine with skill points (1 per level).

import type { StatKey } from './items';

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  /** Stat bonus per rank. */
  perRank: Partial<Record<StatKey, number>>;
  /** Special flags unlocked at rank >= 1. */
  special?: 'secondWind' | 'teaMastery' | 'parryDodge';
  requiresLevel?: number;
}

export const SKILLS: SkillDef[] = [
  { id: 'vitality', name: 'Vitality', description: '+15 maximum health per rank.', maxRank: 5, perRank: { maxHp: 15 } },
  { id: 'might', name: 'Might', description: '+5% damage per rank.', maxRank: 5, perRank: { atkPct: 0.05 } },
  { id: 'ironskin', name: 'Iron Skin', description: '+3 defense per rank.', maxRank: 3, perRank: { def: 3 } },
  { id: 'keen', name: 'Keen Edge', description: '+4% critical chance per rank.', maxRank: 3, perRank: { crit: 0.04 } },
  { id: 'fleet', name: 'Fleetfoot', description: '+4% move speed and +10% stamina regen per rank.', maxRank: 3, perRank: { moveSpeed: 0.04, staminaRegen: 0.1 } },
  { id: 'wellspring', name: 'Wellspring', description: '+15% spirit gain per rank.', maxRank: 3, perRank: { spiritGain: 0.15 } },
  {
    id: 'tea',
    name: 'Tea Ceremony',
    description: 'Healing items restore 50% more and act twice as fast.',
    maxRank: 1,
    perRank: {},
    special: 'teaMastery',
    requiresLevel: 4,
  },
  {
    id: 'shadowdodge',
    name: 'Shadow Dodge',
    description: 'Dodging through an attack at the last moment slows time briefly and refunds stamina.',
    maxRank: 1,
    perRank: {},
    special: 'parryDodge',
    requiresLevel: 6,
  },
  {
    id: 'secondwind',
    name: 'Second Wind',
    description: 'Once per rest, survive a fatal blow with 30% health.',
    maxRank: 1,
    perRank: {},
    special: 'secondWind',
    requiresLevel: 8,
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
