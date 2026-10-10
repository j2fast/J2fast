// Save serialization with checksum, validation/sanitization, migrations,
// backups and slot management.

import { ITEMS, MAX_UPGRADE, StatKey, STAT_LABELS } from '../data/items';
import { QUESTS } from '../data/quests';
import { SKILL_BY_ID } from '../data/skills';
import { AREA_IDS } from '../data/areaIds';
import type { KeyValueStore } from '../core/storage';
import { clamp } from '../core/math';
import { EQUIP_SLOTS, GameData, ItemInstance, SAVE_VERSION, newGameData } from './state';
import { MAX_LEVEL } from './stats';

export const SAVE_FORMAT = 'lanternbound-save';
export const SLOTS = ['auto', '1', '2', '3'] as const;
export type SlotId = (typeof SLOTS)[number];

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function serialize(data: GameData): string {
  const payload = JSON.stringify(data);
  return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, checksum: fnv1a(payload), payload });
}

export type LoadResult = { ok: true; data: GameData; warnings: string[] } | { ok: false; error: string };

export function deserialize(text: string | null): LoadResult {
  if (!text) return { ok: false, error: 'No save data found.' };
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save file is not readable (corrupted JSON).' };
  }
  if (!envelope || typeof envelope !== 'object') return { ok: false, error: 'Save file has an invalid structure.' };
  const env = envelope as Record<string, unknown>;
  if (env.format !== SAVE_FORMAT || typeof env.payload !== 'string') {
    return { ok: false, error: 'This is not a Lanternbound save file.' };
  }
  if (typeof env.version !== 'number' || env.version > SAVE_VERSION) {
    return { ok: false, error: 'Save was made by a newer version of the game.' };
  }
  if (fnv1a(env.payload) !== env.checksum) {
    return { ok: false, error: 'Save file failed its integrity check (corrupted or edited).' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(env.payload);
  } catch {
    return { ok: false, error: 'Save contents are corrupted.' };
  }
  const migrated = migrate(raw, env.version);
  const { data, warnings } = sanitizeGameData(migrated);
  return { ok: true, data, warnings };
}

/** Upgrade older save structures. Version 1 is current, so this is the hook for future formats. */
export function migrate(raw: unknown, _fromVersion: number): unknown {
  return raw;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, def: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Convert untrusted data into a valid GameData. Anything invalid is replaced
 * with safe defaults and reported as a warning rather than crashing the game.
 */
export function sanitizeGameData(raw: unknown): { data: GameData; warnings: string[] } {
  const warnings: string[] = [];
  const d = newGameData();
  if (!isObj(raw)) {
    warnings.push('Save data missing; started fresh.');
    return { data: d, warnings };
  }
  d.createdAt = finite(raw.createdAt, d.createdAt, 0);
  d.savedAt = finite(raw.savedAt, d.savedAt, 0);
  d.playTime = finite(raw.playTime, 0, 0);
  d.nextUid = Math.floor(finite(raw.nextUid, 1, 1));
  d.ending = raw.ending === true;

  // Inventory
  const seen = new Set<string>();
  if (Array.isArray(raw.inventory)) {
    for (const it of raw.inventory) {
      if (!isObj(it) || typeof it.id !== 'string' || typeof it.uid !== 'string') continue;
      if (!ITEMS[it.id]) {
        warnings.push(`Removed unknown item "${String(it.id)}".`);
        continue;
      }
      if (seen.has(it.uid)) continue;
      seen.add(it.uid);
      const def = ITEMS[it.id];
      const inst: ItemInstance = {
        uid: it.uid,
        id: it.id,
        qty: Math.floor(finite(it.qty, 1, 1, def.maxStack ?? 1)),
        rarity: Math.floor(finite(it.rarity, 0, 0, 4)),
        level: Math.floor(finite(it.level, 0, 0, MAX_UPGRADE)),
        affixes: Array.isArray(it.affixes)
          ? it.affixes
              .filter((a): a is { stat: StatKey; value: number } => isObj(a) && typeof a.stat === 'string' && a.stat in STAT_LABELS && typeof a.value === 'number' && Number.isFinite(a.value))
              .slice(0, 5)
              .map((a) => ({ stat: a.stat, value: a.value }))
          : [],
        isNew: it.isNew === true,
      };
      d.inventory.push(inst);
      const n = Number(inst.uid.slice(1));
      if (Number.isFinite(n) && n >= d.nextUid) d.nextUid = n + 1;
    }
  }

  // Player
  const p = isObj(raw.player) ? raw.player : {};
  d.player.level = Math.floor(finite(p.level, 1, 1, MAX_LEVEL));
  d.player.xp = Math.floor(finite(p.xp, 0, 0));
  d.player.coins = Math.floor(finite(p.coins, 0, 0, 9_999_999));
  d.player.hpFrac = finite(p.hpFrac, 1, 0.05, 1);
  d.player.spirit = finite(p.spirit, 0, 0, 100);
  d.player.skillPoints = Math.floor(finite(p.skillPoints, 0, 0, MAX_LEVEL));
  if (isObj(p.skills)) {
    for (const [k, v] of Object.entries(p.skills)) {
      const sk = SKILL_BY_ID[k];
      if (sk && typeof v === 'number') d.player.skills[k] = Math.floor(clamp(v, 0, sk.maxRank));
    }
  }
  const area = typeof p.area === 'string' && (AREA_IDS as readonly string[]).includes(p.area) ? p.area : 'village';
  if (area !== p.area) warnings.push('Saved location was invalid; returning to the village.');
  d.player.area = area;
  d.player.spawn = typeof p.spawn === 'string' ? p.spawn : 'start';
  if (Array.isArray(p.pos) && p.pos.length === 3 && p.pos.every((x) => typeof x === 'number' && Number.isFinite(x)) && area === p.area) {
    d.player.pos = [p.pos[0], p.pos[1], p.pos[2]] as [number, number, number];
  }
  d.player.activeWeapon = p.activeWeapon === 1 ? 1 : 0;
  const eq = isObj(p.equipment) ? p.equipment : {};
  for (const slot of EQUIP_SLOTS) {
    const uid = eq[slot];
    if (typeof uid !== 'string') continue;
    const inst = d.inventory.find((i) => i.uid === uid);
    const kind = inst ? ITEMS[inst.id].kind : null;
    const ok = inst && ((slot.startsWith('weapon') && kind === 'weapon') || kind === slot);
    if (ok) d.player.equipment[slot] = uid;
    else warnings.push(`Unequipped invalid item in ${slot}.`);
  }
  if (d.player.equipment.weapon1 === d.player.equipment.weapon2) d.player.equipment.weapon2 = null;
  if (!d.player.equipment.weapon1 && d.player.equipment.weapon2) {
    d.player.equipment.weapon1 = d.player.equipment.weapon2;
    d.player.equipment.weapon2 = null;
  }
  if (!d.player.equipment.weapon1) {
    const anyWeapon = d.inventory.find((i) => ITEMS[i.id].kind === 'weapon');
    if (anyWeapon) d.player.equipment.weapon1 = anyWeapon.uid;
    else {
      const uid = 'i' + d.nextUid++;
      d.inventory.push({ uid, id: 'katana_wanderer', qty: 1, rarity: 0, level: 0, affixes: [] });
      d.player.equipment.weapon1 = uid;
      warnings.push('No weapon found; a replacement katana was provided.');
    }
  }
  if (d.player.activeWeapon === 1 && !d.player.equipment.weapon2) d.player.activeWeapon = 0;

  // Quests
  const q = isObj(raw.quests) ? raw.quests : {};
  d.quests.completed = strArr(q.completed).filter((id) => QUESTS[id]);
  if (isObj(q.active)) {
    for (const [id, st] of Object.entries(q.active)) {
      const def = QUESTS[id];
      if (!def || d.quests.completed.includes(id) || !isObj(st)) continue;
      d.quests.active[id] = {
        stage: Math.floor(finite(st.stage, 0, 0, def.objectives.length - 1)),
        progress: Math.floor(finite(st.progress, 0, 0, 999)),
      };
    }
  }
  d.quests.tracked = typeof q.tracked === 'string' && d.quests.active[q.tracked] ? q.tracked : Object.keys(d.quests.active)[0] ?? null;

  // Flags / world / stats
  if (isObj(raw.flags)) for (const [k, v] of Object.entries(raw.flags)) if (typeof v === 'number' && Number.isFinite(v)) d.flags[k] = v;
  const w = isObj(raw.world) ? raw.world : {};
  d.world.openedChests = strArr(w.openedChests);
  d.world.litBraziers = strArr(w.litBraziers);
  d.world.bossesDefeated = strArr(w.bossesDefeated);
  d.world.visitedAreas = strArr(w.visitedAreas);
  d.world.collected = strArr(w.collected);
  const s = isObj(raw.stats) ? raw.stats : {};
  d.stats.kills = Math.floor(finite(s.kills, 0, 0));
  d.stats.deaths = Math.floor(finite(s.deaths, 0, 0));
  d.stats.damageDealt = Math.floor(finite(s.damageDealt, 0, 0));
  d.stats.itemsFound = Math.floor(finite(s.itemsFound, 0, 0));

  // A brand-new game with no quests should at least have the opening quest.
  if (d.quests.completed.length === 0 && Object.keys(d.quests.active).length === 0) {
    d.quests.active.mq_oath = { stage: 0, progress: 0 };
    d.quests.tracked = 'mq_oath';
  }
  return { data: d, warnings };
}

export interface SlotSummary {
  slot: SlotId;
  exists: boolean;
  corrupt: boolean;
  error?: string;
  level?: number;
  area?: string;
  playTime?: number;
  savedAt?: number;
  quest?: string;
  ending?: boolean;
}

export class SaveManager {
  constructor(private store: KeyValueStore) {}

  key(slot: SlotId): string {
    return `lanternbound.save.${slot}`;
  }

  save(slot: SlotId, data: GameData): boolean {
    data.savedAt = Date.now();
    const text = serialize(data);
    const prev = this.store.get(this.key(slot));
    if (prev && deserialize(prev).ok) this.store.set(this.key(slot) + '.bak', prev);
    return this.store.set(this.key(slot), text);
  }

  /** Load a slot, falling back to its backup if the main copy is damaged. */
  load(slot: SlotId): LoadResult & { usedBackup?: boolean } {
    const main = deserialize(this.store.get(this.key(slot)));
    if (main.ok) return main;
    const bak = deserialize(this.store.get(this.key(slot) + '.bak'));
    if (bak.ok) return { ...bak, warnings: [...bak.warnings, `Main save was damaged (${main.error}); loaded backup.`], usedBackup: true };
    return main;
  }

  delete(slot: SlotId): void {
    this.store.remove(this.key(slot));
    this.store.remove(this.key(slot) + '.bak');
  }

  summary(slot: SlotId): SlotSummary {
    const text = this.store.get(this.key(slot));
    if (!text) return { slot, exists: false, corrupt: false };
    const r = this.load(slot);
    if (!r.ok) return { slot, exists: true, corrupt: true, error: r.error };
    const d = r.data;
    const tracked = d.quests.tracked ? QUESTS[d.quests.tracked]?.title : undefined;
    return {
      slot,
      exists: true,
      corrupt: false,
      level: d.player.level,
      area: d.player.area,
      playTime: d.playTime,
      savedAt: d.savedAt,
      quest: d.ending ? 'Story complete' : tracked,
      ending: d.ending,
    };
  }

  /** Most recently saved valid slot, for "Continue". */
  latest(): SlotId | null {
    let best: SlotId | null = null;
    let bestTime = -1;
    for (const s of SLOTS) {
      const sum = this.summary(s);
      if (sum.exists && !sum.corrupt && (sum.savedAt ?? 0) > bestTime) {
        best = s;
        bestTime = sum.savedAt ?? 0;
      }
    }
    return best;
  }

  exportSlot(slot: SlotId): string | null {
    return this.store.get(this.key(slot));
  }

  importToSlot(slot: SlotId, text: string): LoadResult {
    const r = deserialize(text);
    if (r.ok) this.store.set(this.key(slot), text);
    return r;
  }
}
