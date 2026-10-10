// Inventory and equipment operations on GameData.

import { ITEMS, MAX_UPGRADE } from '../data/items';
import type { EquipSlot, GameData, ItemInstance } from './state';
import { newUid } from './state';

export const MAX_EQUIPMENT_ITEMS = 48;

export function findItem(data: GameData, uid: string): ItemInstance | undefined {
  return data.inventory.find((i) => i.uid === uid);
}

export function countItem(data: GameData, id: string): number {
  return data.inventory.filter((i) => i.id === id).reduce((s, i) => s + i.qty, 0);
}

export function isEquipment(id: string): boolean {
  const k = ITEMS[id]?.kind;
  return k === 'weapon' || k === 'armor' || k === 'charm';
}

export function equipmentCount(data: GameData): number {
  return data.inventory.filter((i) => isEquipment(i.id)).length;
}

export interface AddResult {
  added: number;
  /** Coins received instead because the bag was full or the stack capped. */
  converted: number;
  instance?: ItemInstance;
}

/**
 * Add an item. Stackable items merge into one stack up to maxStack; any excess
 * is sold automatically. Equipment always creates a new instance (supply
 * `template` for rarity/affixes).
 */
export function addItem(data: GameData, id: string, qty = 1, template?: Partial<ItemInstance>): AddResult {
  const def = ITEMS[id];
  if (!def || qty <= 0) return { added: 0, converted: 0 };
  if (def.stackable) {
    let stack = data.inventory.find((i) => i.id === id);
    const max = def.maxStack ?? 99;
    const have = stack?.qty ?? 0;
    const add = Math.max(0, Math.min(qty, max - have));
    const excess = qty - add;
    if (add > 0) {
      if (!stack) {
        stack = { uid: newUid(data), id, qty: 0, rarity: 0, level: 0, affixes: [], isNew: true };
        data.inventory.push(stack);
      }
      stack.qty += add;
    }
    const converted = excess * def.value;
    data.player.coins += converted;
    return { added: add, converted, instance: stack };
  }
  if (def.kind === 'key') {
    if (countItem(data, id) > 0) return { added: 0, converted: 0 };
    const inst: ItemInstance = { uid: newUid(data), id, qty: 1, rarity: 0, level: 0, affixes: [], isNew: true };
    data.inventory.push(inst);
    return { added: 1, converted: 0, instance: inst };
  }
  // Equipment
  let added = 0;
  let converted = 0;
  let last: ItemInstance | undefined;
  for (let n = 0; n < qty; n++) {
    const inst: ItemInstance = {
      uid: newUid(data),
      id,
      qty: 1,
      rarity: template?.rarity ?? def.fixedRarity ?? 0,
      level: template?.level ?? 0,
      affixes: template?.affixes ? template.affixes.map((a) => ({ ...a })) : (def.fixedAffixes ?? []).map((a) => ({ ...a })),
      isNew: true,
    };
    if (equipmentCount(data) >= MAX_EQUIPMENT_ITEMS) {
      converted += sellValue(inst);
      continue;
    }
    data.inventory.push(inst);
    added++;
    last = inst;
  }
  data.player.coins += converted;
  return { added, converted, instance: last };
}

/** Remove `qty` of a stackable item id (or the instance with that uid). Returns true if successful. */
export function removeItem(data: GameData, idOrUid: string, qty = 1): boolean {
  const byUid = data.inventory.find((i) => i.uid === idOrUid);
  if (byUid) {
    if (byUid.qty < qty) return false;
    byUid.qty -= qty;
    if (byUid.qty <= 0) {
      unequipUid(data, byUid.uid);
      data.inventory.splice(data.inventory.indexOf(byUid), 1);
    }
    return true;
  }
  if (countItem(data, idOrUid) < qty) return false;
  let left = qty;
  for (const inst of [...data.inventory]) {
    if (inst.id !== idOrUid || left <= 0) continue;
    const take = Math.min(left, inst.qty);
    inst.qty -= take;
    left -= take;
    if (inst.qty <= 0) {
      unequipUid(data, inst.uid);
      data.inventory.splice(data.inventory.indexOf(inst), 1);
    }
  }
  return true;
}

function unequipUid(data: GameData, uid: string) {
  const eq = data.player.equipment;
  for (const k of Object.keys(eq) as EquipSlot[]) if (eq[k] === uid) eq[k] = null;
}

export function slotAccepts(slot: EquipSlot, id: string): boolean {
  const kind = ITEMS[id]?.kind;
  if (slot === 'weapon1' || slot === 'weapon2') return kind === 'weapon';
  return kind === slot;
}

export function equip(data: GameData, uid: string, slot: EquipSlot): boolean {
  const inst = findItem(data, uid);
  if (!inst || !slotAccepts(slot, inst.id)) return false;
  const eq = data.player.equipment;
  // Swapping a weapon between the two weapon slots.
  if (slot === 'weapon1' && eq.weapon2 === uid) eq.weapon2 = eq.weapon1;
  else if (slot === 'weapon2' && eq.weapon1 === uid) eq.weapon1 = eq.weapon2;
  eq[slot] = uid;
  inst.isNew = false;
  return true;
}

export function unequip(data: GameData, slot: EquipSlot): boolean {
  // Always keep at least one weapon equipped.
  const eq = data.player.equipment;
  if (slot === 'weapon1' && !eq.weapon2) return false;
  if (slot === 'weapon2' && !eq.weapon1) return false;
  eq[slot] = null;
  if (slot === 'weapon1') {
    eq.weapon1 = eq.weapon2;
    eq.weapon2 = null;
  }
  data.player.activeWeapon = 0;
  return true;
}

export function isEquipped(data: GameData, uid: string): boolean {
  return Object.values(data.player.equipment).includes(uid);
}

export function activeWeapon(data: GameData): ItemInstance | undefined {
  const eq = data.player.equipment;
  const uid = data.player.activeWeapon === 1 && eq.weapon2 ? eq.weapon2 : eq.weapon1;
  return uid ? findItem(data, uid) : undefined;
}

export function sellValue(inst: ItemInstance): number {
  const def = ITEMS[inst.id];
  if (!def || def.kind === 'key') return 0;
  return Math.round(def.value * (1 + inst.rarity * 0.5) * (1 + 0.25 * inst.level));
}

export function sell(data: GameData, uid: string, qty = 1): number {
  const inst = findItem(data, uid);
  if (!inst || isEquipped(data, uid)) return 0;
  const def = ITEMS[inst.id];
  if (!def || def.kind === 'key') return 0;
  const n = Math.min(qty, inst.qty);
  const coins = sellValue(inst) * n;
  removeItem(data, uid, n);
  data.player.coins += coins;
  return coins;
}

export interface UpgradeCost {
  coins: number;
  ore: number;
  essence: number;
}

export function upgradeCost(inst: ItemInstance): UpgradeCost | null {
  const def = ITEMS[inst.id];
  if (!def || !isEquipment(inst.id) || inst.level >= MAX_UPGRADE) return null;
  const next = inst.level + 1;
  return {
    coins: Math.round(35 * def.tier * Math.pow(next, 1.35) + 15 * inst.rarity),
    ore: next + def.tier,
    essence: next >= 4 ? next - 2 : 0,
  };
}

export function canUpgrade(data: GameData, inst: ItemInstance): boolean {
  const c = upgradeCost(inst);
  if (!c) return false;
  return data.player.coins >= c.coins && countItem(data, 'spirit_ore') >= c.ore && countItem(data, 'hollow_essence') >= c.essence;
}

export function upgrade(data: GameData, uid: string): boolean {
  const inst = findItem(data, uid);
  if (!inst || !canUpgrade(data, inst)) return false;
  const c = upgradeCost(inst)!;
  data.player.coins -= c.coins;
  removeItem(data, 'spirit_ore', c.ore);
  if (c.essence > 0) removeItem(data, 'hollow_essence', c.essence);
  inst.level++;
  return true;
}

export function buy(data: GameData, id: string, price: number, qty = 1): boolean {
  const total = price * qty;
  if (data.player.coins < total || !ITEMS[id]) return false;
  const def = ITEMS[id];
  if (def.stackable && countItem(data, id) + qty > (def.maxStack ?? 99)) return false;
  data.player.coins -= total;
  addItem(data, id, qty);
  return true;
}
