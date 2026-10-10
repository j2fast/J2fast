import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/storage';
import { defaultSettings, loadSettings, sanitizeSettings, saveSettings } from '../../src/core/settings';

describe('settings', () => {
  it('round-trips through storage', () => {
    const store = new MemoryStore();
    const s = defaultSettings();
    s.mouseSensitivity = 2.2;
    s.subtitleSize = 'xlarge';
    s.difficulty = 'story';
    s.keyBindings.dodge = ['KeyC'];
    saveSettings(store, s);
    const l = loadSettings(store);
    expect(l.mouseSensitivity).toBe(2.2);
    expect(l.subtitleSize).toBe('xlarge');
    expect(l.difficulty).toBe('story');
    expect(l.keyBindings.dodge).toEqual(['KeyC']);
  });

  it('clamps and repairs invalid values', () => {
    const s = sanitizeSettings({ masterVolume: 9, fov: -3, difficulty: 'nightmare', invertY: 'yes', mouseSensitivity: NaN });
    expect(s.masterVolume).toBe(1);
    expect(s.fov).toBe(55);
    expect(s.difficulty).toBe('normal');
    expect(s.invertY).toBe(false);
    expect(s.mouseSensitivity).toBe(1);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const store = new MemoryStore();
    store.set('lanternbound.settings', '{not json');
    expect(loadSettings(store)).toEqual(defaultSettings());
  });
});
