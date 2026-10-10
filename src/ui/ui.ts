// All HTML user interface: HUD, dialogue, menus and settings. Supports mouse,
// keyboard and gamepad navigation.

import * as THREE from 'three';
import { ACTIONS, ACTION_LABELS, Action, DEFAULT_KEY_BINDINGS, DEFAULT_PAD_BINDINGS, cloneKeyBindings, clonePadBindings, keyName, padButtonName, rebindKey, rebindPad } from '../core/bindings';
import type { UiNav } from '../core/input';
import { DIFFICULTY_MODS, Settings, defaultSettings } from '../core/settings';
import { AREA_NAMES, AreaId } from '../data/areaIds';
import { ITEMS, MAX_UPGRADE, RARITY_COLORS, RARITY_NAMES, StatKey, formatStat } from '../data/items';
import { QUESTS } from '../data/quests';
import { SKILLS } from '../data/skills';
import { WEAPON_FAMILIES } from '../data/weapons';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game/game';
import { canTrain } from '../systems/progression';
import { countItem, findItem, isEquipment, isEquipped, sellValue, upgradeCost, canUpgrade } from '../systems/inventory';
import { objectiveCount } from '../systems/quests';
import { SLOTS, SlotId } from '../systems/save';
import { EquipSlot, ItemInstance } from '../systems/state';
import { itemStats } from '../systems/stats';
import { xpToNext } from '../systems/progression';
import { ICONS, itemIcon } from './icons';

export type ScreenName =
  | 'title'
  | 'pause'
  | 'inventory'
  | 'quests'
  | 'shop'
  | 'smith'
  | 'shrine'
  | 'skills'
  | 'wayshrine'
  | 'save'
  | 'load'
  | 'settings'
  | 'credits'
  | 'death'
  | 'confirm'
  | 'controls';

interface Screen {
  name: ScreenName;
  el: HTMLDivElement;
  opts: Record<string, unknown>;
  focus: number;
  state: Record<string, unknown>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
}

export class UI {
  private root: HTMLDivElement;
  private hud!: HTMLDivElement;
  private els: Record<string, HTMLElement> = {};
  private stack: Screen[] = [];
  private screensEl!: HTMLDivElement;
  private toastsEl!: HTMLDivElement;
  private captionsEl!: HTMLDivElement;
  private dialogueEl!: HTMLDivElement;
  private minimap!: HTMLCanvasElement;
  private mmCtx!: CanvasRenderingContext2D;
  private bannerT = 0;
  private typing: { full: string; shown: number; el: HTMLElement } | null = null;
  private dialogueChoices: string[] = [];
  private choiceFocus = 0;
  private bossTarget: Enemy | null = null;
  private hintT = 0;
  private lastHp = -1;
  private mmTick = 0;
  private v = new THREE.Vector3();
  private deathShown = false;

  constructor(
    private game: Game,
    container: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    container.appendChild(this.root);
    this.buildHud();
    this.screensEl = document.createElement('div');
    this.screensEl.id = 'screens';
    this.root.appendChild(this.screensEl);
    const fade = document.createElement('div');
    fade.id = 'fade';
    this.root.appendChild(fade);
    this.els.fade = fade;
    window.addEventListener('keydown', (e) => this.onKey(e));
    game.input.onUiNav = (n) => this.onNav(n);
    game.input.onDeviceChange = () => this.refresh();
  }

  // =================================================================== HUD

  private buildHud() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'hidden';
    hud.innerHTML = `
      <div id="lowhp"></div>
      <div id="vignette"></div>
      <div class="hud-vitals">
        <div class="hud-name">LANTERN WARDEN <span id="h-level"></span></div>
        <div class="bar hp"><div class="lag" id="h-hplag"></div><div class="fill" id="h-hp"></div><div class="label" id="h-hptext"></div></div>
        <div class="bar stamina"><div class="fill" id="h-st"></div></div>
        <div class="bar spirit" id="h-spbar"><div class="fill" id="h-sp"></div></div>
        <div class="hud-meta"><span><span class="coin-ico">◉</span> <b id="h-coins">0</b></span><span id="h-sp-text"></span></div>
        <div class="bar xp"><div class="fill" id="h-xp"></div></div>
        <div class="status-row" id="h-status"></div>
      </div>
      <canvas id="minimap" width="340" height="340"></canvas>
      <div class="minimap-label" id="h-area"></div>
      <div class="hud-tracker" id="h-tracker"></div>
      <div id="boss-bar"><div class="btitle" id="b-title"></div><div class="bname" id="b-name"></div><div class="bar"><div class="lag" id="b-lag"></div><div class="fill" id="b-fill"></div></div><div class="phase" id="b-phase"></div></div>
      <div class="hud-weapons">
        <div class="wslot" id="h-w1"></div>
        <div class="wslot" id="h-w2"></div>
        <div class="ability" id="h-ab"><div class="cd" id="h-abcd"></div><div class="name" id="h-abname"></div><span id="h-abcost"></span><div class="key" id="h-abkey"></div></div>
        <div class="quick" id="h-quick">${ICONS.dango}<div class="count" id="h-dango"></div><div class="key" id="h-healkey"></div></div>
      </div>
      <div id="reticle"></div>
      <div id="waypoint"><div class="diamond"></div><div id="wp-text"></div></div>
      <div id="prompt"></div>
      <div id="toasts"></div>
      <div id="banner"><div class="t" id="bn-t"></div><div class="s" id="bn-s"></div></div>
      <div class="controls-hint" id="ctl-hint"></div>
      <div id="fps"></div>`;
    this.root.appendChild(hud);
    this.hud = hud;
    hud.querySelectorAll<HTMLElement>('[id]').forEach((el) => (this.els[el.id] = el));
    this.toastsEl = this.els.toasts as HTMLDivElement;
    this.minimap = this.els.minimap as HTMLCanvasElement;
    this.mmCtx = this.minimap.getContext('2d')!;
    this.captionsEl = document.createElement('div');
    this.captionsEl.id = 'captions';
    this.root.appendChild(this.captionsEl);
    this.dialogueEl = document.createElement('div');
    this.dialogueEl.id = 'dialogue';
    this.root.appendChild(this.dialogueEl);
    this.dialogueEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const ch = t.closest('[data-choice]') as HTMLElement | null;
      if (ch) this.game.chooseDialogue(Number(ch.dataset.choice));
      else if (!this.dialogueChoices.length && this.game.mode === 'dialogue') this.game.advanceDialogue();
    });
  }

  showHud(v: boolean) {
    this.hud.classList.toggle('hidden', !v);
    if (!v) this.els.prompt.classList.remove('show');
  }

  applySettings(s: Settings) {
    const sizes = { small: '17px', medium: '22px', large: '27px', xlarge: '33px' };
    document.documentElement.style.setProperty('--sub-size', sizes[s.subtitleSize]);
    document.documentElement.style.setProperty('--sub-bg', String(s.subtitleBackground));
    this.els.fps.style.display = s.showFps ? 'block' : 'none';
  }

  update(dt: number) {
    const g = this.game;
    // Dialogue typewriter
    if (this.typing) {
      this.typing.shown += dt * 55;
      const n = Math.floor(this.typing.shown);
      this.typing.el.textContent = this.typing.full.slice(0, n);
      if (n >= this.typing.full.length) this.typing = null;
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.els.banner.classList.remove('show');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.els['ctl-hint'].classList.remove('show');
    }
    if (g.settings.showFps) this.els.fps.textContent = `${g.fps} fps`;
    if (this.hud.classList.contains('hidden')) return;
    const p = g.player;
    const s = g.stats;
    const d = g.data;
    const hpf = Math.max(0, p.hp / s.maxHp);
    (this.els['h-hp'] as HTMLElement).style.transform = `scaleX(${hpf})`;
    if (Math.abs(this.lastHp - hpf) > 0.001) {
      (this.els['h-hplag'] as HTMLElement).style.transform = `scaleX(${hpf})`;
      this.lastHp = hpf;
    }
    this.els['h-hptext'].textContent = `${Math.ceil(p.hp)} / ${s.maxHp}`;
    (this.els['h-st'] as HTMLElement).style.transform = `scaleX(${Math.max(0, p.stamina / s.maxStamina)})`;
    (this.els['h-sp'] as HTMLElement).style.transform = `scaleX(${p.spirit / s.maxSpirit})`;
    this.els['h-spbar'].classList.toggle('full', p.spirit >= p.family.ability.cost);
    this.els['h-level'].textContent = `· Lv ${d.player.level}`;
    this.els['h-coins'].textContent = String(d.player.coins);
    this.els['h-sp-text'].textContent = d.player.skillPoints > 0 ? `✦ ${d.player.skillPoints} skill point${d.player.skillPoints > 1 ? 's' : ''}` : '';
    (this.els['h-xp'] as HTMLElement).style.transform = `scaleX(${d.player.level >= 20 ? 1 : d.player.xp / xpToNext(d.player.level)})`;
    (this.els.lowhp as HTMLElement).style.opacity = hpf < 0.3 && p.alive ? String(0.5 + Math.sin(g.time * 6) * 0.3) : '0';
    let st = '';
    if (p.burnT > 0) st += `<span class="status burn">Burning ${p.burnT.toFixed(0)}s</span>`;
    if (p.slowT > 0) st += `<span class="status slow">Webbed ${p.slowT.toFixed(0)}s</span>`;
    if (p.buffT > 0) st += `<span class="status buff">Incense +${Math.round(p.buffAtk * 100)}% ${p.buffT.toFixed(0)}s</span>`;
    if (this.els['h-status'].innerHTML !== st) this.els['h-status'].innerHTML = st;

    // Weapons
    const eq = d.player.equipment;
    const w1 = eq.weapon1 ? findItem(d, eq.weapon1) : undefined;
    const w2 = eq.weapon2 ? findItem(d, eq.weapon2) : undefined;
    const act = d.player.activeWeapon;
    this.renderWeaponSlot(this.els['h-w1'], w1, act === 0, act === 0 ? '' : g.input.prompt('swapWeapon'));
    this.renderWeaponSlot(this.els['h-w2'], w2, act === 1, act === 1 ? '' : g.input.prompt('swapWeapon'));
    const ab = p.family.ability;
    const cd = p.abilityCd[p.weaponType];
    (this.els['h-abcd'] as HTMLElement).style.setProperty('--p', `${cd > 0 ? (cd / ab.cooldown) * 100 : p.spirit < ab.cost ? 100 : 0}%`);
    this.els['h-ab'].classList.toggle('ready', cd <= 0 && p.spirit >= ab.cost);
    this.els['h-abname'].textContent = ab.name;
    this.els['h-abcost'].textContent = cd > 0 ? cd.toFixed(1) : `${ab.cost}`;
    this.els['h-abkey'].textContent = g.input.prompt('ability');
    this.els['h-dango'].textContent = String(countItem(d, 'dango'));
    this.els['h-healkey'].textContent = g.input.prompt('heal');

    // Tracker
    const tq = d.quests.tracked;
    let tr = '';
    if (tq && QUESTS[tq]) {
      const obj = QUESTS[tq].objectives[d.quests.active[tq]?.stage ?? 0];
      tr = `<div class="qtitle">${esc(QUESTS[tq].title)}</div><div class="qobj">${esc(g.quests.objectiveText(tq))}</div>`;
      if (obj?.hint) tr += `<div class="qhint">${this.withPrompts(obj.hint)}</div>`;
    } else if (d.ending) tr = `<div class="qtitle">The Lantern burns</div><div class="qobj">Explore freely, Warden.</div>`;
    if (this.els['h-tracker'].innerHTML !== tr) this.els['h-tracker'].innerHTML = tr;
    this.els['h-area'].textContent = g.world.area?.name ?? '';

    // Interaction prompt
    const it = g.interaction;
    if (it && g.mode === 'playing') {
      const html = `<span class="kbd">${esc(g.input.prompt('interact'))}</span>${esc(it.label)}`;
      if (this.els.prompt.innerHTML !== html) this.els.prompt.innerHTML = html;
      this.els.prompt.classList.add('show');
    } else this.els.prompt.classList.remove('show');

    // Boss bar
    const b = this.bossTarget;
    if (b) {
      const f = Math.max(0, b.hp / b.maxHp);
      (this.els['b-fill'] as HTMLElement).style.transform = `scaleX(${f})`;
      (this.els['b-lag'] as HTMLElement).style.transform = `scaleX(${f})`;
      const phases = (b.def.boss?.phaseThresholds.length ?? 0) + 1;
      this.els['b-phase'].textContent = phases > 1 ? `Phase ${b.phase} / ${phases}` : '';
    }

    this.updateWorldMarkers();
    if (++this.mmTick % 3 === 0) this.drawMinimap();
  }

  private renderWeaponSlot(el: HTMLElement, inst: ItemInstance | undefined, active: boolean, key: string) {
    const sig = `${inst?.uid}|${inst?.level}|${active}|${key}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.classList.toggle('active', active);
    el.style.borderColor = inst && active ? RARITY_COLORS[inst.rarity] : '';
    el.innerHTML = inst ? `${itemIcon(inst.id)}${inst.level ? `<span style="position:absolute;top:2px;left:4px;font-size:11px;color:var(--gold)">+${inst.level}</span>` : ''}${key ? `<div class="key">${esc(key)}</div>` : ''}` : '<span class="muted">—</span>';
  }

  /** Replace {action} tokens with the current device's prompts. */
  withPrompts(text: string): string {
    return esc(text).replace(/\{(\w+)\}/g, (_, a) => `<span class="kbd">${esc(this.game.input.prompt(a as Action))}</span>`);
  }

  private updateWorldMarkers() {
    const g = this.game;
    const cam = g.camRig.camera;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const lock = g.player.lockTarget;
    const ret = this.els.reticle;
    if (lock && lock.alive) {
      this.v.set(lock.pos.x, lock.pos.y + lock.aimHeight, lock.pos.z).project(cam);
      if (this.v.z < 1) {
        ret.style.left = `${(this.v.x * 0.5 + 0.5) * w}px`;
        ret.style.top = `${(-this.v.y * 0.5 + 0.5) * h}px`;
        ret.classList.add('show');
      } else ret.classList.remove('show');
    } else ret.classList.remove('show');

    const wp = g.mode === 'playing' ? g.waypoint() : null;
    const wpel = this.els.waypoint;
    if (wp) {
      this.v.set(wp.x, wp.y + 2.2, wp.z).project(cam);
      let x = (this.v.x * 0.5 + 0.5) * w;
      let y = (-this.v.y * 0.5 + 0.5) * h;
      const behind = this.v.z > 1;
      if (behind) {
        x = w - x;
        y = h - 40;
      }
      const m = 50;
      x = Math.min(w - m, Math.max(m, x));
      y = Math.min(h - m, Math.max(m + 120, y));
      wpel.style.left = `${x}px`;
      wpel.style.top = `${y}px`;
      const dist = Math.round(Math.hypot(wp.x - g.player.pos.x, wp.z - g.player.pos.z));
      this.els['wp-text'].textContent = `${dist} m`;
      wpel.classList.toggle('show', dist > 3);
    } else wpel.classList.remove('show');
  }

  private drawMinimap() {
    const g = this.game;
    const ctx = this.mmCtx;
    const W = this.minimap.width;
    const R = W / 2;
    const scale = R / 45; // pixels per metre
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(14,10,20,0.6)';
    ctx.fillRect(0, 0, W, W);
    const p = g.player.pos;
    const yaw = g.camRig.yaw;
    // Map world -> minimap so that camera forward is up.
    const tf = (x: number, z: number): [number, number] => {
      const dx = x - p.x;
      const dz = z - p.z;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const forward = dx * fx + dz * fz;
      const right = dx * -fz + dz * fx;
      return [R - right * scale, R - forward * scale];
    };
    const area = g.world.area;
    if (area?.walkable) {
      // Sample walkable space coarsely.
      ctx.fillStyle = 'rgba(120,110,90,0.35)';
      const step = 4;
      for (let sx = -44; sx <= 44; sx += step) {
        for (let sz = -44; sz <= 44; sz += step) {
          const wx = p.x + sx;
          const wz = p.z + sz;
          if (area.walkable(wx, wz)) {
            const [mx, my] = tf(wx, wz);
            ctx.fillRect(mx - step * scale * 0.55, my - step * scale * 0.55, step * scale * 1.1, step * scale * 1.1);
          }
        }
      }
    }
    if (area) {
      for (const ex of area.exits) {
        const [x, y] = tf(ex.x, ex.z);
        ctx.fillStyle = '#7fd17a';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const io of g.world.interactObjs.values()) {
        if (!g.world.interactableAvailable(io.def, g.data) && io.def.kind !== 'wayshrine') continue;
        const [x, y] = tf(io.def.x, io.def.z);
        ctx.fillStyle = io.def.kind === 'chest' ? '#ffc145' : io.def.kind === 'wayshrine' ? '#ff8a6a' : '#6fd8ff';
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
    }
    for (const n of g.npcs) {
      const [x, y] = tf(n.pos.x, n.pos.z);
      ctx.fillStyle = n.marker.visible ? '#ffd27a' : '#e8e0d0';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const [x, y] = tf(e.pos.x, e.pos.z);
      ctx.fillStyle = e.boss ? '#ff3a3a' : e.aggro ? '#ff6a4a' : '#c05040';
      ctx.beginPath();
      ctx.arc(x, y, e.boss ? 10 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const wp = g.waypoint();
    if (wp) {
      let [x, y] = tf(wp.x, wp.z);
      const dx = x - R;
      const dy = y - R;
      const d = Math.hypot(dx, dy);
      if (d > R - 14) {
        x = R + (dx / d) * (R - 14);
        y = R + (dy / d) * (R - 14);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd27a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.restore();
    }
    if (g.companion) {
      const [x, y] = tf(g.companion.pos.x, g.companion.pos.z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow
    const rel = g.player.yaw - yaw;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-rel);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  toast(text: string, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 6) this.toastsEl.firstChild!.remove();
    setTimeout(() => (el.style.opacity = '0'), 4200);
    setTimeout(() => el.remove(), 4700);
  }

  banner(title: string, sub = '', seconds = 3.5) {
    this.els['bn-t'].textContent = title;
    this.els['bn-s'].textContent = sub;
    this.els.banner.classList.add('show');
    this.bannerT = seconds;
  }

  areaBanner(name: string) {
    this.banner(name, '', 2.8);
  }

  caption(text: string, speaker: string, seconds = 3) {
    if (!text) return;
    if (!this.game.settings.subtitles && speaker) return;
    this.pushCaption(`${speaker ? `<span class="who">${esc(speaker)}</span>` : ''}${esc(text)}`, '', seconds);
  }

  soundCaption(text: string) {
    this.pushCaption(esc(text), 'sound', 2);
  }

  private pushCaption(html: string, cls: string, seconds: number) {
    const el = document.createElement('div');
    el.className = `caption ${cls}`;
    el.innerHTML = html;
    this.captionsEl.appendChild(el);
    while (this.captionsEl.children.length > 3) this.captionsEl.firstChild!.remove();
    setTimeout(() => (el.style.opacity = '0'), seconds * 1000);
    setTimeout(() => el.remove(), seconds * 1000 + 450);
  }

  damageFlash() {
    if (this.game.settings.reduceFlashing) return;
    const v = this.els.vignette as HTMLElement;
    v.style.transition = 'none';
    v.style.opacity = '1';
    requestAnimationFrame(() => {
      v.style.transition = 'opacity 0.5s';
      v.style.opacity = '0';
    });
  }

  showBossBar(e: Enemy) {
    this.bossTarget = e;
    this.els['b-name'].textContent = e.def.name;
    this.els['b-title'].textContent = e.def.boss?.title ?? '';
    this.els['boss-bar'].classList.add('show');
  }

  hideBossBar() {
    this.bossTarget = null;
    this.els['boss-bar'].classList.remove('show');
  }

  showControlsHint() {
    const p = (a: Action) => `<span class="kbd">${esc(this.game.input.prompt(a))}</span>`;
    const pad = this.game.input.lastDevice === 'gamepad';
    this.els['ctl-hint'].innerHTML = `${pad ? 'Left stick' : `${p('moveForward')}${p('moveLeft')}${p('moveBack')}${p('moveRight')}`} Move &nbsp; ${pad ? 'Right stick' : 'Mouse (click to capture)'} Camera &nbsp; ${p('sprint')} Sprint<br>${p('attack')} Attack &nbsp; ${p('heavy')} Heavy &nbsp; ${p('dodge')} Dodge &nbsp; ${p('interact')} Talk &nbsp; ${p('pause')} Menu`;
    this.els['ctl-hint'].classList.add('show');
    this.hintT = 9;
  }

  fadeIn() {
    const f = this.els.fade;
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  // =================================================================== Dialogue

  showDialogue(speaker: string, text: string, choices: string[], cinematic = false) {
    this.dialogueChoices = choices;
    this.choiceFocus = 0;
    this.dialogueEl.innerHTML = `${speaker ? `<div class="speaker">${esc(speaker)}</div>` : ''}<div class="text"></div>${choices.length ? `<div class="choices">${choices.map((c, i) => `<button class="btn${i === 0 ? ' focused' : ''}" data-choice="${i}">${i + 1}. ${esc(c)}</button>`).join('')}</div>` : `<div class="next">${cinematic ? '' : esc(this.game.input.prompt('interact')) + ' ▶'}</div>`}`;
    this.dialogueEl.classList.add('show');
    const textEl = this.dialogueEl.querySelector('.text') as HTMLElement;
    this.typing = { full: text, shown: 0, el: textEl };
    this.showHud(false);
  }

  hideDialogue() {
    this.dialogueEl.classList.remove('show');
    this.dialogueChoices = [];
    this.typing = null;
    if (this.game.mode === 'playing') this.showHud(true);
  }

  dialogueHasChoices(): boolean {
    return this.dialogueChoices.length > 0;
  }

  dialogueTyping(): boolean {
    return !!this.typing;
  }

  finishTyping() {
    if (this.typing) {
      this.typing.el.textContent = this.typing.full;
      this.typing = null;
    }
  }

  private moveChoice(d: number) {
    const n = this.dialogueChoices.length;
    if (!n) return;
    this.choiceFocus = (this.choiceFocus + d + n) % n;
    this.dialogueEl.querySelectorAll('[data-choice]').forEach((el, i) => el.classList.toggle('focused', i === this.choiceFocus));
    this.game.sfx('uiMove');
  }

  // =================================================================== Screens

  currentScreen(): ScreenName | null {
    return this.stack.length ? this.stack[this.stack.length - 1].name : null;
  }

  isDeathShown() {
    return this.deathShown;
  }

  showDeath() {
    this.deathShown = true;
    this.showHud(false);
    this.openScreen('death');
  }

  openScreen(name: ScreenName, opts: Record<string, unknown> = {}) {
    const el = document.createElement('div');
    el.className = 'screen';
    this.screensEl.appendChild(el);
    const scr: Screen = { name, el, opts, focus: 0, state: {} };
    this.stack.push(scr);
    el.addEventListener('click', (e) => this.onClick(e, scr));
    el.addEventListener('input', (e) => this.onInput(e, scr));
    el.addEventListener('mousemove', (e) => {
      const t = (e.target as HTMLElement).closest('[data-f]');
      if (!t) return;
      const list = this.focusables(scr);
      const i = list.indexOf(t as HTMLElement);
      if (i >= 0 && i !== scr.focus) {
        scr.focus = i;
        this.applyFocus(scr);
      }
    });
    this.render(scr);
    if (name !== 'title' && name !== 'death' && name !== 'credits') this.showHud(false);
  }

  back() {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (top.name === 'title' || top.name === 'death') return;
    if (top.name === 'credits' && top.opts.ending) return;
    if (this.game.input.capturing) {
      this.game.input.cancelCapture();
      this.refresh();
      return;
    }
    this.game.sfx('uiBack');
    this.popScreen();
  }

  private popScreen() {
    const top = this.stack.pop();
    top?.el.remove();
    if (this.stack.length === 0) {
      if (this.game.mode === 'paused' || this.game.mode === 'menu') this.game.resumePlay();
    } else this.refresh();
  }

  hideAllScreens() {
    for (const s of this.stack) s.el.remove();
    this.stack = [];
    this.deathShown = false;
  }

  refresh() {
    const top = this.stack[this.stack.length - 1];
    if (top) this.render(top);
  }

  private focusables(scr: Screen): HTMLElement[] {
    return Array.from(scr.el.querySelectorAll<HTMLElement>('[data-f]')).filter((e) => !(e as HTMLButtonElement).disabled || e.dataset.keep);
  }

  private applyFocus(scr: Screen) {
    const list = this.focusables(scr);
    if (!list.length) return;
    scr.focus = Math.max(0, Math.min(scr.focus, list.length - 1));
    list.forEach((e, i) => e.classList.toggle('focused', i === scr.focus));
    const el = list[scr.focus];
    el.scrollIntoView?.({ block: 'nearest' });
    if (el.dataset.preview) this.preview(scr, el.dataset.preview);
  }

  private render(scr: Screen) {
    const html = this.screenHtml(scr);
    scr.el.className = `screen ${scr.name === 'title' ? 'title-screen' : scr.name === 'death' ? 'death' : ''}`;
    scr.el.innerHTML = html;
    this.applyFocus(scr);
  }

  // ------------------------------------------------------------------ Screen content

  private screenHtml(scr: Screen): string {
    const g = this.game;
    switch (scr.name) {
      case 'title': {
        const latest = g.saves.latest();
        return `<div class="logo"><div class="lantern"></div><div class="main">LANTERNBOUND</div><div class="sub">Embers of Hinoyama</div></div>
          <div class="title-menu">
            ${latest ? `<button class="btn" data-f data-action="continue">Continue</button>` : ''}
            <button class="btn" data-f data-action="newGame">New Game</button>
            <button class="btn" data-f data-action="open" data-arg="load">Load Game</button>
            <button class="btn" data-f data-action="open" data-arg="settings">Settings</button>
            <button class="btn" data-f data-action="open" data-arg="controls">Controls</button>
            <button class="btn" data-f data-action="open" data-arg="credits">Credits</button>
          </div>
          <div class="title-foot">An original action RPG · v1.0 · ${g.store.persistent ? 'Progress saves in this browser' : 'Storage unavailable: progress will not persist'}</div>`;
      }
      case 'pause':
        return `<div class="panel narrow"><h1>Paused</h1>
          <button class="btn" data-f data-action="close">Resume</button>
          <button class="btn" data-f data-action="open" data-arg="inventory">Inventory &amp; Equipment</button>
          <button class="btn" data-f data-action="open" data-arg="quests">Quest Log</button>
          <button class="btn" data-f data-action="open" data-arg="skills">Skills</button>
          <button class="btn" data-f data-action="open" data-arg="save" ${g.bossActive ? 'disabled' : ''}>Save Game${g.bossActive ? ' (not during a boss fight)' : ''}</button>
          <button class="btn" data-f data-action="open" data-arg="load">Load Game</button>
          <button class="btn" data-f data-action="open" data-arg="settings">Settings</button>
          <button class="btn" data-f data-action="open" data-arg="controls">Controls</button>
          <button class="btn danger" data-f data-action="quitConfirm">Quit to Title</button>
          <div class="hint-bar"><span>Play time: ${fmtTime(g.data.playTime)}</span><span>Defeated: ${g.data.stats.kills}</span><span>Difficulty: ${DIFFICULTY_MODS[g.settings.difficulty].label}</span></div></div>`;
      case 'inventory':
        return this.inventoryHtml(scr);
      case 'quests':
        return this.questsHtml();
      case 'skills':
      case 'shrine':
        return this.skillsHtml(scr.name === 'shrine');
      case 'shop':
        return this.shopHtml(scr);
      case 'smith':
        return this.smithHtml(scr);
      case 'wayshrine': {
        const visited = g.data.world.visitedAreas.filter((a) => a !== g.world.area?.id) as AreaId[];
        return `<div class="panel narrow"><h2>Wayshrine</h2><p class="muted">A small shrine of red lacquer. Its lantern still burns.</p>
          <button class="btn" data-f data-action="rest">Rest (restore health, save, enemies return)</button>
          <button class="btn" data-f data-action="open" data-arg="save">Save Game</button>
          ${visited.length ? `<h3>Travel</h3>${visited.map((a) => `<button class="btn" data-f data-action="travel" data-arg="${a}">Travel to ${esc(AREA_NAMES[a])}</button>`).join('')}` : ''}
          <button class="btn" data-f data-action="close">Leave</button></div>`;
      }
      case 'save':
      case 'load':
        return this.slotsHtml(scr.name === 'save');
      case 'settings':
        return this.settingsHtml(scr);
      case 'controls':
        return this.controlsHtml();
      case 'credits':
        return this.creditsHtml(scr);
      case 'death':
        return `<h1>THE LANTERN GUTTERS</h1><p class="muted" style="margin-bottom:24px">Your light fades... but a Warden's oath is not so easily broken.</p>
          <div class="title-menu">
            <button class="btn" data-f data-action="respawn">Rise Again (last waypoint)</button>
            <button class="btn" data-f data-action="open" data-arg="load">Load a Save</button>
            <button class="btn" data-f data-action="quitTitle">Quit to Title</button>
          </div><div class="title-foot">Tip: watch for the red ground markings — they show exactly where an attack will land. Dodge through them!</div>`;
      case 'confirm':
        return `<div class="panel narrow"><h2>${esc(String(scr.opts.title ?? 'Are you sure?'))}</h2><p>${esc(String(scr.opts.message ?? ''))}</p>
          <button class="btn" data-f data-action="confirmYes">${esc(String(scr.opts.yes ?? 'Yes'))}</button>
          <button class="btn" data-f data-action="close">${esc(String(scr.opts.no ?? 'Cancel'))}</button></div>`;
    }
  }

  private itemCell(inst: ItemInstance, opts: { action: string; selected?: boolean; showEq?: boolean } = { action: 'select' }): string {
    const g = this.game;
    const def = ITEMS[inst.id];
    const eq = opts.showEq !== false && isEquipped(g.data, inst.uid);
    return `<button class="item r${inst.rarity}${opts.selected ? ' focused' : ''}" data-f data-action="${opts.action}" data-arg="${inst.uid}" data-preview="${inst.uid}" title="${esc(def.name)}" style="color:${RARITY_COLORS[inst.rarity]}">
      ${itemIcon(inst.id)}${inst.level ? `<span class="lv">+${inst.level}</span>` : ''}${def.stackable ? `<span class="q">${inst.qty}</span>` : ''}${eq ? '<span class="eq">E</span>' : ''}${inst.isNew ? '<span class="new"></span>' : ''}</button>`;
  }

  private itemDetails(inst: ItemInstance | undefined, compareSlot?: EquipSlot): string {
    if (!inst) return '<div class="muted">Select an item to see its details.</div>';
    const g = this.game;
    const def = ITEMS[inst.id];
    let html = `<div class="nm" style="color:${RARITY_COLORS[inst.rarity]}">${isEquipment(inst.id) ? RARITY_NAMES[inst.rarity] + ' ' : ''}${esc(def.name)}${inst.level ? ` +${inst.level}` : ''}</div>`;
    html += `<div class="muted" style="margin:2px 0 8px">${def.kind === 'weapon' ? WEAPON_FAMILIES[def.weaponType!].name : def.kind[0].toUpperCase() + def.kind.slice(1)}${def.tier ? ` · Tier ${def.tier}` : ''}</div>`;
    if (isEquipment(inst.id)) {
      const st = itemStats(inst);
      let cmp: Partial<Record<StatKey, number>> = {};
      if (compareSlot) {
        const other = g.data.player.equipment[compareSlot];
        const oi = other ? findItem(g.data, other) : undefined;
        if (oi && oi.uid !== inst.uid) cmp = itemStats(oi);
      }
      for (const [k, v] of Object.entries(st)) {
        const key = k as StatKey;
        const diff = compareSlot && cmp ? v - (cmp[key] ?? 0) : 0;
        html += `<div class="stat">${formatStat(key, v)}${diff ? ` <span class="${diff > 0 ? 'cmp-up' : 'cmp-down'}">(${diff > 0 ? '▲' : '▼'}${key === 'atk' || key === 'def' || key === 'maxHp' ? Math.abs(Math.round(diff)) : Math.abs(Math.round(diff * 100)) + '%'})</span>` : ''}</div>`;
      }
      if (def.kind === 'weapon') {
        const fam = WEAPON_FAMILIES[def.weaponType!];
        html += `<div class="muted" style="margin-top:8px;font-size:13px">${esc(fam.description)}<br>Ability: <b style="color:var(--spirit)">${esc(fam.ability.name)}</b> — ${esc(fam.ability.description)}</div>`;
      }
    } else if (def.stackable) html += `<div>Owned: ${inst.qty}</div>`;
    html += `<p class="muted" style="font-style:italic">${esc(def.description)}</p>`;
    html += `<div class="muted" style="font-size:12px">Sell value: ${sellValue(inst)} coins</div>`;
    return html;
  }

  private preview(scr: Screen, uid: string) {
    if (scr.name !== 'inventory' && scr.name !== 'smith' && scr.name !== 'shop') return;
    scr.state.preview = uid;
    const box = scr.el.querySelector('#inv-details');
    if (!box) return;
    const inst = findItem(this.game.data, uid);
    const def = inst ? ITEMS[inst.id] : null;
    const slot: EquipSlot | undefined = def?.kind === 'weapon' ? (this.game.data.player.activeWeapon === 1 ? 'weapon2' : 'weapon1') : def?.kind === 'armor' ? 'armor' : def?.kind === 'charm' ? 'charm' : undefined;
    box.innerHTML = this.itemDetails(inst, slot) + (scr.name === 'inventory' ? this.itemActions(inst) : '');
  }

  private itemActions(inst: ItemInstance | undefined): string {
    if (!inst) return '';
    const g = this.game;
    const def = ITEMS[inst.id];
    const eq = g.data.player.equipment;
    let b = '<div style="margin-top:10px">';
    if (def.kind === 'weapon') {
      if (eq.weapon1 !== inst.uid) b += `<button class="btn small" data-f data-action="equip" data-arg="${inst.uid}|weapon1">Equip as Weapon 1</button>`;
      if (eq.weapon2 !== inst.uid) b += `<button class="btn small" data-f data-action="equip" data-arg="${inst.uid}|weapon2">Equip as Weapon 2</button>`;
      if (eq.weapon2 === inst.uid) b += `<button class="btn small" data-f data-action="unequip" data-arg="weapon2">Unequip</button>`;
    } else if (def.kind === 'armor' || def.kind === 'charm') {
      if (eq[def.kind] !== inst.uid) b += `<button class="btn small" data-f data-action="equip" data-arg="${inst.uid}|${def.kind}">Equip</button>`;
      else b += `<button class="btn small" data-f data-action="unequip" data-arg="${def.kind}">Unequip</button>`;
    } else if (def.use) b += `<button class="btn small" data-f data-action="use" data-arg="${inst.uid}">Use</button>`;
    return b + '</div>';
  }

  private inventoryHtml(scr: Screen): string {
    const g = this.game;
    const d = g.data;
    const tab = (scr.state.tab as string) ?? 'equipment';
    const eq = d.player.equipment;
    const slotNames: [EquipSlot, string][] = [
      ['weapon1', 'Weapon 1'],
      ['weapon2', 'Weapon 2'],
      ['armor', 'Armor'],
      ['charm', 'Charm'],
    ];
    const slots = slotNames
      .map(([s, label]) => {
        const inst = eq[s] ? findItem(d, eq[s]!) : undefined;
        return `<div class="slot-box">${inst ? this.itemCell(inst, { action: 'select', showEq: false }) : `<div class="item" style="opacity:.4"></div>`}${label}${d.player.activeWeapon === (s === 'weapon2' ? 1 : 0) && s.startsWith('weapon') ? ' ★' : ''}</div>`;
      })
      .join('');
    const items = d.inventory.filter((i) => (tab === 'equipment' ? isEquipment(i.id) : !isEquipment(i.id)));
    items.sort((a, b) => Number(isEquipped(d, b.uid)) - Number(isEquipped(d, a.uid)) || b.rarity - a.rarity || ITEMS[b.id].tier - ITEMS[a.id].tier);
    const s = g.stats;
    const statRows: [string, string][] = [
      ['Level', `${d.player.level}`],
      ['Health', `${Math.ceil(g.player.hp)} / ${s.maxHp}`],
      ['Attack', `${s.atk}`],
      ['Damage bonus', `${Math.round(s.atkPct * 100)}%`],
      ['Defense', `${s.def}`],
      ['Crit chance', `${Math.round(s.crit * 100)}%`],
      ['Crit damage', `+${Math.round(s.critDmg * 100)}%`],
      ['Stamina regen', `+${Math.round(s.staminaRegen * 100)}%`],
      ['Spirit gain', `+${Math.round(s.spiritGain * 100)}%`],
      ['Move speed', `+${Math.round(s.moveSpeed * 100)}%`],
      ['Lifesteal', `${Math.round(s.lifesteal * 100)}%`],
      ['Coins', `${d.player.coins}`],
    ];
    const sel = (scr.state.preview as string) ?? '';
    const selInst = sel ? findItem(d, sel) : undefined;
    return `<div class="panel"><h1>Inventory</h1>
      <div class="row">
        <div class="col" style="flex:1.4">
          <h3>Equipped</h3><div class="slots">${slots}</div>
          <div class="tabs" style="margin-top:14px">
            <button class="btn ${tab === 'equipment' ? 'sel' : ''}" data-f data-action="tab" data-arg="equipment">Equipment (${d.inventory.filter((i) => isEquipment(i.id)).length})</button>
            <button class="btn ${tab === 'items' ? 'sel' : ''}" data-f data-action="tab" data-arg="items">Items</button>
          </div>
          <div class="grid">${items.map((i) => this.itemCell(i, { action: 'select', selected: false })).join('') || '<span class="muted">Empty</span>'}</div>
        </div>
        <div class="col">
          <h3>Details</h3><div class="details" id="inv-details">${this.itemDetails(selInst)}${this.itemActions(selInst)}</div>
          <h3>Character</h3><div class="stats-list">${statRows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>
        </div>
      </div>
      <div class="hint-bar"><span>Select an item, then choose an action.</span><span>${esc(g.input.prompt('swapWeapon'))}: swap weapons in combat</span><button class="btn small" data-f data-action="close">Close</button></div></div>`;
  }

  private questsHtml(): string {
    const g = this.game;
    const d = g.data;
    const active = Object.keys(d.quests.active).map((id) => QUESTS[id]).filter(Boolean);
    active.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1));
    const entry = (qid: string) => {
      const q = QUESTS[qid];
      const st = d.quests.active[qid];
      const objs = q.objectives
        .map((o, i) => {
          if (i > st.stage) return '';
          const cls = i < st.stage ? 'done' : 'current';
          const cnt = objectiveCount(o) > 1 && i === st.stage ? ` (${o.type === 'collect' ? Math.min(objectiveCount(o), countItem(d, o.target)) : st.progress}/${objectiveCount(o)})` : '';
          return `<div class="obj ${cls}">${esc(o.text)}${cnt}</div>`;
        })
        .join('');
      return `<div class="quest-entry ${q.kind}"><div class="t">${q.kind === 'main' ? '◈ ' : ''}${esc(q.title)} ${d.quests.tracked === qid ? '<span class="muted" style="font-size:12px">(tracked)</span>' : `<button class="btn small" data-f data-action="track" data-arg="${qid}">Track</button>`}</div>
        <div class="muted" style="font-size:13px;margin:4px 0">${esc(q.summary)}</div>${objs}</div>`;
    };
    const done = d.quests.completed.map((id) => QUESTS[id]).filter(Boolean);
    return `<div class="panel"><h1>Quest Log</h1><div class="row"><div class="col" style="flex:2">
      <h3>Active</h3>${active.map((q) => entry(q.id)).join('') || '<p class="muted">No active quests. Speak with the villagers of Akari.</p>'}
      </div><div class="col"><h3>Completed (${done.length})</h3>${done.map((q) => `<div class="obj done">${esc(q.title)}</div>`).join('') || '<p class="muted">None yet.</p>'}</div></div>
      <div class="hint-bar"><button class="btn small" data-f data-action="close">Close</button></div></div>`;
  }

  private skillsHtml(canTrain_: boolean): string {
    const g = this.game;
    const d = g.data;
    const rows = SKILLS.map((sk) => {
      const rank = d.player.skills[sk.id] ?? 0;
      const r = canTrain(d, sk.id);
      const reason = r === 'level_too_low' ? `Requires level ${sk.requiresLevel}` : r === 'max_rank' ? 'Mastered' : r === 'no_points' ? 'No skill points' : '';
      const pips = Array.from({ length: sk.maxRank }, (_, i) => (i < rank ? '◆' : '◇')).join('');
      return `<div class="setting"><label><b>${esc(sk.name)}</b> <span style="color:var(--gold)">${pips}</span><br><span class="muted" style="font-size:13px">${esc(sk.description)}</span></label>
        <div class="val">${canTrain_ ? `<button class="btn small" data-f data-action="train" data-arg="${sk.id}" ${r !== 'ok' ? 'disabled data-keep="1"' : ''}>${r === 'ok' ? 'Train' : esc(reason)}</button>` : `<span class="muted">${rank}/${sk.maxRank}</span>`}</div></div>`;
    }).join('');
    return `<div class="panel"><h1>${canTrain_ ? "Mikoto's Shrine — Training" : 'Skills'}</h1>
      <p>Skill points: <b style="color:var(--gold)">${d.player.skillPoints}</b> ${canTrain_ ? '' : '<span class="muted">— spend them with Mikoto at the village shrine.</span>'}</p>
      ${rows}
      <div class="hint-bar">${canTrain_ ? `<button class="btn small" data-f data-action="respec">Reset skills (100 coins)</button>` : ''}<button class="btn small" data-f data-action="close">Close</button></div></div>`;
  }

  private shopHtml(scr: Screen): string {
    const g = this.game;
    const d = g.data;
    const tab = (scr.state.tab as string) ?? 'buy';
    let body = '';
    if (tab === 'buy') {
      body = g
        .shopStock()
        .map((s) => {
          const def = ITEMS[s.item];
          const owned = def.stackable ? ` <span class="muted">(owned ${countItem(d, s.item)}/${def.maxStack})</span>` : '';
          const color = s.rarity !== undefined ? RARITY_COLORS[s.rarity] : 'inherit';
          return `<div class="setting"><label><span style="color:${color}">${s.rarity !== undefined && isEquipment(s.item) ? RARITY_NAMES[s.rarity] + ' ' : ''}${esc(def.name)}</span>${owned}<br><span class="muted" style="font-size:13px">${esc(def.description)}</span></label>
          <div class="val"><button class="btn small" data-f data-action="buy" data-arg="${s.item}" ${d.player.coins < s.price ? 'disabled data-keep="1"' : ''}>Buy · ${s.price} ◉</button></div></div>`;
        })
        .join('');
    } else {
      const sellable = d.inventory.filter((i) => ITEMS[i.id].kind !== 'key' && !isEquipped(d, i.uid));
      body = `<div class="row"><div class="col"><div class="grid">${sellable.map((i) => this.itemCell(i, { action: 'sell' })).join('') || '<span class="muted">Nothing to sell.</span>'}</div></div><div class="col"><div class="details" id="inv-details"><div class="muted">Select an item to sell it.</div></div></div></div>`;
    }
    return `<div class="panel"><h1>The Fallen Leaf — Ohana's Wares</h1><p>Your coins: <b style="color:var(--gold)">${d.player.coins} ◉</b></p>
      <div class="tabs"><button class="btn ${tab === 'buy' ? 'sel' : ''}" data-f data-action="tab" data-arg="buy">Buy</button><button class="btn ${tab === 'sell' ? 'sel' : ''}" data-f data-action="tab" data-arg="sell">Sell</button></div>
      ${body}<div class="hint-bar"><button class="btn small" data-f data-action="close">Leave</button></div></div>`;
  }

  private smithHtml(_scr: Screen): string {
    const g = this.game;
    const d = g.data;
    const gear = d.inventory.filter((i) => isEquipment(i.id));
    gear.sort((a, b) => Number(isEquipped(d, b.uid)) - Number(isEquipped(d, a.uid)) || ITEMS[b.id].tier - ITEMS[a.id].tier);
    const rows = gear
      .map((i) => {
        const def = ITEMS[i.id];
        const c = upgradeCost(i);
        const can = canUpgrade(d, i);
        const cost = c ? `${c.coins} ◉ · ${c.ore} ore${c.essence ? ` · ${c.essence} essence` : ''}` : 'Max level';
        return `<div class="setting"><label><span style="color:${RARITY_COLORS[i.rarity]}">${esc(def.name)}${i.level ? ` +${i.level}` : ''}</span>${isEquipped(d, i.uid) ? ' <span class="eq" style="color:var(--gold)">(equipped)</span>' : ''}<br><span class="muted" style="font-size:13px">${Object.entries(itemStats(i)).slice(0, 3).map(([k, v]) => formatStat(k as StatKey, v)).join(' · ')}</span></label>
        <div class="val"><button class="btn small" data-f data-action="upgrade" data-arg="${i.uid}" ${!can ? 'disabled data-keep="1"' : ''}>${i.level >= MAX_UPGRADE ? 'Mastered' : `Upgrade → +${i.level + 1}`}</button><span class="muted" style="font-size:12px;min-width:150px">${cost}</span></div></div>`;
      })
      .join('');
    return `<div class="panel"><h1>Kanetsugu's Forge</h1>
      <p>Coins <b style="color:var(--gold)">${d.player.coins}</b> · Spirit Ore <b style="color:var(--spirit)">${countItem(d, 'spirit_ore')}</b> · Hollow Essence <b style="color:var(--xp)">${countItem(d, 'hollow_essence')}</b></p>
      <p class="muted">Each upgrade raises an item's base stats by 12%. Items can be upgraded to +${MAX_UPGRADE}.</p>
      ${rows}<div class="hint-bar"><button class="btn small" data-f data-action="close">Leave</button></div></div>`;
  }

  private slotsHtml(saving: boolean): string {
    const g = this.game;
    const rows = SLOTS.filter((s) => !(saving && s === 'auto'))
      .map((slot) => {
        const sum = g.saves.summary(slot);
        const name = slot === 'auto' ? 'Autosave' : `Slot ${slot}`;
        let desc = '<span class="muted">Empty</span>';
        if (sum.corrupt) desc = `<span style="color:#ff8a7a">Damaged: ${esc(sum.error ?? '')}</span>`;
        else if (sum.exists) desc = `Lv ${sum.level} · ${esc(AREA_NAMES[sum.area as AreaId] ?? '')} · ${esc(sum.quest ?? '')} · ${fmtTime(sum.playTime ?? 0)} · ${new Date(sum.savedAt ?? 0).toLocaleString()}`;
        const main = saving
          ? `<button class="btn" data-f data-action="saveSlot" data-arg="${slot}"><b>${name}</b><br><span style="font-size:13px">${desc}</span></button>`
          : `<button class="btn" data-f data-action="loadSlot" data-arg="${slot}" ${!sum.exists || sum.corrupt ? 'disabled data-keep="1"' : ''}><b>${name}</b><br><span style="font-size:13px">${desc}</span></button>`;
        const extra = sum.exists
          ? `<button class="btn small" data-f data-action="export" data-arg="${slot}">Export</button><button class="btn small danger" data-f data-action="deleteSlot" data-arg="${slot}">Delete</button>`
          : '';
        return `${main}<div style="margin:-2px 0 10px">${extra}${!saving && slot !== 'auto' ? `<button class="btn small" data-f data-action="import" data-arg="${slot}">Import file…</button>` : ''}</div>`;
      })
      .join('');
    return `<div class="panel narrow" style="width:min(640px,94vw)"><h1>${saving ? 'Save Game' : 'Load Game'}</h1>${rows}
      <div class="hint-bar"><button class="btn small" data-f data-action="close">Back</button></div></div>`;
  }

  private settingsHtml(scr: Screen): string {
    const s = this.game.settings;
    const tab = (scr.state.tab as string) ?? 'gameplay';
    const tabs = [
      ['gameplay', 'Gameplay'],
      ['controls', 'Controls'],
      ['audio', 'Audio'],
      ['access', 'Accessibility'],
      ['graphics', 'Graphics'],
    ];
    const toggle = (key: keyof Settings, label: string) => `<div class="setting" data-f data-action="toggle" data-arg="${key}"><label>${label}</label><div class="val">${s[key] ? 'On' : 'Off'}</div></div>`;
    const cycle = (key: keyof Settings, label: string, opts: [string, string][]) => {
      const cur = opts.find((o) => o[0] === s[key])?.[1] ?? String(s[key]);
      return `<div class="setting" data-f data-action="cycle" data-arg="${key}" data-opts="${opts.map((o) => o[0]).join(',')}"><label>${label}</label><div class="val">◀ ${cur} ▶</div></div>`;
    };
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<div class="setting" data-f data-action="slider" data-arg="${key}" data-min="${min}" data-max="${max}" data-step="${step}"><label>${label}</label><div class="val"><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-setting="${key}"><span style="min-width:44px">${fmt(s[key] as number)}</span></div></div>`;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    let body = '';
    if (tab === 'gameplay') {
      body =
        cycle('difficulty', 'Difficulty', [
          ['story', 'Story (gentle)'],
          ['normal', 'Normal'],
          ['hard', 'Hard'],
        ]) +
        cycle('lockOnMode', 'Lock-on mode', [
          ['toggle', 'Toggle'],
          ['hold', 'Hold'],
        ]) +
        toggle('autoFaceTarget', 'Auto-face nearby enemies when attacking') +
        toggle('companionEnabled', 'Fox companion (Kohaku) follows you') +
        toggle('damageNumbers', 'Show damage numbers') +
        `<p class="muted" style="font-size:13px">Difficulty applies immediately to damage taken; enemy health changes on the next area load.</p>`;
    } else if (tab === 'controls') {
      const capturing = scr.state.capturing as string | undefined;
      body =
        slider('mouseSensitivity', 'Mouse / key camera sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2)) +
        slider('stickSensitivity', 'Gamepad camera sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2)) +
        toggle('invertY', 'Invert camera Y') +
        `<h3>Key bindings <span class="muted" style="font-size:12px">— select a binding, then press the new key/button. Esc cancels.</span></h3>` +
        ACTIONS.map((a) => {
          const kb = s.keyBindings[a];
          const pb = s.padBindings[a];
          const cap = (slot: string) => (capturing === `${a}|${slot}` ? ' capturing' : '');
          const padOk = !a.startsWith('move') && !a.startsWith('look');
          return `<div class="setting"><label>${ACTION_LABELS[a]}</label><div class="val">
            <button class="bind${cap('k0')}" data-f data-rebind data-action="rebind" data-arg="${a}|k0">${capturing === `${a}|k0` ? 'Press…' : esc(kb[0] ? keyName(kb[0]) : '—')}</button>
            <button class="bind${cap('k1')}" data-f data-rebind data-action="rebind" data-arg="${a}|k1">${capturing === `${a}|k1` ? 'Press…' : esc(kb[1] ? keyName(kb[1]) : '—')}</button>
            ${padOk ? `<button class="bind${cap('p')}" data-f data-rebind data-action="rebind" data-arg="${a}|p">🎮 ${capturing === `${a}|p` ? 'Press…' : esc(pb[0] !== undefined ? padButtonName(pb[0]) : '—')}</button>` : '<span class="bind muted" style="border:none">🎮 stick</span>'}
          </div></div>`;
        }).join('') +
        `<button class="btn small" data-f data-action="resetBindings">Reset bindings to defaults</button>`;
    } else if (tab === 'audio') {
      body = slider('masterVolume', 'Master volume', 0, 1, 0.05, pct) + slider('musicVolume', 'Music volume', 0, 1, 0.05, pct) + slider('sfxVolume', 'Effects volume', 0, 1, 0.05, pct);
    } else if (tab === 'access') {
      body =
        toggle('subtitles', 'Subtitles for spoken lines') +
        cycle('subtitleSize', 'Subtitle & dialogue text size', [
          ['small', 'Small'],
          ['medium', 'Medium'],
          ['large', 'Large'],
          ['xlarge', 'Extra large'],
        ]) +
        slider('subtitleBackground', 'Subtitle background opacity', 0, 1, 0.05, pct) +
        toggle('soundCaptions', 'Captions for important sounds') +
        toggle('cameraShake', 'Camera shake') +
        toggle('reduceFlashing', 'Reduce flashing effects') +
        toggle('highContrastTelegraphs', 'High-contrast attack warnings (yellow/magenta)') +
        slider('fov', 'Field of view', 55, 100, 1, (v) => `${Math.round(v)}°`) +
        `<p class="muted" style="font-size:13px">All controls are remappable under Controls. Story difficulty halves incoming damage.</p>`;
    } else {
      body =
        cycle('quality', 'Graphics quality', [
          ['low', 'Low (no shadows)'],
          ['medium', 'Medium'],
          ['high', 'High'],
        ]) + toggle('showFps', 'Show FPS counter');
    }
    return `<div class="panel"><h1>Settings</h1><div class="tabs">${tabs.map(([id, l]) => `<button class="btn ${tab === id ? 'sel' : ''}" data-f data-action="tab" data-arg="${id}">${l}</button>`).join('')}</div>
      ${body}<div class="hint-bar"><button class="btn small" data-f data-action="resetSettings">Restore all defaults</button><button class="btn small" data-f data-action="close">Done</button><span>Changes save automatically.</span></div></div>`;
  }

  private controlsHtml(): string {
    const s = this.game.settings;
    const rows = ACTIONS.filter((a) => !a.startsWith('look'))
      .map((a) => `<span>${ACTION_LABELS[a]}</span><span>${esc(s.keyBindings[a].map(keyName).join(' / ') || '—')} &nbsp; <span class="muted">${a.startsWith('move') ? 'Left stick' : esc(s.padBindings[a].map(padButtonName).join(' / ') || '—')}</span></span>`)
      .join('');
    return `<div class="panel narrow" style="width:min(640px,94vw)"><h1>Controls</h1>
      <div class="stats-list" style="font-size:14px">${rows}<span>Camera</span><span>Mouse (click the game to capture) or arrow keys &nbsp; <span class="muted">Right stick</span></span></div>
      <h3>Combat tips</h3><ul class="muted" style="font-size:14px;line-height:1.6;padding-left:18px">
      <li>Red ground markings show exactly where an attack will land. Move out, or dodge through it — you are invulnerable mid-roll.</li>
      <li>Chain light attacks into a heavy attack. Heavy hits break enemy poise and cause staggers.</li>
      <li>Landing hits builds spirit. Spend it on your weapon's spirit ability.</li>
      <li>Each weapon has its own ability. Carry two weapons and swap mid-fight.</li></ul>
      <div class="hint-bar"><button class="btn small" data-f data-action="close">Back</button></div></div>`;
  }

  private creditsHtml(scr: Screen): string {
    const ending = !!scr.opts.ending;
    const c = (role: string, who: string) => `<div class="role">${role}</div><div class="who">${who}</div>`;
    return `<div class="panel narrow credits" style="width:min(620px,94vw)">
      ${ending ? '<h2>The Spirit Lantern burns again.</h2><p class="muted">Thank you for playing.</p>' : ''}
      <h1>LANTERNBOUND</h1><div class="muted">Embers of Hinoyama</div>
      ${c('Game design, code, world, story &amp; dialogue', 'Created for this project with Claude Code (AI-assisted development)')}
      ${c('Art', 'Procedural models, materials and effects generated in code')}
      ${c('Music &amp; sound', 'Original procedural compositions and synthesised effects (WebAudio)')}
      ${c('Built with', 'three.js (MIT) · Vite (MIT) · TypeScript (Apache-2.0)')}
      ${c('Tested with', 'Vitest (MIT) · Playwright (Apache-2.0)')}
      <p class="muted" style="margin-top:22px;font-size:12px">Lanternbound is an original work inspired by the broad genre of folklore action RPGs. It is not affiliated with, endorsed by, or connected to the makers of any other game.</p>
      ${ending ? `<button class="btn center" data-f data-action="continueEnding">Continue exploring the valley</button><button class="btn center" data-f data-action="quitTitle">Return to title</button>` : `<button class="btn center" data-f data-action="close">Back</button>`}
      <p class="muted" style="font-size:12px">Defeated: ${this.game.data.stats.kills} · Deaths: ${this.game.data.stats.deaths} · Time: ${fmtTime(this.game.data.playTime)}</p></div>`;
  }

  // ------------------------------------------------------------------ Actions

  private onClick(e: MouseEvent, scr: Screen) {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const list = this.focusables(scr);
    const i = list.indexOf(t);
    if (i >= 0) scr.focus = i;
    this.action(scr, t.dataset.action!, t.dataset.arg ?? '', t);
  }

  private onInput(e: Event, scr: Screen) {
    const t = e.target as HTMLInputElement;
    const key = t.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    (this.game.settings as unknown as Record<string, unknown>)[key] = Number(t.value);
    this.game.persistSettings();
    const span = t.nextElementSibling as HTMLElement | null;
    if (span) span.textContent = key === 'fov' ? `${Math.round(Number(t.value))}°` : key.includes('Volume') || key === 'subtitleBackground' ? `${Math.round(Number(t.value) * 100)}%` : Number(t.value).toFixed(2);
    void scr;
  }

  private action(scr: Screen, action: string, arg: string, el?: HTMLElement) {
    const g = this.game;
    switch (action) {
      case 'newGame':
        if (g.saves.latest()) {
          this.openScreen('confirm', { title: 'Start a new game?', message: 'Your saves are kept; the new journey will autosave over the autosave slot.', yes: 'Begin', onYes: () => this.startNew() });
        } else this.startNew();
        return;
      case 'continue': {
        const slot = g.saves.latest();
        if (slot) {
          this.hideAllScreens();
          if (!g.loadSlot(slot)) g.showTitleScene();
        }
        return;
      }
      case 'open':
        g.sfx('uiConfirm');
        this.openScreen(arg as ScreenName);
        return;
      case 'close':
        this.back();
        return;
      case 'tab':
        scr.state.tab = arg;
        g.sfx('uiMove');
        this.render(scr);
        return;
      case 'select':
        scr.state.preview = arg;
        this.preview(scr, arg);
        g.sfx('uiMove');
        {
          const inst = findItem(g.data, arg);
          if (inst) inst.isNew = false;
          // Move focus to the first action button for controller users.
          const btn = scr.el.querySelector('#inv-details [data-action]') as HTMLElement | null;
          if (btn && g.input.lastDevice === 'gamepad') {
            const list = this.focusables(scr);
            scr.focus = list.indexOf(btn);
            this.applyFocus(scr);
          }
        }
        return;
      case 'equip': {
        const [uid, slot] = arg.split('|');
        g.equipItem(uid, slot as EquipSlot);
        this.render(scr);
        return;
      }
      case 'unequip':
        if (!g.unequipSlot(arg as EquipSlot)) this.toast('You must keep at least one weapon equipped.', 'error');
        this.render(scr);
        return;
      case 'use':
        g.useItem(arg);
        scr.state.preview = '';
        this.render(scr);
        return;
      case 'track':
        g.data.quests.tracked = arg;
        this.render(scr);
        return;
      case 'train': {
        const r = g.train(arg);
        if (r === 'ok') this.toast(`Trained ${SKILLS.find((s) => s.id === arg)?.name}.`, 'quest');
        this.render(scr);
        return;
      }
      case 'respec':
        this.openScreen('confirm', {
          title: 'Reset skills?',
          message: 'All skill points will be refunded for 100 coins.',
          yes: 'Reset',
          onYes: () => {
            if (!g.respecSkills()) this.toast('Not enough coins.', 'error');
          },
        });
        return;
      case 'buy':
        if (g.buyItem(arg)) this.toast(`Bought ${ITEMS[arg].name}.`, 'item');
        else this.toast('Cannot buy that (not enough coins, or you carry the maximum).', 'error');
        this.render(scr);
        return;
      case 'sell': {
        const inst = findItem(g.data, arg);
        if (!inst) return;
        if (scr.state.confirmSell !== arg) {
          scr.state.confirmSell = arg;
          const box = scr.el.querySelector('#inv-details');
          if (box) box.innerHTML = this.itemDetails(inst) + `<p style="color:var(--gold)">Select again to sell for ${sellValue(inst)} coins.</p>`;
          return;
        }
        const coins = g.sellItem(arg);
        scr.state.confirmSell = '';
        if (coins) this.toast(`Sold for ${coins} coins.`, 'item');
        this.render(scr);
        return;
      }
      case 'upgrade':
        if (g.upgradeItem(arg)) {
          const inst = findItem(g.data, arg);
          this.toast(`${ITEMS[inst!.id].name} upgraded to +${inst!.level}!`, 'quest');
        }
        this.render(scr);
        return;
      case 'rest':
        this.hideAllScreens();
        g.resumePlay();
        g.rest();
        return;
      case 'travel':
        this.hideAllScreens();
        g.resumePlay();
        g.fastTravel(arg as AreaId);
        return;
      case 'saveSlot': {
        const slot = arg as SlotId;
        const doSave = () => {
          if (g.save(slot)) this.toast(`Saved to slot ${slot}.`, 'quest');
          this.refresh();
        };
        if (g.saves.summary(slot).exists) this.openScreen('confirm', { title: `Overwrite slot ${slot}?`, message: 'The existing save in this slot will be replaced.', yes: 'Overwrite', onYes: doSave });
        else doSave();
        return;
      }
      case 'loadSlot': {
        const doLoad = () => {
          this.hideAllScreens();
          if (!g.loadSlot(arg as SlotId)) {
            if (g.mode === 'title') g.showTitleScene();
            else this.openScreen('load');
          }
        };
        if (g.mode === 'title' || g.mode === 'dead') doLoad();
        else this.openScreen('confirm', { title: 'Load this save?', message: 'Unsaved progress since your last save will be lost.', yes: 'Load', onYes: doLoad });
        return;
      }
      case 'deleteSlot':
        this.openScreen('confirm', {
          title: `Delete ${arg === 'auto' ? 'the autosave' : `slot ${arg}`}?`,
          message: 'This cannot be undone.',
          yes: 'Delete',
          onYes: () => g.saves.delete(arg as SlotId),
        });
        return;
      case 'export': {
        const text = g.saves.exportSlot(arg as SlotId);
        if (!text) return;
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `lanternbound-save-${arg}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        this.toast('Save exported.', 'info');
        return;
      }
      case 'import': {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return;
          f.text().then((text) => {
            const r = g.saves.importToSlot(arg as SlotId, text);
            this.toast(r.ok ? `Imported into slot ${arg}.` : `Import failed: ${r.error}`, r.ok ? 'quest' : 'error');
            this.refresh();
          });
        };
        input.click();
        return;
      }
      case 'confirmYes': {
        const cb = scr.opts.onYes as (() => void) | undefined;
        this.popScreen();
        cb?.();
        this.refresh();
        return;
      }
      case 'quitConfirm':
        this.openScreen('confirm', {
          title: 'Quit to title?',
          message: 'Progress since your last save or autosave will be lost.',
          yes: 'Quit',
          onYes: () => {
            this.hideAllScreens();
            g.quitToTitle();
          },
        });
        return;
      case 'quitTitle':
        this.hideAllScreens();
        g.quitToTitle();
        return;
      case 'respawn':
        g.respawn();
        return;
      case 'continueEnding':
        g.continueAfterEnding();
        return;
      case 'toggle': {
        const k = arg as keyof Settings;
        (g.settings as unknown as Record<string, unknown>)[k] = !g.settings[k];
        g.persistSettings();
        g.sfx('uiMove');
        this.render(scr);
        return;
      }
      case 'cycle':
        this.cycleSetting(scr, el!, 1);
        return;
      case 'slider':
        return;
      case 'rebind': {
        const [act, slot] = arg.split('|');
        scr.state.capturing = arg;
        this.render(scr);
        g.input.captureNext((code) => {
          scr.state.capturing = undefined;
          const s = g.settings;
          if (code.key === 'Escape' && slot !== 'k0') {
            this.render(scr);
            return;
          }
          if (slot === 'p') {
            if (code.pad !== undefined) rebindPad(s.padBindings, act as Action, code.pad);
          } else if (code.key) {
            const displaced = rebindKey(s.keyBindings, act as Action, code.key, slot === 'k1' ? 1 : 0);
            if (displaced.length) this.toast(`${keyName(code.key)} was removed from: ${displaced.map((a) => ACTION_LABELS[a]).join(', ')}`, 'info');
          }
          g.persistSettings();
          this.render(scr);
        });
        return;
      }
      case 'resetBindings':
        g.settings.keyBindings = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
        g.settings.padBindings = clonePadBindings(DEFAULT_PAD_BINDINGS);
        g.persistSettings();
        this.render(scr);
        return;
      case 'resetSettings':
        g.settings = defaultSettings();
        g.persistSettings();
        this.render(scr);
        return;
    }
  }

  private startNew() {
    this.hideAllScreens();
    this.game.newGame();
  }

  private cycleSetting(scr: Screen, el: HTMLElement, dir: number) {
    const k = el.dataset.arg as keyof Settings;
    const opts = (el.dataset.opts ?? '').split(',');
    const cur = opts.indexOf(String(this.game.settings[k]));
    (this.game.settings as unknown as Record<string, unknown>)[k] = opts[(cur + dir + opts.length) % opts.length];
    this.game.persistSettings();
    this.game.sfx('uiMove');
    this.render(scr);
  }

  private adjustSlider(el: HTMLElement, dir: number) {
    const k = el.dataset.arg as keyof Settings;
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    const step = Number(el.dataset.step);
    const s = this.game.settings as unknown as Record<string, number>;
    s[k] = Math.round(Math.min(max, Math.max(min, s[k] + dir * step)) * 1000) / 1000;
    this.game.persistSettings();
    const input = el.querySelector('input') as HTMLInputElement;
    if (input) {
      input.value = String(s[k]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ------------------------------------------------------------------ Navigation

  private onKey(e: KeyboardEvent) {
    if (this.game.input.capturing) return;
    // Dialogue choices
    if (this.game.mode === 'dialogue' && this.dialogueChoices.length && !this.stack.length) {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.moveChoice(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.moveChoice(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') this.game.chooseDialogue(this.choiceFocus);
      else if (/^Digit[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        if (i < this.dialogueChoices.length) this.game.chooseDialogue(i);
      }
      return;
    }
    if (this.game.mode === 'dialogue' && e.code === 'Enter') {
      this.game.advanceDialogue();
      return;
    }
    if (!this.stack.length) return;
    const map: Record<string, UiNav> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Escape: 'back', Backspace: 'back' };
    let nav = map[e.code];
    if (!nav && e.code === 'Tab') nav = e.shiftKey ? 'up' : 'down';
    if (!nav) return;
    const tgt = e.target as HTMLElement;
    if (tgt?.tagName === 'INPUT' && (nav === 'left' || nav === 'right')) return;
    e.preventDefault();
    this.onNav(nav);
  }

  private onNav(nav: UiNav) {
    if (this.game.input.capturing) return;
    if (this.game.mode === 'dialogue' && this.dialogueChoices.length && !this.stack.length) {
      if (nav === 'up') this.moveChoice(-1);
      else if (nav === 'down') this.moveChoice(1);
      else if (nav === 'confirm') this.game.chooseDialogue(this.choiceFocus);
      return;
    }
    const scr = this.stack[this.stack.length - 1];
    if (!scr) return;
    if (nav === 'back') {
      this.back();
      return;
    }
    const list = this.focusables(scr);
    if (!list.length) return;
    const cur = list[scr.focus];
    if (nav === 'confirm') {
      if (cur) {
        if (cur.dataset.action === 'slider') return;
        cur.click();
      }
      return;
    }
    if ((nav === 'left' || nav === 'right') && cur) {
      const dir = nav === 'left' ? -1 : 1;
      if (cur.dataset.action === 'cycle') {
        this.cycleSetting(scr, cur, dir);
        return;
      }
      if (cur.dataset.action === 'slider') {
        this.adjustSlider(cur, dir);
        return;
      }
    }
    if (nav === 'tabNext' || nav === 'tabPrev') {
      const tabs = Array.from(scr.el.querySelectorAll<HTMLElement>('.tabs [data-action="tab"]'));
      if (tabs.length) {
        const i = tabs.findIndex((t) => t.classList.contains('sel'));
        tabs[(i + (nav === 'tabNext' ? 1 : -1) + tabs.length) % tabs.length].click();
      }
      return;
    }
    // Spatial navigation
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = -1;
    let bestScore = Infinity;
    list.forEach((el, i) => {
      if (i === scr.focus) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      let primary: number;
      let secondary: number;
      if (nav === 'up') [primary, secondary] = [-dy, Math.abs(dx)];
      else if (nav === 'down') [primary, secondary] = [dy, Math.abs(dx)];
      else if (nav === 'left') [primary, secondary] = [-dx, Math.abs(dy)];
      else [primary, secondary] = [dx, Math.abs(dy)];
      if (primary <= 2) return;
      const score = primary + secondary * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 && (nav === 'down' || nav === 'up')) best = (scr.focus + (nav === 'down' ? 1 : -1) + list.length) % list.length;
    if (best >= 0) {
      scr.focus = best;
      this.applyFocus(scr);
      this.game.sfx('uiMove');
    }
  }
}
