// Procedural sound effects (WebAudio). No audio files are used: every sound
// is synthesised at runtime, so all audio is original to this project.

import { fxRng } from './rng';

export type Sfx =
  | 'swing'
  | 'swingHeavy'
  | 'hit'
  | 'hitHeavy'
  | 'crit'
  | 'playerHurt'
  | 'dodge'
  | 'enemyWindup'
  | 'enemyDie'
  | 'bossRoar'
  | 'arrow'
  | 'orb'
  | 'explosion'
  | 'pickup'
  | 'coin'
  | 'levelUp'
  | 'questUpdate'
  | 'questComplete'
  | 'uiMove'
  | 'uiConfirm'
  | 'uiBack'
  | 'uiError'
  | 'heal'
  | 'ability'
  | 'swap'
  | 'chest'
  | 'brazier'
  | 'door'
  | 'death'
  | 'parry'
  | 'splash'
  | 'lockOn'
  | 'step'
  | 'block'
  | 'stagger';

export const SFX_CAPTIONS: Partial<Record<Sfx, string>> = {
  bossRoar: '[A deafening roar]',
  levelUp: '[Bright chime: level up]',
  door: '[Stone doors grind open]',
  questComplete: '[Triumphant chord]',
  death: '[Low, fading drone]',
  brazier: '[Spirit flame ignites]',
  explosion: '[Explosion]',
  parry: '[Time slows]',
  stagger: '[Enemy staggers]',
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private listener = { x: 0, z: 0, yaw: 0 };
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private lastPlayed = new Map<string, number>();
  onCaption: ((text: string) => void) | null = null;
  failed = false;

  /** Create/resume the audio context. Must be called from a user gesture. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch (err) {
      console.warn('[audio] unavailable', err);
      this.failed = true;
    }
  }

  get ready(): boolean {
    return !!this.ctx && !this.failed;
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  setListener(x: number, z: number, yaw: number) {
    this.listener = { x, z, yaw };
  }

  get noiseBuffer(): AudioBuffer {
    return this.noise;
  }

  /** Play a sound effect. Positional sounds are attenuated and panned. */
  play(name: Sfx, opts: { x?: number; z?: number; volume?: number; pitch?: number; caption?: boolean } = {}): void {
    if (opts.caption !== false && SFX_CAPTIONS[name]) this.onCaption?.(SFX_CAPTIONS[name]!);
    if (!this.ctx || this.failed) return;
    // Rate limit identical sounds to avoid harsh stacking.
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < 30) return;
    this.lastPlayed.set(name, now);
    const ctx = this.ctx;
    const out = ctx.createGain();
    let vol = opts.volume ?? 1;
    let pan = 0;
    if (opts.x !== undefined && opts.z !== undefined) {
      const dx = opts.x - this.listener.x;
      const dz = opts.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      vol *= 1 / (1 + d * 0.07);
      if (d > 0.5) {
        // Right vector of the listener (yaw 0 faces +Z, right is -X).
        const rx = -Math.cos(this.listener.yaw);
        const rz = Math.sin(this.listener.yaw);
        pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.7;
      }
    }
    if (vol < 0.02) return;
    out.gain.value = vol;
    let dest: AudioNode = this.sfxBus;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(this.sfxBus);
      dest = p;
    }
    out.connect(dest);
    const t = ctx.currentTime + 0.005;
    const pitch = (opts.pitch ?? 1) * (0.94 + fxRng.next() * 0.12);
    try {
      this.synth(name, out, t, pitch);
    } catch (err) {
      console.warn('[audio] sfx failed', name, err);
    }
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, out: AudioNode, gain: number, freqEnd?: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, out: AudioNode, gain: number, filter: BiquadFilterType, freq: number, freqEnd?: number, q = 1, attack = 0.003) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, fxRng.next() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private synth(name: Sfx, out: AudioNode, t: number, p: number) {
    switch (name) {
      case 'swing':
        this.noiseBurst(t, 0.16, out, 0.35, 'bandpass', 900 * p, 3200 * p, 1.2, 0.03);
        break;
      case 'swingHeavy':
        this.noiseBurst(t, 0.3, out, 0.45, 'bandpass', 400 * p, 1600 * p, 1, 0.06);
        break;
      case 'hit':
        this.noiseBurst(t, 0.09, out, 0.6, 'lowpass', 3000 * p, 600, 1);
        this.osc('square', 220 * p, t, 0.08, out, 0.15, 90);
        break;
      case 'hitHeavy':
        this.noiseBurst(t, 0.18, out, 0.8, 'lowpass', 1800 * p, 200, 1);
        this.osc('sine', 120 * p, t, 0.25, out, 0.6, 40);
        break;
      case 'crit':
        this.noiseBurst(t, 0.12, out, 0.6, 'highpass', 2500, 1500, 1);
        this.osc('triangle', 1200 * p, t, 0.25, out, 0.25, 1800);
        this.osc('sine', 140 * p, t, 0.2, out, 0.5, 50);
        break;
      case 'playerHurt':
        this.osc('sawtooth', 260 * p, t, 0.22, out, 0.2, 110);
        this.noiseBurst(t, 0.15, out, 0.5, 'lowpass', 1500, 300, 1);
        break;
      case 'dodge':
        this.noiseBurst(t, 0.25, out, 0.3, 'bandpass', 500 * p, 1400 * p, 0.8, 0.05);
        break;
      case 'enemyWindup':
        this.osc('sawtooth', 180 * p, t, 0.35, out, 0.12, 260 * p, 0.1);
        break;
      case 'enemyDie':
        this.noiseBurst(t, 0.6, out, 0.35, 'bandpass', 1200 * p, 200, 1.5, 0.02);
        this.osc('sine', 500 * p, t, 0.5, out, 0.15, 120);
        break;
      case 'bossRoar':
        this.osc('sawtooth', 90 * p, t, 1.4, out, 0.4, 55, 0.15);
        this.osc('sawtooth', 93 * p, t, 1.4, out, 0.3, 50, 0.15);
        this.noiseBurst(t, 1.3, out, 0.4, 'lowpass', 700, 200, 1, 0.15);
        break;
      case 'arrow':
        this.noiseBurst(t, 0.12, out, 0.3, 'highpass', 3000, 6000, 1, 0.005);
        this.osc('triangle', 900 * p, t, 0.08, out, 0.1, 400);
        break;
      case 'orb':
        this.osc('sine', 600 * p, t, 0.3, out, 0.15, 300);
        this.noiseBurst(t, 0.25, out, 0.15, 'bandpass', 2000, 800, 2);
        break;
      case 'explosion':
        this.noiseBurst(t, 0.7, out, 0.9, 'lowpass', 1200, 80, 1);
        this.osc('sine', 80 * p, t, 0.6, out, 0.7, 30);
        break;
      case 'pickup':
        this.osc('sine', 880 * p, t, 0.12, out, 0.2);
        this.osc('sine', 1320 * p, t + 0.06, 0.15, out, 0.2);
        break;
      case 'coin':
        this.osc('square', 1600 * p, t, 0.06, out, 0.06);
        this.osc('square', 2100 * p, t + 0.05, 0.1, out, 0.06);
        break;
      case 'levelUp':
        [0, 4, 7, 12].forEach((s, i) => this.osc('triangle', 523 * Math.pow(2, s / 12), t + i * 0.09, 0.5, out, 0.25));
        break;
      case 'questUpdate':
        this.osc('sine', 660, t, 0.25, out, 0.25);
        this.osc('sine', 990, t + 0.1, 0.35, out, 0.2);
        break;
      case 'questComplete':
        [0, 5, 7, 12].forEach((s, i) => this.osc('triangle', 392 * Math.pow(2, s / 12), t + i * 0.12, 0.8, out, 0.22));
        this.osc('sine', 196, t, 1.2, out, 0.25);
        break;
      case 'uiMove':
        this.osc('sine', 1200, t, 0.04, out, 0.08);
        break;
      case 'uiConfirm':
        this.osc('triangle', 900, t, 0.08, out, 0.15);
        this.osc('triangle', 1350, t + 0.05, 0.1, out, 0.12);
        break;
      case 'uiBack':
        this.osc('triangle', 700, t, 0.08, out, 0.12, 500);
        break;
      case 'uiError':
        this.osc('square', 200, t, 0.15, out, 0.08);
        break;
      case 'heal':
        [0, 3, 7].forEach((s, i) => this.osc('sine', 660 * Math.pow(2, s / 12), t + i * 0.07, 0.4, out, 0.18));
        break;
      case 'ability':
        this.noiseBurst(t, 0.4, out, 0.4, 'bandpass', 600, 3000, 2, 0.05);
        this.osc('triangle', 440 * p, t, 0.35, out, 0.2, 880);
        break;
      case 'swap':
        this.osc('square', 500, t, 0.05, out, 0.08);
        this.noiseBurst(t, 0.08, out, 0.2, 'highpass', 4000, 3000, 1);
        break;
      case 'chest':
        this.osc('triangle', 300, t, 0.2, out, 0.2, 200);
        [0, 4, 7, 11].forEach((s, i) => this.osc('sine', 784 * Math.pow(2, s / 12), t + 0.15 + i * 0.06, 0.4, out, 0.15));
        break;
      case 'brazier':
        this.noiseBurst(t, 0.8, out, 0.5, 'lowpass', 400, 2500, 1, 0.1);
        this.osc('sine', 330, t, 1.0, out, 0.2, 660, 0.2);
        break;
      case 'door':
        this.noiseBurst(t, 1.6, out, 0.5, 'lowpass', 300, 120, 2, 0.2);
        this.osc('sawtooth', 50, t, 1.5, out, 0.2, 40, 0.2);
        break;
      case 'death':
        this.osc('sine', 220, t, 2.0, out, 0.3, 55, 0.05);
        this.osc('sine', 233, t, 2.0, out, 0.2, 58, 0.05);
        break;
      case 'parry':
        this.osc('sine', 1800, t, 0.6, out, 0.25, 900);
        this.osc('sine', 2700, t, 0.4, out, 0.15, 1300);
        break;
      case 'splash':
        this.noiseBurst(t, 0.2, out, 0.2, 'bandpass', 1200, 500, 1.5, 0.01);
        break;
      case 'lockOn':
        this.osc('sine', 1000, t, 0.06, out, 0.1);
        this.osc('sine', 1500, t + 0.04, 0.06, out, 0.08);
        break;
      case 'step':
        this.noiseBurst(t, 0.05, out, 0.08, 'lowpass', 600, 300, 1);
        break;
      case 'block':
        this.osc('square', 300, t, 0.08, out, 0.12, 200);
        this.noiseBurst(t, 0.08, out, 0.3, 'highpass', 2000, 1500, 1);
        break;
      case 'stagger':
        this.osc('triangle', 300, t, 0.4, out, 0.3, 120);
        this.noiseBurst(t, 0.3, out, 0.4, 'lowpass', 1000, 200, 1);
        break;
    }
  }
}
