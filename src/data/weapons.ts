// Weapon families: combos, heavy attacks and spirit abilities. All timings are
// in seconds, distances in metres, damage values are multipliers of the
// player's attack stat.

export type WeaponType = 'katana' | 'naginata' | 'tanto' | 'kanabo' | 'bow';

export type AttackPose =
  | 'slashR'
  | 'slashL'
  | 'slashUp'
  | 'thrust'
  | 'overhead'
  | 'spin'
  | 'stabTwin'
  | 'shoot'
  | 'chargeShot';

export interface AttackDef {
  name: string;
  kind: 'melee' | 'projectile';
  pose: AttackPose;
  damage: number;
  windup: number;
  active: number;
  recovery: number;
  /** Time after active ends during which the next combo input is accepted early. */
  comboWindow: number;
  range: number;
  /** Full arc width in degrees for melee hits. */
  arc: number;
  /** Forward movement during the swing (m). */
  lunge: number;
  knockback: number;
  /** Poise damage dealt (staggers enemies when their poise breaks). */
  poise: number;
  stamina: number;
  /** Optional ground shockwave at the end of the active window. */
  shockwave?: { radius: number; damage: number };
  projectile?: { speed: number; count: number; spread: number; pierce: boolean; radius: number };
  /** Chance to inflict bleed (damage over time). */
  bleed?: number;
}

export type AbilityKind = 'iaiDash' | 'whirlwind' | 'shadowStep' | 'earthshaker' | 'emberRain';

export interface AbilityDef {
  kind: AbilityKind;
  name: string;
  description: string;
  cost: number;
  cooldown: number;
  damage: number;
  radius: number;
  duration: number;
}

export interface WeaponFamily {
  type: WeaponType;
  name: string;
  description: string;
  moveSpeed: number;
  light: AttackDef[];
  heavy: AttackDef;
  ability: AbilityDef;
}

const melee = (a: Partial<AttackDef> & Pick<AttackDef, 'name' | 'pose' | 'damage'>): AttackDef => ({
  kind: 'melee',
  windup: 0.1,
  active: 0.1,
  recovery: 0.25,
  comboWindow: 0.35,
  range: 2.4,
  arc: 110,
  lunge: 0.8,
  knockback: 1.5,
  poise: 10,
  stamina: 8,
  ...a,
});

export const WEAPON_FAMILIES: Record<WeaponType, WeaponFamily> = {
  katana: {
    type: 'katana',
    name: 'Katana',
    description: 'Balanced and quick. A four-strike combo that ends in a lunging thrust.',
    moveSpeed: 1,
    light: [
      melee({ name: 'Rising Cut', pose: 'slashR', damage: 1.0, windup: 0.1, active: 0.1, recovery: 0.24 }),
      melee({ name: 'Returning Cut', pose: 'slashL', damage: 1.0, windup: 0.09, active: 0.1, recovery: 0.24, arc: 120 }),
      melee({ name: 'Crescent Cut', pose: 'slashUp', damage: 1.25, windup: 0.12, active: 0.12, recovery: 0.28, arc: 140 }),
      melee({
        name: 'Piercing Thrust',
        pose: 'thrust',
        damage: 1.8,
        windup: 0.18,
        active: 0.14,
        recovery: 0.42,
        range: 3.0,
        arc: 50,
        lunge: 2.8,
        knockback: 4,
        poise: 25,
        stamina: 12,
      }),
    ],
    heavy: melee({
      name: 'Draw Cut',
      pose: 'slashR',
      damage: 2.6,
      windup: 0.38,
      active: 0.15,
      recovery: 0.45,
      range: 2.9,
      arc: 170,
      lunge: 1.5,
      knockback: 3,
      poise: 40,
      stamina: 22,
    }),
    ability: {
      kind: 'iaiDash',
      name: 'Lantern Flash',
      description: 'Dash forward in a streak of light, cutting every foe in your path.',
      cost: 35,
      cooldown: 5,
      damage: 3.2,
      radius: 1.6,
      duration: 0.28,
    },
  },
  naginata: {
    type: 'naginata',
    name: 'Naginata',
    description: 'Long reach and wide sweeps. Keeps crowds at bay.',
    moveSpeed: 0.97,
    light: [
      melee({ name: 'Wide Sweep', pose: 'slashR', damage: 1.15, windup: 0.15, active: 0.14, recovery: 0.3, range: 3.4, arc: 160, stamina: 10 }),
      melee({ name: 'Back Sweep', pose: 'slashL', damage: 1.15, windup: 0.14, active: 0.14, recovery: 0.3, range: 3.4, arc: 160, stamina: 10 }),
      melee({
        name: 'Wheel Cut',
        pose: 'spin',
        damage: 1.6,
        windup: 0.2,
        active: 0.2,
        recovery: 0.42,
        range: 3.5,
        arc: 360,
        knockback: 3,
        poise: 25,
        stamina: 14,
      }),
    ],
    heavy: melee({
      name: 'Heron Thrust',
      pose: 'thrust',
      damage: 2.5,
      windup: 0.34,
      active: 0.14,
      recovery: 0.45,
      range: 4.4,
      arc: 34,
      lunge: 2.2,
      knockback: 4,
      poise: 35,
      stamina: 20,
    }),
    ability: {
      kind: 'whirlwind',
      name: 'Gale Wheel',
      description: 'Spin the blade around you, striking repeatedly while you move.',
      cost: 40,
      cooldown: 7,
      damage: 0.9,
      radius: 3.6,
      duration: 1.5,
    },
  },
  tanto: {
    type: 'tanto',
    name: 'Twin Tanto',
    description: 'Paired knives. Very fast, short reach, opens bleeding wounds.',
    moveSpeed: 1.08,
    light: [
      melee({ name: 'Flick', pose: 'slashR', damage: 0.55, windup: 0.05, active: 0.07, recovery: 0.12, range: 1.9, arc: 100, lunge: 0.6, stamina: 5, poise: 5, bleed: 0.08 }),
      melee({ name: 'Counter Flick', pose: 'slashL', damage: 0.55, windup: 0.05, active: 0.07, recovery: 0.12, range: 1.9, arc: 100, lunge: 0.6, stamina: 5, poise: 5, bleed: 0.08 }),
      melee({ name: 'Cross', pose: 'stabTwin', damage: 0.7, windup: 0.06, active: 0.08, recovery: 0.14, range: 2.0, arc: 80, lunge: 0.8, stamina: 5, poise: 6, bleed: 0.12 }),
      melee({ name: 'Flick', pose: 'slashR', damage: 0.6, windup: 0.05, active: 0.07, recovery: 0.12, range: 1.9, arc: 100, lunge: 0.6, stamina: 5, poise: 5, bleed: 0.08 }),
      melee({
        name: 'Moth Spiral',
        pose: 'spin',
        damage: 1.1,
        windup: 0.08,
        active: 0.12,
        recovery: 0.3,
        range: 2.2,
        arc: 360,
        lunge: 1.2,
        knockback: 2.5,
        stamina: 8,
        poise: 15,
        bleed: 0.25,
      }),
    ],
    heavy: melee({
      name: 'Twin Fang',
      pose: 'stabTwin',
      damage: 1.7,
      windup: 0.2,
      active: 0.12,
      recovery: 0.3,
      range: 2.2,
      arc: 60,
      lunge: 3.6,
      knockback: 2,
      poise: 20,
      stamina: 16,
      bleed: 0.6,
    }),
    ability: {
      kind: 'shadowStep',
      name: 'Shadow Step',
      description: 'Vanish and reappear behind your target for a guaranteed critical strike.',
      cost: 30,
      cooldown: 4,
      damage: 3.0,
      radius: 14,
      duration: 0.2,
    },
  },
  kanabo: {
    type: 'kanabo',
    name: 'Kanabo',
    description: 'A studded war club. Slow, crushing blows that break guards.',
    moveSpeed: 0.92,
    light: [
      melee({ name: 'Crush', pose: 'slashR', damage: 1.9, windup: 0.3, active: 0.14, recovery: 0.42, range: 2.7, arc: 130, lunge: 1, knockback: 3.5, poise: 35, stamina: 14 }),
      melee({ name: 'Backhand', pose: 'slashL', damage: 2.0, windup: 0.3, active: 0.14, recovery: 0.42, range: 2.7, arc: 130, lunge: 1, knockback: 3.5, poise: 35, stamina: 14 }),
      melee({
        name: 'Mountain Fall',
        pose: 'overhead',
        damage: 2.8,
        windup: 0.42,
        active: 0.14,
        recovery: 0.55,
        range: 2.8,
        arc: 70,
        lunge: 1.2,
        knockback: 5,
        poise: 60,
        stamina: 18,
        shockwave: { radius: 2.6, damage: 0.8 },
      }),
    ],
    heavy: melee({
      name: 'Quake Slam',
      pose: 'overhead',
      damage: 3.4,
      windup: 0.6,
      active: 0.14,
      recovery: 0.6,
      range: 2.8,
      arc: 70,
      lunge: 0.6,
      knockback: 6,
      poise: 80,
      stamina: 26,
      shockwave: { radius: 3.4, damage: 1.4 },
    }),
    ability: {
      kind: 'earthshaker',
      name: 'Earthshaker',
      description: 'Leap and smash the ground, stunning every enemy nearby.',
      cost: 45,
      cooldown: 8,
      damage: 4.0,
      radius: 5.5,
      duration: 0.7,
    },
  },
  bow: {
    type: 'bow',
    name: 'Spirit Bow',
    description: 'Fire spirit arrows from range. Aims at your target or straight ahead.',
    moveSpeed: 1,
    light: [
      {
        name: 'Quick Shot',
        kind: 'projectile',
        pose: 'shoot',
        damage: 0.85,
        windup: 0.12,
        active: 0.02,
        recovery: 0.22,
        comboWindow: 0.3,
        range: 30,
        arc: 0,
        lunge: 0,
        knockback: 0.8,
        poise: 6,
        stamina: 5,
        projectile: { speed: 34, count: 1, spread: 0, pierce: false, radius: 0.35 },
      },
      {
        name: 'Quick Shot',
        kind: 'projectile',
        pose: 'shoot',
        damage: 0.85,
        windup: 0.1,
        active: 0.02,
        recovery: 0.22,
        comboWindow: 0.3,
        range: 30,
        arc: 0,
        lunge: 0,
        knockback: 0.8,
        poise: 6,
        stamina: 5,
        projectile: { speed: 34, count: 1, spread: 0, pierce: false, radius: 0.35 },
      },
      {
        name: 'Fan Volley',
        kind: 'projectile',
        pose: 'shoot',
        damage: 0.7,
        windup: 0.16,
        active: 0.02,
        recovery: 0.4,
        comboWindow: 0.3,
        range: 26,
        arc: 0,
        lunge: -0.6,
        knockback: 1.2,
        poise: 8,
        stamina: 10,
        projectile: { speed: 30, count: 3, spread: 0.22, pierce: false, radius: 0.35 },
      },
    ],
    heavy: {
      name: 'Piercing Star',
      kind: 'projectile',
      pose: 'chargeShot',
      damage: 2.8,
      windup: 0.6,
      active: 0.02,
      recovery: 0.4,
      comboWindow: 0.2,
      range: 40,
      arc: 0,
      lunge: -0.4,
      knockback: 3,
      poise: 30,
      stamina: 18,
      projectile: { speed: 46, count: 1, spread: 0, pierce: true, radius: 0.5 },
    },
    ability: {
      kind: 'emberRain',
      name: 'Ember Rain',
      description: 'Call down a storm of burning arrows on your target area.',
      cost: 40,
      cooldown: 7,
      damage: 0.75,
      radius: 4.2,
      duration: 2.2,
    },
  },
};

export const WEAPON_TYPES = Object.keys(WEAPON_FAMILIES) as WeaponType[];

/** Total duration of an attack. */
export function attackDuration(a: AttackDef): number {
  return a.windup + a.active + a.recovery;
}
