// Quest progression. Pure logic operating on GameData; returns updates the
// game turns into notifications, rewards and audio.

import { ITEMS } from '../data/items';
import { ObjectiveDef, QUESTS, QuestDef } from '../data/quests';
import type { Rng } from '../core/rng';
import type { GameData } from './state';
import { setFlag } from './state';
import { addItem, countItem, removeItem } from './inventory';
import { addXp } from './progression';
import { generateEquipment } from './loot';

export type QuestEventType = 'talk' | 'kill' | 'reach' | 'interact' | 'boss' | 'event' | 'collect';

export interface QuestEvent {
  type: QuestEventType;
  target: string;
  /** Restrict a talk event to a specific quest. */
  quest?: string;
  amount?: number;
}

export type QuestUpdate =
  | { kind: 'started'; quest: QuestDef }
  | { kind: 'progress'; quest: QuestDef; objective: ObjectiveDef; progress: number; count: number }
  | { kind: 'objective'; quest: QuestDef; completed: ObjectiveDef; next: ObjectiveDef | null }
  | { kind: 'completed'; quest: QuestDef; rewards: RewardSummary };

export interface RewardSummary {
  xp: number;
  coins: number;
  items: string[];
  levelsGained: number;
}

export function isDone(data: GameData, id: string): boolean {
  return data.quests.completed.includes(id);
}

export function isActive(data: GameData, id: string): boolean {
  return id in data.quests.active;
}

export function canStart(data: GameData, id: string): boolean {
  const q = QUESTS[id];
  if (!q || isActive(data, id) || isDone(data, id)) return false;
  if (q.prereqs && !q.prereqs.every((p) => isDone(data, p))) return false;
  if (q.requiresFlags && !q.requiresFlags.every((f) => (data.flags[f] ?? 0) > 0)) return false;
  return true;
}

export function currentObjective(data: GameData, id: string): ObjectiveDef | null {
  const st = data.quests.active[id];
  const q = QUESTS[id];
  if (!st || !q) return null;
  return q.objectives[st.stage] ?? null;
}

export function objectiveCount(o: ObjectiveDef): number {
  return o.count ?? 1;
}

export class QuestLog {
  constructor(
    public data: GameData,
    private rng: Rng,
  ) {}

  start(id: string): QuestUpdate[] {
    if (!canStart(this.data, id)) return [];
    const q = QUESTS[id];
    this.data.quests.active[id] = { stage: 0, progress: 0 };
    if (!this.data.quests.tracked || q.kind === 'main') this.data.quests.tracked = id;
    for (const it of q.startItems ?? []) addItem(this.data, it.id, it.qty ?? 1);
    const updates: QuestUpdate[] = [{ kind: 'started', quest: q }];
    // A collect objective may already be satisfied.
    updates.push(...this.checkCollect(id));
    return updates;
  }

  /** Feed a gameplay event to every active quest. */
  notify(ev: QuestEvent): QuestUpdate[] {
    const updates: QuestUpdate[] = [];
    for (const id of Object.keys(this.data.quests.active)) {
      if (ev.quest && ev.quest !== id) continue;
      const obj = currentObjective(this.data, id);
      if (!obj) continue;
      if (!matches(obj, ev)) continue;
      const st = this.data.quests.active[id];
      const need = objectiveCount(obj);
      st.progress = Math.min(need, st.progress + (ev.amount ?? 1));
      if (st.progress >= need) updates.push(...this.advance(id));
      else updates.push({ kind: 'progress', quest: QUESTS[id], objective: obj, progress: st.progress, count: need });
    }
    if (ev.type !== 'collect') updates.push(...this.checkAllCollect());
    return updates;
  }

  /** Re-check collect objectives against the inventory (call after item changes). */
  checkAllCollect(): QuestUpdate[] {
    const out: QuestUpdate[] = [];
    for (const id of Object.keys(this.data.quests.active)) out.push(...this.checkCollect(id));
    return out;
  }

  private checkCollect(id: string): QuestUpdate[] {
    const obj = currentObjective(this.data, id);
    if (!obj || obj.type !== 'collect') return [];
    const have = countItem(this.data, obj.target);
    const need = objectiveCount(obj);
    const st = this.data.quests.active[id];
    if (have >= need) {
      if (obj.consume) removeItem(this.data, obj.target, need);
      return this.advance(id);
    }
    if (have !== st.progress) {
      st.progress = have;
      return [{ kind: 'progress', quest: QUESTS[id], objective: obj, progress: have, count: need }];
    }
    return [];
  }

  private advance(id: string): QuestUpdate[] {
    const q = QUESTS[id];
    const st = this.data.quests.active[id];
    const completed = q.objectives[st.stage];
    st.stage++;
    st.progress = 0;
    if (st.stage >= q.objectives.length) return this.complete(id);
    const next = q.objectives[st.stage];
    const updates: QuestUpdate[] = [{ kind: 'objective', quest: q, completed, next }];
    updates.push(...this.checkCollect(id));
    return updates;
  }

  complete(id: string): QuestUpdate[] {
    const q = QUESTS[id];
    delete this.data.quests.active[id];
    if (!this.data.quests.completed.includes(id)) this.data.quests.completed.push(id);
    const rewards = this.grantRewards(q);
    const updates: QuestUpdate[] = [{ kind: 'completed', quest: q, rewards }];
    if (this.data.quests.tracked === id) this.data.quests.tracked = null;
    for (const n of q.next ?? []) updates.push(...this.start(n));
    if (!this.data.quests.tracked) {
      const first = Object.keys(this.data.quests.active)[0];
      this.data.quests.tracked = first ?? null;
    }
    return updates;
  }

  private grantRewards(q: QuestDef): RewardSummary {
    const r = q.rewards;
    const summary: RewardSummary = { xp: r.xp ?? 0, coins: r.coins ?? 0, items: [], levelsGained: 0 };
    this.data.player.coins += summary.coins;
    summary.levelsGained = addXp(this.data, summary.xp);
    for (const it of r.items ?? []) {
      const def = ITEMS[it.id];
      if (!def) continue;
      if (def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'charm') {
        const gen = generateEquipment(it.id, this.rng, it.rarity ?? 0);
        addItem(this.data, it.id, 1, { rarity: gen.rarity, affixes: gen.affixes });
      } else {
        addItem(this.data, it.id, it.qty ?? 1);
      }
      summary.items.push(it.qty && it.qty > 1 ? `${def.name} ×${it.qty}` : def.name);
    }
    for (const f of r.flags ?? []) setFlag(this.data, f);
    return summary;
  }

  /** Text for the HUD tracker, e.g. "Drive out the Ashen Imps (2/6)". */
  objectiveText(id: string): string {
    const obj = currentObjective(this.data, id);
    if (!obj) return '';
    const need = objectiveCount(obj);
    if (need > 1) {
      const st = this.data.quests.active[id];
      const have = obj.type === 'collect' ? Math.min(need, countItem(this.data, obj.target)) : st.progress;
      return `${obj.text} (${have}/${need})`;
    }
    return obj.text;
  }
}

function matches(obj: ObjectiveDef, ev: QuestEvent): boolean {
  if (obj.type !== ev.type) return false;
  if (obj.type === 'kill' && obj.target === 'any') return true;
  return obj.target === ev.target;
}
