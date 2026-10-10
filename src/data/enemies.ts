// Enemy and boss definitions. Attack patterns are data; the behaviours they
// map to are implemented in entities/enemy.ts.

export type EnemyAttackKind =
  | 'melee' // cone in front, resolved when the active window opens
  | 'charge' // dash forward along a line
  | 'leap' // jump to the player's position, circle impact
  | 'slam' // circle centred on self
  | 'pillars' // delayed circles under/around the player
  | 'projectile' // fire projectiles at the player
  | 'ring' // expanding shockwave ring (dodge through it)
  | 'beam' // sweeping line
  | 'spiral' // spiral of projectiles
  | 'summon' // call minions
  | 'teleport' // blink near the player
  | 'dive'; // vanish, shadow follows player, crash down

export interface EnemyAttack {
  id: string;
  name: string;
  kind: EnemyAttackKind;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Maximum distance at which this attack is chosen. */
  range: number;
  minRange?: number;
  arc?: number;
  radius?: number;
  cooldown: number;
  weight: number;
  /** Boss phase from which this attack is available (1-based). */
  phase?: number;
  count?: number;
  speed?: number;
  spread?: number;
  status?: { type: 'burn' | 'slow'; time: number };
  summon?: { enemy: string; count: number };
  /** Spoken/captioned callout for bosses. */
  callout?: string;
  /** Hits several times while active (beam / spiral emission interval). */
  interval?: number;
}

export type EnemyBehavior = 'melee' | 'ranged' | 'skirmisher' | 'heavy' | 'caster' | 'dummy' | 'boss' | 'swarm';

export interface EnemyDef {
  id: string;
  name: string;
  model: string;
  behavior: EnemyBehavior;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  radius: number;
  scale: number;
  poise: number;
  aggroRange: number;
  leash: number;
  preferredRange?: number;
  flying?: boolean;
  superArmor?: boolean;
  xp: number;
  coins: [number, number];
  drops: { item: string; chance: number; qty?: [number, number] }[];
  /** Chance to drop a random equipment piece. */
  equipChance: number;
  attacks: EnemyAttack[];
  boss?: { title: string; phaseThresholds: number[]; music: string; reward: string[] };
  /** Chance to sidestep when the player starts an attack nearby. */
  evade?: number;
}

const atk = (a: Partial<EnemyAttack> & Pick<EnemyAttack, 'id' | 'name' | 'kind'>): EnemyAttack => ({
  windup: 0.6,
  active: 0.15,
  recovery: 0.6,
  damage: 1,
  range: 2,
  cooldown: 1.5,
  weight: 1,
  ...a,
});

export const ENEMIES: Record<string, EnemyDef> = {
  training_dummy: {
    id: 'training_dummy',
    name: 'Straw Dummy',
    model: 'dummy',
    behavior: 'dummy',
    hp: 60,
    atk: 0,
    def: 0,
    speed: 0,
    radius: 0.55,
    scale: 1,
    poise: 9999,
    aggroRange: 0,
    leash: 0,
    xp: 3,
    coins: [0, 0],
    drops: [],
    equipChance: 0,
    attacks: [],
  },
  ashen_imp: {
    id: 'ashen_imp',
    name: 'Ashen Imp',
    model: 'imp',
    behavior: 'melee',
    hp: 42,
    atk: 8,
    def: 2,
    speed: 3.8,
    radius: 0.5,
    scale: 0.85,
    poise: 14,
    aggroRange: 13,
    leash: 28,
    xp: 12,
    coins: [3, 7],
    drops: [
      { item: 'dango', chance: 0.12 },
      { item: 'spirit_ore', chance: 0.25 },
    ],
    equipChance: 0.05,
    attacks: [
      atk({ id: 'claw', name: 'Claw', kind: 'melee', windup: 0.5, active: 0.12, recovery: 0.55, damage: 1, range: 1.8, arc: 100, cooldown: 1.2 }),
      atk({ id: 'pounce', name: 'Pounce', kind: 'charge', windup: 0.65, active: 0.3, recovery: 0.7, damage: 1.3, range: 6, minRange: 3, speed: 12, cooldown: 4, weight: 0.6 }),
    ],
  },
  ember_wisp: {
    id: 'ember_wisp',
    name: 'Ember Wisp',
    model: 'wisp',
    behavior: 'ranged',
    hp: 30,
    atk: 8,
    def: 0,
    speed: 3.2,
    radius: 0.45,
    scale: 1,
    poise: 10,
    aggroRange: 16,
    leash: 30,
    preferredRange: 8,
    flying: true,
    xp: 14,
    coins: [4, 8],
    drops: [
      { item: 'spirit_tea', chance: 0.15 },
      { item: 'spirit_ore', chance: 0.2 },
    ],
    equipChance: 0.05,
    attacks: [
      atk({
        id: 'ember_orb',
        name: 'Ember Orb',
        kind: 'projectile',
        windup: 0.75,
        active: 0.1,
        recovery: 0.9,
        damage: 1,
        range: 14,
        speed: 9,
        count: 1,
        cooldown: 2.2,
        status: { type: 'burn', time: 3 },
      }),
    ],
  },
  bog_lurker: {
    id: 'bog_lurker',
    name: 'Bog Lurker',
    model: 'lurker',
    behavior: 'melee',
    hp: 80,
    atk: 12,
    def: 4,
    speed: 3,
    radius: 0.7,
    scale: 1.1,
    poise: 30,
    aggroRange: 12,
    leash: 26,
    xp: 22,
    coins: [5, 11],
    drops: [
      { item: 'dango', chance: 0.15 },
      { item: 'spirit_ore', chance: 0.35 },
    ],
    equipChance: 0.08,
    attacks: [
      atk({ id: 'slap', name: 'Webbed Slap', kind: 'melee', windup: 0.55, active: 0.14, recovery: 0.6, damage: 1, range: 2.1, arc: 110, cooldown: 1.4 }),
      atk({ id: 'belly_charge', name: 'Belly Charge', kind: 'charge', windup: 0.85, active: 0.6, recovery: 0.9, damage: 1.4, range: 10, minRange: 4, speed: 13, cooldown: 5, weight: 0.8 }),
    ],
  },
  stone_sentinel: {
    id: 'stone_sentinel',
    name: 'Stone Sentinel',
    model: 'sentinel',
    behavior: 'heavy',
    hp: 170,
    atk: 18,
    def: 12,
    speed: 2.1,
    radius: 1.0,
    scale: 1.35,
    poise: 90,
    superArmor: true,
    aggroRange: 11,
    leash: 24,
    xp: 45,
    coins: [10, 20],
    drops: [
      { item: 'spirit_ore', chance: 0.7, qty: [1, 3] },
      { item: 'hollow_essence', chance: 0.12 },
    ],
    equipChance: 0.18,
    attacks: [
      atk({ id: 'hammer', name: 'Stone Hammer', kind: 'melee', windup: 1.0, active: 0.16, recovery: 0.9, damage: 1.2, range: 3, arc: 70, cooldown: 1.8 }),
      atk({ id: 'quake', name: 'Ground Pound', kind: 'slam', windup: 1.2, active: 0.18, recovery: 1.1, damage: 1.4, range: 3.6, radius: 4, cooldown: 5, weight: 0.8 }),
    ],
  },
  shade_fox: {
    id: 'shade_fox',
    name: 'Shade Fox',
    model: 'fox',
    behavior: 'skirmisher',
    hp: 58,
    atk: 11,
    def: 3,
    speed: 5.6,
    radius: 0.55,
    scale: 1,
    poise: 18,
    aggroRange: 15,
    leash: 30,
    xp: 26,
    coins: [6, 12],
    evade: 0.35,
    drops: [
      { item: 'dango', chance: 0.12 },
      { item: 'spirit_ore', chance: 0.3 },
    ],
    equipChance: 0.1,
    attacks: [
      atk({ id: 'bite', name: 'Bite', kind: 'melee', windup: 0.4, active: 0.1, recovery: 0.45, damage: 0.9, range: 1.8, arc: 90, cooldown: 1 }),
      atk({ id: 'fox_pounce', name: 'Shadow Pounce', kind: 'leap', windup: 0.6, active: 0.45, recovery: 0.6, damage: 1.3, range: 8, minRange: 3, radius: 1.6, cooldown: 4 }),
    ],
  },
  spiderling: {
    id: 'spiderling',
    name: 'Silk Spiderling',
    model: 'spiderling',
    behavior: 'swarm',
    hp: 24,
    atk: 8,
    def: 0,
    speed: 4.6,
    radius: 0.45,
    scale: 0.8,
    poise: 6,
    aggroRange: 14,
    leash: 30,
    xp: 7,
    coins: [1, 4],
    drops: [{ item: 'spirit_ore', chance: 0.12 }],
    equipChance: 0.02,
    attacks: [atk({ id: 'nip', name: 'Nip', kind: 'melee', windup: 0.45, active: 0.1, recovery: 0.5, damage: 1, range: 1.5, arc: 90, cooldown: 1.1 })],
  },
  masked_acolyte: {
    id: 'masked_acolyte',
    name: 'Masked Acolyte',
    model: 'acolyte',
    behavior: 'caster',
    hp: 95,
    atk: 15,
    def: 6,
    speed: 3,
    radius: 0.6,
    scale: 1.05,
    poise: 35,
    aggroRange: 16,
    leash: 30,
    preferredRange: 9,
    xp: 40,
    coins: [10, 18],
    drops: [
      { item: 'spirit_tea', chance: 0.25 },
      { item: 'hollow_essence', chance: 0.15 },
    ],
    equipChance: 0.15,
    attacks: [
      atk({ id: 'fan', name: 'Hollow Fan', kind: 'projectile', windup: 0.8, active: 0.1, recovery: 0.8, damage: 0.9, range: 15, speed: 10, count: 3, spread: 0.35, cooldown: 2.6 }),
      atk({ id: 'pillar', name: 'Dusk Pillar', kind: 'pillars', windup: 1.1, active: 0.3, recovery: 0.7, damage: 1.3, range: 14, radius: 1.8, count: 1, cooldown: 4.5 }),
      atk({ id: 'blink', name: 'Blink', kind: 'teleport', windup: 0.4, active: 0.1, recovery: 0.4, damage: 0, range: 3.5, cooldown: 6, weight: 0.8 }),
    ],
  },

  // ---------------------------------------------------------------- Bosses
  kuroganemaru: {
    id: 'kuroganemaru',
    name: 'Kuroganemaru',
    model: 'oni',
    behavior: 'boss',
    hp: 950,
    atk: 20,
    def: 8,
    speed: 3.4,
    radius: 1.4,
    scale: 2.1,
    poise: 260,
    aggroRange: 30,
    leash: 999,
    xp: 400,
    coins: [150, 150],
    drops: [{ item: 'spirit_ore', chance: 1, qty: [4, 6] }],
    equipChance: 0,
    boss: { title: 'the Iron-Gate Oni', phaseThresholds: [0.5], music: 'boss', reward: ['kanabo_irongate', 'ember_core_1'] },
    attacks: [
      atk({ id: 'smash', name: 'Gate Smash', kind: 'melee', windup: 0.9, active: 0.18, recovery: 0.8, damage: 1.2, range: 4.2, arc: 60, cooldown: 1.2, weight: 1.2 }),
      atk({ id: 'sweep', name: 'Iron Sweep', kind: 'melee', windup: 0.8, active: 0.2, recovery: 0.8, damage: 1.0, range: 4.6, arc: 200, cooldown: 2.5 }),
      atk({ id: 'leap', name: 'Mountain Leap', kind: 'leap', windup: 0.8, active: 0.8, recovery: 1.0, damage: 1.5, range: 18, minRange: 5, radius: 4, cooldown: 6, callout: 'The Oni crouches to leap!' }),
      atk({
        id: 'fissure',
        name: 'Fissure Line',
        kind: 'pillars',
        windup: 1.0,
        active: 0.3,
        recovery: 1.0,
        damage: 1.3,
        range: 14,
        radius: 1.8,
        count: 5,
        cooldown: 5,
        phase: 2,
        callout: 'The ground splits!',
      }),
      atk({ id: 'call_imps', name: 'Call of the Gate', kind: 'summon', windup: 1.0, active: 0.2, recovery: 0.8, damage: 0, range: 40, cooldown: 18, phase: 2, weight: 0.7, summon: { enemy: 'ashen_imp', count: 2 }, callout: 'Kuroganemaru calls his imps!' }),
      atk({ id: 'rage_slam', name: 'Rage Quake', kind: 'ring', windup: 1.1, active: 1.2, recovery: 1.0, damage: 1.3, range: 10, radius: 14, speed: 9, cooldown: 7, phase: 2, callout: 'A shockwave spreads — dodge through it!' }),
    ],
  },
  itomaru: {
    id: 'itomaru',
    name: 'Itomaru',
    model: 'widow',
    behavior: 'boss',
    hp: 1500,
    atk: 26,
    def: 12,
    speed: 4.2,
    radius: 1.6,
    scale: 1.8,
    poise: 320,
    aggroRange: 30,
    leash: 999,
    xp: 800,
    coins: [300, 300],
    drops: [
      { item: 'spirit_ore', chance: 1, qty: [6, 8] },
      { item: 'hollow_essence', chance: 1, qty: [2, 3] },
    ],
    equipChance: 0,
    boss: { title: 'the Silk Widow', phaseThresholds: [0.55], music: 'boss', reward: ['armor_silkweave', 'ember_core_2'] },
    attacks: [
      atk({ id: 'leg_stab', name: 'Leg Stab', kind: 'melee', windup: 0.7, active: 0.14, recovery: 0.6, damage: 1.0, range: 4, arc: 80, cooldown: 1.1, weight: 1.2 }),
      atk({
        id: 'web_spit',
        name: 'Web Spit',
        kind: 'projectile',
        windup: 0.8,
        active: 0.1,
        recovery: 0.7,
        damage: 0.8,
        range: 20,
        speed: 12,
        count: 5,
        spread: 0.5,
        cooldown: 3,
        status: { type: 'slow', time: 2.5 },
      }),
      atk({ id: 'skitter', name: 'Skitter Charge', kind: 'charge', windup: 0.8, active: 0.7, recovery: 0.9, damage: 1.3, range: 16, minRange: 4, speed: 16, cooldown: 4.5 }),
      atk({ id: 'brood', name: 'Brood Call', kind: 'summon', windup: 0.9, active: 0.2, recovery: 0.6, damage: 0, range: 40, cooldown: 16, weight: 0.6, summon: { enemy: 'spiderling', count: 3 }, callout: 'Spiderlings pour from the walls!' }),
      atk({ id: 'drop', name: 'Ceiling Drop', kind: 'dive', windup: 2.0, active: 0.3, recovery: 1.1, damage: 1.7, range: 40, radius: 3.6, cooldown: 8, phase: 2, callout: 'Itomaru vanishes into the dark above…' }),
      atk({ id: 'silk_burst', name: 'Silk Burst', kind: 'spiral', windup: 0.9, active: 2.0, recovery: 1.0, damage: 0.7, range: 30, speed: 9, count: 3, interval: 0.16, cooldown: 9, phase: 2, status: { type: 'slow', time: 2 }, callout: 'Threads lash out in every direction!' }),
    ],
  },
  yomikage: {
    id: 'yomikage',
    name: 'Yomikage',
    model: 'yomikage',
    behavior: 'boss',
    hp: 2400,
    atk: 30,
    def: 14,
    speed: 4,
    radius: 1.5,
    scale: 1.9,
    poise: 400,
    flying: true,
    aggroRange: 40,
    leash: 999,
    xp: 0,
    coins: [0, 0],
    drops: [],
    equipChance: 0,
    boss: { title: 'the Hollow Mask', phaseThresholds: [0.66, 0.33], music: 'finalBoss', reward: ['ember_core_3', 'katana_lanternfire'] },
    attacks: [
      atk({ id: 'hand_swipe', name: 'Hollow Hands', kind: 'melee', windup: 0.75, active: 0.18, recovery: 0.6, damage: 1.0, range: 4.5, arc: 150, cooldown: 1.2, weight: 1.2 }),
      atk({ id: 'orb_volley', name: 'Soul Volley', kind: 'projectile', windup: 0.8, active: 0.1, recovery: 0.7, damage: 0.8, range: 26, speed: 11, count: 7, spread: 0.9, cooldown: 3, status: { type: 'burn', time: 3 } }),
      atk({ id: 'mask_beam', name: 'Mask Gaze', kind: 'beam', windup: 1.2, active: 2.2, recovery: 0.9, damage: 0.6, range: 22, radius: 22, interval: 0.25, cooldown: 7, callout: 'The Mask fixes its gaze…' }),
      atk({ id: 'blink', name: 'Fade', kind: 'teleport', windup: 0.5, active: 0.1, recovery: 0.3, damage: 0, range: 40, cooldown: 7, phase: 2, weight: 0.7 }),
      atk({ id: 'flame_ring', name: 'Ring of Dusk', kind: 'ring', windup: 1.0, active: 1.4, recovery: 0.8, damage: 1.2, range: 14, radius: 16, speed: 10, cooldown: 6, phase: 2, callout: 'A ring of dusk-fire expands — dodge through it!' }),
      atk({ id: 'lantern_fall', name: 'Falling Lanterns', kind: 'pillars', windup: 1.2, active: 0.3, recovery: 0.8, damage: 1.4, range: 40, radius: 2.2, count: 7, cooldown: 6, phase: 2, callout: 'Broken lanterns rain from the sky!' }),
      atk({ id: 'soul_storm', name: 'Soul Storm', kind: 'spiral', windup: 1.0, active: 2.6, recovery: 1.0, damage: 0.7, range: 40, speed: 10, count: 4, interval: 0.12, cooldown: 9, phase: 3, status: { type: 'burn', time: 2 }, callout: 'A storm of souls spirals outward!' }),
      atk({ id: 'acolytes', name: 'Summon Acolytes', kind: 'summon', windup: 1.0, active: 0.2, recovery: 0.6, damage: 0, range: 40, cooldown: 22, phase: 3, weight: 0.5, summon: { enemy: 'masked_acolyte', count: 2 }, callout: 'Masked acolytes answer the call!' }),
    ],
  },
};

/** Per-level scaling used when an area spawns enemies above level 1. */
export function scaleEnemy(def: EnemyDef, level: number) {
  const l = Math.max(1, level) - 1;
  return {
    hp: Math.round(def.hp * (1 + 0.2 * l)),
    atk: def.atk * (1 + 0.13 * l),
    def: def.def + l,
    xp: Math.round(def.xp * (1 + 0.22 * l)),
    coinMult: 1 + 0.15 * l,
  };
}
