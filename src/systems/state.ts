// The persistent game state (everything that goes into a save file).

import type { StatKey } from '../data/items';

export interface Affix {
  stat: StatKey;
  value: number;
}

export interface ItemInstance {
  uid: string;
  id: string;
  qty: number;
  rarity: number;
  level: number;
  affixes: Affix[];
  isNew?: boolean;
}

export type EquipSlot = 'weapon1' | 'weapon2' | 'armor' | 'charm';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon1', 'weapon2', 'armor', 'charm'];

export interface QuestState {
  stage: number;
  progress: number;
}

export interface GameData {
  version: number;
  createdAt: number;
  savedAt: number;
  playTime: number;
  player: {
    level: number;
    xp: number;
    coins: number;
    hpFrac: number;
    spirit: number;
    skillPoints: number;
    skills: Record<string, number>;
    area: string;
    spawn: string;
    pos: [number, number, number] | null;
    equipment: Record<EquipSlot, string | null>;
    activeWeapon: 0 | 1;
  };
  inventory: ItemInstance[];
  quests: {
    active: Record<string, QuestState>;
    completed: string[];
    tracked: string | null;
  };
  flags: Record<string, number>;
  world: {
    openedChests: string[];
    litBraziers: string[];
    bossesDefeated: string[];
    visitedAreas: string[];
    collected: string[];
  };
  stats: {
    kills: number;
    deaths: number;
    damageDealt: number;
    itemsFound: number;
  };
  nextUid: number;
  ending: boolean;
}

export const SAVE_VERSION = 1;

export function newGameData(now = Date.now()): GameData {
  const data: GameData = {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    playTime: 0,
    player: {
      level: 1,
      xp: 0,
      coins: 30,
      hpFrac: 1,
      spirit: 0,
      skillPoints: 0,
      skills: {},
      area: 'village',
      spawn: 'start',
      pos: null,
      equipment: { weapon1: null, weapon2: null, armor: null, charm: null },
      activeWeapon: 0,
    },
    inventory: [],
    quests: { active: {}, completed: [], tracked: null },
    flags: {},
    world: { openedChests: [], litBraziers: [], bossesDefeated: [], visitedAreas: [], collected: [] },
    stats: { kills: 0, deaths: 0, damageDealt: 0, itemsFound: 0 },
    nextUid: 1,
    ending: false,
  };
  return data;
}

export function newUid(data: GameData): string {
  return 'i' + data.nextUid++;
}

export function getFlag(data: GameData, flag: string): number {
  return data.flags[flag] ?? 0;
}

export function setFlag(data: GameData, flag: string, value = 1): void {
  data.flags[flag] = value;
}
