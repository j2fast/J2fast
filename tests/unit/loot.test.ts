import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { ENEMIES } from '../../src/data/enemies';
import { ITEMS } from '../../src/data/items';
import { generateEquipment, rollEnemyDrops, rollEquipmentDrop, rollRarity } from '../../src/systems/loot';

describe('loot', () => {
  it('is deterministic for a given seed', () => {
    const a = rollEquipmentDrop(new Rng(7), 2);
    const b = rollEquipmentDrop(new Rng(7), 2);
    expect(a).toEqual(b);
  });

  it('rarity distribution favours common items', () => {
    const rng = new Rng(11);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) counts[rollRarity(rng)]++;
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[4]);
  });

  it('affix count follows rarity and has no duplicates', () => {
    const rng = new Rng(5);
    for (let r = 0; r <= 4; r++) {
      const g = generateEquipment('katana_ashwood', rng, r);
      expect(g.affixes.length).toBe(Math.min(3, r));
      expect(new Set(g.affixes.map((a) => a.stat)).size).toBe(g.affixes.length);
    }
  });

  it('unique items keep their fixed rarity and affixes', () => {
    const g = generateEquipment('katana_lanternfire', new Rng(1), 0);
    expect(g.rarity).toBe(4);
    expect(g.affixes.some((a) => a.stat === 'burnChance')).toBe(true);
  });

  it('dropped equipment never exceeds the area tier and excludes uniques', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 300; i++) {
      const g = rollEquipmentDrop(rng, 2);
      expect(ITEMS[g.id].tier).toBeLessThanOrEqual(2);
      expect(ITEMS[g.id].fixedRarity).toBeUndefined();
    }
  });

  it('enemy drops respect coin ranges', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const d = rollEnemyDrops(ENEMIES.ashen_imp, rng, 1);
      expect(d.coins).toBeGreaterThanOrEqual(3);
      expect(d.coins).toBeLessThanOrEqual(7);
    }
  });
});
