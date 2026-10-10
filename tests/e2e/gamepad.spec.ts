import { expect, test } from '@playwright/test';
import { boot, step } from './helpers';

// Playwright cannot attach a physical controller, so we install a fake
// standard-mapping gamepad behind navigator.getGamepads().
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Test Gamepad (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  });
});

/** Wait for real animation frames (gamepad polling happens once per frame). */
async function frames(page: import('@playwright/test').Page, n = 2) {
  const f0 = await page.evaluate(() => (window as any).__lanternbound.game.lastFrame);
  let seen = 0;
  let last = f0;
  while (seen < n) {
    await page.waitForFunction((l) => (window as any).__lanternbound.game.lastFrame !== l, last, { timeout: 20_000 });
    last = await page.evaluate(() => (window as any).__lanternbound.game.lastFrame);
    seen++;
  }
}

async function tap(page: import('@playwright/test').Page, button: number, steps = 2) {
  await page.evaluate((b) => {
    const btn = (window as any).__pad.buttons[b];
    btn.pressed = true;
    btn.value = 1;
  }, button);
  await frames(page, 2);
  await step(page, steps);
  await page.evaluate((b) => {
    const btn = (window as any).__pad.buttons[b];
    btn.pressed = false;
    btn.value = 0;
  }, button);
  await frames(page, 2);
  return step(page, 1);
}

test('menus, movement and combat work with a gamepad', async ({ page }) => {
  await boot(page);
  // D-pad down moves focus from New Game to Load Game; B backs out.
  await tap(page, 13);
  await expect(page.locator('.title-menu .btn.focused')).toHaveText('Load Game');
  await tap(page, 12);
  await expect(page.locator('.title-menu .btn.focused')).toHaveText('New Game');
  // A starts a new game.
  await tap(page, 0);
  let s = await step(page, 2);
  expect(s.mode).toBe('playing');
  // Prompts switch to controller labels.
  await expect(page.locator('#h-healkey')).toHaveText('D-Up');
  // Left stick forward moves the player.
  const z0 = s.player.z;
  await page.evaluate(() => ((window as any).__pad.axes[1] = -1));
  s = await step(page, 40);
  await page.evaluate(() => ((window as any).__pad.axes[1] = 0));
  expect(s.player.z).toBeGreaterThan(z0 + 2);
  // Right stick turns the camera.
  const yaw0 = await page.evaluate(() => (window as any).__lanternbound.game.camRig.yaw);
  await page.evaluate(() => ((window as any).__pad.axes[2] = 1));
  await step(page, 20);
  await page.evaluate(() => ((window as any).__pad.axes[2] = 0));
  const yaw1 = await page.evaluate(() => (window as any).__lanternbound.game.camRig.yaw);
  expect(yaw1).not.toBeCloseTo(yaw0, 2);
  // X attacks, B dodges.
  s = await tap(page, 2, 2);
  expect(['attack', 'normal']).toContain(s.player.state);
  const combo = await page.evaluate(() => (window as any).__lanternbound.game.player.comboIndex);
  expect(combo).toBeGreaterThan(0);
  await step(page, 40);
  s = await tap(page, 1, 2);
  expect(s.player.state).toBe('dodge');
  // Start opens the pause menu; B closes it.
  await step(page, 30);
  s = await tap(page, 9, 2);
  expect(s.mode).toBe('paused');
  await tap(page, 1, 2);
  s = await step(page, 2);
  expect(s.mode).toBe('playing');
});
