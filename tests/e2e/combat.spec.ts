import { expect, Page, test } from '@playwright/test';
import { boot, newGame, press, screenshot, state, step, teleport, trackErrors } from './helpers';

async function setup(page: Page) {
  await boot(page);
  await newGame(page);
  // Clear the training dummies out of the way and stand in an open spot.
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    for (const e of g.enemies) e.removed = true;
  });
  await step(page, 2);
  await teleport(page, 0, -25, 0, -20);
}

async function equipWeapon(page: Page, id: string) {
  await page.evaluate((id) => {
    const lb = (window as any).__lanternbound;
    const uid = lb.give(id, 1, 1);
    lb.game.equipItem(uid, 'weapon1');
    lb.game.data.player.activeWeapon = 0;
    lb.game.player.equipWeapon(lb.game);
  }, id);
  return step(page, 2);
}

for (const weapon of ['katana_ashwood', 'naginata_crescent', 'tanto_nightwhisper', 'kanabo_oak', 'bow_ember']) {
  test(`weapon ${weapon}: combo, heavy and spirit ability deal damage`, async ({ page }) => {
    const errors = trackErrors(page);
    await setup(page);
    await equipWeapon(page, weapon);
    const ranged = weapon.startsWith('bow');
    const dist = ranged ? 8 : 1.6;
    await page.evaluate((d) => (window as any).__lanternbound.spawn('stone_sentinel', 0, -25 + d, 6), dist);
    let s = await step(page, 2);
    const sentinel = s.enemies.find((e) => e.def === 'stone_sentinel')!;
    // Freeze the target so the test measures the player's attacks only.
    await page.evaluate(() => {
      const g = (window as any).__lanternbound.game;
      const e = g.enemies.find((x: any) => x.def.id === 'stone_sentinel');
      e.def = { ...e.def, attacks: [], speed: 0 };
      e.aggro = false;
    });
    await press(page, 'Tab', 2);
    const hp0 = sentinel.hp;
    const combo: number[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('KeyJ');
      await step(page, 1);
      combo.push(await page.evaluate(() => (window as any).__lanternbound.game.player.comboIndex));
      await step(page, ranged ? 22 : 18);
    }
    // The combo counter advances with each chained light attack.
    expect(new Set(combo).size).toBeGreaterThan(1);
    s = await step(page, 40);
    const afterLight = s.enemies.find((e) => e.def === 'stone_sentinel')!.hp;
    expect(afterLight).toBeLessThan(hp0);
    s = await press(page, 'KeyK', 80);
    const afterHeavy = s.enemies.find((e) => e.def === 'stone_sentinel')!.hp;
    expect(afterHeavy).toBeLessThan(afterLight);
    // Spirit ability
    await page.evaluate(() => ((window as any).__lanternbound.game.player.spirit = 100));
    await page.keyboard.press('KeyQ');
    s = await step(page, 3);
    expect(['ability', 'normal']).toContain(s.player.state);
    expect(s.player.spirit).toBeLessThan(100);
    s = await step(page, 160);
    const afterAbility = s.enemies.find((e) => e.def === 'stone_sentinel');
    expect(!afterAbility || afterAbility.hp < afterHeavy).toBe(true);
    await screenshot(page, `weapon-${weapon}`);
    expect(errors).toEqual([]);
  });
}

test('enemy attacks are telegraphed, hurt when ignored, and can be dodged', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window as any).__lanternbound.spawn('stone_sentinel', 0, -22, 1));
  // Wait for the wind-up: a ground telegraph appears before the hit.
  let s = await state(page);
  let sawTelegraph = false;
  for (let i = 0; i < 120 && !sawTelegraph; i++) {
    s = await step(page, 2);
    if (s.telegraphs > 0) sawTelegraph = true;
  }
  expect(sawTelegraph).toBe(true);
  await screenshot(page, 'telegraph');
  const hpBefore = s.player.hp;
  s = await step(page, 90);
  expect(s.player.hp).toBeLessThan(hpBefore);

  // Now dodge at the right moment: wait for the next wind-up to be nearly done.
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.player.hp = g.stats.maxHp;
  });
  let dodged = false;
  for (let i = 0; i < 400 && !dodged; i++) {
    const t = await page.evaluate(() => {
      const g = (window as any).__lanternbound.game;
      const p = g.player.pos;
      return g.effects.telegraphs.dangerAt(p.x, p.z, 0.5);
    });
    if (t && t.progress > 0.75) {
      const hp = (await state(page)).player.hp;
      await page.keyboard.down('KeyS');
      await page.keyboard.press('Space');
      s = await step(page, 30);
      await page.keyboard.up('KeyS');
      expect(s.player.hp).toBe(hp);
      dodged = true;
    } else await step(page, 1);
  }
  expect(dodged).toBe(true);
});

test('defeating enemies grants XP, coins and loot', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const lb = (window as any).__lanternbound;
    lb.spawn('ashen_imp', 0, -22, 1);
    lb.spawn('ashen_imp', 1.5, -22, 1);
  });
  const s0 = await state(page);
  const r = await page.evaluate(() => (window as any).__lanternbound.bot(3000, { range: 20 }, 's.enemies.filter(e=>e.alive).length===0'));
  expect(r.state.enemies.filter((e: any) => e.alive).length).toBe(0);
  const s = await step(page, 120); // let coin pickups fly to the player
  expect(s.coins).toBeGreaterThan(s0.coins);
  const xp = await page.evaluate(() => (window as any).__lanternbound.game.data.player.xp);
  expect(xp + (s.player.level - 1) * 1000).toBeGreaterThan(0);
  expect(r.dodges).toBeGreaterThanOrEqual(0);
});

test('lock-on cycles between targets and the player dies when overwhelmed', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const lb = (window as any).__lanternbound;
    lb.spawn('ashen_imp', -2, -20, 3);
    lb.spawn('ashen_imp', 2, -20, 3);
  });
  let s = await press(page, 'Tab', 2);
  const first = s.player.lock;
  expect(first).not.toBeNull();
  s = await press(page, 'KeyT', 2);
  expect(s.player.lock).not.toBe(first);
  // Standing still against many enemies leads to the death screen.
  await page.evaluate(() => {
    const lb = (window as any).__lanternbound;
    for (let i = 0; i < 5; i++) lb.spawn('bog_lurker', -3 + i * 1.5, -22, 8);
    lb.game.player.hp = 5;
  });
  for (let i = 0; i < 60 && s.mode !== 'dead'; i++) s = await step(page, 10);
  expect(s.mode).toBe('dead');
  await step(page, 120);
  await expect(page.locator('.death h1')).toBeVisible();
  await page.locator('[data-action=respawn]').click();
  s = await step(page, 2);
  expect(s.mode).toBe('playing');
  expect(s.player.hp).toBe(s.player.maxHp);
});
