// Game orchestrator: owns the renderer, world, entities and systems and runs
// the fixed-step simulation.

import * as THREE from 'three';
import { AudioEngine, Sfx } from '../core/audio';
import { Input, InputFrame } from '../core/input';
import { angleDiff, clamp, yawTo } from '../core/math';
import { Music } from '../core/music';
import { Rng } from '../core/rng';
import { DIFFICULTY_MODS, Settings, loadSettings, saveSettings } from '../core/settings';
import { BrowserStore } from '../core/storage';
import { AREA_IDS, AREA_NAMES, AreaId, nextAreaToward } from '../data/areaIds';
import { BOSS_LINES, DIALOGUES, ENDING_LINES, NPC_NAMES, NpcDialogueEntry } from '../data/dialogue';
import { ENEMIES } from '../data/enemies';
import { ITEMS, RARITY_NAMES } from '../data/items';
import { QUESTS } from '../data/quests';
import { SHOP_STOCK } from '../data/shop';
import { Companion } from '../entities/companion';
import type { EnemyHit, GameCtx, HitInfo } from '../entities/context';
import { Enemy } from '../entities/enemy';
import { Hazards } from '../entities/hazards';
import { Npc } from '../entities/npc';
import { PickupContent, Pickups } from '../entities/pickups';
import { Player } from '../entities/player';
import { Projectiles } from '../entities/projectiles';
import { Effects, FloatingText } from '../render/effects';
import { DialogueRunner, evalCond, npcHasQuestMarker, selectDialogue } from '../systems/dialogue';
import { addItem, buy, countItem, equip, findItem, removeItem, sell, unequip, upgrade } from '../systems/inventory';
import { generateEquipment, rollEnemyDrops, rollEquipmentDrop } from '../systems/loot';
import { addXp, resetSkills, trainSkill } from '../systems/progression';
import { QuestLog, QuestUpdate, currentObjective } from '../systems/quests';
import { SaveManager, SlotId } from '../systems/save';
import { EquipSlot, GameData, newGameData, setFlag } from '../systems/state';
import { DerivedStats, computeDamage, computeStats, defenseFactor, hasSpecial } from '../systems/stats';
import type { InteractDef } from '../world/areaTypes';
import { barrier as barrierMesh } from '../world/props';
import { World } from '../world/world';
import type { UI } from '../ui/ui';
import { CameraRig } from './camera';

export type Mode = 'title' | 'playing' | 'paused' | 'dialogue' | 'menu' | 'dead' | 'cutscene' | 'credits';

export const STEP = 1 / 60;

interface ActiveDialogue {
  runner: DialogueRunner;
  npc: Npc;
  entry: NpcDialogueEntry;
  deferred: string[];
}

export interface Interaction {
  kind: 'npc' | 'object';
  label: string;
  npc?: Npc;
  def?: InteractDef;
}

export class Game implements GameCtx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camRig: CameraRig;
  readonly world: World;
  readonly effects = new Effects();
  readonly floating: FloatingText;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly music: Music;
  readonly store = new BrowserStore();
  readonly saves: SaveManager;
  settings: Settings;
  ui!: UI;
  rng = new Rng((Date.now() & 0xffff) + 7);
  data: GameData = newGameData();
  quests: QuestLog;
  readonly player = new Player();
  companion: Companion | null = null;
  enemies: Enemy[] = [];
  npcs: Npc[] = [];
  readonly projectiles = new Projectiles();
  readonly hazards = new Hazards();
  readonly pickups = new Pickups();
  mode: Mode = 'title';
  time = 0;
  private hitstopT = 0;
  private slowmoT = 0;
  private statsCache: DerivedStats;
  boss: Enemy | null = null;
  bossActive = false;
  private barrier: { mesh: THREE.Mesh; collider: import('../world/terrain').Collider } | null = null;
  dialogue: ActiveDialogue | null = null;
  interaction: Interaction | null = null;
  private respawnQueue: { spawn: import('../world/areaTypes').EnemySpawnDef; t: number }[] = [];
  private lockedMsgT = 0;
  private acc = 0;
  private lastFrame = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  godMode = false;
  testMode = false;
  inCombat = false;
  private deathT = 0;
  endingIndex = -1;
  private endingT = 0;
  private running = false;
  lastAutosave = 0;

  constructor(private container: HTMLElement) {
    this.settings = loadSettings(this.store);
    this.saves = new SaveManager(this.store);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';
    this.camRig = new CameraRig(1);
    this.world = new World(this.scene);
    this.scene.add(this.effects.group, this.projectiles.group, this.hazards.group, this.pickups.group, this.player.trail.mesh);
    const floatLayer = document.createElement('div');
    floatLayer.id = 'float-layer';
    container.appendChild(floatLayer);
    this.floating = new FloatingText(floatLayer);
    this.input = new Input(this.settings.keyBindings, this.settings.padBindings);
    this.input.attach();
    this.input.pointerLockTarget = this.renderer.domElement;
    this.music = new Music(this.audio);
    this.quests = new QuestLog(this.data, this.rng);
    this.statsCache = computeStats(this.data);
    this.audio.onCaption = (text) => {
      if (this.settings.soundCaptions) this.ui?.soundCaption(text);
    };
    this.renderer.domElement.addEventListener('click', () => {
      this.audio.unlock();
      if (this.mode === 'playing') this.input.requestPointerLock();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.mode === 'playing' && !this.testMode) this.openPause();
    });
    this.resize();
  }

  // ------------------------------------------------------------------ GameCtx

  get stats(): DerivedStats {
    return this.statsCache;
  }

  refreshStats() {
    this.statsCache = computeStats(this.data);
    if (this.player.hp > this.statsCache.maxHp) this.player.hp = this.statsCache.maxHp;
  }

  enemyDifficulty() {
    const m = DIFFICULTY_MODS[this.settings.difficulty];
    return { damage: m.enemyDamage, health: m.enemyHealth };
  }

  lockTarget(): Enemy | null {
    return this.player.lockTarget;
  }

  onWeaponSwapped(): void {
    this.refreshStats();
  }

  sfx(name: Sfx, x?: number, z?: number, volume?: number) {
    this.audio.play(name, { x, z, volume });
  }

  caption(text: string, speaker = '', seconds = 3) {
    this.ui?.caption(text, speaker, seconds);
  }

  hitstop(seconds: number) {
    this.hitstopT = Math.max(this.hitstopT, seconds);
  }

  shake(amount: number) {
    this.camRig.shake(amount);
  }

  questEvent(type: 'event', target: string) {
    this.handleQuestUpdates(this.quests.notify({ type, target }));
  }

  requestToken(e: Enemy): boolean {
    if (e.hasToken) return true;
    const holders = this.enemies.filter((x) => x.alive && x.hasToken && !x.boss).length;
    return holders < 2;
  }

  releaseToken(e: Enemy): void {
    e.hasToken = false;
  }

  spawnEnemy(id: string, x: number, z: number, level: number, summoned = false): Enemy | null {
    if (!ENEMIES[id]) return null;
    const e = new Enemy(id, level, summoned ? `summon_${this.time}` : id, ENEMIES[id].id === 'training_dummy' ? 1 : this.enemyDifficulty().health);
    const pos = this.world.move(x, z, 0, 0, e.radius);
    e.place(pos.x, this.world.groundY(pos.x, pos.z), pos.z, yawTo(pos.x, pos.z, this.player.pos.x, this.player.pos.z));
    e.summoned = summoned;
    this.scene.add(e.root);
    this.enemies.push(e);
    return e;
  }

  hitEnemy(e: Enemy, hit: HitInfo): number {
    if (!e.alive || e.invulnerable || e.dormant || this.mode !== 'playing') return 0;
    const s = this.stats;
    let amount: number;
    let crit = false;
    if (hit.fixedDamage !== undefined) amount = hit.fixedDamage;
    else {
      const r = computeDamage({ atk: s.atk, mult: hit.mult, atkPct: s.atkPct, buff: this.player.buffAtk, crit: s.crit, critDmg: s.critDmg, forceCrit: hit.forceCrit, targetDef: e.defense, rng: this.rng });
      amount = r.amount;
      crit = r.crit;
      if (this.godMode && this.testMode) amount = Math.max(amount, 9999);
    }
    e.receiveHit(amount, hit, this);
    this.data.stats.damageDealt += amount;
    const hy = e.pos.y + e.aimHeight;
    if (hit.source !== 'dot') {
      this.effects.hitSpark(e.pos.x, hy, e.pos.z, crit, hit.source === 'companion' ? 0xffd27a : 0xffe0a0);
      this.sfx(crit ? 'crit' : hit.heavy ? 'hitHeavy' : 'hit', e.pos.x, e.pos.z);
      if (!hit.noHitstop) this.hitstop(crit ? 0.09 : hit.heavy ? 0.075 : 0.045);
      if (hit.heavy || crit) this.shake(0.15);
      // Spirit gain from landing hits.
      if (hit.source !== 'companion') {
        const gain = (hit.source === 'ability' ? 1 : 4) * (1 + s.spiritGain);
        this.player.spirit = Math.min(s.maxSpirit, this.player.spirit + gain);
      }
      if (s.lifesteal > 0 && this.player.alive) this.player.hp = Math.min(s.maxHp, this.player.hp + amount * s.lifesteal);
    }
    this.floating.spawn(new THREE.Vector3(e.pos.x, hy + 0.6, e.pos.z), crit ? `${amount}!` : `${amount}`, crit ? 'dmg crit' : hit.source === 'dot' ? 'dmg dot' : 'dmg', crit ? 1.1 : 0.8);
    if (e.hp <= 0) this.killEnemy(e);
    return amount;
  }

  hitPlayer(hit: EnemyHit): boolean {
    const p = this.player;
    if (!p.alive || this.mode !== 'playing') return false;
    if (p.invulnerable || this.godMode) {
      // Perfect dodge: dodging through an attack at the last moment.
      if (p.state === 'dodge' && this.time - p.dodgeStartTime < 0.22 && hasSpecial(this.data, 'parryDodge') && this.slowmoT <= 0) {
        this.slowmoT = 0.6;
        p.parryT = 0.6;
        p.stamina = this.stats.maxStamina;
        this.sfx('parry');
        this.caption('Perfect dodge!', '', 1.2);
      }
      return false;
    }
    const variance = 0.92 + this.rng.next() * 0.16;
    const dmg = Math.max(1, Math.round(hit.damage * variance * defenseFactor(this.stats.def)));
    const died = p.takeDamage(dmg, hit.fromX, hit.fromZ, hit.knockback, this);
    if (hit.status?.type === 'burn') p.burnT = Math.max(p.burnT, hit.status.time);
    if (hit.status?.type === 'slow') p.slowT = Math.max(p.slowT, hit.status.time);
    this.sfx('playerHurt', p.pos.x, p.pos.z);
    this.floating.spawn(new THREE.Vector3(p.pos.x, p.pos.y + 2.1, p.pos.z), `${dmg}`, 'dmg player', 0.9);
    this.effects.hitSpark(p.pos.x, p.pos.y + 1.2, p.pos.z, false, 0xff5a4a);
    this.shake(0.25 + Math.min(0.5, dmg / this.stats.maxHp));
    this.hitstop(0.05);
    this.ui?.damageFlash();
    if (died) this.onPlayerDeath();
    return true;
  }

  // ------------------------------------------------------------------ Lifecycle

  start(): void {
    this.applySettings();
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camRig.camera.aspect = w / Math.max(1, h);
    this.camRig.camera.updateProjectionMatrix();
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    this.input.keyBindings = s.keyBindings;
    this.input.padBindings = s.padBindings;
    this.input.mouseSensitivity = s.mouseSensitivity;
    this.input.stickSensitivity = s.stickSensitivity;
    this.input.invertY = s.invertY;
    this.camRig.camera.fov = s.fov;
    this.camRig.camera.updateProjectionMatrix();
    this.camRig.shakeEnabled = s.cameraShake;
    this.effects.reduceFlashing = s.reduceFlashing;
    this.effects.telegraphs.highContrast = s.highContrastTelegraphs;
    this.floating.enabled = s.damageNumbers;
    this.world.setQuality(s.quality);
    const ratio = s.quality === 'high' ? Math.min(2, window.devicePixelRatio || 1) : s.quality === 'medium' ? Math.min(1.25, window.devicePixelRatio || 1) : 0.8;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = s.quality !== 'low';
    this.resize();
    this.ui?.applySettings(s);
    this.syncCompanion();
  }

  persistSettings(): void {
    saveSettings(this.store, this.settings);
    this.applySettings();
  }

  private frame(now: number) {
    const dtReal = clamp((now - this.lastFrame) / 1000, 0, 0.1);
    this.lastFrame = now;
    this.fpsAcc += dtReal;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.input.pollUi(dtReal);
    if (!this.testMode || !this.manualStepping) {
      this.acc += dtReal;
      let n = 0;
      while (this.acc >= STEP && n < 6) {
        this.step(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 6) this.acc = 0;
    }
    this.render(dtReal);
  }

  /** When true (tests), the simulation only advances through step(). */
  manualStepping = false;

  render(dt: number) {
    this.ui?.update(dt);
    this.floating.update(dt, this.camRig.camera, this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
    this.renderer.render(this.scene, this.camRig.camera);
  }

  // ------------------------------------------------------------------ Simulation step

  step(dt: number): void {
    const area = this.world.area;
    switch (this.mode) {
      case 'playing':
        this.stepPlaying(dt);
        break;
      case 'dialogue':
      case 'cutscene': {
        const frame = this.input.sample(dt);
        if (this.mode === 'dialogue') this.handleDialogueInput(frame);
        else this.stepCutscene(dt, frame);
        for (const n of this.npcs) n.update(dt, this.player.pos);
        this.player.update(dt, frame, this.camRig.yaw, this);
        this.companion?.update(dt, this);
        this.cameraStep(dt, 0, 0);
        this.effects.update(dt, this.player.pos);
        area?.animate?.(this.time, dt);
        this.time += dt;
        break;
      }
      case 'dead': {
        this.deathT += dt;
        this.player.update(dt, this.input.sample(dt), this.camRig.yaw, this);
        for (const e of this.enemies) e.update(dt, this);
        this.cameraStep(dt, 0, 0);
        this.effects.update(dt, this.player.pos);
        if (this.deathT > 1.6 && !this.ui.isDeathShown()) this.ui.showDeath();
        this.time += dt;
        break;
      }
      case 'title':
        // Slow cinematic orbit on the title screen.
        this.time += dt;
        this.camRig.yaw += dt * 0.05;
        this.cameraStep(dt, 0, 0);
        this.effects.update(dt, this.player.pos);
        area?.animate?.(this.time, dt);
        for (const n of this.npcs) n.update(dt, this.player.pos);
        break;
      default:
        break;
    }
  }

  private cameraStep(dt: number, lx: number, ly: number) {
    const lock = this.player.lockTarget;
    const extra = this.bossActive ? 2.2 : 0;
    this.camRig.update(dt, lx, ly, this.player.pos, lock ? lock.pos : null, this.world, extra);
    this.world.updateShadowFocus(this.player.pos);
    this.audio.setListener(this.player.pos.x, this.player.pos.z, this.camRig.yaw);
  }

  private stepPlaying(rawDt: number) {
    const area = this.world.area;
    if (!area) return;
    this.refreshStats();
    const frame = this.input.sample(rawDt);
    this.data.playTime += rawDt;
    if (this.handleGlobalInput(frame)) return;

    let dt = rawDt;
    if (this.slowmoT > 0) {
      this.slowmoT -= rawDt;
      dt = rawDt * 0.35;
    }
    this.cameraStep(rawDt, frame.lookX, frame.lookY);
    this.effects.update(rawDt, this.player.pos);
    area.animate?.(this.time, rawDt);
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      return;
    }
    this.time += dt;

    this.player.update(dt, frame, this.camRig.yaw, this);
    this.player.root.updateMatrixWorld(true);
    this.player.updateTrail(dt);
    if (this.player.state === 'normal' && frame.pressed.interact) this.doInteract();

    for (const e of this.enemies) e.update(dt, this);
    this.separateEnemies();
    for (const e of this.enemies.filter((x) => x.removed)) {
      this.scene.remove(e.root);
      e.dispose(this);
    }
    this.enemies = this.enemies.filter((x) => !x.removed);
    this.updateRespawns(dt);
    this.companion?.update(dt, this);
    this.projectiles.update(dt, this);
    this.hazards.update(dt, this);
    for (const c of this.pickups.update(dt, this.player.pos, (x, z) => this.world.groundY(x, z))) this.collect(c);
    for (const n of this.npcs) n.update(dt, this.player.pos);

    this.checkExits(dt);
    this.checkMarkers();
    this.checkBossTrigger();
    this.updateInteraction();
    this.updateCombatMusic();
    if (this.data.player.coins < 0) this.data.player.coins = 0;
  }

  private handleGlobalInput(f: InputFrame): boolean {
    if (f.pressed.pause) {
      this.openPause();
      return true;
    }
    if (f.pressed.inventory) {
      this.openMenu('inventory');
      return true;
    }
    if (f.pressed.questLog) {
      this.openMenu('quests');
      return true;
    }
    const p = this.player;
    if (this.settings.lockOnMode === 'hold') {
      if (f.down.lockOn && !p.lockTarget) this.acquireLock();
      if (!f.down.lockOn && p.lockTarget) p.lockTarget = null;
    } else if (f.pressed.lockOn) {
      if (p.lockTarget) p.lockTarget = null;
      else this.acquireLock();
    }
    if (f.pressed.targetNext && p.lockTarget) this.cycleLock();
    return false;
  }

  acquireLock(): boolean {
    const best = this.lockCandidates()[0];
    if (best) {
      this.player.lockTarget = best.e;
      this.sfx('lockOn');
      if (best.e.def.id === 'training_dummy') this.questEvent('event', 'tut_lockon');
      return true;
    }
    return false;
  }

  private lockCandidates(): { e: Enemy; score: number; ang: number }[] {
    const p = this.player.pos;
    const out: { e: Enemy; score: number; ang: number }[] = [];
    for (const e of this.enemies) {
      if (!e.alive || !e.targetable) continue;
      const d = e.pos.distanceTo(p);
      if (d > 24) continue;
      const ang = angleDiff(this.camRig.yaw, yawTo(p.x, p.z, e.pos.x, e.pos.z));
      if (Math.abs(ang) > 1.4 && d > 4) continue;
      out.push({ e, score: Math.abs(ang) * 6 + d * 0.3, ang });
    }
    return out.sort((a, b) => a.score - b.score);
  }

  private cycleLock() {
    const c = this.lockCandidates().sort((a, b) => a.ang - b.ang);
    if (c.length < 2) return;
    const i = c.findIndex((x) => x.e === this.player.lockTarget);
    this.player.lockTarget = c[(i + 1) % c.length].e;
    this.sfx('lockOn');
  }

  private separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.dormant) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.dormant) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          const wa = a.boss ? 0.1 : 1;
          const wb = b.boss ? 0.1 : 1;
          a.pos.x -= nx * push * wa;
          a.pos.z -= nz * push * wa;
          b.pos.x += nx * push * wb;
          b.pos.z += nz * push * wb;
        }
      }
      // Keep enemies out of the player.
      const p = this.player;
      const dx = a.pos.x - p.pos.x;
      const dz = a.pos.z - p.pos.z;
      const min = a.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6 && a.def.behavior !== 'dummy') {
        const d = Math.sqrt(d2);
        const push = min - d;
        if (a.boss) {
          p.moveBy((-dx / d) * push, (-dz / d) * push, this);
        } else {
          a.pos.x += (dx / d) * push * 0.6;
          a.pos.z += (dz / d) * push * 0.6;
          p.moveBy((-dx / d) * push * 0.4, (-dz / d) * push * 0.4, this);
        }
      } else if (d2 < min * min && a.def.behavior === 'dummy' && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.moveBy((-dx / d) * (min - d), (-dz / d) * (min - d), this);
      }
    }
  }

  private updateRespawns(dt: number) {
    for (const r of this.respawnQueue) r.t -= dt;
    const ready = this.respawnQueue.filter((r) => r.t <= 0);
    this.respawnQueue = this.respawnQueue.filter((r) => r.t > 0);
    for (const r of ready) {
      const e = this.spawnEnemy(r.spawn.enemy, r.spawn.x, r.spawn.z, r.spawn.level);
      if (e) {
        e.spawnId = r.spawn.id;
        e.yaw = Math.PI;
        this.effects.burst(r.spawn.x, e.pos.y + 1, r.spawn.z, { count: 10, color: 0xd8bf72, speed: 2, life: 0.5, size: 'm' });
      }
    }
  }

  private updateCombatMusic() {
    let combat = false;
    for (const e of this.enemies) {
      if (e.alive && e.aggro && e.def.behavior !== 'dummy' && e.pos.distanceTo(this.player.pos) < 25) {
        combat = true;
        break;
      }
    }
    this.inCombat = combat;
    this.music.setCombat(combat);
  }

  // ------------------------------------------------------------------ Kills, loot, XP

  private killEnemy(e: Enemy) {
    e.die(this);
    if (this.player.lockTarget === e) {
      this.player.lockTarget = null;
      if (this.settings.lockOnMode === 'toggle' && !e.boss) this.acquireLock();
    }
    this.sfx('enemyDie', e.pos.x, e.pos.z);
    this.effects.deathPuff(e.pos.x, e.pos.y, e.pos.z, e.boss ? 0xffd27a : 0x9a8ab0);
    this.data.stats.kills++;
    this.handleQuestUpdates(this.quests.notify({ type: 'kill', target: e.def.id }));
    const area = this.world.area!;
    if (e.def.id === 'training_dummy') {
      const spawn = area.enemies.find((s) => s.id === e.spawnId);
      if (spawn?.respawn) this.respawnQueue.push({ spawn, t: spawn.respawn });
      return;
    }
    this.player.spirit = Math.min(this.stats.maxSpirit, this.player.spirit + 8 * (1 + this.stats.spiritGain));
    this.grantXp(e.summoned ? Math.round(e.xp * 0.5) : e.xp);
    const drops = rollEnemyDrops(e.def, this.rng, area.tier, e.coinMult * (e.summoned ? 0.3 : 1));
    if (drops.coins > 0) this.pickups.spawn({ kind: 'coins', amount: drops.coins }, e.pos.x, e.pos.y, e.pos.z);
    for (const it of drops.items) this.pickups.spawn({ kind: 'item', id: it.id, qty: it.qty }, e.pos.x, e.pos.y, e.pos.z);
    for (const g of drops.equipment) this.pickups.spawn({ kind: 'equipment', gen: g }, e.pos.x, e.pos.y, e.pos.z);
    if (e.boss) this.onBossDefeated(e);
    else if (this.companion && this.rng.chance(0.12)) this.companion.bark(this, 'kill');
  }

  grantXp(xp: number) {
    const gained = addXp(this.data, xp);
    if (xp > 0) this.floating.spawn(new THREE.Vector3(this.player.pos.x, this.player.pos.y + 2.4, this.player.pos.z), `+${xp} XP`, 'xp', 1.0);
    if (gained > 0) {
      this.refreshStats();
      this.player.hp = this.stats.maxHp;
      this.sfx('levelUp');
      this.ui?.banner(`Level ${this.data.player.level}`, `+${gained} skill point${gained > 1 ? 's' : ''} — train at the village shrine`);
      this.effects.burst(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, { count: 40, color: 0xffe08a, speed: 4, life: 1.2, gravity: -2, size: 'm', spread: 1 });
    }
  }

  private collect(c: PickupContent) {
    if (c.kind === 'coins') {
      this.data.player.coins += c.amount;
      this.sfx('coin');
      this.floating.spawn(new THREE.Vector3(this.player.pos.x, this.player.pos.y + 2, this.player.pos.z), `+${c.amount}`, 'coin', 0.8);
    } else if (c.kind === 'item') {
      const r = addItem(this.data, c.id, c.qty);
      this.sfx('pickup');
      const name = ITEMS[c.id]?.name ?? c.id;
      this.ui?.toast(r.added > 0 ? `+ ${name}${c.qty > 1 ? ` ×${c.qty}` : ''}` : `${name} (full) sold for ${r.converted} coins`, 'item');
    } else {
      const r = addItem(this.data, c.gen.id, 1, { rarity: c.gen.rarity, affixes: c.gen.affixes });
      this.data.stats.itemsFound++;
      this.sfx('chest');
      const name = `${RARITY_NAMES[c.gen.rarity]} ${ITEMS[c.gen.id].name}`;
      this.ui?.toast(r.added ? `Found: ${name}` : `Bag full — ${name} sold for ${r.converted} coins`, `rarity${c.gen.rarity}`);
    }
    this.handleQuestUpdates(this.quests.checkAllCollect());
  }

  // ------------------------------------------------------------------ Quests

  handleQuestUpdates(updates: QuestUpdate[]) {
    for (const u of updates) {
      switch (u.kind) {
        case 'started':
          this.ui?.toast(`New ${u.quest.kind === 'main' ? 'Story ' : ''}Quest: ${u.quest.title}`, 'quest');
          this.sfx('questUpdate');
          this.afterQuestStart(u.quest.id);
          break;
        case 'progress':
          this.ui?.toast(`${u.objective.text}: ${u.progress}/${u.count}`, 'progress');
          break;
        case 'objective':
          if (u.next) {
            this.ui?.toast(`Objective: ${u.next.text}`, 'quest');
            this.sfx('questUpdate');
          }
          break;
        case 'completed': {
          const r = u.rewards;
          const parts = [r.xp ? `${r.xp} XP` : '', r.coins ? `${r.coins} coins` : '', ...r.items].filter(Boolean);
          this.ui?.banner(`Quest Complete`, `${u.quest.title}${parts.length ? ' — ' + parts.join(', ') : ''}`);
          this.sfx('questComplete');
          if (r.levelsGained > 0) {
            this.refreshStats();
            this.player.hp = this.stats.maxHp;
            this.sfx('levelUp');
            this.ui?.toast(`Level up! You are now level ${this.data.player.level}.`, 'quest');
          }
          this.world.refreshDynamic(this.data);
          this.autosave();
          break;
        }
      }
    }
  }

  private afterQuestStart(id: string) {
    if (id === 'mq_oath') {
      // Equip the bow in the second weapon slot so the swap tutorial works.
      const bow = this.data.inventory.find((i) => i.id === 'bow_willow');
      if (bow && !this.data.player.equipment.weapon2) equip(this.data, bow.uid, 'weapon2');
    }
  }

  // ------------------------------------------------------------------ Areas

  newGame(): void {
    this.audio.unlock();
    this.data = newGameData();
    this.rng = new Rng((Date.now() & 0xffff) + 13);
    this.quests = new QuestLog(this.data, this.rng);
    const k = addItem(this.data, 'katana_wanderer').instance!;
    equip(this.data, k.uid, 'weapon1');
    const a = addItem(this.data, 'armor_traveler').instance!;
    equip(this.data, a.uid, 'armor');
    addItem(this.data, 'dango', 2);
    this.handleQuestUpdates(this.quests.start('mq_oath'));
    this.data.player.activeWeapon = 0;
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.stamina = this.stats.maxStamina;
    this.player.spirit = 0;
    this.player.secondWindUsed = false;
    this.enterArea('village', 'start');
    this.mode = 'playing';
    this.ui.hideAllScreens();
    this.ui.showHud(true);
    this.ui.banner('Akari Village', 'The Spirit Lantern on Hinoyama has gone dark.');
    this.ui.showControlsHint();
    this.autosave();
  }

  /** Load a save slot and start playing. */
  loadSlot(slot: SlotId): boolean {
    this.audio.unlock();
    const r = this.saves.load(slot);
    if (!r.ok) {
      this.ui.toast(`Could not load: ${r.error}`, 'error');
      this.sfx('uiError');
      return false;
    }
    this.data = r.data;
    this.quests = new QuestLog(this.data, this.rng);
    this.refreshStats();
    this.player.hp = Math.max(1, Math.round(this.stats.maxHp * this.data.player.hpFrac));
    this.player.spirit = this.data.player.spirit;
    this.player.stamina = this.stats.maxStamina;
    this.player.secondWindUsed = false;
    const pos = this.data.player.pos;
    this.enterArea(this.data.player.area as AreaId, this.data.player.spawn, pos ?? undefined);
    this.mode = 'playing';
    this.ui.hideAllScreens();
    this.ui.showHud(true);
    for (const w of r.warnings) this.ui.toast(w, 'error');
    this.ui.toast(`Loaded ${slot === 'auto' ? 'autosave' : `slot ${slot}`}`, 'info');
    return true;
  }

  enterArea(id: AreaId, spawnId: string, pos?: [number, number, number]): void {
    this.clearEntities();
    const area = this.world.load(id, this.data);
    const spawn = area.spawns[spawnId] ?? area.spawns.shrine ?? Object.values(area.spawns)[0];
    this.data.player.area = id;
    this.data.player.spawn = area.spawns[spawnId] ? spawnId : 'shrine';
    const px = pos ? pos[0] : spawn.x;
    const pz = pos ? pos[2] : spawn.z;
    this.player.resetCombatState();
    this.player.place(px, this.world.groundY(px, pz), pz, spawn.yaw);
    this.scene.add(this.player.root);
    this.player.equipWeapon(this);
    this.player.lantern.intensity = area.env.lanternIntensity;
    this.camRig.snapBehind(spawn.yaw);
    this.effects.setAmbient(area.ambient);

    for (const n of area.npcs) {
      if (n.showIf && !evalCond(this.data, n.showIf)) continue;
      const npc = new Npc(n.id, n.x, this.world.groundY(n.x, n.z), n.z, n.yaw);
      this.npcs.push(npc);
      this.scene.add(npc.root, npc.marker);
      area.colliders.push({ kind: 'circle', x: n.x, z: n.z, r: 0.5, h: 2, id: `npc_${n.id}` });
    }
    this.refreshNpcMarkers();
    for (const s of area.enemies) {
      const e = this.spawnEnemy(s.enemy, s.x, s.z, s.level);
      if (e) e.spawnId = s.id;
    }
    this.boss = null;
    this.bossActive = false;
    if (area.boss && !this.data.world.bossesDefeated.includes(area.boss.enemy) && (!area.boss.requires || evalCond(this.data, area.boss.requires))) {
      const b = this.spawnEnemy(area.boss.enemy, area.boss.x, area.boss.z, 1);
      if (b) {
        b.dormant = true;
        b.yaw = area.boss.yaw;
        this.boss = b;
      }
    }
    this.syncCompanion();
    if (!this.data.world.visitedAreas.includes(id)) this.data.world.visitedAreas.push(id);
    this.music.play(area.music);
    this.ui?.areaBanner(AREA_NAMES[id]);
    this.ui?.fadeIn();
    this.handleQuestUpdates(this.quests.notify({ type: 'reach', target: `area:${id}` }));
    this.world.refreshDynamic(this.data);
  }

  private clearEntities() {
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      e.dispose(this);
    }
    this.enemies = [];
    for (const n of this.npcs) this.scene.remove(n.root, n.marker);
    this.npcs = [];
    this.projectiles.clear();
    this.hazards.clear();
    this.pickups.clear();
    this.effects.clearTransient();
    this.floating.clear();
    this.respawnQueue = [];
    this.removeBarrier();
    this.player.lockTarget = null;
    this.interaction = null;
  }

  syncCompanion() {
    const want = (this.data.flags.kohaku_joined ?? 0) > 0 && this.settings.companionEnabled && this.mode !== 'title' && !!this.world.area;
    if (want && !this.companion) {
      this.companion = new Companion();
      this.scene.add(this.companion.root);
      this.companion.place(this.player.pos.x - 1.5, this.player.pos.y, this.player.pos.z - 1.5);
    } else if (!want && this.companion) {
      this.scene.remove(this.companion.root);
      this.companion = null;
    } else if (want && this.companion) {
      this.companion.place(this.player.pos.x - Math.sin(this.player.yaw) * 1.5, this.player.pos.y, this.player.pos.z - Math.cos(this.player.yaw) * 1.5);
    }
  }

  refreshNpcMarkers() {
    for (const n of this.npcs) n.setMarker(npcHasQuestMarker(this.data, n.id));
  }

  private checkExits(dt: number) {
    const area = this.world.area!;
    this.lockedMsgT -= dt;
    const p = this.player.pos;
    for (const ex of area.exits) {
      if (Math.hypot(p.x - ex.x, p.z - ex.z) > ex.r) continue;
      if (this.bossActive) return;
      if (ex.requires && !evalCond(this.data, ex.requires)) {
        if (this.lockedMsgT <= 0) {
          this.caption(ex.lockedText ?? 'The way is blocked.', '', 2.5);
          this.sfx('uiError');
          this.lockedMsgT = 2.5;
        }
        // Nudge the player back out of the trigger.
        const d = Math.hypot(p.x - ex.x, p.z - ex.z) || 1;
        this.player.moveBy(((p.x - ex.x) / d) * 0.25, ((p.z - ex.z) / d) * 0.25, this);
        return;
      }
      this.travel(ex.to, ex.spawn);
      return;
    }
  }

  travel(to: AreaId, spawn: string) {
    this.data.player.pos = null;
    this.enterArea(to, spawn);
    this.autosave();
  }

  private checkMarkers() {
    const area = this.world.area!;
    const p = this.player.pos;
    for (const [id, m] of Object.entries(area.markers)) {
      if (Math.hypot(p.x - m.x, p.z - m.z) < m.r) {
        // Only notify for markers that some quest is waiting on.
        for (const qid of Object.keys(this.data.quests.active)) {
          const o = currentObjective(this.data, qid);
          if (o && o.type === 'reach' && o.target === id) {
            this.handleQuestUpdates(this.quests.notify({ type: 'reach', target: id }));
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ Bosses

  private checkBossTrigger() {
    const area = this.world.area!;
    const b = this.boss;
    if (!b || !area.boss || !b.dormant || !this.player.alive) return;
    const t = area.boss.trigger;
    if (Math.hypot(this.player.pos.x - t.x, this.player.pos.z - t.z) > t.r) return;
    this.bossActive = true;
    b.startIntro();
    const gate = area.boss.gate;
    const mesh = barrierMesh(gate.width, 5);
    mesh.position.set(gate.x, this.world.groundY(gate.x, gate.z), gate.z);
    mesh.position.y += 2.5;
    mesh.rotation.y = gate.yaw;
    this.scene.add(mesh);
    const collider = { kind: 'box' as const, minX: gate.x - gate.width / 2, maxX: gate.x + gate.width / 2, minZ: gate.z - 0.6, maxZ: gate.z + 0.6, h: 5, id: 'bossBarrier' };
    area.colliders.push(collider);
    this.barrier = { mesh, collider };
    const lines = BOSS_LINES[b.def.id]?.intro ?? [];
    lines.forEach((l, i) => setTimeout(() => this.caption(l, b.def.name, 2.8), i * 1500));
    this.sfx('bossRoar', b.pos.x, b.pos.z);
    this.music.play(b.def.boss!.music);
    this.ui.showBossBar(b);
    this.companion?.bark(this, 'boss');
    this.player.lockTarget = b;
  }

  private removeBarrier() {
    if (!this.barrier) return;
    this.scene.remove(this.barrier.mesh);
    const area = this.world.area;
    if (area) area.colliders = area.colliders.filter((c) => c !== this.barrier!.collider);
    this.barrier = null;
  }

  private onBossDefeated(e: Enemy) {
    const def = e.def;
    this.bossActive = false;
    this.data.world.bossesDefeated.push(def.id);
    this.caption(BOSS_LINES[def.id]?.defeat ?? '', def.name, 3.5);
    for (const other of this.enemies) if (other.summoned && other.alive) this.killEnemy(other);
    for (const r of def.boss!.reward) {
      const d = ITEMS[r];
      if (!d) continue;
      if (d.kind === 'key') addItem(this.data, r);
      else {
        const g = generateEquipment(r, this.rng);
        addItem(this.data, r, 1, { rarity: g.rarity, affixes: g.affixes });
      }
      this.ui.toast(`Obtained: ${d.name}`, d.kind === 'key' ? 'quest' : `rarity${d.fixedRarity ?? 2}`);
    }
    this.grantXp(e.xp);
    this.handleQuestUpdates(this.quests.notify({ type: 'boss', target: def.id }));
    this.removeBarrier();
    this.ui.hideBossBar();
    this.boss = null;
    this.player.hp = this.stats.maxHp;
    setTimeout(() => {
      if (this.world.area) this.music.play(this.world.area.music);
    }, 3000);
    this.ui.banner(`${def.name} Defeated`, def.boss!.title);
    this.autosave();
  }

  // ------------------------------------------------------------------ Death

  private onPlayerDeath() {
    this.mode = 'dead';
    this.deathT = 0;
    this.data.stats.deaths++;
    this.sfx('death');
    this.input.exitPointerLock();
    this.ui.hideBossBar();
  }

  respawn() {
    this.ui.hideAllScreens();
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.stamina = this.stats.maxStamina;
    this.player.secondWindUsed = false;
    this.data.player.pos = null;
    this.enterArea(this.data.player.area as AreaId, this.data.player.spawn);
    this.mode = 'playing';
    this.ui.showHud(true);
    this.ui.toast('You rise again at the last waypoint.', 'info');
  }

  // ------------------------------------------------------------------ Interaction

  private updateInteraction() {
    const p = this.player.pos;
    let best: Interaction | null = null;
    let bd = Infinity;
    for (const n of this.npcs) {
      const d = n.pos.distanceTo(p);
      if (d < 2.8 && d < bd) {
        bd = d;
        best = { kind: 'npc', label: `Talk to ${n.name}`, npc: n };
      }
    }
    for (const io of this.world.interactObjs.values()) {
      const def = io.def;
      const d = Math.hypot(def.x - p.x, def.z - p.z);
      const range = def.kind === 'lantern' ? 5 : 2.6;
      if (d > range || d >= bd) continue;
      if (!this.world.interactableAvailable(def, this.data)) continue;
      const labels: Record<string, string> = { chest: 'Open chest', brazier: 'Light brazier', wayshrine: 'Rest at wayshrine', seal: 'Break the seal', lantern: 'Relight the Spirit Lantern' };
      bd = d;
      best = { kind: 'object', label: labels[def.kind], def };
    }
    this.interaction = this.bossActive ? null : best;
  }

  doInteract() {
    const it = this.interaction;
    if (!it || this.mode !== 'playing') return;
    if (it.kind === 'npc' && it.npc) this.startDialogue(it.npc);
    else if (it.def) this.useObject(it.def);
  }

  private useObject(def: InteractDef) {
    const d = this.data;
    switch (def.kind) {
      case 'chest': {
        d.world.openedChests.push(def.id);
        this.sfx('chest', def.x, def.z);
        const loot = def.loot ?? {};
        if (loot.coins) {
          d.player.coins += loot.coins;
          this.ui.toast(`+ ${loot.coins} coins`, 'item');
        }
        for (const it of loot.items ?? []) {
          addItem(d, it.id, it.qty ?? 1);
          this.ui.toast(`+ ${ITEMS[it.id].name}${(it.qty ?? 1) > 1 ? ` ×${it.qty}` : ''}`, 'item');
        }
        if (loot.equipmentTier) {
          const g = rollEquipmentDrop(this.rng, loot.equipmentTier);
          if (loot.rarityLuck && g.rarity < 2 && this.rng.chance(loot.rarityLuck)) {
            const better = generateEquipment(g.id, this.rng, 2);
            g.rarity = better.rarity;
            g.affixes = better.affixes;
          }
          addItem(d, g.id, 1, { rarity: g.rarity, affixes: g.affixes });
          this.ui.toast(`Found: ${RARITY_NAMES[g.rarity]} ${ITEMS[g.id].name}`, `rarity${g.rarity}`);
        }
        this.effects.burst(def.x, this.world.groundY(def.x, def.z) + 0.8, def.z, { count: 24, color: 0xffd27a, speed: 3, life: 0.8, gravity: -1, size: 'm' });
        this.world.refreshDynamic(d);
        this.handleQuestUpdates(this.quests.checkAllCollect());
        break;
      }
      case 'brazier': {
        d.world.litBraziers.push(def.id);
        this.sfx('brazier', def.x, def.z);
        this.effects.burst(def.x, this.world.groundY(def.x, def.z) + 2, def.z, { count: 30, color: 0x6fd8ff, speed: 4, life: 1, gravity: -3, size: 'm' });
        this.handleQuestUpdates(this.quests.notify({ type: 'interact', target: 'brazier' }));
        const lit = d.world.litBraziers.filter((b) => b.startsWith('brazier_')).length;
        if (lit >= 3 && !(d.flags.catacombs_open > 0)) {
          setFlag(d, 'catacombs_open');
          this.caption('Far to the north-east, stone doors grind open.', '', 3.5);
          this.sfx('door');
        } else this.caption(`A spirit brazier burns again. (${lit}/3)`, '', 2.5);
        this.world.refreshDynamic(d);
        this.autosave();
        break;
      }
      case 'seal': {
        setFlag(d, def.id);
        this.sfx('brazier', def.x, def.z);
        this.effects.burst(def.x, 1.6, def.z, { count: 30, color: 0x8ad8ff, speed: 4, life: 1, size: 'm' });
        const both = d.flags.seal_east > 0 && d.flags.seal_west > 0;
        this.caption(both ? 'Somewhere ahead, a great door groans open.' : 'The seal shatters. One more remains.', '', 3);
        if (both) this.sfx('door');
        this.world.refreshDynamic(d);
        break;
      }
      case 'wayshrine':
        this.openMenu('wayshrine');
        break;
      case 'lantern':
        this.startEnding();
        break;
    }
  }

  /** Rest: restore, respawn enemies, set the respawn point, autosave. */
  rest() {
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.stamina = this.stats.maxStamina;
    this.player.burnT = 0;
    this.player.secondWindUsed = false;
    const area = this.world.area!;
    const spawn = area.spawns.shrine ? 'shrine' : this.data.player.spawn;
    this.data.player.pos = null;
    this.enterArea(area.id, spawn);
    this.data.player.spawn = spawn;
    this.sfx('heal');
    this.autosave();
    this.ui.toast('Rested. Health restored and progress saved. The Hollowed stir again...', 'info');
  }

  fastTravel(to: AreaId) {
    this.data.player.pos = null;
    this.enterArea(to, 'shrine');
    this.data.player.spawn = 'shrine';
    this.autosave();
  }

  // ------------------------------------------------------------------ Dialogue

  startDialogue(npc: Npc) {
    const entry = selectDialogue(this.data, npc.id);
    if (!entry) return;
    const runner = new DialogueRunner(this.data, entry.dialogue);
    this.dialogue = { runner, npc, entry, deferred: [] };
    npc.talking = true;
    this.mode = 'dialogue';
    this.player.state = 'frozen';
    this.player.lockTarget = null;
    this.player.yaw = yawTo(this.player.pos.x, this.player.pos.z, npc.pos.x, npc.pos.z);
    this.input.exitPointerLock();
    this.runDialogueActions();
    this.showDialogueNode();
  }

  private showDialogueNode() {
    const dlg = this.dialogue;
    if (!dlg) return;
    const node = dlg.runner.node;
    if (!node) {
      this.endDialogue();
      return;
    }
    const name = node.speaker === 'warden' ? 'You' : NPC_NAMES[node.speaker] ?? node.speaker;
    this.ui.showDialogue(name, node.text, dlg.runner.visibleChoices().map((c) => c.text));
  }

  private handleDialogueInput(f: InputFrame) {
    if (!this.dialogue) return;
    if (this.ui.dialogueHasChoices()) return; // choices are handled by the UI
    if (f.pressed.interact || f.pressed.attack || f.pressed.dodge) this.advanceDialogue();
  }

  advanceDialogue() {
    const dlg = this.dialogue;
    if (!dlg) return;
    if (this.ui.dialogueTyping()) {
      this.ui.finishTyping();
      return;
    }
    dlg.runner.advance();
    this.sfx('uiMove');
    this.runDialogueActions();
    this.showDialogueNode();
  }

  chooseDialogue(index: number) {
    const dlg = this.dialogue;
    if (!dlg) return;
    dlg.runner.choose(index);
    this.sfx('uiConfirm');
    this.runDialogueActions();
    this.showDialogueNode();
  }

  private runDialogueActions() {
    const dlg = this.dialogue;
    if (!dlg) return;
    for (const a of dlg.runner.takeActions()) {
      const [kind, arg, qty] = a.split(':');
      switch (kind) {
        case 'startQuest':
          this.handleQuestUpdates(this.quests.start(arg));
          break;
        case 'give': {
          addItem(this.data, arg, Number(qty ?? 1));
          this.ui.toast(`Received: ${ITEMS[arg]?.name ?? arg}`, 'item');
          break;
        }
        case 'take':
          removeItem(this.data, arg, Number(qty ?? 1));
          break;
        case 'flag':
          setFlag(this.data, arg);
          if (arg === 'kohaku_joined') this.ui.toast('Kohaku the fox spirit joins you!', 'quest');
          if (arg === 'blessing') this.ui.toast('The summit path is now open.', 'quest');
          break;
        case 'heal':
          this.player.hp = this.stats.maxHp;
          this.sfx('heal');
          break;
        case 'rest':
        case 'open':
          dlg.deferred.push(a);
          break;
      }
    }
  }

  private endDialogue() {
    const dlg = this.dialogue;
    if (!dlg) return;
    this.dialogue = null;
    dlg.npc.talking = false;
    this.ui.hideDialogue();
    this.mode = 'playing';
    this.player.state = 'normal';
    this.input.clearAll();
    if (!dlg.entry.noTalk) this.handleQuestUpdates(this.quests.notify({ type: 'talk', target: dlg.npc.id, quest: dlg.entry.quest }));
    // Hotaru crosses over once she has given you her bell.
    if (dlg.npc.id === 'hotaru' && this.data.flags.hotaru_saved > 0) this.removeNpc(dlg.npc, 0x9fd8ff);
    if (dlg.npc.id === 'kohaku' && this.data.flags.kohaku_joined > 0) {
      this.removeNpc(dlg.npc, 0xffd27a);
      this.world.refreshDynamic(this.data);
      this.syncCompanion();
    }
    this.refreshNpcMarkers();
    for (const a of dlg.deferred) {
      if (a === 'rest') this.rest();
      else if (a.startsWith('open:')) this.openMenu(a.slice(5) as 'shop' | 'smith' | 'shrine');
    }
  }

  private removeNpc(npc: Npc, color: number) {
    this.effects.burst(npc.pos.x, npc.pos.y + 1, npc.pos.z, { count: 30, color, speed: 3, life: 1.2, gravity: -2, size: 'm' });
    this.scene.remove(npc.root, npc.marker);
    this.npcs = this.npcs.filter((n) => n !== npc);
    const area = this.world.area;
    if (area) area.colliders = area.colliders.filter((c) => c.id !== `npc_${npc.id}`);
  }

  // ------------------------------------------------------------------ Ending

  private startEnding() {
    this.handleQuestUpdates(this.quests.notify({ type: 'interact', target: 'lantern' }));
    this.data.ending = true;
    for (const id of ['ember_core_1', 'ember_core_2', 'ember_core_3']) removeItem(this.data, id, 1);
    this.world.setLanternLit(true);
    this.world.refreshDynamic(this.data);
    this.music.play('ending');
    this.mode = 'cutscene';
    this.player.state = 'frozen';
    this.player.lockTarget = null;
    this.endingIndex = -1;
    this.endingT = 99;
    this.ui.showHud(false);
    this.input.exitPointerLock();
    this.effects.burst(0, this.world.groundY(0, 74) + 8.4, 74, { count: 120, color: 0xffd27a, speed: 10, life: 2.5, gravity: -1, size: 'm' });
    this.shake(0.6);
    this.autosave();
  }

  private stepCutscene(dt: number, f: InputFrame) {
    this.endingT += dt;
    this.camRig.yaw += dt * 0.12;
    const skip = f.pressed.interact || f.pressed.attack || f.pressed.pause;
    if (this.endingT > 5 || (skip && this.endingT > 0.4)) {
      this.endingIndex++;
      this.endingT = 0;
      if (this.endingIndex >= ENDING_LINES.length) {
        this.ui.hideDialogue();
        this.mode = 'credits';
        this.ui.openScreen('credits', { ending: true });
        return;
      }
      const l = ENDING_LINES[this.endingIndex];
      this.ui.showDialogue(l.speaker ? NPC_NAMES[l.speaker] : '', l.text, [], true);
    }
    if (this.rng.chance(0.3)) {
      const a = this.rng.next() * Math.PI * 2;
      this.effects.burst(Math.cos(a) * 20, this.player.pos.y + 1, 58 + Math.sin(a) * 20, { count: 2, color: 0xbfe8ff, speed: 0.5, life: 3, gravity: -2, size: 'm' });
    }
  }

  /** After the credits: continue exploring in the village. */
  continueAfterEnding() {
    this.ui.hideAllScreens();
    this.mode = 'playing';
    this.player.state = 'normal';
    this.enterArea('village', 'from_summit');
    this.ui.showHud(true);
    this.autosave();
  }

  // ------------------------------------------------------------------ Menus & services

  openPause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.exitPointerLock();
    this.input.clearAll();
    this.ui.openScreen('pause');
    this.sfx('uiConfirm');
  }

  openMenu(name: 'inventory' | 'quests' | 'shop' | 'smith' | 'shrine' | 'wayshrine' | 'skills') {
    if (this.mode !== 'playing' && this.mode !== 'paused') return;
    this.mode = 'menu';
    this.input.exitPointerLock();
    this.input.clearAll();
    this.ui.openScreen(name);
    this.sfx('uiConfirm');
  }

  /** Called by the UI when the last screen closes. */
  resumePlay() {
    if (this.mode === 'paused' || this.mode === 'menu') {
      this.mode = 'playing';
      this.input.clearAll();
      this.refreshStats();
      this.refreshNpcMarkers();
      this.ui.showHud(true);
    }
  }

  quitToTitle() {
    this.clearEntities();
    this.world.unload();
    this.bossActive = false;
    this.boss = null;
    if (this.companion) {
      this.scene.remove(this.companion.root);
      this.companion = null;
    }
    this.scene.remove(this.player.root);
    this.mode = 'title';
    this.showTitleScene();
  }

  /** Load a scenic backdrop behind the title screen. */
  showTitleScene() {
    this.data = newGameData();
    this.quests = new QuestLog(this.data, this.rng);
    const area = this.world.load('village', this.data);
    this.effects.setAmbient(area.ambient);
    this.player.place(0, this.world.groundY(0, 6), 6, Math.PI);
    this.camRig.snapBehind(Math.PI * 0.85);
    this.camRig.pitch = 0.12;
    this.music.play('title');
    this.ui.showHud(false);
    this.ui.openScreen('title');
  }

  equipItem(uid: string, slot: EquipSlot): boolean {
    const ok = equip(this.data, uid, slot);
    if (ok) this.afterEquipChange();
    return ok;
  }

  unequipSlot(slot: EquipSlot): boolean {
    const ok = unequip(this.data, slot);
    if (ok) this.afterEquipChange();
    return ok;
  }

  private afterEquipChange() {
    if (this.data.player.activeWeapon === 1 && !this.data.player.equipment.weapon2) this.data.player.activeWeapon = 0;
    this.player.equipWeapon(this);
    this.refreshStats();
    this.sfx('swap');
  }

  useItem(uid: string): boolean {
    const inst = findItem(this.data, uid);
    const def = inst ? ITEMS[inst.id] : null;
    if (!inst || !def?.use) return false;
    const u = def.use;
    if (u.heal) {
      if (this.player.hp >= this.stats.maxHp) {
        this.ui.toast('Already at full health.', 'info');
        return false;
      }
      const mult = hasSpecial(this.data, 'teaMastery') ? 1.5 : 1;
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * u.heal * mult);
    }
    if (u.spirit) this.player.spirit = Math.min(this.stats.maxSpirit, this.player.spirit + u.spirit);
    if (u.buffAtk) {
      this.player.buffAtk = u.buffAtk;
      this.player.buffT = u.buffTime ?? 30;
    }
    removeItem(this.data, uid, 1);
    this.sfx('heal');
    this.ui.toast(`Used ${def.name}`, 'info');
    return true;
  }

  sellItem(uid: string): number {
    const coins = sell(this.data, uid);
    if (coins > 0) this.sfx('coin');
    return coins;
  }

  shopStock() {
    return SHOP_STOCK.filter((s) => (!s.requires || evalCond(this.data, s.requires)) && !(s.once && this.data.flags[`bought_${s.item}`] > 0));
  }

  buyItem(itemId: string): boolean {
    const entry = SHOP_STOCK.find((s) => s.item === itemId);
    if (!entry) return false;
    const def = ITEMS[itemId];
    let ok: boolean;
    if (def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'charm') {
      if (this.data.player.coins < entry.price) ok = false;
      else {
        this.data.player.coins -= entry.price;
        const g = generateEquipment(itemId, this.rng, entry.rarity ?? 0);
        addItem(this.data, itemId, 1, { rarity: g.rarity, affixes: g.affixes });
        if (entry.once) setFlag(this.data, `bought_${itemId}`);
        ok = true;
      }
    } else ok = buy(this.data, itemId, entry.price);
    this.sfx(ok ? 'coin' : 'uiError');
    if (ok) this.handleQuestUpdates(this.quests.checkAllCollect());
    return ok;
  }

  upgradeItem(uid: string): boolean {
    const ok = upgrade(this.data, uid);
    this.sfx(ok ? 'chest' : 'uiError');
    if (ok) {
      this.player.equipWeapon(this);
      this.refreshStats();
    }
    return ok;
  }

  train(skillId: string) {
    const r = trainSkill(this.data, skillId);
    this.sfx(r === 'ok' ? 'levelUp' : 'uiError');
    this.refreshStats();
    return r;
  }

  respecSkills(): boolean {
    const cost = 100;
    if (this.data.player.coins < cost) return false;
    this.data.player.coins -= cost;
    resetSkills(this.data);
    this.refreshStats();
    return true;
  }

  save(slot: SlotId): boolean {
    this.data.player.hpFrac = clamp(this.player.hp / this.stats.maxHp, 0.05, 1);
    this.data.player.spirit = this.player.spirit;
    this.data.player.pos = this.bossActive || this.mode === 'title' ? null : [this.player.pos.x, this.player.pos.y, this.player.pos.z];
    const ok = this.saves.save(slot, this.data);
    if (!ok) this.ui?.toast('Saving failed (storage unavailable). Progress kept for this session only.', 'error');
    return ok;
  }

  autosave() {
    if (this.mode === 'title' || !this.world.area) return;
    this.save('auto');
    this.lastAutosave = this.time;
  }

  // ------------------------------------------------------------------ Waypoints

  /** World position the quest waypoint should point at, if any. */
  waypoint(): { x: number; y: number; z: number; label: string } | null {
    const qid = this.data.quests.tracked;
    const area = this.world.area;
    if (!qid || !area) return null;
    const obj = currentObjective(this.data, qid);
    if (!obj) return null;
    const here = area.id;
    let target = obj.area as AreaId | undefined;
    if (obj.target.startsWith('area:')) target = obj.target.slice(5) as AreaId;
    if (target && target !== here && AREA_IDS.includes(target)) {
      // Route through exits toward the objective's area.
      const next = nextAreaToward(here, target);
      const ex = area.exits.find((e) => e.to === next);
      if (ex) return { x: ex.x, y: this.world.groundY(ex.x, ex.z), z: ex.z, label: ex.label };
      return null;
    }
    const wp = obj.waypoint;
    if (!wp) return null;
    const npc = this.npcs.find((n) => n.id === wp);
    if (npc) return { x: npc.pos.x, y: npc.pos.y, z: npc.pos.z, label: npc.name };
    if (wp === 'brazier') {
      let best: InteractDef | null = null;
      let bd = Infinity;
      for (const io of this.world.interactObjs.values()) {
        if (io.def.kind !== 'brazier' || this.data.world.litBraziers.includes(io.def.id)) continue;
        const d = Math.hypot(io.def.x - this.player.pos.x, io.def.z - this.player.pos.z);
        if (d < bd) {
          bd = d;
          best = io.def;
        }
      }
      return best ? { x: best.x, y: this.world.groundY(best.x, best.z), z: best.z, label: 'Brazier' } : null;
    }
    const m = area.markers[wp];
    if (m) return { x: m.x, y: this.world.groundY(m.x, m.z), z: m.z, label: obj.text };
    if (wp === 'kohaku' || wp === 'hotaru') return null;
    return null;
  }

  questTitle(id: string): string {
    return QUESTS[id]?.title ?? id;
  }

  // ------------------------------------------------------------------ Test hooks

  debugState() {
    const p = this.player;
    return {
      mode: this.mode,
      area: this.world.area?.id ?? null,
      time: this.time,
      player: {
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        yaw: p.yaw,
        hp: p.hp,
        maxHp: this.stats.maxHp,
        stamina: p.stamina,
        spirit: p.spirit,
        state: p.state,
        weapon: p.weaponType,
        level: this.data.player.level,
        lock: p.lockTarget?.spawnId ?? null,
      },
      coins: this.data.player.coins,
      enemies: this.enemies.map((e) => ({ id: e.spawnId, def: e.def.id, hp: e.hp, maxHp: e.maxHp, x: e.pos.x, z: e.pos.z, state: e.state, alive: e.alive, boss: e.boss, dormant: e.dormant, phase: e.phase })),
      npcs: this.npcs.map((n) => ({ id: n.id, x: n.pos.x, z: n.pos.z })),
      quests: { active: { ...this.data.quests.active }, completed: [...this.data.quests.completed], tracked: this.data.quests.tracked },
      flags: { ...this.data.flags },
      interaction: this.interaction?.label ?? null,
      bossActive: this.bossActive,
      companion: !!this.companion,
      ending: this.data.ending,
      inventory: this.data.inventory.map((i) => ({ uid: i.uid, id: i.id, qty: i.qty, rarity: i.rarity, level: i.level })),
      equipment: { ...this.data.player.equipment },
      telegraphs: this.effects.telegraphs.count,
      projectiles: this.projectiles.count,
      dialogue: this.dialogue ? { npc: this.dialogue.npc.id, node: this.dialogue.runner.nodeId } : null,
      screen: this.ui?.currentScreen() ?? null,
      dangoCount: countItem(this.data, 'dango'),
    };
  }

  teleport(x: number, z: number) {
    this.player.place(x, this.world.groundY(x, z), z, this.player.yaw);
  }

  /** Approach an interaction target directly (tests). */
  findNpc(id: string): Npc | undefined {
    return this.npcs.find((n) => n.id === id);
  }

  dialogueNodeText(): string | null {
    return this.dialogue?.runner.node?.text ?? null;
  }

  dialogueExists(id: string): boolean {
    return !!DIALOGUES[id];
  }
}
