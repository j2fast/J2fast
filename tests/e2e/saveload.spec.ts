import { expect, test } from '@playwright/test';
import { boot, newGame, press, state, step, teleport, trackErrors } from './helpers';

test('save to a slot through the pause menu and load it back', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await newGame(page);
  await page.evaluate(() => {
    const lb = (window as any).__lanternbound;
    lb.game.data.player.coins = 777;
    lb.give('katana_moonlit', 1, 2);
    lb.game.data.flags.test_flag = 1;
  });
  await teleport(page, 5, -10);
  let s = await press(page, 'Escape', 2);
  expect(s.mode).toBe('paused');
  await page.locator('[data-action=open][data-arg=save]').click();
  await page.locator('[data-action=saveSlot][data-arg="1"]').click();
  await expect(page.locator('[data-action=saveSlot][data-arg="1"]')).toContainText('Lv 1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  s = await step(page, 2);
  expect(s.mode).toBe('playing');

  // Change state, then load slot 1
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.player.coins = 1;
  });
  await teleport(page, -10, -20);
  await press(page, 'Escape', 2);
  await page.locator('[data-action=open][data-arg=load]').click();
  await page.locator('[data-action=loadSlot][data-arg="1"]').click();
  await page.locator('[data-action=confirmYes]').click();
  s = await step(page, 2);
  expect(s.mode).toBe('playing');
  expect(s.coins).toBe(777);
  expect(s.flags.test_flag).toBe(1);
  expect(s.inventory.some((i) => i.id === 'katana_moonlit' && i.rarity === 2)).toBe(true);
  expect(Math.round(s.player.x)).toBe(5);
  expect(Math.round(s.player.z)).toBe(-10);
  expect(errors).toEqual([]);
});

test('continue from the title after reload, with settings persisted', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.player.coins = 4242;
    g.save('2');
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__lanternbound);
  await page.evaluate(() => (window as any).__lanternbound.manual(true));
  await expect(page.locator('[data-action=continue]')).toBeVisible();
  await page.locator('[data-action=continue]').click();
  const s = await step(page, 2);
  expect(s.mode).toBe('playing');
  expect(s.coins).toBe(4242);
});

test('corrupted saves are detected and do not crash the game', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await newGame(page);
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.player.coins = 10;
    g.save('1');
    g.data.player.coins = 20;
    g.save('1'); // previous copy becomes the backup
    localStorage.setItem('lanternbound.save.3', '{"format":"lanternbound-save","version":1,"checksum":"0","payload":"{}"}');
    localStorage.setItem('lanternbound.save.1', 'garbage!!');
  });
  await press(page, 'Escape', 2);
  await page.locator('[data-action=open][data-arg=load]').click();
  // Slot 3 is reported as damaged and cannot be loaded.
  await expect(page.locator('[data-action=loadSlot][data-arg="3"]')).toContainText('Damaged');
  await expect(page.locator('[data-action=loadSlot][data-arg="3"]')).toBeDisabled();
  // Slot 1 falls back to its backup copy.
  await page.locator('[data-action=loadSlot][data-arg="1"]').click();
  await page.locator('[data-action=confirmYes]').click();
  const s = await step(page, 2);
  expect(s.mode).toBe('playing');
  expect(s.coins).toBe(10);
  await expect(page.locator('#toasts')).toContainText('backup');
  expect(errors).toEqual([]);
});

test('autosave happens on area transitions', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.data.quests.completed.push('mq_oath');
    delete g.data.quests.active.mq_oath;
  });
  // Walk through the bamboo gate.
  await teleport(page, -40.5, 32.5);
  let s = await step(page, 3);
  expect(s.area).toBe('bamboo');
  const summary = await page.evaluate(() => (window as any).__lanternbound.game.saves.summary('auto'));
  expect(summary.area).toBe('bamboo');
  s = await state(page);
  expect(s.player.z).toBeLessThan(-50);
});
