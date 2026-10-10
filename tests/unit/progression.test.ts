import { describe, expect, it } from 'vitest';
import { addXp, canTrain, resetSkills, trainSkill, xpToNext } from '../../src/systems/progression';
import { MAX_LEVEL } from '../../src/systems/stats';
import { freshGame } from './helpers';

describe('progression', () => {
  it('levels up and grants skill points', () => {
    const { data } = freshGame();
    const gained = addXp(data, xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(data.player.level).toBe(3);
    expect(data.player.xp).toBe(5);
    expect(data.player.skillPoints).toBe(2);
  });

  it('caps at max level', () => {
    const { data } = freshGame();
    addXp(data, 1e9);
    expect(data.player.level).toBe(MAX_LEVEL);
    expect(data.player.xp).toBe(0);
    expect(addXp(data, 100)).toBe(0);
  });

  it('training checks points, rank and level requirements', () => {
    const { data } = freshGame();
    expect(trainSkill(data, 'vitality')).toBe('no_points');
    data.player.skillPoints = 10;
    expect(trainSkill(data, 'secondwind')).toBe('level_too_low');
    for (let i = 0; i < 5; i++) expect(trainSkill(data, 'vitality')).toBe('ok');
    expect(canTrain(data, 'vitality')).toBe('max_rank');
    expect(data.player.skillPoints).toBe(5);
    expect(trainSkill(data, 'nope')).toBe('unknown');
    expect(resetSkills(data)).toBe(5);
    expect(data.player.skillPoints).toBe(10);
  });
});
