// Ohana's tea-house stock. Equipment entries unlock with story progress.

import type { Cond } from './dialogue';

export interface ShopEntry {
  item: string;
  price: number;
  rarity?: number;
  requires?: Cond;
  /** Limited stock for equipment (one purchase each). */
  once?: boolean;
}

export const SHOP_STOCK: ShopEntry[] = [
  { item: 'dango', price: 25 },
  { item: 'spirit_tea', price: 30 },
  { item: 'ember_incense', price: 70, requires: { done: 'mq_oath' } },
  { item: 'spirit_ore', price: 40 },
  { item: 'hollow_essence', price: 160, requires: { flag: 'marsh_open' } },
  { item: 'tanto_twinfang', price: 90, rarity: 1, once: true },
  { item: 'kanabo_oak', price: 110, rarity: 1, once: true },
  { item: 'armor_warden', price: 120, rarity: 1, once: true },
  { item: 'charm_tortoise', price: 100, rarity: 1, once: true },
  { item: 'katana_ashwood', price: 260, rarity: 2, once: true, requires: { flag: 'marsh_open' } },
  { item: 'naginata_crescent', price: 280, rarity: 2, once: true, requires: { flag: 'marsh_open' } },
  { item: 'bow_ember', price: 260, rarity: 2, once: true, requires: { flag: 'marsh_open' } },
  { item: 'armor_lacquer', price: 300, rarity: 2, once: true, requires: { flag: 'marsh_open' } },
  { item: 'charm_ember', price: 280, rarity: 2, once: true, requires: { flag: 'marsh_open' } },
  { item: 'katana_moonlit', price: 650, rarity: 2, once: true, requires: { flag: 'summit_open' } },
  { item: 'kanabo_mountain', price: 900, rarity: 2, once: true, requires: { flag: 'summit_open' } },
  { item: 'armor_emberguard', price: 850, rarity: 2, once: true, requires: { flag: 'summit_open' } },
  { item: 'charm_moonmirror', price: 900, rarity: 2, once: true, requires: { flag: 'summit_open' } },
];
