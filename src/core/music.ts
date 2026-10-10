// A small step sequencer that plays the game's original soundtrack using
// synthesised instruments inspired by koto, shakuhachi, shamisen and taiko.
// All melodies are original compositions written for this project.

import type { AudioEngine } from './audio';

type Inst = 'koto' | 'flute' | 'pad' | 'bass' | 'taiko' | 'ka' | 'shaker' | 'shamisen' | 'bell';

interface Layer {
  inst: Inst;
  /** Space separated tokens, 16 per bar: degree number, '.' rest, '_' hold. Bars separated by '|'. */
  pattern: string;
  gain: number;
  octave?: number;
  /** Only audible during combat (scaled by intensity). */
  combat?: boolean;
}

interface Track {
  bpm: number;
  root: number; // MIDI note of scale degree 0
  scale: number[];
  layers: Layer[];
}

const IN = [0, 1, 5, 7, 8]; // miyako-bushi ("in") scale
const YO = [0, 2, 5, 7, 9]; // "yo" scale

const TRACKS: Record<string, Track> = {
  title: {
    bpm: 66,
    root: 62,
    scale: IN,
    layers: [
      { inst: 'pad', gain: 0.5, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _' },
      { inst: 'koto', gain: 0.5, pattern: '0 . 2 . 4 . 5 . 4 . 2 . 3 . . . | -1 . 1 . 3 . 4 . 3 . 1 . 2 . . . | 1 . 3 . 5 . 6 . 5 . 3 . 4 . 2 . | -2 . 0 . 2 . 3 . 2 . 0 . -1 . . .' },
      { inst: 'flute', gain: 0.35, pattern: '. . . . . . . . 7 _ _ _ 6 _ 5 _ | 4 _ _ _ _ _ _ _ . . . . . . . . | . . . . . . . . 8 _ _ _ 7 _ 6 _ | 5 _ _ _ 4 _ _ _ _ _ _ _ . . . .' },
      { inst: 'bell', gain: 0.25, octave: 1, pattern: '0 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | 2 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .' },
    ],
  },
  village: {
    bpm: 84,
    root: 64,
    scale: YO,
    layers: [
      { inst: 'pad', gain: 0.32, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 2 _ _ _ _ _ _ _ 4 _ _ _ _ _ _ _' },
      { inst: 'koto', gain: 0.45, pattern: '0 . 1 2 . 4 . 2 3 . 2 1 0 . . . | 3 . 4 5 . 4 . 3 2 . 1 . 2 . . . | 1 . 2 3 . 5 . 3 4 . 3 2 1 . 0 . | 2 . 1 . 0 . -1 . 0 . . . . . . .' },
      { inst: 'flute', gain: 0.3, pattern: '. . . . . . . . . . . . 5 _ 6 _ | 7 _ _ _ 6 _ 5 _ 4 _ _ _ . . . . | . . . . . . . . . . . . 6 _ 7 _ | 8 _ _ _ 7 _ 5 _ 5 _ _ _ _ _ . .' },
      { inst: 'bass', gain: 0.35, octave: -2, pattern: '0 . . . 0 . . . 2 . . . 0 . . . | 3 . . . 3 . . . 1 . . . 3 . . . | 1 . . . 1 . . . 3 . . . 1 . . . | 2 . . . 2 . . . 4 . . . -1 . . .' },
      { inst: 'shaker', gain: 0.15, pattern: '. . x . . . x . . . x . . . x x | . . x . . . x . . . x . . . x . | . . x . . . x . . . x . . . x x | . . x . . . x . . . x . x . x .' },
    ],
  },
  field: {
    bpm: 104,
    root: 62,
    scale: IN,
    layers: [
      { inst: 'shamisen', gain: 0.32, pattern: '0 . 0 2 . 0 3 . 0 . 0 2 . 3 2 . | 0 . 0 2 . 0 3 . 4 . 3 2 . 1 0 . | -1 . -1 1 . -1 2 . -1 . -1 1 . 2 1 . | 0 . 0 2 . 0 3 . 2 . 1 0 . -1 -2 .' },
      { inst: 'koto', gain: 0.38, pattern: '5 _ _ _ 4 _ 3 _ 4 _ _ _ . . . . | 5 _ 6 _ 7 _ 6 _ 5 _ _ _ . . . . | 4 _ _ _ 3 _ 2 _ 3 _ _ _ . . . . | 2 _ 3 _ 4 _ 3 _ 0 _ _ _ . . . .' },
      { inst: 'bass', gain: 0.35, octave: -2, pattern: '0 . . . . . 0 . . . 0 . . . . . | 0 . . . . . 0 . . . 2 . . . . . | -1 . . . . . -1 . . . -1 . . . . . | 0 . . . . . 0 . . . -2 . . . . .' },
      { inst: 'taiko', gain: 0.6, combat: true, pattern: 'x . . x . . x . x . . . x . x . | x . . x . . x . x . . . x x x x' },
      { inst: 'ka', gain: 0.25, combat: true, pattern: '. . x . . x . . . . x . . . . x' },
      { inst: 'shaker', gain: 0.12, pattern: 'x . x . x . x . x . x . x . x x' },
    ],
  },
  marsh: {
    bpm: 76,
    root: 61,
    scale: IN,
    layers: [
      { inst: 'pad', gain: 0.45, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ -2 _ _ _ _ _ _ _' },
      { inst: 'flute', gain: 0.35, pattern: '. . . . 4 _ _ _ _ _ 3 _ 2 _ _ _ | . . . . . . . . 1 _ 2 _ 3 _ _ _ | . . . . 5 _ _ _ _ _ 4 _ 3 _ 2 _ | 1 _ _ _ _ _ _ _ 0 _ _ _ _ _ . .' },
      { inst: 'koto', gain: 0.3, pattern: '0 . . . . . . 2 . . . . . . . . | . . 1 . . . . . . . 3 . . . . . | 0 . . . . . . 2 . . . . 4 . . . | . . 1 . . . . . 0 . . . . . . .' },
      { inst: 'taiko', gain: 0.5, combat: true, pattern: 'x . . . . . x . x . . . . . . . | x . . . . . x . x . . . x . x .' },
      { inst: 'bell', gain: 0.18, octave: 1, pattern: '. . . . . . . . . . . . . . . . | 4 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | 2 . . . . . . . . . . . . . . .' },
    ],
  },
  dungeon: {
    bpm: 66,
    root: 57,
    scale: IN,
    layers: [
      { inst: 'pad', gain: 0.5, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ 1 _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ -1 _ _ _ _ _ _ _' },
      { inst: 'taiko', gain: 0.45, pattern: 'x . . . . . . . x . . . . . . . ' },
      { inst: 'bell', gain: 0.22, octave: 1, pattern: '. . . . . . . . 1 . . . . . . . | . . . . . . . . . . . . . . . . | . . . . . . . . 0 . . . . . . . | . . . . . . . . . . . . 3 . . .' },
      { inst: 'flute', gain: 0.25, pattern: '. . . . . . . . . . . . . . . . | 3 _ _ _ _ _ 2 _ 1 _ _ _ _ _ _ _ | . . . . . . . . . . . . . . . . | 1 _ _ _ 0 _ _ _ -1 _ _ _ _ _ _ _' },
      { inst: 'ka', gain: 0.2, combat: true, pattern: '. . x . . . x . . . x . . x . x' },
      { inst: 'shamisen', gain: 0.25, combat: true, pattern: '0 . 0 . 1 . 0 . -1 . 0 . 1 . 2 .' },
    ],
  },
  boss: {
    bpm: 140,
    root: 62,
    scale: IN,
    layers: [
      { inst: 'taiko', gain: 0.75, pattern: 'x . . x . . x . x . x . x . . . | x . . x . . x . x x . x x . x x' },
      { inst: 'ka', gain: 0.3, pattern: '. . x . x . . x . . x . . x x .' },
      { inst: 'shamisen', gain: 0.38, pattern: '0 0 2 0 3 0 2 0 4 3 2 0 1 0 -1 0 | 0 0 2 0 3 0 5 4 3 2 1 0 -1 -2 -1 0' },
      { inst: 'bass', gain: 0.45, octave: -2, pattern: '0 . 0 . 0 . 0 . 1 . 1 . -1 . -1 . | 0 . 0 . 0 . 0 . 2 . 1 . 0 . -1 .' },
      { inst: 'flute', gain: 0.3, pattern: '7 _ _ _ _ _ 6 _ 5 _ _ _ 6 _ _ _ | 7 _ 8 _ 9 _ _ _ 8 _ 7 _ 6 _ 5 _' },
    ],
  },
  finalBoss: {
    bpm: 150,
    root: 61,
    scale: IN,
    layers: [
      { inst: 'taiko', gain: 0.8, pattern: 'x . x x . x . x x . x . x x x x' },
      { inst: 'ka', gain: 0.3, pattern: '. x . . x . x . . x . x . . x .' },
      { inst: 'pad', gain: 0.4, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ -1 _ _ _ _ _ _ _' },
      { inst: 'shamisen', gain: 0.38, pattern: '0 2 3 2 0 2 3 4 5 4 3 2 3 2 0 -1 | 0 2 3 2 0 2 3 4 6 5 4 3 2 1 0 -1' },
      { inst: 'flute', gain: 0.35, pattern: '9 _ _ _ 8 _ 7 _ 8 _ _ _ _ _ 5 _ | 6 _ 7 _ 8 _ 9 _ 10 _ _ _ 9 _ _ _ | 8 _ _ _ 7 _ 6 _ 7 _ _ _ _ _ 5 _ | 4 _ 5 _ 6 _ 5 _ 4 _ _ _ _ _ _ _' },
      { inst: 'bass', gain: 0.45, octave: -2, pattern: '0 . 0 0 . 0 . 0 -1 . -1 -1 . -1 . -1 | 1 . 1 1 . 1 . 1 -2 . -2 -2 . -1 . -1' },
    ],
  },
  summit: {
    bpm: 88,
    root: 61,
    scale: IN,
    layers: [
      { inst: 'pad', gain: 0.42, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ 0 _ _ _ _ _ _ _' },
      { inst: 'flute', gain: 0.35, pattern: '5 _ _ _ 4 _ 5 _ 7 _ _ _ 6 _ 5 _ | 4 _ _ _ _ _ 3 _ 2 _ _ _ _ _ . . | 5 _ _ _ 6 _ 7 _ 8 _ _ _ 7 _ 6 _ | 5 _ 4 _ 3 _ _ _ 2 _ _ _ _ _ . .' },
      { inst: 'koto', gain: 0.32, pattern: '0 . 2 . 3 . 2 . 0 . 2 . 3 . 4 . | -2 . 0 . 1 . 0 . -2 . 0 . 1 . 2 . | -1 . 1 . 2 . 1 . -1 . 1 . 2 . 3 . | 1 . 3 . 4 . 3 . 0 . 2 . 3 . 2 .' },
      { inst: 'taiko', gain: 0.55, combat: true, pattern: 'x . . . x . . x x . . . x . x . ' },
      { inst: 'ka', gain: 0.2, combat: true, pattern: '. . x . . . x . . . x . . . x x' },
    ],
  },
  ending: {
    bpm: 72,
    root: 64,
    scale: YO,
    layers: [
      { inst: 'pad', gain: 0.4, octave: -1, pattern: '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ 2 _ _ _ _ _ _ _' },
      { inst: 'koto', gain: 0.42, pattern: '0 . 2 . 4 . 5 . 7 . 5 . 4 . 2 . | 3 . 5 . 7 . 8 . 7 . 5 . 3 . 2 . | 4 . 6 . 7 . 9 . 7 . 6 . 4 . 3 . | 5 . 4 . 2 . 1 . 0 . . . . . . .' },
      { inst: 'flute', gain: 0.35, pattern: '7 _ _ _ _ _ 6 _ 5 _ _ _ 4 _ _ _ | 5 _ _ _ 7 _ _ _ 8 _ _ _ _ _ _ _ | 9 _ _ _ 8 _ 7 _ 6 _ _ _ 7 _ _ _ | 5 _ _ _ _ _ _ _ _ _ _ _ . . . .' },
      { inst: 'bell', gain: 0.22, octave: 1, pattern: '0 . . . . . . . . . . . . . . . | . . . . . . . . 2 . . . . . . . | 4 . . . . . . . . . . . . . . . | . . . . . . . . 0 . . . . . . .' },
    ],
  },
};

export const TRACK_NAMES = Object.keys(TRACKS);

interface ParsedLayer {
  layer: Layer;
  steps: { deg: number | null; len: number; hit: boolean }[];
  gainNode: GainNode | null;
}

function parse(pattern: string): { deg: number | null; len: number; hit: boolean }[] {
  const tokens = pattern.replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
  const steps: { deg: number | null; len: number; hit: boolean }[] = tokens.map(() => ({ deg: null, len: 1, hit: false }));
  let last = -1;
  tokens.forEach((t, i) => {
    if (t === '_') {
      if (last >= 0) steps[last].len++;
    } else if (t === '.') {
      last = -1;
    } else if (t === 'x') {
      steps[i] = { deg: 0, len: 1, hit: true };
      last = -1;
    } else {
      const n = Number(t);
      if (!Number.isNaN(n)) {
        steps[i] = { deg: n, len: 1, hit: true };
        last = i;
      }
    }
  });
  return steps;
}

export class Music {
  private current: string | null = null;
  private layers: ParsedLayer[] = [];
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private trackGain: GainNode | null = null;
  combatIntensity = 0;
  private combatTarget = 0;

  constructor(private audio: AudioEngine) {}

  get playing(): string | null {
    return this.current;
  }

  play(name: string): void {
    if (this.current === name) return;
    const ctx = this.audio.ctx;
    this.current = name;
    const track = TRACKS[name];
    if (!ctx || !track) return;
    // Fade out the old track.
    if (this.trackGain) {
      const old = this.trackGain;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => old.disconnect(), 2500);
    }
    this.trackGain = ctx.createGain();
    this.trackGain.gain.setValueAtTime(0, ctx.currentTime);
    this.trackGain.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 0.6);
    this.trackGain.connect(this.audio.musicBus);
    this.track = track;
    this.layers = track.layers.map((layer) => {
      const g = ctx.createGain();
      g.gain.value = layer.combat ? 0 : layer.gain;
      g.connect(this.trackGain!);
      return { layer, steps: parse(layer.pattern), gainNode: g };
    });
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Re-start the current track after the audio context becomes available. */
  resume(): void {
    const name = this.current;
    if (!name || !this.audio.ctx) return;
    if (this.track && this.trackGain) return;
    this.current = null;
    this.play(name);
  }

  stop(): void {
    const ctx = this.audio.ctx;
    if (ctx && this.trackGain) this.trackGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    this.current = null;
    this.track = null;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setCombat(active: boolean): void {
    this.combatTarget = active ? 1 : 0;
  }

  private tick() {
    const ctx = this.audio.ctx;
    const track = this.track;
    if (!ctx || !track) return;
    this.combatIntensity += (this.combatTarget - this.combatIntensity) * 0.02;
    for (const l of this.layers) {
      if (l.layer.combat && l.gainNode) l.gainNode.gain.value = l.layer.gain * this.combatIntensity;
    }
    const stepDur = 60 / track.bpm / 4;
    // Avoid a burst of catch-up notes after the tab was in the background.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      for (const l of this.layers) {
        const s = l.steps[this.step % l.steps.length];
        if (!s || !s.hit) continue;
        const deg = s.deg ?? 0;
        const midi = this.degToMidi(track, deg, l.layer.octave ?? 0);
        this.note(l.layer.inst, midi, this.nextTime, s.len * stepDur, l.gainNode!);
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private degToMidi(track: Track, deg: number, octave: number): number {
    const n = track.scale.length;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return track.root + track.scale[idx] + 12 * (oct + octave);
  }

  private note(inst: Inst, midi: number, t: number, dur: number, out: AudioNode) {
    const ctx = this.audio.ctx!;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const env = (g: GainNode, a: number, peak: number, decay: number, sustain = 0.0001) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + decay);
    };
    switch (inst) {
      case 'koto': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 1.01, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2;
        const g = ctx.createGain();
        env(g, 0.004, 0.35, 1.3);
        const g2 = ctx.createGain();
        env(g2, 0.004, 0.08, 0.4);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(4000, t);
        lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
        o.connect(g);
        o2.connect(g2);
        g.connect(lp);
        g2.connect(lp);
        lp.connect(out);
        o.start(t);
        o2.start(t);
        o.stop(t + 1.5);
        o2.stop(t + 0.6);
        break;
      }
      case 'shamisen': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(4000, f * 3);
        bp.Q.value = 2;
        const g = ctx.createGain();
        env(g, 0.002, 0.3, 0.25);
        o.connect(bp);
        bp.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 0.35);
        break;
      }
      case 'flute': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2;
        const lfoG = ctx.createGain();
        lfoG.gain.setValueAtTime(0, t);
        lfoG.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.4));
        lfo.connect(lfoG);
        lfoG.connect(o.frequency);
        const g = ctx.createGain();
        const d = Math.max(0.15, dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.09);
        g.gain.setValueAtTime(0.22, t + d * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
        // Breath noise
        const n = ctx.createBufferSource();
        n.buffer = this.audio.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * 2;
        bp.Q.value = 3;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
        n.connect(bp);
        bp.connect(ng);
        ng.connect(out);
        o.connect(g);
        g.connect(out);
        o.start(t);
        lfo.start(t);
        n.start(t, Math.random());
        o.stop(t + d + 0.3);
        lfo.stop(t + d + 0.3);
        n.stop(t + d + 0.3);
        break;
      }
      case 'pad': {
        const d = Math.max(0.5, dur);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.6);
        g.gain.setValueAtTime(0.12, t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
        lp.connect(g);
        g.connect(out);
        for (const det of [-7, 0, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(lp);
          o.start(t);
          o.stop(t + d + 1.3);
        }
        const fifth = ctx.createOscillator();
        fifth.type = 'triangle';
        fifth.frequency.value = f * 1.5;
        const fg = ctx.createGain();
        fg.gain.value = 0.3;
        fifth.connect(fg);
        fg.connect(lp);
        fifth.start(t);
        fifth.stop(t + d + 1.3);
        break;
      }
      case 'bass': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        env(g, 0.01, 0.4, Math.max(0.2, dur * 0.9));
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + dur + 0.3);
        break;
      }
      case 'taiko': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
        const g = ctx.createGain();
        env(g, 0.003, 0.9, 0.45);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 0.5);
        const n = ctx.createBufferSource();
        n.buffer = this.audio.noiseBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        const ng = ctx.createGain();
        env(ng, 0.002, 0.4, 0.12);
        n.connect(lp);
        lp.connect(ng);
        ng.connect(out);
        n.start(t, Math.random());
        n.stop(t + 0.2);
        break;
      }
      case 'ka': {
        const n = ctx.createBufferSource();
        n.buffer = this.audio.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500;
        bp.Q.value = 4;
        const g = ctx.createGain();
        env(g, 0.001, 0.5, 0.05);
        n.connect(bp);
        bp.connect(g);
        g.connect(out);
        n.start(t, Math.random());
        n.stop(t + 0.08);
        break;
      }
      case 'shaker': {
        const n = ctx.createBufferSource();
        n.buffer = this.audio.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const g = ctx.createGain();
        env(g, 0.01, 0.2, 0.06);
        n.connect(hp);
        hp.connect(g);
        g.connect(out);
        n.start(t, Math.random());
        n.stop(t + 0.1);
        break;
      }
      case 'bell': {
        for (const [ratio, amp, dec] of [
          [1, 0.2, 3],
          [2.76, 0.08, 1.6],
          [5.4, 0.04, 0.8],
        ]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f * ratio;
          const g = ctx.createGain();
          env(g, 0.003, amp, dec);
          o.connect(g);
          g.connect(out);
          o.start(t);
          o.stop(t + dec + 0.1);
        }
        break;
      }
    }
  }
}
