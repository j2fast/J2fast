// Unified keyboard / mouse / gamepad input. Produces one InputFrame per
// simulation step. Supports rebinding, virtual input injection (for automated
// tests) and gamepad menu navigation.

import { ACTIONS, Action, KeyBindings, PadBindings, keyName, padButtonName } from './bindings';

export type Device = 'kbm' | 'gamepad';

export interface InputFrame {
  moveX: number; // -1 (left) .. 1 (right)
  moveY: number; // -1 (back) .. 1 (forward)
  lookX: number; // radians-ish camera yaw delta for this step
  lookY: number;
  down: Record<Action, boolean>;
  pressed: Record<Action, boolean>;
  released: Record<Action, boolean>;
}

export type UiNav = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'tabNext' | 'tabPrev';

function emptyRecord(): Record<Action, boolean> {
  const r = {} as Record<Action, boolean>;
  for (const a of ACTIONS) r[a] = false;
  return r;
}

const STICK_DEADZONE = 0.18;

function deadzone(v: number): number {
  const a = Math.abs(v);
  if (a < STICK_DEADZONE) return 0;
  return Math.sign(v) * ((a - STICK_DEADZONE) / (1 - STICK_DEADZONE));
}

export interface VirtualInput {
  moveX?: number;
  moveY?: number;
  lookX?: number;
  lookY?: number;
  down?: Partial<Record<Action, boolean>>;
}

export class Input {
  keyBindings: KeyBindings;
  padBindings: PadBindings;
  mouseSensitivity = 1;
  stickSensitivity = 1;
  invertY = false;
  lastDevice: Device = 'kbm';
  enabled = true;

  private codesDown = new Set<string>();
  private codesPressed = new Set<string>(); // pressed since last sample
  private mouseDX = 0;
  private mouseDY = 0;
  private prevDown = emptyRecord();
  private padPrev: boolean[] = [];
  private padPressedQueue = new Set<number>();
  private padNavPrev = { up: false, down: false, left: false, right: false };
  private navRepeatTimer = 0;
  private captureCb: ((code: { key?: string; pad?: number }) => void) | null = null;
  private virtual: VirtualInput | null = null;
  private virtualPrev = emptyRecord();
  private listeners: Array<[EventTarget, string, EventListener]> = [];

  onUiNav: ((nav: UiNav) => void) | null = null;
  onDeviceChange: ((d: Device) => void) | null = null;
  pointerLockTarget: HTMLElement | null = null;

  constructor(keyBindings: KeyBindings, padBindings: PadBindings) {
    this.keyBindings = keyBindings;
    this.padBindings = padBindings;
  }

  attach(target: Window = window): void {
    const add = (t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.listeners.push([t, type, fn]);
    };
    add(target, 'keydown', (e) => this.handleKeyDown(e as KeyboardEvent));
    add(target, 'keyup', (e) => this.handleKeyUp(e as KeyboardEvent));
    add(target, 'mousedown', (e) => this.handleMouse(e as MouseEvent, true));
    add(target, 'mouseup', (e) => this.handleMouse(e as MouseEvent, false));
    add(target, 'mousemove', (e) => {
      const m = e as MouseEvent;
      if (document.pointerLockElement) {
        this.mouseDX += m.movementX || 0;
        this.mouseDY += m.movementY || 0;
      }
    });
    add(
      target,
      'wheel',
      (e) => {
        const w = e as WheelEvent;
        const code = w.deltaY > 0 ? 'WheelDown' : 'WheelUp';
        this.setDevice('kbm');
        if (this.captureCb) {
          this.finishCapture({ key: code });
          return;
        }
        this.codesPressed.add(code);
      },
      { passive: true },
    );
    add(target, 'blur', () => this.clearAll());
    add(target, 'contextmenu', (e) => e.preventDefault());
  }

  detach(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners = [];
  }

  private setDevice(d: Device) {
    if (this.lastDevice !== d) {
      this.lastDevice = d;
      this.onDeviceChange?.(d);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    this.setDevice('kbm');
    if (this.captureCb) {
      e.preventDefault();
      this.finishCapture({ key: e.code });
      return;
    }
    // Avoid browser shortcuts stealing gameplay keys (Tab focus, Space scroll).
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      const t = e.target as HTMLElement | null;
      if (!t || !['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) e.preventDefault();
    }
    if (!e.repeat) this.codesPressed.add(e.code);
    this.codesDown.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.codesDown.delete(e.code);
  }

  private handleMouse(e: MouseEvent, down: boolean) {
    const code = 'Mouse' + e.button;
    this.setDevice('kbm');
    if (down && this.captureCb) {
      // Ignore the click that landed on the "rebind" button itself.
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('[data-rebind]')) return;
      this.finishCapture({ key: code });
      return;
    }
    if (down) {
      // Only treat clicks on the game canvas as gameplay input.
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== 'CANVAS' && !document.pointerLockElement) return;
      this.codesPressed.add(code);
      this.codesDown.add(code);
    } else {
      this.codesDown.delete(code);
    }
  }

  clearAll(): void {
    this.codesDown.clear();
    this.codesPressed.clear();
    this.padPressedQueue.clear();
    this.mouseDX = this.mouseDY = 0;
  }

  /** Wait for the next key, mouse button or gamepad button (for rebinding). */
  captureNext(cb: (code: { key?: string; pad?: number }) => void): void {
    this.captureCb = cb;
  }

  cancelCapture(): void {
    this.captureCb = null;
  }

  get capturing(): boolean {
    return this.captureCb !== null;
  }

  private finishCapture(code: { key?: string; pad?: number }) {
    const cb = this.captureCb;
    this.captureCb = null;
    this.clearAll();
    cb?.(code);
  }

  setVirtual(v: VirtualInput | null): void {
    this.virtual = v;
  }

  private readPad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pads: (Gamepad | null)[] = [];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      return null;
    }
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * Polls gamepad state for UI navigation. Called every rendered frame even
   * when gameplay is paused.
   */
  pollUi(dt: number): void {
    const pad = this.readPad();
    if (!pad) return;
    const pressedNow: boolean[] = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const anyNew = pressedNow.some((p, i) => p && !this.padPrev[i]);
    const ax = deadzone(pad.axes[0] ?? 0);
    const ay = deadzone(pad.axes[1] ?? 0);
    if (anyNew || Math.abs(ax) > 0.3 || Math.abs(ay) > 0.3) this.setDevice('gamepad');

    for (let i = 0; i < pressedNow.length; i++) {
      if (pressedNow[i] && !this.padPrev[i]) {
        if (this.captureCb) {
          this.finishCapture({ pad: i });
          this.padPrev = pressedNow;
          return;
        }
        this.padPressedQueue.add(i);
        if (this.onUiNav) {
          if (i === 0) this.onUiNav('confirm');
          else if (i === 1) this.onUiNav('back');
          else if (i === 4) this.onUiNav('tabPrev');
          else if (i === 5) this.onUiNav('tabNext');
          else if (i === 9) this.onUiNav('back');
        }
      }
    }
    this.padPrev = pressedNow;

    // Directional navigation from D-pad or left stick with auto-repeat.
    const dir = {
      up: !!pressedNow[12] || ay < -0.5,
      down: !!pressedNow[13] || ay > 0.5,
      left: !!pressedNow[14] || ax < -0.5,
      right: !!pressedNow[15] || ax > 0.5,
    };
    this.navRepeatTimer -= dt;
    for (const k of ['up', 'down', 'left', 'right'] as const) {
      if (dir[k] && (!this.padNavPrev[k] || this.navRepeatTimer <= 0)) {
        this.onUiNav?.(k);
        this.navRepeatTimer = this.padNavPrev[k] ? 0.12 : 0.35;
      }
    }
    this.padNavPrev = dir;
  }

  /** Build the input frame for one simulation step. */
  sample(dt: number): InputFrame {
    const down = emptyRecord();
    const pressed = emptyRecord();
    const released = emptyRecord();
    let moveX = 0;
    let moveY = 0;
    let lookX = 0;
    let lookY = 0;

    if (this.enabled) {
      for (const a of ACTIONS) {
        for (const code of this.keyBindings[a]) {
          if (this.codesDown.has(code)) down[a] = true;
          if (this.codesPressed.has(code)) {
            pressed[a] = true;
            // Wheel "presses" have no hold duration.
            if (!code.startsWith('Wheel')) down[a] = true;
          }
        }
      }
      if (down.moveForward) moveY += 1;
      if (down.moveBack) moveY -= 1;
      if (down.moveRight) moveX += 1;
      if (down.moveLeft) moveX -= 1;

      const mouseScale = 0.0025 * this.mouseSensitivity;
      lookX += this.mouseDX * mouseScale;
      lookY += this.mouseDY * mouseScale;
      const keyLook = 2.4 * dt * this.mouseSensitivity;
      if (down.lookLeft) lookX -= keyLook;
      if (down.lookRight) lookX += keyLook;
      if (down.lookUp) lookY -= keyLook * 0.6;
      if (down.lookDown) lookY += keyLook * 0.6;

      const pad = this.readPad();
      if (pad) {
        const lx = deadzone(pad.axes[0] ?? 0);
        const ly = deadzone(pad.axes[1] ?? 0);
        const rx = deadzone(pad.axes[2] ?? 0);
        const ry = deadzone(pad.axes[3] ?? 0);
        if (lx || ly) {
          moveX = lx;
          moveY = -ly;
        }
        const stick = 3.2 * dt * this.stickSensitivity;
        lookX += rx * stick;
        lookY += ry * stick * 0.6;
        for (const a of ACTIONS) {
          for (const b of this.padBindings[a]) {
            const btn = pad.buttons[b];
            if (btn && (btn.pressed || btn.value > 0.5)) down[a] = true;
            if (this.padPressedQueue.has(b)) {
              pressed[a] = true;
              down[a] = true;
            }
          }
        }
      }
    }

    if (this.virtual) {
      const v = this.virtual;
      if (v.moveX !== undefined) moveX = v.moveX;
      if (v.moveY !== undefined) moveY = v.moveY;
      lookX += v.lookX ?? 0;
      lookY += v.lookY ?? 0;
      for (const a of ACTIONS) {
        const vd = !!v.down?.[a];
        if (vd) down[a] = true;
        if (vd && !this.virtualPrev[a]) pressed[a] = true;
        this.virtualPrev[a] = vd;
      }
    }

    for (const a of ACTIONS) {
      if (!down[a] && this.prevDown[a]) released[a] = true;
    }
    this.prevDown = down;
    this.codesPressed.clear();
    this.padPressedQueue.clear();
    this.mouseDX = this.mouseDY = 0;

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    if (this.invertY) lookY = -lookY;
    return { moveX, moveY, lookX, lookY, down, pressed, released };
  }

  /** Human-readable prompt for the current device, e.g. "E" or "A". */
  prompt(action: Action): string {
    if (this.lastDevice === 'gamepad') {
      const b = this.padBindings[action][0];
      return b === undefined ? '—' : padButtonName(b);
    }
    const k = this.keyBindings[action][0];
    return k === undefined ? '—' : keyName(k);
  }

  requestPointerLock(): void {
    const el = this.pointerLockTarget;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => undefined);
    } catch {
      /* pointer lock not available (e.g. headless) */
    }
  }

  exitPointerLock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }
}
