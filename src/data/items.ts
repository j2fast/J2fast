// Item definitions. Equipment instances (with rarity, affixes and upgrade
// level) are created by systems/loot.ts from these templates.

import type { WeaponType } from './weapons';

export type ItemKind = 'weapon' | 'armor' | 'charm' | 'consumable' | 'material' | 'key';
export type StatKey =
  | 'atk'
  | 'atkPct'
  | 'def'
  | 'maxHp'
  | 'crit'
  | 'critDmg'
  | 'staminaRegen'
  | 'spiritGain'
  | 'moveSpeed'
  | 'lifesteal'
  | 'burnChance';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  description: string;
  /** Sell value in coins (buy price is derived for merchant stock). */
  value: number;
  /** Item tier (1-4) drives affix strength and upgrade costs. */
  tier: number;
  weaponType?: WeaponType;
  baseStats?: Partial<Record<StatKey, number>>;
  /** Fixed affixes always present (used for unique items). */
  fixedAffixes?: { stat: StatKey; value: number }[];
  stackable?: boolean;
  maxStack?: number;
  /** For consumables. */
  use?: { heal?: number; spirit?: number; buffAtk?: number; buffTime?: number };
  /** Unique items always drop at this rarity. */
  fixedRarity?: number;
}

const weapon = (id: string, name: string, weaponType: WeaponType, tier: number, atk: number, description: string, extra: Partial<ItemDef> = {}): ItemDef => ({
  id,
  name,
  kind: 'weapon',
  weaponType,
  tier,
  description,
  value: 20 * tier * tier + 10,
  baseStats: { atk },
  ...extra,
});

const armor = (id: string, name: string, tier: number, def: number, maxHp: number, description: string, extra: Partial<ItemDef> = {}): ItemDef => ({
  id,
  name,
  kind: 'armor',
  tier,
  description,
  value: 18 * tier * tier + 10,
  baseStats: { def, maxHp },
  ...extra,
});

const charm = (id: string, name: string, tier: number, stats: Partial<Record<StatKey, number>>, description: string): ItemDef => ({
  id,
  name,
  kind: 'charm',
  tier,
  description,
  value: 25 * tier * tier + 15,
  baseStats: stats,
});

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    // --- Katana
    weapon('katana_wanderer', "Wanderer's Katana", 'katana', 1, 6, 'A plain, honest blade carried by every new Warden.'),
    weapon('katana_ashwood', 'Ashwood Katana', 'katana', 2, 12, 'Tempered in the ash of burned bamboo.'),
    weapon('katana_moonlit', 'Moonlit Blade', 'katana', 3, 20, 'Its edge catches light that is not there.'),
    weapon('katana_lanternfire', 'Lanternfire Katana', 'katana', 4, 30, 'Forged from a sliver of the Spirit Lantern itself.', {
      fixedRarity: 4,
      fixedAffixes: [{ stat: 'burnChance', value: 0.2 }],
    }),
    // --- Naginata
    weapon('naginata_shrine', 'Shrine Guard Naginata', 'naginata', 1, 8, 'Once carried by the guardians of the village shrine.'),
    weapon('naginata_crescent', 'Crescent Naginata', 'naginata', 2, 16, 'The blade curves like the thinnest moon.'),
    weapon('naginata_stormreed', 'Stormreed Glaive', 'naginata', 3, 26, 'Whistles like wind through marsh reeds.'),
    // --- Twin Tanto
    weapon('tanto_twinfang', 'Twin Fang Tanto', 'tanto', 1, 5, 'A matched pair of short knives.'),
    weapon('tanto_nightwhisper', 'Nightwhisper Tanto', 'tanto', 2, 12, 'They make no sound, even when they bite.'),
    weapon('tanto_mothwing', 'Moth-Wing Tanto', 'tanto', 3, 21, 'Light as paper, sharp as frost.'),
    // --- Kanabo
    weapon('kanabo_oak', 'Oak Kanabo', 'kanabo', 1, 9, 'Heavy oak bound with iron studs.'),
    weapon('kanabo_irongate', 'Iron-Gate Kanabo', 'kanabo', 3, 24, 'Torn from the hands of the Iron-Gate Oni.', {
      fixedRarity: 3,
      fixedAffixes: [{ stat: 'atkPct', value: 0.1 }],
    }),
    weapon('kanabo_mountain', 'Mountain Breaker', 'kanabo', 4, 33, 'Each blow sounds like a landslide.'),
    // --- Bow
    weapon('bow_willow', 'Willow Bow', 'bow', 1, 6, 'Supple and forgiving.'),
    weapon('bow_ember', 'Ember Bow', 'bow', 2, 13, 'Arrows loosed from it trail sparks.'),
    weapon('bow_starfall', 'Starfall Bow', 'bow', 3, 22, 'Strung with a thread of silver silk.'),

    // --- Armor
    armor('armor_traveler', "Traveler's Haori", 1, 2, 0, 'A light coat for the road.'),
    armor('armor_warden', "Warden's Robe", 1, 4, 10, 'Lantern-red robes of the Wardens.'),
    armor('armor_lacquer', 'Lacquered Do', 2, 8, 20, 'Layered lacquer plates over cloth.'),
    armor('armor_silkweave', 'Silk-Weave Mantle', 3, 9, 30, 'Woven from spider silk, impossibly strong.', {
      fixedAffixes: [{ stat: 'spiritGain', value: 0.15 }],
    }),
    armor('armor_emberguard', 'Ember Guard Armor', 4, 15, 50, 'Armor that glows faintly when danger is near.'),

    // --- Charms
    charm('charm_fox', 'Fox Charm', 1, { crit: 0.05 }, 'A carved fox. Favors the quick.'),
    charm('charm_tortoise', 'Tortoise Charm', 1, { maxHp: 20 }, 'A smooth stone tortoise. Favors the patient.'),
    charm('charm_crane', 'Crane Charm', 2, { staminaRegen: 0.2 }, 'A paper crane that never creases.'),
    charm('charm_ember', 'Ember Charm', 2, { spiritGain: 0.25 }, 'Warm to the touch.'),
    charm('charm_ironbell', 'Iron Bell', 3, { def: 6, maxHp: 15 }, 'Rings to ward off the Hollowed.'),
    charm('charm_moonmirror', 'Moon Mirror', 4, { crit: 0.08, critDmg: 0.25 }, 'Shows your reflection a moment late.'),

    // --- Consumables
    {
      id: 'dango',
      name: 'Healing Dango',
      kind: 'consumable',
      tier: 1,
      value: 10,
      description: 'Sweet rice dumplings. Restores 45% of your health.',
      stackable: true,
      maxStack: 10,
      use: { heal: 0.45 },
    },
    {
      id: 'spirit_tea',
      name: 'Spirit Tea',
      kind: 'consumable',
      tier: 1,
      value: 12,
      description: 'Bitter green tea. Restores 60 spirit.',
      stackable: true,
      maxStack: 10,
      use: { spirit: 60 },
    },
    {
      id: 'ember_incense',
      name: 'Ember Incense',
      kind: 'consumable',
      tier: 2,
      value: 20,
      description: 'Burning it emboldens you: +25% damage for 45 seconds.',
      stackable: true,
      maxStack: 5,
      use: { buffAtk: 0.25, buffTime: 45 },
    },

    // --- Materials
    { id: 'spirit_ore', name: 'Spirit Ore', kind: 'material', tier: 1, value: 8, description: 'Glimmering ore used by smiths to strengthen gear.', stackable: true, maxStack: 99 },
    { id: 'hollow_essence', name: 'Hollow Essence', kind: 'material', tier: 3, value: 30, description: 'A cold wisp of a lost soul. Needed for high-level upgrades.', stackable: true, maxStack: 99 },

    // --- Key items
    { id: 'ember_core_1', name: 'Ember Core of Ash', kind: 'key', tier: 1, value: 0, description: 'The first fragment of the Spirit Lantern, smouldering grey-red.' },
    { id: 'ember_core_2', name: 'Ember Core of Silk', kind: 'key', tier: 1, value: 0, description: 'The second fragment, wrapped in threads of light.' },
    { id: 'ember_core_3', name: 'Ember Core of Dusk', kind: 'key', tier: 1, value: 0, description: 'The last fragment, pulsing like a heartbeat.' },
    { id: 'hotaru_bell', name: "Hotaru's Bell", kind: 'key', tier: 1, value: 0, description: 'A tiny bronze bell. It still rings softly.' },
    { id: 'ferry_token', name: 'Ferry Token', kind: 'key', tier: 1, value: 0, description: 'A wooden tag stamped with a lantern. Ibuki will honour it.' },
    { id: 'tea_parcel', name: 'Tea Parcel', kind: 'key', tier: 1, value: 0, description: 'A neatly wrapped parcel of Ohana\'s best tea leaves.' },
  ].map((d) => [d.id, d as ItemDef]),
);

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export const RARITY_COLORS = ['#d9d4c7', '#7fd17a', '#5fa8ff', '#c27bff', '#ffc145'] as const;
/** Multiplier applied to base stats by rarity. */
export const RARITY_STAT_MULT = [1, 1.1, 1.22, 1.36, 1.5] as const;

export const STAT_LABELS: Record<StatKey, string> = {
  atk: 'Attack',
  atkPct: 'Damage',
  def: 'Defense',
  maxHp: 'Max Health',
  crit: 'Crit Chance',
  critDmg: 'Crit Damage',
  staminaRegen: 'Stamina Regen',
  spiritGain: 'Spirit Gain',
  moveSpeed: 'Move Speed',
  lifesteal: 'Lifesteal',
  burnChance: 'Burn Chance',
};

/** Stats shown as percentages in the UI. */
export const PERCENT_STATS: ReadonlySet<StatKey> = new Set([
  'atkPct',
  'crit',
  'critDmg',
  'staminaRegen',
  'spiritGain',
  'moveSpeed',
  'lifesteal',
  'burnChance',
]);

export function formatStat(stat: StatKey, value: number): string {
  if (PERCENT_STATS.has(stat)) return `+${Math.round(value * 100)}% ${STAT_LABELS[stat]}`;
  return `+${Math.round(value)} ${STAT_LABELS[stat]}`;
}

/** Affix pools per equipment kind with value ranges at tier 1 (scaled by tier). */
export const AFFIX_POOLS: Record<'weapon' | 'armor' | 'charm', { stat: StatKey; min: number; max: number }[]> = {
  weapon: [
    { stat: 'atkPct', min: 0.03, max: 0.08 },
    { stat: 'crit', min: 0.02, max: 0.05 },
    { stat: 'critDmg', min: 0.08, max: 0.2 },
    { stat: 'lifesteal', min: 0.01, max: 0.025 },
    { stat: 'burnChance', min: 0.04, max: 0.1 },
    { stat: 'spiritGain', min: 0.06, max: 0.14 },
  ],
  armor: [
    { stat: 'maxHp', min: 8, max: 20 },
    { stat: 'def', min: 1, max: 4 },
    { stat: 'staminaRegen', min: 0.05, max: 0.12 },
    { stat: 'moveSpeed', min: 0.02, max: 0.05 },
  ],
  charm: [
    { stat: 'crit', min: 0.02, max: 0.04 },
    { stat: 'maxHp', min: 6, max: 16 },
    { stat: 'spiritGain', min: 0.05, max: 0.12 },
    { stat: 'staminaRegen', min: 0.05, max: 0.1 },
    { stat: 'atkPct', min: 0.02, max: 0.05 },
  ],
};

export const MAX_UPGRADE = 5;
