import { describe, expect, it } from 'vitest';
import {
  MAX_EQUIPMENT_ITEMS,
  activeWeapon,
  addItem,
  buy,
  canUpgrade,
  countItem,
  equip,
  removeItem,
  sell,
  unequip,
  upgrade,
  upgradeCost,
} from '../../src/systems/inventory';
import { freshGame } from './helpers';

describe('inventory', () => {
  it('stacks consumables and caps them', () => {
    const { data } = freshGame();
    const coins = data.player.coins;
    addItem(data, 'dango', 4);
    addItem(data, 'dango', 4);
    expect(countItem(data, 'dango')).toBe(8);
    const r = addItem(data, 'dango', 5);
    expect(r.added).toBe(2);
    expect(countItem(data, 'dango')).toBe(10);
    expect(data.player.coins).toBe(coins + 3 * 10);
  });

  it('removes items by id and by uid', () => {
    const { data } = freshGame();
    addItem(data, 'spirit_ore', 7);
    expect(removeItem(data, 'spirit_ore', 3)).toBe(true);
    expect(countItem(data, 'spirit_ore')).toBe(4);
    expect(removeItem(data, 'spirit_ore', 9)).toBe(false);
    expect(removeItem(data, 'spirit_ore', 4)).toBe(true);
    expect(data.inventory.some((i) => i.id === 'spirit_ore')).toBe(false);
  });

  it('key items are unique', () => {
    const { data } = freshGame();
    addItem(data, 'ember_core_1');
    addItem(data, 'ember_core_1');
    expect(countItem(data, 'ember_core_1')).toBe(1);
  });

  it('equips to valid slots only', () => {
    const { data } = freshGame();
    const charm = addItem(data, 'charm_fox').instance!;
    expect(equip(data, charm.uid, 'armor')).toBe(false);
    expect(equip(data, charm.uid, 'charm')).toBe(true);
    expect(data.player.equipment.charm).toBe(charm.uid);
  });

  it('swapping a weapon between slots keeps both', () => {
    const { data } = freshGame();
    const w1 = data.player.equipment.weapon1!;
    const bow = addItem(data, 'bow_willow').instance!;
    equip(data, bow.uid, 'weapon2');
    equip(data, bow.uid, 'weapon1');
    expect(data.player.equipment.weapon1).toBe(bow.uid);
    expect(data.player.equipment.weapon2).toBe(w1);
  });

  it('never leaves the player without a weapon', () => {
    const { data } = freshGame();
    expect(unequip(data, 'weapon1')).toBe(false);
    expect(activeWeapon(data)).toBeDefined();
  });

  it('cannot sell equipped items; selling adds coins', () => {
    const { data } = freshGame();
    expect(sell(data, data.player.equipment.weapon1!)).toBe(0);
    const extra = addItem(data, 'katana_ashwood', 1, { rarity: 2, affixes: [] }).instance!;
    const before = data.player.coins;
    const got = sell(data, extra.uid);
    expect(got).toBeGreaterThan(0);
    expect(data.player.coins).toBe(before + got);
  });

  it('upgrades consume coins and materials', () => {
    const { data } = freshGame();
    const w = activeWeapon(data)!;
    expect(canUpgrade(data, w)).toBe(false);
    const cost = upgradeCost(w)!;
    data.player.coins = cost.coins;
    addItem(data, 'spirit_ore', cost.ore);
    expect(upgrade(data, w.uid)).toBe(true);
    expect(w.level).toBe(1);
    expect(data.player.coins).toBe(0);
    expect(countItem(data, 'spirit_ore')).toBe(0);
  });

  it('high upgrades need hollow essence and cap at +5', () => {
    const { data } = freshGame();
    const w = activeWeapon(data)!;
    w.level = 3;
    expect(upgradeCost(w)!.essence).toBeGreaterThan(0);
    w.level = 5;
    expect(upgradeCost(w)).toBeNull();
  });

  it('buying respects coins and stack caps', () => {
    const { data } = freshGame();
    data.player.coins = 100;
    expect(buy(data, 'dango', 25, 2)).toBe(true);
    expect(data.player.coins).toBe(50);
    expect(buy(data, 'dango', 25, 9)).toBe(false);
    expect(buy(data, 'ember_incense', 999)).toBe(false);
  });

  it('a full bag converts equipment to coins', () => {
    const { data } = freshGame();
    while (data.inventory.length < MAX_EQUIPMENT_ITEMS) addItem(data, 'charm_fox');
    const before = data.player.coins;
    const r = addItem(data, 'charm_fox');
    expect(r.added).toBe(0);
    expect(data.player.coins).toBeGreaterThan(before);
  });
});
