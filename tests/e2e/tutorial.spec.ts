import { expect, test } from '@playwright/test';
import { boot, hold, newGame, press, screenshot, state, step, talkTo, teleport, trackErrors } from './helpers';

test('tutorial quest is completable with real keyboard input', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await newGame(page);
  let s = await state(page);
  expect(s.area).toBe('village');
  expect(s.quests.active.mq_oath.stage).toBe(0);
  await expect(page.locator('#h-tracker')).toContainText('Speak with Elder Tsugumi');

  // Walking with W moves the player forward.
  const z0 = s.player.z;
  s = await hold(page, 'KeyW', 40);
  expect(s.player.z).toBeGreaterThan(z0 + 2);

  // Talk to Tsugumi, pick the first choice.
  s = await talkTo(page, 'tsugumi', [0]);
  expect(s.quests.active.mq_oath.stage).toBe(1);
  await screenshot(page, 'tutorial-after-talk');

  // Training ground
  s = await teleport(page, 23, -7.5, 21.5, -3);
  expect(s.quests.active.mq_oath.stage).toBe(2);
  await teleport(page, 21.5, -5, 21.5, -3);
  s = await press(page, 'KeyJ', 30);
  expect(s.quests.active.mq_oath.stage).toBe(3);
  s = await press(page, 'KeyK', 70);
  expect(s.quests.active.mq_oath.stage).toBe(4);
  await page.keyboard.down('KeyS');
  s = await press(page, 'Space', 10);
  await page.keyboard.up('KeyS');
  expect(s.quests.active.mq_oath.stage).toBe(5);
  await teleport(page, 24, -6, 24, -3);
  s = await press(page, 'Tab', 3);
  expect(s.player.lock).not.toBeNull();
  expect(s.quests.active.mq_oath.stage).toBe(6);
  await screenshot(page, 'tutorial-lockon');

  // Destroy three dummies with light/heavy attacks.
  for (let i = 0; i < 80 && s.quests.active.mq_oath?.stage === 6; i++) {
    const target = s.enemies.find((e) => e.alive && e.def === 'training_dummy');
    if (!target) {
      s = await step(page, 30);
      continue;
    }
    await teleport(page, target.x, target.z - 1.6, target.x, target.z);
    s = await press(page, i % 4 === 3 ? 'KeyK' : 'KeyJ', 25);
  }
  expect(s.quests.active.mq_oath.stage).toBe(7);

  // Swap weapons with R
  s = await press(page, 'KeyR', 30);
  expect(s.player.weapon).toBe('bow');
  expect(s.quests.active.mq_oath.stage).toBe(8);
  s = await press(page, 'KeyR', 3);
  expect(s.player.weapon).toBe('katana');

  const coins = s.coins;
  s = await talkTo(page, 'tsugumi');
  expect(s.quests.completed).toContain('mq_oath');
  expect(s.quests.active.mq_bamboo).toBeDefined();
  expect(s.coins).toBe(coins + 60);
  expect(s.dangoCount).toBe(5);
  await expect(page.locator('#h-tracker')).toContainText('Ash in the Bamboo');
  expect(errors).toEqual([]);
});

test('exits respect quest gating', async ({ page }) => {
  await boot(page);
  await newGame(page);
  // The bamboo gate is closed until the tutorial is done.
  let s = await teleport(page, -40, 31.5, -42, 34);
  s = await step(page, 5);
  expect(s.area).toBe('village');
  await expect(page.locator('#captions')).toContainText('training');
  // Marsh gate is barred before the first core.
  s = await teleport(page, 45.5, 10);
  s = await step(page, 5);
  expect(s.area).toBe('village');
});
