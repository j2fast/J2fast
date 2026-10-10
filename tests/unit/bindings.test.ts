import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_PAD_BINDINGS,
  cloneKeyBindings,
  clonePadBindings,
  keyName,
  missingRequired,
  rebindKey,
  rebindPad,
  sanitizeKeyBindings,
} from '../../src/core/bindings';

describe('input bindings', () => {
  it('every action has default bindings defined', () => {
    for (const a of ACTIONS) {
      expect(DEFAULT_KEY_BINDINGS[a]).toBeDefined();
      expect(DEFAULT_PAD_BINDINGS[a]).toBeDefined();
    }
    expect(missingRequired(DEFAULT_KEY_BINDINGS)).toEqual([]);
  });

  it('default keyboard bindings have no duplicate keys', () => {
    const seen = new Map<string, string>();
    for (const a of ACTIONS) {
      for (const k of DEFAULT_KEY_BINDINGS[a]) {
        expect(seen.has(k), `${k} bound to ${seen.get(k)} and ${a}`).toBe(false);
        seen.set(k, a);
      }
    }
  });

  it('rebinding a key steals it from the action that used it', () => {
    const b = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
    const displaced = rebindKey(b, 'heal', 'KeyQ');
    expect(b.heal[0]).toBe('KeyQ');
    expect(b.ability).not.toContain('KeyQ');
    expect(displaced).toContain('ability');
  });

  it('rebinding the alternate slot keeps the primary', () => {
    const b = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
    rebindKey(b, 'dodge', 'KeyC', 1);
    expect(b.dodge).toEqual(['Space', 'KeyC']);
    rebindKey(b, 'dodge', 'KeyV', 0);
    expect(b.dodge).toEqual(['KeyV', 'KeyC']);
  });

  it('gamepad rebinding swaps buttons between actions', () => {
    const b = clonePadBindings(DEFAULT_PAD_BINDINGS);
    rebindPad(b, 'dodge', 0);
    expect(b.dodge[0]).toBe(0);
    expect(b.interact).not.toContain(0);
  });

  it('sanitize restores required actions and rejects garbage', () => {
    const b = sanitizeKeyBindings({ attack: [], dodge: [5, 6], moveForward: ['KeyZ'] });
    expect(b.attack).toEqual(DEFAULT_KEY_BINDINGS.attack);
    expect(b.dodge).toEqual(DEFAULT_KEY_BINDINGS.dodge);
    expect(b.moveForward).toEqual(['KeyZ']);
    expect(sanitizeKeyBindings('nonsense')).toEqual(DEFAULT_KEY_BINDINGS);
  });

  it('formats key names for prompts', () => {
    expect(keyName('KeyE')).toBe('E');
    expect(keyName('Mouse0')).toBe('LMB');
    expect(keyName('Digit3')).toBe('3');
  });
});
