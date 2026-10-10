// Entry point: checks WebGL support, boots the game and (in test mode)
// exposes hooks used by the automated Playwright tests.

import './ui/styles.css';
import { Game, STEP } from './game/game';
import { UI } from './ui/ui';
import type { VirtualInput } from './core/input';
import { BotOptions, TestBot } from './game/testbot';
import { addItem } from './systems/inventory';
import { WEAPON_FAMILIES } from './data/weapons';
import { ITEMS } from './data/items';
import { ENEMIES } from './data/enemies';
import { QUESTS } from './data/quests';
import { DIALOGUES, NPC_DIALOGUE, NPC_NAMES, BOSS_LINES, ENDING_LINES } from './data/dialogue';
import { SKILLS } from './data/skills';
import { SHOP_STOCK } from './data/shop';
import { AREA_BUILDERS } from './world/areas';
import { collectLights, collectParts, encodeParts, toBase64 } from './tools/meshExport';
import { brazier, chest, barrier } from './world/props';
import * as THREE from 'three';

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
      /** Raw game data and area layouts, used by scripts/export-unreal.mjs. */
      exportData() {
        return { WEAPON_FAMILIES, ITEMS, ENEMIES, QUESTS, DIALOGUES, NPC_DIALOGUE, NPC_NAMES, BOSS_LINES, ENDING_LINES, SKILLS, SHOP_STOCK };
      },
      exportArea(id: string, step = 2) {
        const a = AREA_BUILDERS[id as keyof typeof AREA_BUILDERS]();
        const half = a.size / 2;
        const n = Math.floor(a.size / step) + 1;
        const heights: number[] = [];
        const walk: number[] = [];
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const x = -half + i * step;
            const z = -half + j * step;
            heights.push(Math.round(a.heightAt(x, z) * 100) / 100);
            walk.push(a.walkable ? (a.walkable(x, z) ? 1 : 0) : 1);
          }
        }
        // Ground colours: sample the vertex colours of the generated ground mesh.
        const ground = a.group.getObjectByName('ground') as any;
        const colors: number[] = [];
        if (ground) {
          const pos = ground.geometry.attributes.position;
          const col = ground.geometry.attributes.color;
          const segs = Math.round(Math.sqrt(pos.count)) - 1;
          const cell = a.size / segs;
          for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
              const x = -half + i * step;
              const z = -half + j * step;
              const gi = Math.min(segs, Math.max(0, Math.round((x + half) / cell)));
              const gj = Math.min(segs, Math.max(0, Math.round((z + half) / cell)));
              const k = gj * (segs + 1) + gi;
              const r = Math.round(col.getX(k) * 255);
              const g = Math.round(col.getY(k) * 255);
              const b = Math.round(col.getZ(k) * 255);
              colors.push((r << 16) | (g << 8) | b);
            }
          }
        }
        return {
          id: a.id,
          name: a.name,
          size: a.size,
          indoor: !!a.indoor,
          grid: { step, n, origin: -half, heights, walkable: walk, colors },
          colliders: a.colliders.map((c) => ({ ...c })),
          spawns: a.spawns,
          markers: a.markers,
          exits: a.exits,
          interactables: a.interactables,
          npcs: a.npcs,
          enemies: a.enemies,
          boss: a.boss ?? null,
          env: a.env,
          music: a.music,
          tier: a.tier,
          water: a.water ?? null,
          ambient: a.ambient,
        };
      },
      /** Binary scenery mesh (base64) and point lights of an area, for the Unreal port. */
      exportAreaMesh(id: string) {
        const a = AREA_BUILDERS[id as keyof typeof AREA_BUILDERS]();
        const parts = collectParts(a.group);
        const bytes = encodeParts(parts);
        return { mesh: toBase64(bytes), lights: collectLights(a.group), parts: parts.map((p) => p.name), bytes: bytes.length };
      },
      /** Fine walkability grid, run-length encoded (alternating runs, starting with blocked cells). */
      exportWalk(id: string, step = 0.5) {
        const a = AREA_BUILDERS[id as keyof typeof AREA_BUILDERS]();
        const half = a.size / 2;
        const n = Math.floor(a.size / step) + 1;
        const runs: number[] = [];
        let cur = 0;
        let run = 0;
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const v = a.walkable ? (a.walkable(-half + i * step, -half + j * step) ? 1 : 0) : 1;
            if (v === cur) run++;
            else {
              runs.push(run);
              cur = v;
              run = 1;
            }
          }
        }
        runs.push(run);
        return { step, n, origin: -half, runs, hemi: a.env.hemiIntensity, stars: !!a.env.stars, moon: !!a.env.moon, gateYaw: a.boss?.gate.yaw ?? 0 };
      },
      /** Interactable prop variants (chests, braziers, seals) and the boss barrier. */
      exportProps() {
        const root = new THREE.Group();
        const add = (name: string, obj: THREE.Object3D) => {
          obj.traverse((o) => (o.name = ''));
          obj.name = name;
          root.add(obj);
        };
        add('chest_closed', chest(false));
        add('chest_open', chest(true));
        add('brazier_unlit', brazier(false));
        add('brazier_lit', brazier(true));
        const w = game.world as unknown as { buildInteractVisual(def: unknown, data: unknown): THREE.Object3D };
        const sealDef = { id: 'seal_x', kind: 'seal', x: 0, z: 0 };
        add('seal_unlit', w.buildInteractVisual(sealDef, { flags: {}, world: { openedChests: [], litBraziers: [] } }));
        add('seal_lit', w.buildInteractVisual(sealDef, { flags: { seal_x: 1 }, world: { openedChests: [], litBraziers: [] } }));
        add('barrier', barrier(1, 4));
        return toBase64(encodeParts(collectParts(root)));
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
