import { describe, expect, it } from 'vitest';
import { nextAreaToward, AREA_IDS, AREA_LINKS } from '../../src/data/areaIds';
import { ENEMIES } from '../../src/data/enemies';
import { ITEMS } from '../../src/data/items';
import { QUESTS } from '../../src/data/quests';
import { SKILLS } from '../../src/data/skills';
import { WEAPON_FAMILIES, WEAPON_TYPES, attackDuration } from '../../src/data/weapons';

describe('data integrity', () => {
  it('every weapon family has a combo, heavy and ability with sane timings', () => {
    for (const t of WEAPON_TYPES) {
      const w = WEAPON_FAMILIES[t];
      expect(w.light.length).toBeGreaterThanOrEqual(3);
      for (const a of [...w.light, w.heavy]) {
        expect(attackDuration(a)).toBeGreaterThan(0.1);
        expect(attackDuration(a)).toBeLessThan(2);
        expect(a.damage).toBeGreaterThan(0);
        if (a.kind === 'projectile') expect(a.projectile).toBeDefined();
      }
      expect(w.ability.cost).toBeGreaterThan(0);
    }
  });

  it('every weapon item references a weapon family', () => {
    for (const it of Object.values(ITEMS)) {
      if (it.kind === 'weapon') expect(WEAPON_FAMILIES[it.weaponType!]).toBeDefined();
    }
    for (const t of WEAPON_TYPES) {
      expect(Object.values(ITEMS).some((i) => i.weaponType === t)).toBe(true);
    }
  });

  it('enemy drops, summons and boss rewards reference real items/enemies', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const d of e.drops) expect(ITEMS[d.item], d.item).toBeDefined();
      for (const a of e.attacks) if (a.summon) expect(ENEMIES[a.summon.enemy]).toBeDefined();
      for (const r of e.boss?.reward ?? []) expect(ITEMS[r], r).toBeDefined();
      expect(e.boss ? e.attacks.length >= 4 : true).toBe(true);
    }
  });

  it('quest objectives reference real things', () => {
    for (const q of Object.values(QUESTS)) {
      for (const o of q.objectives) {
        if (o.type === 'kill' && o.target !== 'any') expect(ENEMIES[o.target], o.target).toBeDefined();
        if (o.type === 'boss') expect(ENEMIES[o.target]?.boss, o.target).toBeDefined();
        if (o.type === 'collect') expect(ITEMS[o.target]).toBeDefined();
        if (o.area) expect(AREA_IDS).toContain(o.area);
      }
      for (const r of q.rewards.items ?? []) expect(ITEMS[r.id], r.id).toBeDefined();
    }
  });

  it('skills have positive ranks', () => {
    for (const s of SKILLS) expect(s.maxRank).toBeGreaterThan(0);
  });

  it('area graph is connected and routable', () => {
    for (const a of AREA_IDS) for (const b of AREA_LINKS[a]) expect(AREA_LINKS[b]).toContain(a);
    expect(nextAreaToward('catacombs', 'summit')).toBe('marsh');
    expect(nextAreaToward('village', 'catacombs')).toBe('marsh');
    expect(nextAreaToward('bamboo', 'bamboo')).toBeNull();
  });
});
