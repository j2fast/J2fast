// Dialogue condition evaluation and a small state machine for walking a
// dialogue tree. The game layer executes the resulting actions.

import { Cond, DIALOGUES, Dialogue, DialogueChoice, DialogueNode, NPC_DIALOGUE, NpcDialogueEntry } from '../data/dialogue';
import { QUESTS } from '../data/quests';
import type { GameData } from './state';
import { countItem } from './inventory';
import { canStart, isDone } from './quests';

export function evalCond(data: GameData, c: Cond | undefined): boolean {
  if (!c) return true;
  if (c.active) {
    const [id, stage] = c.active.split(':');
    const st = data.quests.active[id];
    if (!st) return false;
    if (stage !== undefined && st.stage !== Number(stage)) return false;
  }
  if (c.activeFrom) {
    const [id, stage] = c.activeFrom.split(':');
    const st = data.quests.active[id];
    if (!st || st.stage < Number(stage)) return false;
  }
  if (c.done && !isDone(data, c.done)) return false;
  if (c.notDone && isDone(data, c.notDone)) return false;
  if (c.available && !canStart(data, c.available)) return false;
  if (c.flag && !(data.flags[c.flag] > 0)) return false;
  if (c.notFlag && data.flags[c.notFlag] > 0) return false;
  if (c.has) {
    const [id, qty] = c.has.split(':');
    if (countItem(data, id) < Number(qty ?? 1)) return false;
  }
  return true;
}

export function selectDialogue(data: GameData, npcId: string): NpcDialogueEntry | null {
  const entries = NPC_DIALOGUE[npcId];
  if (!entries) return null;
  for (const e of entries) if (evalCond(data, e.cond)) return e;
  return null;
}

/** Does this NPC currently have something quest-related to say? (for the "!" marker) */
export function npcHasQuestMarker(data: GameData, npcId: string): 'new' | 'turnin' | null {
  const entry = selectDialogue(data, npcId);
  if (entry?.quest && !entry.noTalk) return 'turnin';
  const dlg = entry ? DIALOGUES[entry.dialogue] : null;
  if (dlg) {
    for (const node of Object.values(dlg.nodes)) {
      for (const ch of node.choices ?? []) {
        if (ch.cond?.available && evalCond(data, ch.cond)) return 'new';
      }
    }
  }
  return null;
}

export class DialogueRunner {
  readonly dialogue: Dialogue;
  nodeId: string | null;
  /** Actions queued for the game layer to execute. */
  pendingActions: string[] = [];

  constructor(
    private data: GameData,
    dialogueId: string,
  ) {
    const dlg = DIALOGUES[dialogueId];
    if (!dlg) throw new Error(`Unknown dialogue ${dialogueId}`);
    this.dialogue = dlg;
    this.nodeId = dlg.start;
    this.enterNode();
  }

  get node(): DialogueNode | null {
    return this.nodeId ? this.dialogue.nodes[this.nodeId] ?? null : null;
  }

  get finished(): boolean {
    return this.node === null;
  }

  visibleChoices(): DialogueChoice[] {
    const n = this.node;
    if (!n?.choices) return [];
    return n.choices.filter((c) => evalCond(this.data, c.cond));
  }

  private enterNode() {
    const n = this.node;
    if (n?.actions) this.pendingActions.push(...n.actions);
  }

  /** Advance a node without choices. */
  advance(): void {
    const n = this.node;
    if (!n) return;
    if (this.visibleChoices().length > 0) return;
    this.nodeId = n.next ?? null;
    this.enterNode();
  }

  choose(index: number): void {
    const ch = this.visibleChoices()[index];
    if (!ch) return;
    if (ch.actions) this.pendingActions.push(...ch.actions);
    this.nodeId = ch.next ?? null;
    this.enterNode();
  }

  takeActions(): string[] {
    const a = this.pendingActions;
    this.pendingActions = [];
    return a;
  }
}

/** Validate that all dialogue references resolve (used by tests). */
export function validateDialogueData(): string[] {
  const errors: string[] = [];
  for (const [npc, entries] of Object.entries(NPC_DIALOGUE)) {
    for (const e of entries) {
      if (!DIALOGUES[e.dialogue]) errors.push(`${npc}: missing dialogue ${e.dialogue}`);
      if (e.quest && !QUESTS[e.quest]) errors.push(`${npc}: unknown quest ${e.quest}`);
    }
  }
  for (const dlg of Object.values(DIALOGUES)) {
    if (!dlg.nodes[dlg.start]) errors.push(`${dlg.id}: missing start node`);
    for (const [nid, n] of Object.entries(dlg.nodes)) {
      const nexts = [n.next, ...(n.choices ?? []).map((c) => c.next)];
      for (const nx of nexts) if (nx && !dlg.nodes[nx]) errors.push(`${dlg.id}.${nid}: bad next ${nx}`);
      const acts = [...(n.actions ?? []), ...(n.choices ?? []).flatMap((c) => c.actions ?? [])];
      for (const a of acts) {
        const [kind, arg] = a.split(':');
        if (kind === 'startQuest' && !QUESTS[arg]) errors.push(`${dlg.id}: unknown quest ${arg}`);
      }
    }
  }
  return errors;
}

