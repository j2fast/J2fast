// Input actions and their default bindings. Pure data + helpers so the
// remapping logic can be unit tested without a browser.

export const ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'lookLeft',
  'lookRight',
  'lookUp',
  'lookDown',
  'sprint',
  'dodge',
  'attack',
  'heavy',
  'ability',
  'interact',
  'heal',
  'lockOn',
  'targetNext',
  'swapWeapon',
  'questLog',
  'inventory',
  'pause',
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  moveForward: 'Move Forward',
  moveBack: 'Move Back',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  lookLeft: 'Camera Left',
  lookRight: 'Camera Right',
  lookUp: 'Camera Up',
  lookDown: 'Camera Down',
  sprint: 'Sprint',
  dodge: 'Dodge',
  attack: 'Light Attack',
  heavy: 'Heavy Attack',
  ability: 'Spirit Ability',
  interact: 'Interact / Talk',
  heal: 'Use Healing Item',
  lockOn: 'Lock On',
  targetNext: 'Switch Target',
  swapWeapon: 'Swap Weapon',
  questLog: 'Quest Log',
  inventory: 'Inventory',
  pause: 'Pause',
};

/** Actions that cannot be left unbound because the game would be unplayable. */
export const REQUIRED_ACTIONS: Action[] = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'attack',
  'dodge',
  'interact',
  'pause',
];

export type KeyBindings = Record<Action, string[]>;
export type PadBindings = Record<Action, number[]>;

// Keyboard codes follow KeyboardEvent.code. Mouse buttons are "Mouse0".."Mouse4",
// mouse wheel is "WheelUp"/"WheelDown".
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  sprint: ['ShiftLeft'],
  dodge: ['Space'],
  attack: ['Mouse0', 'KeyJ'],
  heavy: ['Mouse2', 'KeyK'],
  ability: ['KeyQ'],
  interact: ['KeyE'],
  heal: ['KeyF'],
  lockOn: ['Mouse1', 'Tab'],
  targetNext: ['WheelDown', 'KeyT'],
  swapWeapon: ['KeyR'],
  questLog: ['KeyL'],
  inventory: ['KeyI'],
  pause: ['Escape', 'KeyP'],
};

// Standard Gamepad mapping indices:
// 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 LB, 5 RB, 6 LT, 7 RT,
// 8 Back/Select, 9 Start, 10 L3, 11 R3, 12 Up, 13 Down, 14 Left, 15 Right
export const DEFAULT_PAD_BINDINGS: PadBindings = {
  moveForward: [],
  moveBack: [],
  moveLeft: [],
  moveRight: [],
  lookLeft: [],
  lookRight: [],
  lookUp: [],
  lookDown: [],
  sprint: [10],
  dodge: [1],
  attack: [2, 5],
  heavy: [3, 7],
  ability: [6],
  interact: [0],
  heal: [12],
  lockOn: [11],
  targetNext: [15],
  swapWeapon: [4],
  questLog: [8],
  inventory: [13],
  pause: [9],
};

export const PAD_BUTTON_NAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'D-Up',
  'D-Down',
  'D-Left',
  'D-Right',
  'Home',
];

const KEY_NAMES: Record<string, string> = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'Mouse4',
  Mouse4: 'Mouse5',
  WheelUp: 'Wheel Up',
  WheelDown: 'Wheel Down',
  Space: 'Space',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
};

export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export function padButtonName(index: number): string {
  return PAD_BUTTON_NAMES[index] ?? `Button ${index}`;
}

export function cloneKeyBindings(b: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const a of ACTIONS) out[a] = [...(b[a] ?? [])];
  return out;
}

export function clonePadBindings(b: PadBindings): PadBindings {
  const out = {} as PadBindings;
  for (const a of ACTIONS) out[a] = [...(b[a] ?? [])];
  return out;
}

/**
 * Bind `code` as the primary binding of `action`. Any other action that used
 * the same code loses it (so one key never triggers two actions). Returns the
 * list of actions that were unbound as a side effect.
 */
export function rebindKey(bindings: KeyBindings, action: Action, code: string, slot = 0): Action[] {
  const displaced: Action[] = [];
  for (const a of ACTIONS) {
    if (a === action) continue;
    const i = bindings[a].indexOf(code);
    if (i >= 0) {
      bindings[a].splice(i, 1);
      displaced.push(a);
    }
  }
  const list = bindings[action].filter((c) => c !== code);
  const s = list.length === 0 ? 0 : Math.min(slot, 1);
  list[s] = code;
  bindings[action] = list.filter(Boolean).slice(0, 2);
  return displaced;
}

export function rebindPad(bindings: PadBindings, action: Action, button: number): Action[] {
  const displaced: Action[] = [];
  for (const a of ACTIONS) {
    if (a === action) continue;
    const i = bindings[a].indexOf(button);
    if (i >= 0) {
      bindings[a].splice(i, 1);
      displaced.push(a);
    }
  }
  bindings[action] = [button, ...bindings[action].filter((b) => b !== button)].slice(0, 2);
  return displaced;
}

/** Required actions that have no keyboard binding at all. */
export function missingRequired(bindings: KeyBindings): Action[] {
  return REQUIRED_ACTIONS.filter((a) => !bindings[a] || bindings[a].length === 0);
}

/** Sanitize bindings loaded from storage, filling in defaults for anything malformed. */
export function sanitizeKeyBindings(raw: unknown): KeyBindings {
  const out = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const a of ACTIONS) {
    const v = r[a];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length < 32)) {
      out[a] = (v as string[]).slice(0, 2);
    }
  }
  for (const a of missingRequired(out)) out[a] = [...DEFAULT_KEY_BINDINGS[a]];
  return out;
}

export function sanitizePadBindings(raw: unknown): PadBindings {
  const out = clonePadBindings(DEFAULT_PAD_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const a of ACTIONS) {
    const v = r[a];
    if (Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0 && x < 32)) {
      out[a] = (v as number[]).slice(0, 2);
    }
  }
  return out;
}
