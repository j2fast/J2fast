// Player-facing settings with validation. Stored separately from save slots
// so accessibility choices persist across every save.

import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_PAD_BINDINGS,
  KeyBindings,
  PadBindings,
  cloneKeyBindings,
  clonePadBindings,
  sanitizeKeyBindings,
  sanitizePadBindings,
} from './bindings';
import { clamp } from './math';
import type { KeyValueStore } from './storage';

export type Difficulty = 'story' | 'normal' | 'hard';
export type SubtitleSize = 'small' | 'medium' | 'large' | 'xlarge';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  version: 1;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  stickSensitivity: number;
  invertY: boolean;
  fov: number;
  cameraShake: boolean;
  reduceFlashing: boolean;
  highContrastTelegraphs: boolean;
  damageNumbers: boolean;
  subtitles: boolean;
  subtitleSize: SubtitleSize;
  subtitleBackground: number;
  soundCaptions: boolean;
  lockOnMode: 'toggle' | 'hold';
  autoFaceTarget: boolean;
  difficulty: Difficulty;
  quality: Quality;
  showFps: boolean;
  companionEnabled: boolean;
  keyBindings: KeyBindings;
  padBindings: PadBindings;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  mouseSensitivity: 1,
  stickSensitivity: 1,
  invertY: false,
  fov: 70,
  cameraShake: true,
  reduceFlashing: false,
  highContrastTelegraphs: false,
  damageNumbers: true,
  subtitles: true,
  subtitleSize: 'medium',
  subtitleBackground: 0.6,
  soundCaptions: false,
  lockOnMode: 'toggle',
  autoFaceTarget: true,
  difficulty: 'normal',
  quality: 'medium',
  showFps: false,
  companionEnabled: true,
  keyBindings: DEFAULT_KEY_BINDINGS,
  padBindings: DEFAULT_PAD_BINDINGS,
};

export const DIFFICULTY_MODS: Record<Difficulty, { enemyDamage: number; enemyHealth: number; label: string }> = {
  story: { enemyDamage: 0.5, enemyHealth: 0.7, label: 'Story' },
  normal: { enemyDamage: 1, enemyHealth: 1, label: 'Normal' },
  hard: { enemyDamage: 1.5, enemyHealth: 1.3, label: 'Hard' },
};

export function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    keyBindings: cloneKeyBindings(DEFAULT_KEY_BINDINGS),
    padBindings: clonePadBindings(DEFAULT_PAD_BINDINGS),
  };
}

function num(v: unknown, def: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}
function oneOf<T extends string>(v: unknown, opts: readonly T[], def: T): T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : def;
}

/** Turn arbitrary (possibly corrupt) stored data into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    masterVolume: num(r.masterVolume, d.masterVolume, 0, 1),
    musicVolume: num(r.musicVolume, d.musicVolume, 0, 1),
    sfxVolume: num(r.sfxVolume, d.sfxVolume, 0, 1),
    mouseSensitivity: num(r.mouseSensitivity, d.mouseSensitivity, 0.1, 3),
    stickSensitivity: num(r.stickSensitivity, d.stickSensitivity, 0.1, 3),
    invertY: bool(r.invertY, d.invertY),
    fov: num(r.fov, d.fov, 55, 100),
    cameraShake: bool(r.cameraShake, d.cameraShake),
    reduceFlashing: bool(r.reduceFlashing, d.reduceFlashing),
    highContrastTelegraphs: bool(r.highContrastTelegraphs, d.highContrastTelegraphs),
    damageNumbers: bool(r.damageNumbers, d.damageNumbers),
    subtitles: bool(r.subtitles, d.subtitles),
    subtitleSize: oneOf(r.subtitleSize, ['small', 'medium', 'large', 'xlarge'] as const, d.subtitleSize),
    subtitleBackground: num(r.subtitleBackground, d.subtitleBackground, 0, 1),
    soundCaptions: bool(r.soundCaptions, d.soundCaptions),
    lockOnMode: oneOf(r.lockOnMode, ['toggle', 'hold'] as const, d.lockOnMode),
    autoFaceTarget: bool(r.autoFaceTarget, d.autoFaceTarget),
    difficulty: oneOf(r.difficulty, ['story', 'normal', 'hard'] as const, d.difficulty),
    quality: oneOf(r.quality, ['low', 'medium', 'high'] as const, d.quality),
    showFps: bool(r.showFps, d.showFps),
    companionEnabled: bool(r.companionEnabled, d.companionEnabled),
    keyBindings: sanitizeKeyBindings(r.keyBindings),
    padBindings: sanitizePadBindings(r.padBindings),
  };
}

const SETTINGS_KEY = 'lanternbound.settings';

export function loadSettings(store: KeyValueStore): Settings {
  const text = store.get(SETTINGS_KEY);
  if (!text) return defaultSettings();
  try {
    return sanitizeSettings(JSON.parse(text));
  } catch {
    console.warn('[settings] stored settings were unreadable; using defaults.');
    return defaultSettings();
  }
}

export function saveSettings(store: KeyValueStore, s: Settings): boolean {
  return store.set(SETTINGS_KEY, JSON.stringify(s));
}
