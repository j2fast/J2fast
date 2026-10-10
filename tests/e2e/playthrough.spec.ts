// Full story playthrough. Travel uses teleports to skip walking, but every
// fight (including all three bosses) is played by the scripted bot through
// normal player inputs on Normal difficulty — no god mode, no damage cheats.

import { expect, Page, test } from '@playwright/test';
import { DebugState, boot, botUntil, enterArea, newGame, press, screenshot, state, step, talkTo, teleport, trackErrors } from './helpers';

test.setTimeout(1_500_000);

const log: string[] = [];
function note(msg: string, s?: DebugState) {
  const line = s ? `${msg} | Lv ${s.player.level} HP ${Math.round(s.player.hp)}/${s.player.maxHp} coins ${s.coins}` : msg;
  log.push(line);
  console.log('[playthrough]', line);
}

/** Equip the best weapon/armor/charm found so far, like a player would. */
async function autoEquip(page: Page) {
  await page.evaluate(() => {
    const lb = (window as any).__lanternbound;
    const g = lb.game;
    const d = g.data;
    // Compare by computed stats: try each candidate and keep the best attack / defense.
    const tryBest = (slot: string, kind: string, key: 'atk' | 'def' | 'maxHp') => {
      const cands = d.inventory.filter((i: any) => {
        const k = i.id.split('_')[0];
        return kind === 'weapon' ? ['katana', 'naginata', 'tanto', 'kanabo'].includes(k) : kind === 'armor' ? k === 'armor' : k === 'charm';
      });
      let bestUid = d.player.equipment[slot];
      d.player.activeWeapon = 0;
      g.refreshStats();
      let bestV = g.stats[key] + (key === 'def' ? g.stats.maxHp * 0.1 : 0);
      for (const c of cands) {
        if (slot === 'weapon1' && d.player.equipment.weapon2 === c.uid) continue;
        const prev = d.player.equipment[slot];
        d.player.equipment[slot] = c.uid;
        g.refreshStats();
        const v = g.stats[key] + (key === 'def' ? g.stats.maxHp * 0.1 : 0) + (key === 'atk' ? g.stats.crit * 20 : 0);
        if (v > bestV) {
          bestV = v;
          bestUid = c.uid;
        }
        d.player.equipment[slot] = prev;
      }
      if (bestUid) g.equipItem(bestUid, slot);
    };
    tryBest('weapon1', 'weapon', 'atk');
    tryBest('armor', 'armor', 'def');
    tryBest('charm', 'charm', 'atk');
    d.player.activeWeapon = 0;
    g.player.equipWeapon(g);
    g.refreshStats();
  });
}

/** Spend coins like a player: upgrade the main weapon/armor, stock up on dango, train skills. */
async function shopAndTrain(page: Page) {
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    const d = g.data;
    for (let i = 0; i < 6; i++) {
      for (const slot of ['weapon1', 'armor']) {
        const uid = d.player.equipment[slot];
        if (uid) g.upgradeItem(uid);
      }
    }
    while (d.player.coins >= 25 && d.inventory.filter((x: any) => x.id === 'dango').reduce((a: number, x: any) => a + x.qty, 0) < 10) {
      if (!g.buyItem('dango')) break;
    }
    const order = ['vitality', 'might', 'ironskin', 'keen', 'vitality', 'might', 'tea', 'secondwind', 'shadowdodge', 'fleet', 'wellspring'];
    for (let k = 0; k < 30 && d.player.skillPoints > 0; k++) g.train(order[k % order.length]);
    g.refreshStats();
    g.player.hp = g.stats.maxHp;
  });
  await autoEquip(page);
}

async function clearNear(page: Page, x: number, z: number, radius: number, maxSteps = 12000) {
  await teleport(page, x, z);
  const r = await botUntil(page, `s.mode!=='playing' || s.enemies.filter(e=>e.alive && !e.dormant && e.def!=='training_dummy' && Math.hypot(e.x-(${x}),e.z-(${z}))<${radius}).length===0`, maxSteps, { range: radius });
  expect(r.state.mode, `died while clearing near ${x},${z}`).toBe('playing');
  return r.state;
}

async function bossFight(page: Page, triggerX: number, triggerZ: number, bossId: string) {
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.player.hp = g.stats.maxHp;
    g.player.spirit = 0;
  });
  let s = await teleport(page, triggerX, triggerZ);
  s = await step(page, 3);
  expect(s.bossActive, `${bossId} fight did not start`).toBe(true);
  await screenshot(page, `boss-${bossId}-start`);
  const r = await botUntil(page, `s.mode!=='playing' || !s.enemies.some(e=>e.def==='${bossId}' && e.alive)`, 60000, { range: 60 });
  const boss = r.state.enemies.find((e) => e.def === bossId);
  note(`${bossId}: ${r.state.mode === 'playing' ? 'DEFEATED' : 'player died'} (boss hp left ${boss?.hp ?? 0}; dodges ${r.dodges}, heals ${r.heals})`, r.state);
  expect(r.state.mode, `player died fighting ${bossId}`).toBe('playing');
  s = await step(page, 200);
  await screenshot(page, `boss-${bossId}-defeated`);
  expect(s.bossActive).toBe(false);
  return s;
}

test('complete the story from new game to the ending', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await newGame(page);

  // ---------------------------------------------------------------- Prologue
  let s = await talkTo(page, 'tsugumi', [1]);
  await teleport(page, 23, -7.5);
  await teleport(page, 21.5, -5, 21.5, -3);
  await press(page, 'KeyJ', 30);
  await press(page, 'KeyK', 70);
  await page.keyboard.down('KeyS');
  await press(page, 'Space', 30);
  await page.keyboard.up('KeyS');
  await teleport(page, 24, -6, 24, -3);
  await press(page, 'Tab', 3);
  s = await botUntil(page, `s.quests.active.mq_oath?.stage===7`, 6000, { includeDummies: true, range: 10, useAbility: false });
  s = await press(page, 'KeyR', 30);
  s = await press(page, 'KeyR', 30);
  s = await talkTo(page, 'tsugumi');
  expect(s.quests.completed).toContain('mq_oath');
  note('Prologue complete', s);
  await talkTo(page, 'kanetsugu', [1, 0]); // accept Ore for the Forge
  await talkTo(page, 'mikoto', [2, 0]); // accept The Lost Firefly
  await talkTo(page, 'ohana', [1, 0]); // accept Wisp Bounty

  // ---------------------------------------------------------------- Act I: bamboo
  s = await teleport(page, -40.5, 32.5);
  s = await step(page, 3);
  expect(s.area).toBe('bamboo');
  s = await clearNear(page, -6, -30, 14);
  s = await clearNear(page, 13, -2, 16);
  expect(s.quests.active.mq_bamboo.stage).toBe(2);
  note('Imp camp cleared', s);
  s = await talkTo(page, 'kohaku');
  expect(s.flags.kohaku_joined).toBe(1);
  s = await step(page, 5);
  expect(s.companion).toBe(true);
  await screenshot(page, 'kohaku-joined');
  s = await clearNear(page, -16, 18, 14);
  s = await clearNear(page, 24, -18, 10);
  s = await talkTo(page, 'hotaru', [0]);
  s = await clearNear(page, 16, 30, 14);
  s = await clearNear(page, 0, 34, 10);
  // Open chests along the way.
  for (const [cx, cz] of [
    [29, -21],
    [-36, 7],
    [18, 37],
  ]) {
    await teleport(page, cx, cz - 1.8, cx, cz);
    await press(page, 'KeyE', 3);
  }
  s = await teleport(page, 0, 42);
  s = await step(page, 3);
  expect(s.quests.active.mq_bamboo.stage).toBe(4);
  await shopAndTrain(page);
  s = await bossFight(page, 0, 52, 'kuroganemaru');
  expect(s.quests.active.mq_bamboo.stage).toBe(5);
  expect(s.inventory.some((i) => i.id === 'ember_core_1')).toBe(true);

  // Return to the village and hand in quests.
  s = await enterArea(page, 'village', 'from_bamboo');
  s = await talkTo(page, 'tsugumi');
  expect(s.flags.marsh_open).toBe(1);
  s = await talkTo(page, 'mikoto');
  if (s.quests.active.sq_wisps?.stage === 1) s = await talkTo(page, 'ohana');
  await shopAndTrain(page);
  note('Act I complete', s);

  // ---------------------------------------------------------------- Act II: marsh
  await talkTo(page, 'ohana', [1, 0]); // A Parcel for the Ferryman
  s = await teleport(page, 45.5, 10);
  s = await step(page, 3);
  expect(s.area).toBe('marsh');
  s = await talkTo(page, 'ibuki');
  expect(s.quests.active.mq_marsh.stage).toBe(1);
  if (s.quests.active.sq_parcel) s = await talkTo(page, 'ibuki');
  s = await clearNear(page, -20, 2, 16);
  for (const [bx, bz] of [
    [-8, 46],
    [46, 4],
    [-4, -46],
  ]) {
    s = await clearNear(page, bx, bz + 4, 16);
    await teleport(page, bx, bz - 2.2, bx, bz);
    s = await press(page, 'KeyE', 3);
  }
  expect(s.flags.catacombs_open).toBe(1);
  expect(s.quests.active.mq_marsh.stage).toBe(2);
  note('Braziers lit', s);
  s = await clearNear(page, 34, 40, 14);
  await shopAndTrain(page);
  s = await teleport(page, 34, 49.5);
  s = await step(page, 3);
  expect(s.area).toBe('catacombs');

  // ---------------------------------------------------------------- Dungeon
  s = await clearNear(page, 0, 30, 14);
  s = await clearNear(page, 30, 32, 12);
  await teleport(page, 34, 33.8, 34, 36);
  s = await press(page, 'KeyE', 3);
  s = await clearNear(page, -30, 32, 12);
  await teleport(page, -34, 33.8, -34, 36);
  s = await press(page, 'KeyE', 3);
  expect(s.flags.seal_east).toBe(1);
  expect(s.flags.seal_west).toBe(1);
  for (const [cx, cz] of [
    [35, 27],
    [-35, 27],
  ]) {
    await teleport(page, cx + (cx > 0 ? -1.8 : 1.8), cz, cx, cz);
    await press(page, 'KeyE', 3);
  }
  await autoEquip(page);
  // The boss door is open: walk through the corridor.
  s = await teleport(page, 0, 50);
  expect(s.player.z).toBeGreaterThan(48);
  s = await bossFight(page, 0, 60, 'itomaru');
  expect(s.inventory.some((i) => i.id === 'ember_core_2')).toBe(true);

  s = await enterArea(page, 'village', 'shrine');
  s = await talkTo(page, 'tsugumi');
  expect(s.flags.summit_open).toBe(1);
  if (s.quests.active.sq_sentinels?.stage === 1) s = await talkTo(page, 'mikoto');
  if (s.quests.active.sq_wisps?.stage === 1) s = await talkTo(page, 'ohana');
  s = await talkTo(page, 'mikoto');
  expect(s.flags.blessing).toBe(1);
  await shopAndTrain(page);
  note('Act II complete', s);

  // ---------------------------------------------------------------- Act III: summit
  s = await teleport(page, 0, 46.5);
  s = await step(page, 3);
  expect(s.area).toBe('summit');
  for (const [x, z] of [
    [-6, -46],
    [-22, -34],
    [-16, -12],
    [16, 6],
    [14, 22],
    [2, 34],
  ]) {
    s = await clearNear(page, x, z, 13);
  }
  s = await teleport(page, 0, 44);
  s = await step(page, 3);
  expect(s.quests.active.mq_summit.stage).toBe(2);
  await shopAndTrain(page);
  s = await bossFight(page, 0, 48, 'yomikage');
  expect(s.quests.active.mq_summit.stage).toBe(3);

  // ---------------------------------------------------------------- Ending
  await teleport(page, 0, 66, 0, 74);
  s = await step(page, 3);
  expect(s.interaction).toContain('Spirit Lantern');
  s = await press(page, 'KeyE', 5);
  expect(s.mode).toBe('cutscene');
  expect(s.ending).toBe(true);
  await screenshot(page, 'ending-lantern');
  for (let i = 0; i < 40 && s.mode === 'cutscene'; i++) s = await press(page, 'KeyE', 30);
  expect(s.mode).toBe('credits');
  await expect(page.getByText('The Spirit Lantern burns again.')).toBeVisible();
  await screenshot(page, 'credits');
  const summary = await page.evaluate(() => (window as any).__lanternbound.game.saves.summary('auto'));
  expect(summary.quest).toBe('Story complete');
  await page.locator('[data-action=continueEnding]').click();
  s = await step(page, 3);
  expect(s.mode).toBe('playing');
  expect(s.area).toBe('village');
  note('Story complete', s);
  const stats = await page.evaluate(() => (window as any).__lanternbound.game.data.stats);
  note(`Totals: kills ${stats.kills}, deaths ${stats.deaths}, quests completed ${s.quests.completed.length}`);
  expect(errors).toEqual([]);
  console.log(log.join('\n'));
});
