import { describe, expect, it } from 'vitest';
import { DialogueRunner, evalCond, npcHasQuestMarker, selectDialogue, validateDialogueData } from '../../src/systems/dialogue';
import { addItem } from '../../src/systems/inventory';
import { freshGame } from './helpers';

describe('dialogue', () => {
  it('all dialogue references are valid', () => {
    expect(validateDialogueData()).toEqual([]);
  });

  it('selects quest dialogue by state', () => {
    const { data } = freshGame();
    expect(selectDialogue(data, 'tsugumi')!.dialogue).toBe('tsugumi_intro');
    data.quests.active.mq_oath.stage = 3;
    expect(selectDialogue(data, 'tsugumi')!.dialogue).toBe('tsugumi_oath_wait');
    data.quests.active.mq_oath.stage = 8;
    expect(selectDialogue(data, 'tsugumi')!.dialogue).toBe('tsugumi_oath_done');
  });

  it('evaluates item conditions', () => {
    const { data } = freshGame();
    expect(evalCond(data, { has: 'spirit_ore:5' })).toBe(false);
    addItem(data, 'spirit_ore', 5);
    expect(evalCond(data, { has: 'spirit_ore:5' })).toBe(true);
  });

  it('walks a branching dialogue and collects actions', () => {
    const { data } = freshGame();
    const r = new DialogueRunner(data, 'tsugumi_intro');
    r.advance();
    r.advance();
    expect(r.visibleChoices().length).toBe(2);
    r.choose(0);
    expect(r.node!.text).toContain('Yomikage');
    r.advance();
    r.advance();
    expect(r.finished).toBe(true);
  });

  it('hides choices whose conditions fail', () => {
    const { data } = freshGame();
    const r = new DialogueRunner(data, 'kanetsugu_menu');
    expect(r.visibleChoices().map((c) => c.text)).not.toContain('Need any help?');
    data.quests.completed.push('mq_oath');
    expect(r.visibleChoices().map((c) => c.text)).toContain('Need any help?');
    expect(npcHasQuestMarker(data, 'kanetsugu')).toBe('new');
  });

  it('choice actions are queued', () => {
    const { data } = freshGame();
    data.quests.completed.push('mq_oath');
    const r = new DialogueRunner(data, 'ohana_menu');
    const idx = r.visibleChoices().findIndex((c) => c.next === 'wisps');
    r.choose(idx);
    r.choose(0);
    expect(r.takeActions()).toEqual(['startQuest:sq_wisps']);
    expect(r.finished).toBe(true);
  });
});
