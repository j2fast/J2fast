import { expect, test } from '@playwright/test';
import { boot, screenshot, trackErrors } from './helpers';

test('boots to the title screen without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.locator('.logo .sub')).toHaveText(/Embers of Hinoyama/i);
  for (const a of ['newGame', 'open']) await expect(page.locator(`[data-action=${a}]`).first()).toBeVisible();
  // No "Continue" without a save.
  await expect(page.locator('[data-action=continue]')).toHaveCount(0);
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();
  await screenshot(page, 'title');
  expect(errors).toEqual([]);
});

test('title menu is keyboard navigable', async ({ page }) => {
  await boot(page);
  // Focus starts on New Game; move down to Load Game and confirm.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.panel h1')).toHaveText('Load Game');
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel h1')).toHaveCount(0);
  // Settings -> tabs -> back
  await page.locator('[data-action=open][data-arg=settings]').click();
  await expect(page.locator('.panel h1')).toHaveText('Settings');
  await page.locator('[data-action=tab][data-arg=access]').click();
  await expect(page.getByText('Captions for important sounds')).toBeVisible();
  await page.keyboard.press('Escape');
  // Credits include the originality disclaimer.
  await page.locator('[data-action=open][data-arg=credits]').click();
  await expect(page.getByText(/not affiliated with/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-action=open][data-arg=controls]').click();
  await expect(page.getByText('Light Attack', { exact: true })).toBeVisible();
});

test('shows a helpful message when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test override
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      // @ts-expect-error passthrough
      return orig.call(this, type, ...args);
    };
  });
  await page.goto('/?test=1');
  await expect(page.locator('#boot-error')).toContainText('WebGL');
});
