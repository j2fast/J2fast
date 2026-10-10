import { expect, Page } from '@playwright/test';

export type DebugState = {
  mode: string;
  area: string | null;
  player: { x: number; y: number; z: number; yaw: number; hp: number; maxHp: number; stamina: number; spirit: number; state: string; weapon: string; level: number; lock: string | null };
  coins: number;
  enemies: { id: string; def: string; hp: number; maxHp: number; x: number; z: number; state: string; alive: boolean; boss: boolean; dormant: boolean; phase: number }[];
  npcs: { id: string; x: number; z: number }[];
  quests: { active: Record<string, { stage: number; progress: number }>; completed: string[]; tracked: string | null };
  flags: Record<string, number>;
  interaction: string | null;
  bossActive: boolean;
  companion: boolean;
  ending: boolean;
  inventory: { uid: string; id: string; qty: number; rarity: number; level: number }[];
  equipment: Record<string, string | null>;
  telegraphs: number;
  projectiles: number;
  dialogue: { npc: string; node: string | null } | null;
  screen: string | null;
  dangoCount: number;
};

/** Collect console errors and uncaught exceptions. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function boot(page: Page, opts: { clearStorage?: boolean } = {}) {
  if (opts.clearStorage !== false) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__lb_cleared')) {
        localStorage.clear();
        sessionStorage.setItem('__lb_cleared', '1');
      }
    });
  }
  await page.goto('/?test=1');
  await page.waitForFunction(() => (window as any).__lanternbound, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__lanternbound.manual(true));
  await expect(page.locator('.logo .main')).toHaveText('LANTERNBOUND');
}

export async function newGame(page: Page) {
  await page.locator('[data-action=newGame]').click();
  await expect.poll(() => state(page).then((s) => s.mode)).toBe('playing');
}

export function state(page: Page): Promise<DebugState> {
  return page.evaluate(() => (window as any).__lanternbound.state());
}

export function step(page: Page, n = 1): Promise<DebugState> {
  return page.evaluate((n) => (window as any).__lanternbound.step(n), n);
}

/** Press a key (real keyboard event) and advance the simulation. */
export async function press(page: Page, code: string, steps = 2): Promise<DebugState> {
  await page.keyboard.press(code);
  return step(page, steps);
}

/** Hold a key for a number of simulation steps. */
export async function hold(page: Page, code: string, steps: number): Promise<DebugState> {
  await page.keyboard.down(code);
  const s = await step(page, steps);
  await page.keyboard.up(code);
  await step(page, 1);
  return s;
}

export async function teleport(page: Page, x: number, z: number, faceX?: number, faceZ?: number) {
  await page.evaluate(
    ([x, z, fx, fz]) => {
      const lb = (window as any).__lanternbound;
      lb.teleport(x, z);
      if (fx !== undefined && fz !== undefined) {
        const yaw = Math.atan2(fx - x, fz - z);
        lb.game.player.yaw = yaw;
        lb.game.camRig.yaw = yaw;
      }
    },
    [x, z, faceX, faceZ] as const,
  );
  return step(page, 2);
}

export async function enterArea(page: Page, area: string, spawn: string) {
  await page.evaluate(([a, s]) => (window as any).__lanternbound.game.enterArea(a, s), [area, spawn]);
  return step(page, 2);
}

/** Talk to an NPC using real key presses, choosing the given choice indexes in order. */
export async function talkTo(page: Page, npcId: string, choices: number[] = []): Promise<DebugState> {
  const s0 = await state(page);
  const npc = s0.npcs.find((n) => n.id === npcId);
  if (!npc) throw new Error(`NPC ${npcId} not present in ${s0.area}`);
  await teleport(page, npc.x, npc.z - 1.8, npc.x, npc.z);
  let s = await step(page, 2);
  expect(s.interaction).toContain('Talk');
  s = await press(page, 'KeyE', 2);
  expect(s.mode).toBe('dialogue');
  const queue = [...choices];
  for (let i = 0; i < 40 && s.mode === 'dialogue'; i++) {
    const hasChoices = await page.locator('#dialogue [data-choice]').count();
    if (hasChoices) {
      const c = queue.shift() ?? 0;
      await page.keyboard.press(`Digit${c + 1}`);
      s = await step(page, 2);
    } else {
      // First press completes the typewriter text, second advances.
      s = await press(page, 'KeyE', 2);
      if (s.mode === 'dialogue') s = await press(page, 'KeyE', 2);
    }
  }
  expect(s.mode).not.toBe('dialogue');
  return s;
}

/** Let the scripted bot fight until a condition holds (JS expression over state `s`). */
export async function botUntil(page: Page, until: string, maxSteps = 6000, opts: Record<string, unknown> = {}) {
  let last: { steps: number; dodges: number; heals: number; state: DebugState } | null = null;
  for (let done = 0; done < maxSteps; done += 600) {
    last = await page.evaluate(([n, o, u]) => (window as any).__lanternbound.bot(n, o, u), [600, opts, until] as const);
    const ok = await page.evaluate((u) => new Function('s', `return (${u});`)((window as any).__lanternbound.state()), until);
    if (ok || last!.state.mode !== 'playing') break;
  }
  return last!;
}

export async function screenshot(page: Page, name: string) {
  await page.evaluate(() => (window as any).__lanternbound.step(1));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/screens/${name}.png` });
}
