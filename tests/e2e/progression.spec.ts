import { expect, test } from '@playwright/test';
import { boot, newGame, press, screenshot, state, step, talkTo, trackErrors } from './helpers';

test('inventory UI: equip, compare, use items', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await newGame(page);
  const uid = await page.evaluate(() => (window as any).__lanternbound.give('katana_moonlit', 1, 3));
  await page.evaluate(() => (window as any).__lanternbound.give('charm_fox', 1, 1));
  let s = await press(page, 'KeyI', 2);
  expect(s.mode).toBe('menu');
  await expect(page.locator('.panel h1')).toHaveText('Inventory');
  const atkBefore = await page.evaluate(() => (window as any).__lanternbound.game.stats.atk);
  await page.locator(`.grid [data-arg="${uid}"]`).click();
  await expect(page.locator('#inv-details')).toContainText('Moonlit Blade');
  await expect(page.locator('#inv-details')).toContainText('Epic');
  await page.locator('#inv-details [data-action=equip]').first().click();
  s = await step(page, 1);
  expect(s.equipment.weapon1).toBe(uid);
  const atkAfter = await page.evaluate(() => (window as any).__lanternbound.game.stats.atk);
  expect(atkAfter).toBeGreaterThan(atkBefore);
  // Equip the charm
  const charm = s.inventory.find((i) => i.id === 'charm_fox')!;
  await page.locator(`.grid [data-arg="${charm.uid}"]`).click();
  await page.locator('#inv-details [data-action=equip]').click();
  s = await step(page, 1);
  expect(s.equipment.charm).toBe(charm.uid);
  // Items tab: use a dango while hurt
  await page.evaluate(() => ((window as any).__lanternbound.game.player.hp = 20));
  await page.locator('[data-action=tab][data-arg=items]').click();
  const dango = s.inventory.find((i) => i.id === 'dango')!;
  await page.locator(`.grid [data-arg="${dango.uid}"]`).click();
  await page.locator('#inv-details [data-action=use]').click();
  s = await step(page, 1);
  expect(s.player.hp).toBeGreaterThan(20);
  await screenshot(page, 'inventory');
  await page.keyboard.press('Escape');
  s = await step(page, 2);
  expect(s.mode).toBe('playing');
  expect(errors).toEqual([]);
});

test('quick heal, shop, forge upgrade and shrine training', async ({ page }) => {
  await boot(page);
  await newGame(page);
  // Quick-heal with F
  await page.evaluate(() => ((window as any).__lanternbound.game.player.hp = 30));
  let s = await press(page, 'KeyF', 70);
  expect(s.player.hp).toBeGreaterThan(30);
  expect(s.dangoCount).toBe(1);

  // Shop (finish the tutorial quest first so Ohana's full menu is available)
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.quests.completed.push('mq_oath');
    delete g.data.quests.active.mq_oath;
    g.data.player.coins = 1000;
  });
  await talkTo(page, 'ohana', [0]);
  s = await step(page, 2);
  expect(s.screen).toBe('shop');
  await page.locator('[data-action=buy][data-arg=dango]').click();
  await page.locator('[data-action=buy][data-arg=spirit_ore]').click();
  await page.locator('[data-action=buy][data-arg=spirit_ore]').click();
  await page.locator('[data-action=buy][data-arg=kanabo_oak]').click();
  s = await step(page, 1);
  expect(s.dangoCount).toBe(2);
  expect(s.inventory.find((i) => i.id === 'spirit_ore')?.qty).toBe(2);
  expect(s.inventory.some((i) => i.id === 'kanabo_oak')).toBe(true);
  // Limited stock disappears after purchase
  await expect(page.locator('[data-action=buy][data-arg=kanabo_oak]')).toHaveCount(0);
  // Sell tab: sell the kanabo (two clicks to confirm)
  await page.locator('[data-action=tab][data-arg=sell]').click();
  const kanabo = s.inventory.find((i) => i.id === 'kanabo_oak')!;
  const coins = s.coins;
  await page.locator(`[data-action=sell][data-arg="${kanabo.uid}"]`).click();
  await page.locator(`[data-action=sell][data-arg="${kanabo.uid}"]`).click();
  s = await step(page, 1);
  expect(s.coins).toBeGreaterThan(coins);
  await screenshot(page, 'shop');
  await page.keyboard.press('Escape');

  // Forge: upgrade the starting katana
  await talkTo(page, 'kanetsugu', [0]);
  s = await step(page, 1);
  expect(s.screen).toBe('smith');
  const katana = s.equipment.weapon1!;
  await page.locator(`[data-action=upgrade][data-arg="${katana}"]`).click();
  s = await step(page, 1);
  expect(s.inventory.find((i) => i.uid === katana)!.level).toBe(1);
  await screenshot(page, 'forge');
  await page.keyboard.press('Escape');

  // Shrine: gain a level and train a skill
  await page.evaluate(() => (window as any).__lanternbound.game.grantXp(200));
  const maxHp0 = (await step(page, 1)).player.maxHp;
  await talkTo(page, 'mikoto', [0]);
  s = await step(page, 1);
  expect(s.screen).toBe('shrine');
  await page.locator('[data-action=train][data-arg=vitality]').click();
  s = await step(page, 1);
  expect(s.player.maxHp).toBe(maxHp0 + 15);
  await screenshot(page, 'shrine');
});

test('side quest: Ore for the Forge', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.quests.completed.push('mq_oath');
    delete g.data.quests.active.mq_oath;
  });
  await talkTo(page, 'kanetsugu', [1, 0]);
  let s = await state(page);
  expect(s.quests.active.sq_ore).toBeDefined();
  await page.evaluate(() => (window as any).__lanternbound.give('spirit_ore', 5));
  // Picking up ore triggers the collect check through the normal pickup path.
  await page.evaluate(() => (window as any).__lanternbound.game.handleQuestUpdates((window as any).__lanternbound.game.quests.checkAllCollect()));
  s = await step(page, 1);
  expect(s.quests.active.sq_ore.stage).toBe(1);
  s = await talkTo(page, 'kanetsugu');
  expect(s.quests.completed).toContain('sq_ore');
  expect(s.inventory.some((i) => i.id === 'naginata_shrine')).toBe(true);
  expect(s.inventory.find((i) => i.id === 'spirit_ore')?.qty ?? 0).toBe(0);
});
