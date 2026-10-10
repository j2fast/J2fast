import { describe, expect, it } from 'vitest';
import { QUESTS } from '../../src/data/quests';
import { addItem, countItem } from '../../src/systems/inventory';
import { canStart, currentObjective, isDone } from '../../src/systems/quests';
import { freshGame } from './helpers';

describe('quests', () => {
  it('new game starts the opening quest with its start items', () => {
    const { data } = freshGame();
    expect(data.quests.active.mq_oath).toEqual({ stage: 0, progress: 0 });
    expect(data.quests.tracked).toBe('mq_oath');
    expect(countItem(data, 'bow_willow')).toBe(1);
  });

  it('advances through the tutorial quest in order', () => {
    const { data, quests } = freshGame();
    // Events for a later objective are ignored.
    quests.notify({ type: 'event', target: 'tut_dodge' });
    expect(data.quests.active.mq_oath.stage).toBe(0);
    quests.notify({ type: 'talk', target: 'tsugumi', quest: 'mq_oath' });
    quests.notify({ type: 'reach', target: 'training_ground' });
    quests.notify({ type: 'event', target: 'tut_attack' });
    quests.notify({ type: 'event', target: 'tut_heavy' });
    quests.notify({ type: 'event', target: 'tut_dodge' });
    quests.notify({ type: 'event', target: 'tut_lockon' });
    const p = quests.notify({ type: 'kill', target: 'training_dummy' });
    expect(p[0].kind).toBe('progress');
    expect(quests.objectiveText('mq_oath')).toContain('(1/3)');
    quests.notify({ type: 'kill', target: 'training_dummy' });
    quests.notify({ type: 'kill', target: 'training_dummy' });
    quests.notify({ type: 'event', target: 'tut_swap' });
    expect(currentObjective(data, 'mq_oath')!.target).toBe('tsugumi');
    const coins = data.player.coins;
    const ups = quests.notify({ type: 'talk', target: 'tsugumi', quest: 'mq_oath' });
    expect(ups.some((u) => u.kind === 'completed')).toBe(true);
    expect(ups.some((u) => u.kind === 'started' && u.quest.id === 'mq_bamboo')).toBe(true);
    expect(isDone(data, 'mq_oath')).toBe(true);
    expect(data.player.coins).toBe(coins + 60);
    expect(countItem(data, 'dango')).toBe(3);
    expect(data.quests.tracked).toBe('mq_bamboo');
  });

  it('talk events scoped to another quest do not progress this one', () => {
    const { data, quests } = freshGame();
    quests.notify({ type: 'talk', target: 'tsugumi', quest: 'sq_ore' });
    expect(data.quests.active.mq_oath.stage).toBe(0);
  });

  it('respects prerequisites and flags', () => {
    const { data, quests } = freshGame();
    expect(canStart(data, 'sq_ore')).toBe(false);
    data.quests.completed.push('mq_oath', 'mq_bamboo');
    expect(canStart(data, 'sq_ore')).toBe(true);
    expect(canStart(data, 'sq_parcel')).toBe(false);
    data.flags.marsh_open = 1;
    expect(canStart(data, 'sq_parcel')).toBe(true);
    quests.start('sq_parcel');
    expect(countItem(data, 'tea_parcel')).toBe(1);
    expect(canStart(data, 'sq_parcel')).toBe(false);
  });

  it('collect objectives track the inventory', () => {
    const { data, quests } = freshGame();
    data.quests.completed.push('mq_oath');
    addItem(data, 'spirit_ore', 2);
    quests.start('sq_ore');
    expect(data.quests.active.sq_ore.progress).toBe(2);
    addItem(data, 'spirit_ore', 3);
    const ups = quests.checkAllCollect();
    expect(ups.some((u) => u.kind === 'objective')).toBe(true);
    expect(data.quests.active.sq_ore.stage).toBe(1);
  });

  it('completion grants equipment rewards and flags', () => {
    const { data, quests } = freshGame();
    data.quests.completed.push('mq_oath');
    data.quests.active.mq_bamboo = { stage: 5, progress: 0 };
    quests.notify({ type: 'talk', target: 'tsugumi' });
    expect(data.flags.marsh_open).toBe(1);
    expect(data.quests.active.mq_marsh).toBeDefined();
    data.quests.active.sq_ore = { stage: 1, progress: 0 };
    quests.notify({ type: 'talk', target: 'kanetsugu', quest: 'sq_ore' });
    const nag = data.inventory.find((i) => i.id === 'naginata_shrine')!;
    expect(nag.rarity).toBe(1);
  });

  it('every quest has objectives and valid follow-ups', () => {
    for (const q of Object.values(QUESTS)) {
      expect(q.objectives.length).toBeGreaterThan(0);
      for (const n of q.next ?? []) expect(QUESTS[n]).toBeDefined();
      for (const p of q.prereqs ?? []) expect(QUESTS[p]).toBeDefined();
    }
  });
});
