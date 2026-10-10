import { expect, test } from '@playwright/test';
import { boot, newGame, press, step } from './helpers';

test('rebinding a key through the settings UI changes gameplay input and persists', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action=open][data-arg=settings]').click();
  await page.locator('[data-action=tab][data-arg=controls]').click();
  await page.locator('[data-action=rebind][data-arg="dodge|k0"]').click();
  await expect(page.locator('[data-action=rebind][data-arg="dodge|k0"]')).toHaveText('Press…');
  await page.keyboard.press('KeyC');
  await expect(page.locator('[data-action=rebind][data-arg="dodge|k0"]')).toHaveText('C');
  // Other settings: sensitivity slider and invert Y
  const slider = page.locator('input[data-setting=mouseSensitivity]');
  await slider.fill('2');
  await page.locator('[data-action=toggle][data-arg=invertY]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await newGame(page);
  let s = await step(page, 2);
  await page.keyboard.down('KeyW');
  s = await press(page, 'KeyC', 3);
  await page.keyboard.up('KeyW');
  expect(s.player.state).toBe('dodge');
  // Space no longer dodges.
  s = await step(page, 40);
  s = await press(page, 'Space', 3);
  expect(s.player.state).not.toBe('dodge');

  // Settings persist across reloads
  await page.reload();
  await page.waitForFunction(() => (window as any).__lanternbound);
  const settings = await page.evaluate(() => (window as any).__lanternbound.game.settings);
  expect(settings.keyBindings.dodge[0]).toBe('KeyC');
  expect(settings.mouseSensitivity).toBe(2);
  expect(settings.invertY).toBe(true);
});

test('accessibility options apply immediately', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action=open][data-arg=settings]').click();
  await page.locator('[data-action=tab][data-arg=access]').click();
  const size = page.locator('[data-action=cycle][data-arg=subtitleSize]');
  await size.click(); // medium -> large
  const fontSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sub-size').trim());
  expect(fontSize).toBe('27px');
  await page.locator('[data-action=toggle][data-arg=highContrastTelegraphs]').click();
  await page.locator('[data-action=toggle][data-arg=soundCaptions]').click();
  await page.locator('[data-action=toggle][data-arg=cameraShake]').click();
  const s = await page.evaluate(() => (window as any).__lanternbound.game.settings);
  expect(s.highContrastTelegraphs).toBe(true);
  expect(s.soundCaptions).toBe(true);
  expect(s.cameraShake).toBe(false);
  // Difficulty
  await page.locator('[data-action=tab][data-arg=gameplay]').click();
  await page.locator('[data-action=cycle][data-arg=difficulty]').click();
  expect(await page.evaluate(() => (window as any).__lanternbound.game.settings.difficulty)).toBe('hard');
  // Keyboard navigation adjusts a focused cycle setting with arrow keys.
  await page.locator('[data-action=cycle][data-arg=difficulty]').hover();
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => (window as any).__lanternbound.game.settings.difficulty)).toBe('normal');
  // Restore defaults
  await page.locator('[data-action=resetSettings]').click();
  expect(await page.evaluate(() => (window as any).__lanternbound.game.settings.subtitleSize)).toBe('medium');
});

test('sound captions appear for important sounds', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__lanternbound.game;
    g.settings.soundCaptions = true;
    g.persistSettings();
  });
  await newGame(page);
  await page.evaluate(() => (window as any).__lanternbound.game.grantXp(100));
  await step(page, 2);
  await expect(page.locator('#captions')).toContainText('level up');
});

test('pause menu opens and closes with Escape and stops the simulation', async ({ page }) => {
  await boot(page);
  await newGame(page);
  let s = await press(page, 'Escape', 2);
  expect(s.mode).toBe('paused');
  const t0 = s.player.z;
  await page.keyboard.down('KeyW');
  s = await step(page, 30);
  await page.keyboard.up('KeyW');
  expect(s.player.z).toBe(t0);
  await page.keyboard.press('Escape');
  s = await step(page, 2);
  expect(s.mode).toBe('playing');
  // Quest log opens with L
  s = await press(page, 'KeyL', 2);
  await expect(page.locator('.panel h1')).toHaveText('Quest Log');
  await expect(page.locator('.panel')).toContainText("The Warden's Oath");
});
