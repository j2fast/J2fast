// Randomized loot generation: rarity rolls, affixes and enemy drop tables.

import { AFFIX_POOLS, ITEMS, ItemDef } from '../data/items';
import type { EnemyDef } from '../data/enemies';
import type { Rng } from '../core/rng';
import type { Affix } from './state';

export const RARITY_WEIGHTS = [60, 26, 10, 3.5, 0.5];

export function rollRarity(rng: Rng, luck = 0): number {
  const w = RARITY_WEIGHTS.map((v, i) => (i === 0 ? Math.max(5, v - luck * 30) : v * (1 + luck * i)));
  return rng.weighted(w.map((weight, value) => ({ weight, value })));
}

/** Random affixes for an equipment template at the given rarity. */
export function rollAffixes(def: ItemDef, rarity: number, rng: Rng): Affix[] {
  const affixes: Affix[] = (def.fixedAffixes ?? []).map((a) => ({ ...a }));
  if (def.kind !== 'weapon' && def.kind !== 'armor' && def.kind !== 'charm') return affixes;
  const pool = AFFIX_POOLS[def.kind].filter((p) => !affixes.some((a) => a.stat === p.stat));
  const count = Math.min(pool.length, Math.min(3, rarity));
  const tierScale = 1 + 0.5 * (def.tier - 1);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const p = pool.splice(idx, 1)[0];
    let v = rng.range(p.min, p.max) * tierScale * (rarity >= 4 ? 1.25 : 1);
    v = p.stat === 'maxHp' || p.stat === 'def' ? Math.round(v) : Math.round(v * 1000) / 1000;
    affixes.push({ stat: p.stat, value: v });
  }
  return affixes;
}

export interface GeneratedEquipment {
  id: string;
  rarity: number;
  affixes: Affix[];
}

export function generateEquipment(id: string, rng: Rng, rarity?: number): GeneratedEquipment {
  const def = ITEMS[id];
  const r = def.fixedRarity ?? rarity ?? rollRarity(rng);
  return { id, rarity: r, affixes: rollAffixes(def, r, rng) };
}

/** Equipment eligible to drop for an area tier (excludes unique boss items). */
export function droppableEquipment(maxTier: number): ItemDef[] {
  return Object.values(ITEMS).filter(
    (d) => (d.kind === 'weapon' || d.kind === 'armor' || d.kind === 'charm') && !d.fixedRarity && d.tier <= maxTier,
  );
}

export function rollEquipmentDrop(rng: Rng, areaTier: number): GeneratedEquipment {
  const pool = droppableEquipment(areaTier);
  const entries = pool.map((d) => ({ weight: d.tier === areaTier ? 3 : 1, value: d.id }));
  const id = rng.weighted(entries);
  return generateEquipment(id, rng, rollRarity(rng, (areaTier - 1) * 0.15));
}

export interface DropResult {
  coins: number;
  items: { id: string; qty: number }[];
  equipment: GeneratedEquipment[];
}

export function rollEnemyDrops(def: EnemyDef, rng: Rng, areaTier: number, coinMult = 1): DropResult {
  const coins = Math.round(rng.int(def.coins[0], def.coins[1]) * coinMult);
  const items: { id: string; qty: number }[] = [];
  for (const d of def.drops) {
    if (rng.next() < d.chance) {
      const qty = d.qty ? rng.int(d.qty[0], d.qty[1]) : 1;
      items.push({ id: d.item, qty });
    }
  }
  const equipment: GeneratedEquipment[] = [];
  if (def.equipChance > 0 && rng.next() < def.equipChance) equipment.push(rollEquipmentDrop(rng, areaTier));
  return { coins, items, equipment };
}
