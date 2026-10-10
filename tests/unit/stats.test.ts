import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { addItem, equip } from '../../src/systems/inventory';
import { baseStats, computeDamage, computeStats, defenseFactor, itemStats } from '../../src/systems/stats';
import { freshGame } from './helpers';

describe('stats', () => {
  it('base stats grow with level', () => {
    expect(baseStats(5).maxHp).toBeGreaterThan(baseStats(1).maxHp);
    expect(baseStats(5).atk).toBeGreaterThan(baseStats(1).atk);
    expect(baseStats(99).maxHp).toBe(baseStats(20).maxHp);
  });

  it('includes active weapon, armor and skills', () => {
    const { data } = freshGame();
    const base = baseStats(1);
    const s = computeStats(data);
    expect(s.atk).toBe(base.atk + 6);
    expect(s.def).toBe(base.def + 2);
    data.player.skills.vitality = 2;
    data.player.skills.might = 1;
    const s2 = computeStats(data);
    expect(s2.maxHp).toBe(base.maxHp + 30);
    expect(s2.atkPct).toBeCloseTo(0.05);
  });

  it('only the active weapon contributes', () => {
    const { data } = freshGame();
    const bow = addItem(data, 'bow_ember').instance!;
    equip(data, bow.uid, 'weapon2');
    const a0 = computeStats(data).atk;
    data.player.activeWeapon = 1;
    const a1 = computeStats(data).atk;
    expect(a1 - a0).toBe(13 - 6);
  });

  it('rarity and upgrades scale item stats', () => {
    const common = itemStats({ uid: 'x', id: 'katana_ashwood', qty: 1, rarity: 0, level: 0, affixes: [] }).atk!;
    const epic = itemStats({ uid: 'x', id: 'katana_ashwood', qty: 1, rarity: 3, level: 0, affixes: [] }).atk!;
    const up = itemStats({ uid: 'x', id: 'katana_ashwood', qty: 1, rarity: 0, level: 5, affixes: [] }).atk!;
    expect(epic).toBeGreaterThan(common);
    expect(up).toBeCloseTo(common * 1.6);
  });

  it('defense reduces damage but never below 1', () => {
    expect(defenseFactor(0)).toBe(1);
    expect(defenseFactor(20)).toBeLessThan(1);
    const r = computeDamage({ atk: 1, mult: 0.1, targetDef: 1000, rng: new Rng(1) });
    expect(r.amount).toBe(1);
  });

  it('crits multiply damage', () => {
    const normal = computeDamage({ atk: 100, mult: 1, targetDef: 0, rng: new Rng(3), crit: 0 });
    const crit = computeDamage({ atk: 100, mult: 1, targetDef: 0, rng: new Rng(3), forceCrit: true, critDmg: 1 });
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBeGreaterThan(normal.amount * 1.7);
  });
});
