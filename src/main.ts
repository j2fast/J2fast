// Entry point: checks WebGL support, boots the game and (in test mode)
// exposes hooks used by the automated Playwright tests.

import './ui/styles.css';
import { Game, STEP } from './game/game';
import { UI } from './ui/ui';
import type { VirtualInput } from './core/input';
import { BotOptions, TestBot } from './game/testbot';
import { addItem } from './systems/inventory';

function showBootError(message: string) {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `<div><h1 style="color:#ffd27a">Lanternbound could not start</h1><p>${message}</p><p style="color:#a69cb0">Try an up-to-date Chrome, Edge or Firefox with hardware acceleration enabled.</p></div>`;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot() {
  if (!webglAvailable()) {
    showBootError('Your browser does not support WebGL, which the game needs to draw 3D graphics.');
    return;
  }
  const container = document.getElementById('app')!;
  let game: Game;
  try {
    game = new Game(container);
    game.ui = new UI(game, container);
  } catch (err) {
    console.error(err);
    showBootError(`Startup failed: ${(err as Error).message}`);
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has('test')) {
    game.testMode = true;
    const hooks = {
      game,
      /** Advance the simulation by n fixed steps without waiting for real time. */
      step(n = 1) {
        for (let i = 0; i < n; i++) game.step(STEP);
        game.render(STEP);
        return game.debugState();
      },
      manual(on: boolean) {
        game.manualStepping = on;
      },
      state: () => game.debugState(),
      setInput: (v: VirtualInput | null) => game.input.setVirtual(v),
      teleport: (x: number, z: number) => game.teleport(x, z),
      god: (on: boolean) => (game.godMode = on),
      /**
       * Let the scripted test bot play for up to n steps, stopping early when
       * `until` (a predicate over debug state) is satisfied.
       */
      bot(n: number, opts: BotOptions = {}, until?: string) {
        const bot = ((hooks as unknown as { _bot?: TestBot })._bot ??= new TestBot(opts));
        bot.opts = opts;
        const pred = until ? (new Function('s', `return (${until});`) as (s: ReturnType<Game['debugState']>) => boolean) : null;
        let i = 0;
        for (; i < n; i++) {
          game.input.setVirtual(bot.tick(game, STEP));
          game.step(STEP);
          if (pred && i % 10 === 0 && pred(game.debugState())) break;
          if (game.mode !== 'playing' && game.mode !== 'dialogue') break;
        }
        game.input.setVirtual(null);
        game.render(STEP);
        return { steps: i, dodges: bot.dodges, heals: bot.heals, attacks: bot.attacks, state: game.debugState() };
      },
      give(id: string, qty = 1, rarity = 0) {
        const r = addItem(game.data, id, qty, { rarity, affixes: [] });
        game.refreshStats();
        return r.instance?.uid ?? null;
      },
      spawn(id: string, x: number, z: number, level = 1) {
        const e = game.spawnEnemy(id, x, z, level);
        return e?.spawnId ?? null;
      },
      resetBot() {
        (hooks as unknown as { _bot?: TestBot })._bot = undefined;
      },
    };
    (window as unknown as { __lanternbound: typeof hooks }).__lanternbound = hooks;
  }
  // Unlock audio on the first user gesture (browser autoplay policy).
  const unlock = () => {
    game.audio.unlock();
    game.music.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('error', (e) => console.error('[lanternbound] runtime error', e.error ?? e.message));
  game.showTitleScene();
  game.start();
}

boot();
