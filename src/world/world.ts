// Loads areas into the scene, manages lighting/sky, dynamic world state
// (doors, braziers, chests) and movement collision.

import * as THREE from 'three';
import type { AreaId } from '../data/areaIds';
import type { Quality } from '../core/settings';
import { clamp } from '../core/math';
import { evalCond } from '../systems/dialogue';
import type { GameData } from '../systems/state';
import { AREA_BUILDERS } from './areas';
import type { AreaBuild, InteractDef } from './areaTypes';
import { brazier, chest, wayshrine } from './props';
import { resolveCircle, segmentBlocked } from './terrain';
import { toon } from '../render/toon';

const SKY_VERT = `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
void main(){ float h = normalize(vPos).y; float t = smoothstep(-0.1, 0.6, h); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }`;

export interface InteractObj {
  def: InteractDef;
  obj: THREE.Object3D;
}

export class World {
  readonly scene: THREE.Scene;
  area: AreaBuild | null = null;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyUniforms: { top: { value: THREE.Color }; bottom: { value: THREE.Color } };
  private extras = new THREE.Group();
  interactObjs = new Map<string, InteractObj>();
  quality: Quality = 'medium';
  private lanternLit = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 24, 12),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    scene.add(this.extras);
    scene.fog = new THREE.Fog(0x000000, 20, 100);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.area) for (const l of this.area.lights) l.visible = q !== 'low' || (l as THREE.PointLight).intensity > 7;
  }

  load(id: AreaId, data: GameData): AreaBuild {
    this.unload();
    const builder = AREA_BUILDERS[id];
    const area = builder();
    this.area = area;
    this.scene.add(area.group);
    const env = area.env;
    this.skyUniforms.top.value.setHex(env.skyTop);
    this.skyUniforms.bottom.value.setHex(env.skyBottom);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(env.fogColor);
    fog.near = env.fogNear;
    fog.far = env.fogFar;
    this.scene.background = new THREE.Color(env.fogColor);
    this.sun.color.setHex(env.sunColor);
    this.sun.intensity = env.sunIntensity;
    this.hemi.color.setHex(env.hemiSky);
    this.hemi.groundColor.setHex(env.hemiGround);
    this.hemi.intensity = env.hemiIntensity;
    if (env.stars) this.addStars();
    if (env.moon) {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xffe8d0, fog: false }));
      moon.position.set(-120, 170, 300);
      moon.lookAt(0, 0, 0);
      this.extras.add(moon);
    }
    for (const def of area.interactables) this.createInteractable(def, data);
    this.refreshDynamic(data);
    this.setQuality(this.quality);
    return area;
  }

  private addStars() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      const r = 420;
      pos[i * 3] = Math.cos(th) * Math.sin(ph) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r;
      pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
    this.extras.add(stars);
  }

  unload() {
    if (!this.area) return;
    this.scene.remove(this.area.group);
    disposeTree(this.area.group);
    for (const c of [...this.extras.children]) {
      this.extras.remove(c);
      disposeTree(c);
    }
    this.interactObjs.clear();
    this.area = null;
  }

  private createInteractable(def: InteractDef, data: GameData) {
    const obj = this.buildInteractVisual(def, data);
    if (!obj || !this.area) return;
    obj.position.set(def.x, this.heightAt(def.x, def.z), def.z);
    obj.rotation.y = def.yaw ?? 0;
    this.area.group.add(obj);
    this.interactObjs.set(def.id, { def, obj });
    if (def.kind === 'chest') this.area.colliders.push({ kind: 'circle', x: def.x, z: def.z, r: 0.7, h: 1 });
    if (def.kind === 'brazier' || def.kind === 'seal') this.area.colliders.push({ kind: 'circle', x: def.x, z: def.z, r: 0.9, h: 2 });
  }

  private buildInteractVisual(def: InteractDef, data: GameData): THREE.Object3D | null {
    switch (def.kind) {
      case 'chest':
        return chest(data.world.openedChests.includes(def.id));
      case 'brazier':
        return brazier(data.world.litBraziers.includes(def.id));
      case 'seal': {
        const g = new THREE.Group();
        const lit = (data.flags[def.id] ?? 0) > 0;
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.6, 6), toon(0x4a4652));
        stone.position.y = 0.8;
        g.add(stone);
        const rune = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 16), lit ? toon(0x8ad8ff, { emissive: 0x4ab8ff, emissiveIntensity: 2 }) : toon(0x6a2a3a, { emissive: 0x6a1a2a, emissiveIntensity: 0.8 }));
        rune.position.set(0, 1.0, 0);
        rune.rotation.x = Math.PI / 2;
        rune.position.y = 1.65;
        g.add(rune);
        return g;
      }
      case 'wayshrine':
        // Wayshrines are already placed as scenery; use an empty marker.
        return new THREE.Group();
      case 'lantern':
        return new THREE.Group();
      default:
        return wayshrine();
    }
  }

  /** Re-apply state-dependent visuals and colliders after flags change. */
  refreshDynamic(data: GameData) {
    const area = this.area;
    if (!area) return;
    for (const io of this.interactObjs.values()) {
      if (io.def.kind === 'chest' || io.def.kind === 'brazier' || io.def.kind === 'seal') {
        const fresh = this.buildInteractVisual(io.def, data);
        if (fresh) {
          fresh.position.copy(io.obj.position);
          fresh.rotation.copy(io.obj.rotation);
          area.group.remove(io.obj);
          disposeTree(io.obj);
          area.group.add(fresh);
          io.obj = fresh;
        }
      }
    }
    const setCollider = (id: string, enabled: boolean) => {
      for (const c of area.colliders) if (c.id === id) c.disabled = !enabled;
    };
    const setVisible = (name: string, v: boolean) => {
      const o = area.group.getObjectByName(name);
      if (o) o.visible = v;
    };
    if (area.id === 'bamboo') {
      const joined = (data.flags.kohaku_joined ?? 0) > 0;
      setVisible('kohakuCage', !joined);
      setCollider('kohakuCage', !joined);
    }
    if (area.id === 'village') {
      setVisible('marshBar', !((data.flags.marsh_open ?? 0) > 0));
    }
    if (area.id === 'marsh') {
      const open = (data.flags.catacombs_open ?? 0) > 0;
      const doors = area.group.getObjectByName('catacombDoors');
      if (doors) {
        const l = doors.getObjectByName('doorL');
        const r = doors.getObjectByName('doorR');
        if (l) l.rotation.y = open ? 1.4 : 0;
        if (r) r.rotation.y = open ? -1.4 : 0;
      }
      setCollider('catacombDoor', !open);
    }
    if (area.id === 'catacombs') {
      const open = (data.flags.seal_east ?? 0) > 0 && (data.flags.seal_west ?? 0) > 0;
      setVisible('bossDoor', !open);
      setCollider('bossDoor', !open);
    }
    if (area.id === 'summit') this.setLanternLit(data.ending);
    const beacon = area.group.getObjectByName('beacon') as THREE.Mesh | undefined;
    if (beacon) {
      const lit = data.ending;
      (beacon.material as THREE.MeshBasicMaterial).color.setHex(lit ? 0xffd27a : 0x6a5a7a);
      beacon.scale.setScalar(lit ? 2.2 : 1);
    }
  }

  setLanternLit(lit: boolean) {
    this.lanternLit = lit;
    const area = this.area;
    if (!area) return;
    const lantern = area.group.getObjectByName('spiritLantern');
    if (!lantern) return;
    const core = lantern.getObjectByName('core') as THREE.Mesh | undefined;
    const halo = lantern.getObjectByName('halo') as THREE.Mesh | undefined;
    if (core) core.material = lit ? toon(0xffe0a0, { emissive: 0xffa040, emissiveIntensity: 2.5 }) : toon(0x6a6070);
    if (halo) (halo.material as THREE.MeshBasicMaterial).opacity = lit ? 0.35 : 0;
    const light = area.group.getObjectByName('lanternLight') as THREE.PointLight | undefined;
    if (light) light.intensity = lit ? 40 : 0;
  }

  get isLanternLit() {
    return this.lanternLit;
  }

  heightAt(x: number, z: number): number {
    return this.area ? this.area.heightAt(x, z) : 0;
  }

  /** Ground height the character stands on (never below water surface level - 0.5). */
  groundY(x: number, z: number): number {
    const h = this.heightAt(x, z);
    const w = this.area?.water;
    return w ? Math.max(h, w.level - 0.45) : h;
  }

  inWater(x: number, z: number): boolean {
    const w = this.area?.water;
    return !!w && this.heightAt(x, z) < w.level - 0.05;
  }

  /** Move a character circle from (x,z) by (dx,dz), respecting walkable space, colliders and bounds. */
  move(x: number, z: number, dx: number, dz: number, radius: number): { x: number; z: number; blocked: boolean } {
    const area = this.area;
    if (!area) return { x: x + dx, z: z + dz, blocked: false };
    let nx = x + dx;
    let nz = z + dz;
    let blocked = false;
    const walk = area.walkable;
    if (walk && !walk(nx, nz)) {
      blocked = true;
      if (walk(nx, z)) nz = z;
      else if (walk(x, nz)) nx = x;
      else {
        nx = x;
        nz = z;
      }
    }
    const r = resolveCircle(area.colliders, nx, nz, radius);
    if (r.hit) blocked = true;
    nx = r.x;
    nz = r.z;
    if (walk && !walk(nx, nz) && walk(x, z)) {
      nx = x;
      nz = z;
    }
    const half = area.size / 2 - 2;
    nx = clamp(nx, -half, half);
    nz = clamp(nz, -half, half);
    return { x: nx, z: nz, blocked };
  }

  /** Fraction (0..1) of the way from `from` to `to` the camera can travel unobstructed. */
  cameraClearance(from: THREE.Vector3, to: THREE.Vector3): number {
    const area = this.area;
    if (!area) return 1;
    let t = segmentBlocked(area.colliders, from.x, from.z, to.x, to.z, 2.5);
    if (area.indoor && area.walkable) {
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        if (f > t) break;
        const x = from.x + (to.x - from.x) * f;
        const z = from.z + (to.z - from.z) * f;
        if (!area.walkable(x, z)) {
          t = Math.max(0.05, f - 1.5 / steps);
          break;
        }
      }
    }
    return t;
  }

  updateShadowFocus(p: THREE.Vector3) {
    const area = this.area;
    if (!area) return;
    const d = area.env.sunDir;
    const len = Math.hypot(d[0], d[1], d[2]);
    this.sun.position.set(p.x + (d[0] / len) * 60, p.y + (d[1] / len) * 60, p.z + (d[2] / len) * 60);
    this.sun.target.position.copy(p);
    this.sky.position.copy(p);
    this.extras.position.set(p.x, 0, p.z);
  }

  interactableAvailable(def: InteractDef, data: GameData): boolean {
    if (def.requires && !evalCond(data, def.requires)) return false;
    if (def.kind === 'chest') return !data.world.openedChests.includes(def.id);
    if (def.kind === 'brazier') return !data.world.litBraziers.includes(def.id);
    if (def.kind === 'seal') return !((data.flags[def.id] ?? 0) > 0);
    if (def.kind === 'lantern') return !data.ending;
    return true;
  }
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
