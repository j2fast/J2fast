import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/storage';
import { SaveManager, deserialize, sanitizeGameData, serialize } from '../../src/systems/save';
import { addItem } from '../../src/systems/inventory';
import { freshGame } from './helpers';

describe('save system', () => {
  it('round-trips a game', () => {
    const { data } = freshGame();
    addItem(data, 'dango', 3);
    data.player.level = 4;
    data.flags.marsh_open = 1;
    data.player.area = 'marsh';
    data.player.pos = [1, 2, 3];
    const r = deserialize(serialize(data));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.data).toEqual(data);
  });

  it('detects tampering via checksum', () => {
    const { data } = freshGame();
    const text = serialize(data).replace('"coins\\":30', '"coins\\":999999');
    const r = deserialize(text);
    expect(r.ok).toBe(false);
  });

  it('rejects garbage and foreign files', () => {
    expect(deserialize('{{{').ok).toBe(false);
    expect(deserialize('{"hello":1}').ok).toBe(false);
    expect(deserialize(null).ok).toBe(false);
  });

  it('rejects saves from a newer version', () => {
    const { data } = freshGame();
    const env = JSON.parse(serialize(data));
    env.version = 99;
    expect(deserialize(JSON.stringify(env)).ok).toBe(false);
  });

  it('sanitizes invalid content without crashing', () => {
    const { data, warnings } = sanitizeGameData({
      player: { level: 500, coins: -5, area: 'moon', equipment: { weapon1: 'missing', armor: 'i1' } },
      inventory: [
        { uid: 'i1', id: 'charm_fox', qty: 1 },
        { uid: 'i2', id: 'laser_sword', qty: 1 },
        'junk',
      ],
      quests: { active: { mq_bamboo: { stage: 99 }, fake: { stage: 0 } }, completed: ['mq_oath', 'nope'] },
    });
    expect(data.player.level).toBe(20);
    expect(data.player.coins).toBe(0);
    expect(data.player.area).toBe('village');
    expect(data.player.equipment.armor).toBeNull();
    expect(data.player.equipment.weapon1).not.toBeNull();
    expect(data.inventory.some((i) => i.id === 'laser_sword')).toBe(false);
    expect(data.quests.active.mq_bamboo.stage).toBe(5);
    expect(data.quests.active.fake).toBeUndefined();
    expect(data.quests.completed).toEqual(['mq_oath']);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('uses the backup when the main slot is corrupted', () => {
    const store = new MemoryStore();
    const mgr = new SaveManager(store);
    const { data } = freshGame();
    data.player.level = 2;
    mgr.save('1', data);
    data.player.level = 3;
    mgr.save('1', data);
    store.set(mgr.key('1'), 'garbage');
    const r = mgr.load('1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.player.level).toBe(2);
      expect(r.warnings.join(' ')).toContain('backup');
    }
  });

  it('reports slot summaries and the latest save', () => {
    const store = new MemoryStore();
    const mgr = new SaveManager(store);
    const { data } = freshGame();
    expect(mgr.latest()).toBeNull();
    mgr.save('2', data);
    store.set(mgr.key('3'), 'broken');
    expect(mgr.summary('2').exists).toBe(true);
    expect(mgr.summary('2').quest).toBe("The Warden's Oath");
    expect(mgr.summary('3').corrupt).toBe(true);
    expect(mgr.summary('1').exists).toBe(false);
    expect(mgr.latest()).toBe('2');
  });

  it('import validates before writing', () => {
    const store = new MemoryStore();
    const mgr = new SaveManager(store);
    expect(mgr.importToSlot('1', 'nonsense').ok).toBe(false);
    expect(mgr.summary('1').exists).toBe(false);
    const { data } = freshGame();
    expect(mgr.importToSlot('1', serialize(data)).ok).toBe(true);
    expect(mgr.summary('1').exists).toBe(true);
  });
});
