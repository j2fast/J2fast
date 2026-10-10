// Visual effects: particle bursts, ambient particles, weapon trails, ground
// telegraphs, shockwaves and floating damage numbers.

import * as THREE from 'three';
import { fxRng } from '../core/rng';
import { basic, petalTexture, softDotTexture } from './toon';

// ------------------------------------------------------------------ Particles

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
  drag: number;
}

export class ParticlePool {
  readonly points: THREE.Points;
  private parts: Particle[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private next = 0;

  constructor(
    private capacity: number,
    size: number,
    texture: THREE.Texture,
    additive = true,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size,
      map: texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.parts.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0 });
      this.pos[i * 3 + 1] = -999;
    }
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: THREE.Color, gravity = 0, drag = 1) {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.capacity;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.r = color.r;
    p.g = color.g;
    p.b = color.b;
    p.gravity = gravity;
    p.drag = drag;
  }

  update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      const dk = Math.exp(-p.drag * dt);
      p.vx *= dk;
      p.vz *= dk;
      p.vy = p.vy * dk - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const f = Math.min(1, (p.life / p.maxLife) * 1.5);
      this.col[i * 3] = p.r * f;
      this.col[i * 3 + 1] = p.g * f;
      this.col[i * 3 + 2] = p.b * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.parts[i].alive = false;
      this.pos[i * 3 + 1] = -999;
    }
  }
}

export interface BurstOpts {
  count: number;
  color: number;
  speed: number;
  life: number;
  gravity?: number;
  upBias?: number;
  size?: 's' | 'm' | 'l';
  spread?: number;
  drag?: number;
}

// ------------------------------------------------------------------ Trails

export class Trail {
  readonly mesh: THREE.Mesh;
  private samples: THREE.Vector3[] = [];
  private maxSamples = 12;
  private geo: THREE.BufferGeometry;
  private posArr: Float32Array;
  private alphaArr: Float32Array;
  active = false;
  private fade = 0;

  constructor(color: number) {
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.maxSamples * 2 * 3);
    this.alphaArr = new Float32Array(this.maxSamples * 2);
    const idx: number[] = [];
    for (let i = 0; i < this.maxSamples - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, fade: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float fade; varying float vA; void main(){ gl_FragColor = vec4(color, vA * fade * 0.85); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setColor(c: number) {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.color.value as THREE.Color).setHex(c);
  }

  /** Push the current world-space base and tip of the blade. */
  push(base: THREE.Vector3, tip: THREE.Vector3) {
    this.samples.unshift(base.clone(), tip.clone());
    if (this.samples.length > this.maxSamples * 2) this.samples.length = this.maxSamples * 2;
    this.fade = 1;
    this.rebuild();
  }

  update(dt: number) {
    if (!this.active) {
      this.fade -= dt * 6;
      if (this.fade <= 0) {
        this.samples.length = 0;
        this.mesh.visible = false;
        return;
      }
    }
    (this.mesh.material as THREE.ShaderMaterial).uniforms.fade.value = Math.max(0, this.fade);
  }

  private rebuild() {
    const n = this.samples.length / 2;
    this.mesh.visible = n >= 2;
    for (let i = 0; i < this.maxSamples; i++) {
      const si = Math.min(i, n - 1);
      const b = this.samples[si * 2];
      const t = this.samples[si * 2 + 1];
      if (!b) continue;
      this.posArr.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      const a = i < n ? 1 - i / Math.max(1, n - 1) : 0;
      this.alphaArr[i * 2] = a * 0.3;
      this.alphaArr[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ Telegraphs

export type TelegraphShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'cone'; radius: number; arc: number }
  | { kind: 'line'; length: number; width: number }
  | { kind: 'ring'; radius: number };

export interface Telegraph {
  group: THREE.Group;
  fill: THREE.Mesh;
  edge: THREE.Mesh;
  shape: TelegraphShape;
  duration: number;
  t: number;
  done: boolean;
  follow?: () => { x: number; y: number; z: number; yaw: number } | null;
}

export class TelegraphManager {
  readonly group = new THREE.Group();
  private list: Telegraph[] = [];
  highContrast = false;

  private materials() {
    return this.highContrast
      ? { fill: basic(0xffe600, { transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }), edge: basic(0xff00c8, { transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }) }
      : { fill: basic(0xff3a2a, { transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), edge: basic(0xff6a3a, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }) };
  }

  spawn(shape: TelegraphShape, x: number, y: number, z: number, yaw: number, duration: number): Telegraph {
    const g = new THREE.Group();
    g.position.set(x, y + 0.06, z);
    g.rotation.y = yaw;
    const m = this.materials();
    let fillGeo: THREE.BufferGeometry;
    let edgeGeo: THREE.BufferGeometry;
    switch (shape.kind) {
      case 'circle':
        fillGeo = new THREE.CircleGeometry(shape.radius, 40);
        edgeGeo = new THREE.RingGeometry(shape.radius * 0.94, shape.radius, 40);
        break;
      case 'ring':
        fillGeo = new THREE.RingGeometry(Math.max(0.01, shape.radius - 0.8), shape.radius, 64);
        edgeGeo = new THREE.RingGeometry(shape.radius - 0.1, shape.radius, 64);
        break;
      case 'cone': {
        const a = (shape.arc * Math.PI) / 180;
        // CircleGeometry sector centred on +Z.
        fillGeo = new THREE.CircleGeometry(shape.radius, 32, Math.PI / 2 - a / 2, a);
        edgeGeo = new THREE.RingGeometry(shape.radius * 0.93, shape.radius, 32, 1, Math.PI / 2 - a / 2, a);
        break;
      }
      case 'line':
        fillGeo = new THREE.PlaneGeometry(shape.width, shape.length);
        fillGeo.translate(0, shape.length / 2, 0);
        edgeGeo = new THREE.PlaneGeometry(shape.width, 0.15);
        edgeGeo.translate(0, shape.length, 0);
        break;
    }
    // Geometry is built in the XY plane; rotating +90° about X lays it flat
    // with local +Y pointing along +Z (the attacker's forward direction).
    const fill = new THREE.Mesh(fillGeo, m.fill);
    const edge = new THREE.Mesh(edgeGeo, m.edge);
    for (const mesh of [fill, edge]) {
      mesh.rotation.x = Math.PI / 2;
      mesh.renderOrder = 2;
    }
    fill.scale.set(0.05, 0.05, 1);
    g.add(fill, edge);
    this.group.add(g);
    const tg: Telegraph = { group: g, fill, edge, shape, duration, t: 0, done: false };
    this.list.push(tg);
    return tg;
  }

  update(dt: number) {
    for (const tg of this.list) {
      tg.t += dt;
      const p = Math.min(1, tg.t / Math.max(0.01, tg.duration));
      if (tg.shape.kind === 'line') tg.fill.scale.set(1, Math.max(0.02, p), 1);
      else if (tg.shape.kind === 'ring') tg.fill.scale.set(1, 1, 1);
      else tg.fill.scale.set(Math.max(0.05, p), Math.max(0.05, p), 1);
      if (tg.follow) {
        const f = tg.follow();
        if (f) {
          tg.group.position.set(f.x, f.y + 0.06, f.z);
          tg.group.rotation.y = f.yaw;
        }
      }
      if (tg.t >= tg.duration + 0.12) tg.done = true;
    }
    for (const tg of this.list.filter((t) => t.done)) this.remove(tg);
  }

  remove(tg: Telegraph) {
    const i = this.list.indexOf(tg);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(tg.group);
    tg.fill.geometry.dispose();
    tg.edge.geometry.dispose();
    tg.done = true;
  }

  clear() {
    for (const tg of [...this.list]) this.remove(tg);
  }

  get count() {
    return this.list.length;
  }

  /**
   * Is the ground point inside any active warning? Returns the warning's
   * centre so a caller can move away from it. Used by the automated test bot,
   * which "reads" telegraphs the way a player does.
   */
  dangerAt(x: number, z: number, margin = 0.6): { x: number; z: number; progress: number } | null {
    for (const tg of this.list) {
      if (tg.done) continue;
      const gx = tg.group.position.x;
      const gz = tg.group.position.z;
      const dx = x - gx;
      const dz = z - gz;
      const d = Math.hypot(dx, dz);
      const yaw = tg.group.rotation.y;
      const sh = tg.shape;
      let inside = false;
      if (sh.kind === 'circle') inside = d < sh.radius + margin;
      else if (sh.kind === 'ring') inside = d < sh.radius + 3;
      else if (sh.kind === 'cone') {
        const ang = Math.atan2(dx, dz) - yaw;
        const a = Math.atan2(Math.sin(ang), Math.cos(ang));
        inside = d < sh.radius + margin && (Math.abs(a) < ((sh.arc * Math.PI) / 180) / 2 + 0.25 || d < 1.2);
      } else if (sh.kind === 'line') {
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const along = dx * fx + dz * fz;
        const perp = Math.abs(dx * fz - dz * fx);
        inside = along > -margin && along < sh.length + margin && perp < sh.width / 2 + margin;
      }
      if (inside) return { x: gx, z: gz, progress: tg.t / Math.max(0.01, tg.duration) };
    }
    return null;
  }
}

// ------------------------------------------------------------------ Shockwaves

interface Wave {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  from: number;
  to: number;
}

// ------------------------------------------------------------------ Effects facade

export class Effects {
  readonly group = new THREE.Group();
  readonly telegraphs = new TelegraphManager();
  private sparks: ParticlePool;
  private embers: ParticlePool;
  private smoke: ParticlePool;
  private ambient: ParticlePool | null = null;
  private ambientCfg: AmbientConfig | null = null;
  private ambientTimer = 0;
  private waves: Wave[] = [];
  private tmpColor = new THREE.Color();
  reduceFlashing = false;

  constructor() {
    this.sparks = new ParticlePool(600, 0.18, softDotTexture());
    this.embers = new ParticlePool(500, 0.35, softDotTexture());
    this.smoke = new ParticlePool(200, 1.6, softDotTexture(), false);
    this.group.add(this.sparks.points, this.embers.points, this.smoke.points, this.telegraphs.group);
  }

  burst(x: number, y: number, z: number, o: BurstOpts) {
    const pool = o.size === 'l' ? this.smoke : o.size === 'm' ? this.embers : this.sparks;
    this.tmpColor.setHex(o.color);
    const n = this.reduceFlashing ? Math.ceil(o.count / 2) : o.count;
    for (let i = 0; i < n; i++) {
      const th = fxRng.next() * Math.PI * 2;
      const ph = Math.acos(2 * fxRng.next() - 1);
      const sp = o.speed * (0.4 + fxRng.next() * 0.6);
      const spread = o.spread ?? 0.1;
      pool.spawn(
        x + (fxRng.next() - 0.5) * spread,
        y + (fxRng.next() - 0.5) * spread,
        z + (fxRng.next() - 0.5) * spread,
        Math.sin(ph) * Math.cos(th) * sp,
        Math.abs(Math.cos(ph)) * sp * (o.upBias ?? 0.6) + (o.upBias ?? 0) * sp * 0.5,
        Math.sin(ph) * Math.sin(th) * sp,
        o.life * (0.6 + fxRng.next() * 0.4),
        this.tmpColor,
        o.gravity ?? 0,
        o.drag ?? 2,
      );
    }
  }

  hitSpark(x: number, y: number, z: number, crit: boolean, color = 0xffd27a) {
    this.burst(x, y, z, { count: crit ? 26 : 14, color, speed: crit ? 9 : 6, life: 0.35, gravity: 10, size: 's' });
    if (crit) this.burst(x, y, z, { count: 6, color: 0xffffff, speed: 3, life: 0.25, size: 'm' });
  }

  deathPuff(x: number, y: number, z: number, color: number) {
    this.burst(x, y + 0.6, z, { count: 18, color, speed: 2.5, life: 1.2, gravity: -1.5, size: 'm', spread: 0.8 });
    this.burst(x, y + 0.4, z, { count: 6, color: 0x2a2030, speed: 1.2, life: 1.4, gravity: -0.6, size: 'l', spread: 0.6 });
  }

  shockwave(x: number, y: number, z: number, radius: number, color = 0xffc070, life = 0.45) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), basic(color, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, additive: true, depthWrite: false }).clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.1, z);
    this.group.add(mesh);
    this.waves.push({ mesh, t: 0, life, from: 0.2, to: radius });
  }

  setAmbient(cfg: AmbientConfig | null) {
    if (this.ambient) {
      this.group.remove(this.ambient.points);
      this.ambient = null;
    }
    this.ambientCfg = cfg;
    if (!cfg) return;
    const tex = cfg.kind === 'petals' ? petalTexture() : softDotTexture();
    this.ambient = new ParticlePool(cfg.count, cfg.size, tex, cfg.kind !== 'petals' && cfg.kind !== 'ash');
    this.group.add(this.ambient.points);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.sparks.update(dt);
    this.embers.update(dt);
    this.smoke.update(dt);
    this.telegraphs.update(dt);
    for (const w of this.waves) {
      w.t += dt;
      const p = Math.min(1, w.t / w.life);
      const r = w.from + (w.to - w.from) * (1 - Math.pow(1 - p, 2));
      w.mesh.scale.setScalar(r);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - p);
    }
    for (const w of this.waves.filter((x) => x.t >= x.life)) {
      this.group.remove(w.mesh);
      w.mesh.geometry.dispose();
      (w.mesh.material as THREE.Material).dispose();
    }
    this.waves = this.waves.filter((x) => x.t < x.life);

    if (this.ambient && this.ambientCfg) {
      const c = this.ambientCfg;
      this.ambientTimer += dt;
      const interval = 1 / c.rate;
      this.tmpColor.setHex(c.color);
      while (this.ambientTimer > interval) {
        this.ambientTimer -= interval;
        const x = focus.x + (fxRng.next() - 0.5) * c.radius * 2;
        const z = focus.z + (fxRng.next() - 0.5) * c.radius * 2;
        const y = focus.y + c.yMin + fxRng.next() * (c.yMax - c.yMin);
        const w = c.wander;
        this.ambient.spawn(x, y, z, (fxRng.next() - 0.5) * w + c.wind, c.vy + (fxRng.next() - 0.5) * w * 0.5, (fxRng.next() - 0.5) * w, c.life, this.tmpColor, 0, 0.2);
      }
      this.ambient.update(dt);
    }
  }

  clearTransient() {
    this.sparks.clear();
    this.embers.clear();
    this.smoke.clear();
    this.telegraphs.clear();
    this.ambient?.clear();
  }
}

export interface AmbientConfig {
  kind: 'petals' | 'fireflies' | 'embers' | 'ash' | 'motes' | 'snow';
  color: number;
  count: number;
  size: number;
  rate: number;
  radius: number;
  yMin: number;
  yMax: number;
  vy: number;
  wind: number;
  wander: number;
  life: number;
}

// ------------------------------------------------------------------ Damage numbers

interface FloatText {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
  vy: number;
}

export class FloatingText {
  private items: FloatText[] = [];
  private v = new THREE.Vector3();
  enabled = true;

  constructor(private container: HTMLElement) {}

  spawn(pos: THREE.Vector3, text: string, cls: string, life = 0.9) {
    if (!this.enabled && cls.includes('dmg')) return;
    if (this.items.length > 40) {
      const old = this.items.shift()!;
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.items.push({ el, pos: pos.clone().add(new THREE.Vector3((fxRng.next() - 0.5) * 0.6, 0, (fxRng.next() - 0.5) * 0.6)), t: 0, life, vy: 1.6 });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    for (const it of this.items) {
      it.t += dt;
      it.pos.y += it.vy * dt;
      it.vy *= Math.exp(-dt * 2);
      this.v.copy(it.pos).project(camera);
      const visible = this.v.z < 1 && it.t < it.life;
      it.el.style.display = visible ? 'block' : 'none';
      if (visible) {
        const x = (this.v.x * 0.5 + 0.5) * w;
        const y = (-this.v.y * 0.5 + 0.5) * h;
        const a = it.t < 0.1 ? it.t / 0.1 : 1 - Math.max(0, (it.t - it.life * 0.6) / (it.life * 0.4));
        const sc = it.t < 0.12 ? 1.4 - it.t * 3 : 1;
        it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
        it.el.style.opacity = a.toFixed(2);
      }
    }
    for (const it of this.items.filter((i) => i.t >= i.life)) it.el.remove();
    this.items = this.items.filter((i) => i.t < i.life);
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
