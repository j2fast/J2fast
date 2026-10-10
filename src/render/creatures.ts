// Character models for the player, NPCs, enemies and bosses.

import * as THREE from 'three';
import { Rig, buildHumanoid, applyPose, POSES, Pose, locomotionPose, addPose } from './rig';
import { addOutlines, basic, toon, toonUnique, canvasTexture } from './toon';
import { buildWeapon } from './weaponModels';

export type AnimMode = 'idle' | 'move' | 'windup' | 'active' | 'recover' | 'hit' | 'stagger' | 'dead' | 'special';

export interface AnimState {
  mode: AnimMode;
  t: number;
  speed: number;
  /** 0..1 progress through the current mode. */
  progress: number;
  /** Pose prefix for attacks on humanoids, e.g. "claw" -> claw_wind / claw_hit. */
  pose?: string;
}

export interface Model {
  root: THREE.Group;
  rig?: Rig;
  flashMats: THREE.MeshToonMaterial[];
  height: number;
  animate(state: AnimState, dt: number): void;
  /** Extra objects (e.g. glowing parts) the game may want to toggle. */
  glow?: THREE.Object3D[];
}


/** Default humanoid animation for enemies and NPCs. */
function humanoidAnimator(rig: Rig, base: Pose, opts: { hunch?: number; strideScale?: number } = {}) {
  let phase = Math.random() * 6;
  return (s: AnimState, dt: number) => {
    phase += dt * s.speed * 2.4 * (opts.strideScale ?? 1);
    let pose: Pose = base;
    if (s.mode === 'move') pose = addPose(base, locomotionPose(phase, Math.min(1, s.speed / 3)));
    else if (s.mode === 'windup' && s.pose) pose = POSES[`${s.pose}_wind`] ?? base;
    else if ((s.mode === 'active' || s.mode === 'recover') && s.pose) pose = POSES[`${s.pose}_hit`] ?? base;
    else if (s.mode === 'hit' || s.mode === 'stagger') pose = POSES.hit;
    else if (s.mode === 'dead') pose = POSES.dead;
    if (opts.hunch) pose = addPose(pose, { torso: [opts.hunch, 0, 0] });
    if (s.mode === 'idle') pose = addPose(pose, { torso: [Math.sin(s.t * 1.6) * 0.03, 0, 0], head: [Math.sin(s.t * 0.7) * 0.05, Math.sin(s.t * 0.4) * 0.15, 0] });
    const rate = s.mode === 'active' ? 30 : s.mode === 'windup' ? 10 : 14;
    applyPose(rig, pose, dt, rate);
    // Fall over when dead.
    const targetTilt = s.mode === 'dead' ? -Math.PI / 2 : 0;
    rig.spinner.rotation.x += (targetTilt - rig.spinner.rotation.x) * Math.min(1, dt * 6);
    rig.spinner.position.y = 0.55 + (s.mode === 'dead' ? -0.35 * Math.min(1, s.progress * 3) : 0);
    rig.hips.position.y = 0.4 + (s.mode === 'move' ? Math.abs(Math.sin(phase)) * 0.05 : 0);
  };
}

function humanoidModel(rig: Rig, base: Pose, opts?: { hunch?: number; strideScale?: number }): Model {
  return { root: rig.root, rig, flashMats: rig.flashMats, height: rig.height, animate: humanoidAnimator(rig, base, opts) };
}

// ------------------------------------------------------------------ Player

export function buildPlayerRig(): Rig {
  const rig = buildHumanoid({
    skin: 0xf0c9a0,
    cloth: 0x2b2f55,
    cloth2: 0xe8e0cf,
    accent: 0xd8452f,
    hair: 0x1a1622,
    headwear: 'topknot',
  });
  // Signature hip lantern.
  const lantern = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), toon(0xffd58a, { emissive: 0xff9a3a, emissiveIntensity: 1.6 }));
  lantern.add(paper);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.03, 8), toon(0x2a1d2e));
  cap.position.y = 0.09;
  lantern.add(cap);
  const cap2 = cap.clone();
  cap2.position.y = -0.09;
  lantern.add(cap2);
  lantern.position.set(0.26, -0.05, -0.05);
  rig.hips.add(lantern);
  // Short cape / haori tail
  const capeGeo = new THREE.PlaneGeometry(0.5, 0.6, 1, 3);
  capeGeo.translate(0, -0.3, 0);
  const cape = new THREE.Mesh(capeGeo, toon(0x2b2f55, { side: THREE.DoubleSide }));
  cape.position.set(0, 0.05, -0.2);
  cape.rotation.x = 0.15;
  cape.name = 'cape';
  rig.hips.add(cape);
  return rig;
}

// ------------------------------------------------------------------ NPCs

export function buildNpc(id: string): Model {
  let rig: Rig;
  let base: Pose = POSES.idleNpc;
  switch (id) {
    case 'tsugumi':
      rig = buildHumanoid({ skin: 0xe8c4a0, cloth: 0x6b4c7a, cloth2: 0xd9cfbf, accent: 0xc9a24a, hair: 0xd4d0cc, headwear: 'bun', skirt: true, scale: 0.92 });
      {
        // Walking staff with a small lantern.
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), toon(0x5a3a26));
        staff.position.y = -0.25;
        rig.handR.add(staff);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0xffd58a, { emissive: 0xff9a3a, emissiveIntensity: 1.5 }));
        l.position.y = 0.6;
        rig.handR.add(l);
      }
      base = { ...POSES.idleNpc, armR: [-0.3, 0, -0.1], foreR: [-0.5, 0, 0], torso: [0.12, 0, 0] };
      break;
    case 'kanetsugu':
      rig = buildHumanoid({ skin: 0xd9a77a, cloth: 0x4a3a2e, cloth2: 0x8a6a4a, accent: 0xb04030, hair: 0x1a1622, headwear: 'topknot', bulk: 1.3, scale: 1.05 });
      {
        const hammer = new THREE.Group();
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), toon(0x5a3a26));
        h.position.y = -0.2;
        hammer.add(h);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.22), toon(0x6a6e78));
        head.position.y = -0.45;
        hammer.add(head);
        rig.handR.add(hammer);
      }
      base = POSES.armsCrossed;
      break;
    case 'ohana':
      rig = buildHumanoid({ skin: 0xf2d0b0, cloth: 0x3f7a6a, cloth2: 0xf2d7b6, accent: 0xf0a0b0, hair: 0x2a1a1a, headwear: 'bun', skirt: true, scale: 0.95 });
      base = { ...POSES.idleNpc, armR: [-0.7, 0.3, 0], foreR: [-1.2, 0, 0], armL: [-0.7, -0.3, 0], foreL: [-1.2, 0, 0] };
      break;
    case 'mikoto':
      rig = buildHumanoid({ skin: 0xf2d6be, cloth: 0xf4f0ea, cloth2: 0xc8322b, accent: 0xffffff, hair: 0x15121a, headwear: 'hair', skirt: true });
      {
        const wand = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), toon(0xe0d0b0));
        stick.position.y = 0.1;
        wand.add(stick);
        for (let i = 0; i < 4; i++) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.005), toon(0xffffff));
          strip.position.set(Math.cos(i * 1.6) * 0.04, 0.35 - i * 0.03, Math.sin(i * 1.6) * 0.04);
          strip.rotation.z = i * 0.4;
          wand.add(strip);
        }
        rig.handR.add(wand);
      }
      break;
    case 'ibuki':
      rig = buildHumanoid({ skin: 0xc99a78, cloth: 0x5a6470, cloth2: 0x3a4048, accent: 0x8a8a6a, hair: 0x8a8a8a, headwear: 'kasa' });
      {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), toon(0x5a3a26));
        pole.position.y = -0.3;
        rig.handR.add(pole);
      }
      base = { ...POSES.idleNpc, armR: [-0.6, 0, -0.1], foreR: [-0.8, 0, 0], torso: [0.15, 0, 0] };
      break;
    case 'hotaru':
      rig = buildHumanoid({ skin: 0xdff4ff, cloth: 0x9fd8ff, cloth2: 0xe8f8ff, accent: 0xffe08a, hair: 0x6aa0d0, headwear: 'bun', scale: 0.6, skirt: true });
      for (const m of rig.flashMats) {
        m.emissive.setHex(0x4aa0ff);
        m.emissiveIntensity = 0.5;
        m.transparent = true;
        m.opacity = 0.8;
      }
      break;
    case 'farmer':
      rig = buildHumanoid({ skin: 0xd9a77a, cloth: 0x6a7a4a, cloth2: 0xd9cfbf, accent: 0x8a6a3a, hair: 0x2a1a1a, headwear: 'kasa', bulk: 1.1 });
      base = { ...POSES.idleNpc, torso: [0.18, 0, 0] };
      break;
    case 'child':
      rig = buildHumanoid({ skin: 0xf2d0b0, cloth: 0xc8503a, cloth2: 0xf2e8d2, accent: 0x3a6aa8, hair: 0x1a1622, headwear: 'topknot', scale: 0.65 });
      break;
    case 'fisher':
      rig = buildHumanoid({ skin: 0xc99a78, cloth: 0x3a5a7a, cloth2: 0xc8c0b0, accent: 0x6a6a5a, hair: 0xb8b8b8, headwear: 'hair', scale: 0.95 });
      base = { ...POSES.idleNpc, torso: [0.2, 0, 0], armR: [-0.5, 0, -0.1], foreR: [-0.6, 0, 0] };
      {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 2.2, 5), toon(0x8a6a3a));
        rod.position.y = -0.2;
        rod.rotation.x = -0.6;
        rig.handR.add(rod);
      }
      break;
    default:
      rig = buildHumanoid({ skin: 0xe8c4a0, cloth: 0x7a6a5a, cloth2: 0xd9cfbf, accent: 0x8a4a3a, hair: 0x2a1a1a, headwear: 'hair' });
  }
  const m = humanoidModel(rig, base);
  if (id === 'hotaru') {
    const inner = m.animate;
    m.animate = (s, dt) => {
      inner(s, dt);
      rig.root.position.y = 0.15 + Math.sin(s.t * 2) * 0.08;
    };
  }
  return m;
}

// ------------------------------------------------------------------ Foxes

export function buildFox(opts: { body: number; tip: number; eyes: number; tails: number; scale?: number; ribbon?: number }): Model {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const furMat = toonUnique(opts.body);
  const tipMat = toon(opts.tip);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), furMat);
  torso.scale.set(0.85, 0.8, 1.5);
  torso.position.y = 0.55;
  body.add(torso);
  const headG = new THREE.Group();
  headG.position.set(0, 0.78, 0.45);
  body.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), furMat);
  head.scale.set(1, 0.9, 1);
  headG.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), furMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.04, 0.22);
  headG.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(0x15101a));
  nose.position.set(0, -0.03, 0.35);
  headG.add(nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), furMat);
    ear.position.set(side * 0.11, 0.2, -0.02);
    ear.rotation.z = -side * 0.2;
    headG.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(opts.eyes, { emissive: opts.eyes, emissiveIntensity: 1.5 }));
    eye.position.set(side * 0.08, 0.04, 0.16);
    eye.scale.set(1.2, 0.6, 0.6);
    eye.userData.noOutline = true;
    headG.add(eye);
  }
  if (opts.ribbon) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), toon(opts.ribbon));
    rib.position.set(0, 0.68, 0.32);
    rib.rotation.x = 1.2;
    body.add(rib);
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [-0.15, 0.3],
    [0.15, 0.3],
    [-0.15, -0.3],
    [0.15, -0.3],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.5, z);
    const geo = new THREE.CylinderGeometry(0.05, 0.04, 0.5, 6);
    geo.translate(0, -0.25, 0);
    leg.add(new THREE.Mesh(geo, furMat));
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), tipMat);
    paw.position.y = -0.5;
    leg.add(paw);
    body.add(leg);
    legs.push(leg);
  }
  const tails: THREE.Group[] = [];
  for (let i = 0; i < opts.tails; i++) {
    const tail = new THREE.Group();
    tail.position.set(0, 0.62, -0.4);
    const geo = new THREE.ConeGeometry(0.13, 0.75, 8);
    geo.translate(0, 0.37, 0);
    const t = new THREE.Mesh(geo, furMat);
    tail.add(t);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), tipMat);
    tip.position.y = 0.72;
    tail.add(tip);
    tail.rotation.x = -0.9;
    tail.rotation.z = (i - (opts.tails - 1) / 2) * 0.45;
    body.add(tail);
    tails.push(tail);
  }
  addOutlines(root, 0.03);
  root.scale.setScalar(opts.scale ?? 1);
  let phase = 0;
  return {
    root,
    flashMats: [furMat],
    height: 1.0 * (opts.scale ?? 1),
    animate(s, dt) {
      phase += dt * (4 + s.speed * 2.2);
      const moving = s.mode === 'move' ? Math.min(1, s.speed / 3) : 0;
      legs[0].rotation.x = Math.sin(phase) * 0.8 * moving;
      legs[3].rotation.x = Math.sin(phase) * 0.8 * moving;
      legs[1].rotation.x = -Math.sin(phase) * 0.8 * moving;
      legs[2].rotation.x = -Math.sin(phase) * 0.8 * moving;
      tails.forEach((t, i) => (t.rotation.y = Math.sin(s.t * 3 + i) * 0.35));
      let crouch = 0;
      let stretch = 0;
      if (s.mode === 'windup') crouch = 1;
      if (s.mode === 'active') stretch = 1;
      body.position.y += ((-0.18 * crouch + (s.mode === 'move' ? Math.abs(Math.sin(phase)) * 0.06 : 0)) - body.position.y) * Math.min(1, dt * 12);
      body.rotation.x += ((crouch * 0.15 - stretch * 0.25) - body.rotation.x) * Math.min(1, dt * 12);
      headG.rotation.x = s.mode === 'windup' ? 0.25 : s.mode === 'idle' ? Math.sin(s.t) * 0.1 : 0;
      const tilt = s.mode === 'dead' ? Math.PI / 2 : 0;
      body.rotation.z += (tilt - body.rotation.z) * Math.min(1, dt * 6);
    },
  };
}

// ------------------------------------------------------------------ Wisp

export function buildWisp(): Model {
  const root = new THREE.Group();
  const coreMat = toonUnique(0xffb050, { emissive: 0xff7a1a, emissiveIntensity: 1.6 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), coreMat);
  core.position.y = 1.5;
  root.add(core);
  const flameMat = basic(0xff8a2a, { transparent: true, opacity: 0.55, additive: true });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10, 1, true), flameMat);
  flame.position.y = 1.95;
  root.add(flame);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), basic(0xffa040, { transparent: true, opacity: 0.18, additive: true }));
  halo.position.y = 1.5;
  root.add(halo);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), toon(0x2a0a00));
    eye.position.set(side * 0.1, 1.55, 0.28);
    eye.scale.set(0.8, 1.4, 0.5);
    root.add(eye);
  }
  return {
    root,
    flashMats: [coreMat],
    height: 1.9,
    glow: [halo],
    animate(s, dt) {
      const bob = Math.sin(s.t * 3) * 0.12;
      core.position.y = 1.5 + bob;
      halo.position.y = 1.5 + bob;
      flame.position.y = 1.95 + bob;
      flame.scale.set(1 + Math.sin(s.t * 13) * 0.1, 1 + Math.sin(s.t * 9) * 0.2, 1);
      const swell = s.mode === 'windup' ? 1 + s.progress * 0.4 : 1;
      core.scale.setScalar(swell);
      halo.scale.setScalar(swell * (1 + Math.sin(s.t * 7) * 0.05));
      if (s.mode === 'dead') root.scale.setScalar(Math.max(0.01, 1 - s.progress * 2));
      void dt;
    },
  };
}

// ------------------------------------------------------------------ Spiders

export function buildSpider(opts: { body: number; mark: number; scale: number; widow?: boolean }): Model {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  const shellMat = toonUnique(opts.body);
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), shellMat);
  abdomen.scale.set(1, 0.85, 1.25);
  abdomen.position.set(0, 0.15, -0.55);
  body.add(abdomen);
  const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), toon(opts.mark, { emissive: opts.mark, emissiveIntensity: 1.2 }));
  mark.position.set(0, 0.55, -0.6);
  mark.scale.set(1, 0.4, 1.4);
  body.add(mark);
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), shellMat);
  thorax.position.set(0, 0.05, 0.05);
  body.add(thorax);
  const eyeMat = toon(0xff3a5a, { emissive: 0xff2a4a, emissiveIntensity: 2 });
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
    e.position.set((i - 1.5) * 0.07, 0.12 + (i % 2) * 0.05, 0.32);
    e.userData.noOutline = true;
    body.add(e);
  }
  const legs: { hip: THREE.Group; knee: THREE.Group; side: number; idx: number }[] = [];
  const legMat = toon(opts.body === 0x2a1d33 ? 0x1a1222 : opts.body);
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const idx = i % 4;
    const hip = new THREE.Group();
    hip.position.set(side * 0.22, 0.05, 0.25 - idx * 0.17);
    hip.rotation.y = side * (Math.PI / 2) + (idx - 1.5) * 0.45 * -side;
    body.add(hip);
    const upperGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.6, 5);
    upperGeo.translate(0, 0.3, 0);
    const upper = new THREE.Mesh(upperGeo, legMat);
    upper.rotation.x = 0.9; // up and out
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(0, Math.cos(0.9) * 0.6, Math.sin(0.9) * 0.6);
    hip.add(knee);
    const lowerGeo = new THREE.CylinderGeometry(0.035, 0.015, 0.85, 5);
    lowerGeo.translate(0, -0.42, 0);
    const lower = new THREE.Mesh(lowerGeo, legMat);
    lower.rotation.x = -0.35;
    knee.add(lower);
    legs.push({ hip, knee, side, idx });
  }
  let torsoArms: THREE.Group[] = [];
  const flashMats = [shellMat];
  if (opts.widow) {
    // Humanoid upper body with a mask, rising from the thorax.
    const upper = new THREE.Group();
    upper.position.set(0, 0.2, 0.2);
    body.add(upper);
    const skinMat = toonUnique(0xd9d0e0);
    flashMats.push(skinMat);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 10), skinMat);
    t.position.y = 0.3;
    upper.add(t);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), toon(0xf4f0ea));
    head.position.y = 0.75;
    upper.add(head);
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10, 1, true), toon(0x150d1c, { side: THREE.DoubleSide }));
    hair.position.set(0, 0.5, -0.05);
    upper.add(hair);
    const slitMat = toon(0xff2a4a, { emissive: 0xff2a4a, emissiveIntensity: 2 });
    for (const sd of [-1, 1]) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), slitMat);
      sl.position.set(sd * 0.06, 0.78, 0.16);
      upper.add(sl);
      const arm = new THREE.Group();
      arm.position.set(sd * 0.2, 0.55, 0);
      const ag = new THREE.CylinderGeometry(0.04, 0.03, 0.6, 6);
      ag.translate(0, -0.3, 0);
      arm.add(new THREE.Mesh(ag, skinMat));
      arm.rotation.z = sd * 0.5;
      upper.add(arm);
      torsoArms.push(arm);
    }
  }
  addOutlines(root, 0.03);
  root.scale.setScalar(opts.scale);
  let phase = 0;
  return {
    root,
    flashMats,
    height: (opts.widow ? 2.0 : 0.9) * opts.scale,
    animate(s, dt) {
      phase += dt * (5 + s.speed * 3);
      const moving = s.mode === 'move' ? 1 : 0.15;
      for (const l of legs) {
        const p = phase + l.idx * 1.6 + (l.side > 0 ? Math.PI : 0);
        l.hip.rotation.x = Math.sin(p) * 0.25 * moving;
        l.knee.rotation.x = Math.max(0, Math.cos(p)) * 0.3 * moving;
      }
      // Rear up during wind-ups, front legs raised.
      const rear = s.mode === 'windup' ? 0.35 : s.mode === 'active' ? -0.15 : 0;
      body.rotation.x += (-rear - body.rotation.x) * Math.min(1, dt * 10);
      for (const l of legs) {
        if (l.idx === 0 && s.mode === 'windup') l.knee.rotation.x = -0.8;
      }
      for (const a of torsoArms) a.rotation.x = s.mode === 'windup' ? -2.4 : s.mode === 'active' ? -0.6 : -0.2 + Math.sin(s.t * 2) * 0.1;
      body.position.y = 0.55 + (s.mode === 'move' ? Math.abs(Math.sin(phase * 2)) * 0.04 : 0);
      if (s.mode === 'dead') {
        body.rotation.z += (Math.PI - body.rotation.z) * Math.min(1, dt * 4);
        body.position.y = 0.55 + 0.4 * Math.min(1, s.progress * 2);
      }
    },
  };
}

// ------------------------------------------------------------------ Yomikage

export function buildYomikage(): Model {
  const root = new THREE.Group();
  const float = new THREE.Group();
  float.position.y = 1.6;
  root.add(float);
  const robeMat = toonUnique(0x241a36, { side: THREE.DoubleSide });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 14, 3, true), robeMat);
  robe.position.y = -0.3;
  float.add(robe);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.3, 14, 1, true), basic(0x0a0610, { side: THREE.BackSide }));
  inner.position.y = -0.32;
  float.add(inner);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 16), toon(0xb03a3a));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.1;
  float.add(sash);
  // Mask with a painted face (canvas texture).
  const maskTex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1a1020';
    ctx.beginPath();
    ctx.ellipse(80, 110, 30, 12, -0.25, 0, Math.PI * 2);
    ctx.ellipse(176, 110, 30, 12, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b02a2a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(60, 70);
    ctx.quadraticCurveTo(80, 55, 105, 72);
    ctx.moveTo(151, 72);
    ctx.quadraticCurveTo(176, 55, 196, 70);
    ctx.stroke();
    ctx.fillStyle = '#b02a2a';
    ctx.beginPath();
    ctx.moveTo(98, 180);
    ctx.quadraticCurveTo(128, 205, 158, 180);
    ctx.quadraticCurveTo(128, 192, 98, 180);
    ctx.fill();
    ctx.strokeStyle = '#1a1020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 130);
    ctx.lineTo(120, 160);
    ctx.lineTo(132, 160);
    ctx.stroke();
  });
  const maskMat = new THREE.MeshToonMaterial({ map: maskTex, emissive: 0x000000 });
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16, 0, Math.PI, 0, Math.PI), maskMat);
  mask.scale.set(1, 1.25, 0.55);
  mask.position.set(0, 1.25, 0.1);
  float.add(mask);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), robeMat);
  hood.position.set(0, 1.3, -0.05);
  hood.rotation.x = -0.35;
  float.add(hood);
  const handMat = toonUnique(0xe8e0f0, { emissive: 0x6a3aa8, emissiveIntensity: 0.6 });
  const hands: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), handMat);
    palm.scale.set(1, 0.6, 1.2);
    h.add(palm);
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.38, 5), handMat);
      fg.rotation.x = Math.PI / 2;
      fg.position.set((f - 1.5) * 0.09, 0, 0.32);
      h.add(fg);
    }
    h.position.set(side * 1.4, 0.4, 0.4);
    float.add(h);
    hands.push(h);
  }
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), basic(0x6a2ab0, { transparent: true, opacity: 0.12, additive: true }));
  aura.position.y = 0.3;
  float.add(aura);
  addOutlines(root, 0.03);
  root.scale.setScalar(1.6);
  return {
    root,
    flashMats: [robeMat, handMat],
    height: 3.2 * 1.6,
    glow: [aura],
    animate(s, dt) {
      float.position.y = 1.6 + Math.sin(s.t * 1.5) * 0.15;
      robe.rotation.y = Math.sin(s.t * 0.8) * 0.1;
      const raise = s.mode === 'windup' ? 1 : 0;
      const strike = s.mode === 'active' ? 1 : 0;
      hands.forEach((h, i) => {
        const side = i === 0 ? -1 : 1;
        const ty = 0.4 + raise * 1.2 - strike * 0.5 + Math.sin(s.t * 2 + i) * 0.1;
        const tz = 0.4 + strike * 1.4;
        const tx = side * (1.4 - strike * 0.5);
        h.position.x += (tx - h.position.x) * Math.min(1, dt * 10);
        h.position.y += (ty - h.position.y) * Math.min(1, dt * 10);
        h.position.z += (tz - h.position.z) * Math.min(1, dt * 10);
      });
      maskMat.emissive.setHex(s.mode === 'windup' ? 0x6a2a2a : 0x000000);
      aura.scale.setScalar(1 + Math.sin(s.t * 3) * 0.05 + raise * 0.2);
      if (s.mode === 'dead') {
        float.position.y = 1.6 + s.progress * 2;
        root.scale.setScalar(1.6 * Math.max(0.05, 1 - s.progress));
      }
    },
  };
}

// ------------------------------------------------------------------ Dummy

export function buildDummy(): Model {
  const root = new THREE.Group();
  const wob = new THREE.Group();
  root.add(wob);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 6), toon(0x5a3a26));
  post.position.y = 0.85;
  wob.add(post);
  const strawMat = toonUnique(0xd8bf72);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.8, 10), strawMat);
  body.position.y = 1.1;
  wob.add(body);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), toon(0x5a3a26));
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.35;
  wob.add(bar);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon(0xe8dcb8));
  head.position.y = 1.72;
  wob.add(head);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 12), toon(0xd8452f));
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.78;
  wob.add(band);
  addOutlines(root, 0.03);
  let wobble = 0;
  return {
    root,
    flashMats: [strawMat],
    height: 1.9,
    animate(s, dt) {
      if (s.mode === 'hit' || s.mode === 'stagger') wobble = 0.4;
      wobble *= Math.exp(-dt * 4);
      wob.rotation.x = Math.sin(s.t * 18) * wobble;
      if (s.mode === 'dead') {
        wob.rotation.x += (-Math.PI / 2 - wob.rotation.x) * Math.min(1, dt * 5);
      }
    },
  };
}

// ------------------------------------------------------------------ Enemy factory

export function buildEnemyModel(model: string): Model {
  switch (model) {
    case 'dummy':
      return buildDummy();
    case 'imp': {
      const rig = buildHumanoid({ skin: 0x6d6670, cloth: 0x3a3138, cloth2: 0x2a2228, accent: 0xb85a2a, hair: 0x2a2228, headwear: 'horns', eyes: 0xff7a2a, eyeGlow: true, bulk: 1.1, scale: 0.85 });
      for (const hand of [rig.handR, rig.handL]) {
        for (let i = 0; i < 3; i++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14, 4), toon(0xe9dcc0));
          claw.position.set((i - 1) * 0.04, -0.08, 0.02);
          claw.rotation.x = Math.PI;
          hand.add(claw);
        }
      }
      return humanoidModel(rig, { armR: [-0.4, 0, -0.3], foreR: [-0.7, 0, 0], armL: [-0.4, 0, 0.3], foreL: [-0.7, 0, 0] }, { hunch: 0.35, strideScale: 1.3 });
    }
    case 'lurker': {
      const rig = buildHumanoid({ skin: 0x5b7a4a, cloth: 0x3f5a35, cloth2: 0x2e4228, accent: 0x6b5a3a, headwear: 'none', eyes: 0xf0e04a, eyeGlow: true, bulk: 1.35, scale: 1.1 });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x6b5a3a));
      shell.rotation.x = -Math.PI / 2;
      shell.position.set(0, 0.35, -0.2);
      rig.parts.torso.add(shell);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 10), toon(0xb8c8a8));
      plate.position.y = 0.37;
      rig.parts.head.add(plate);
      return humanoidModel(rig, { armR: [-0.2, 0, -0.4], armL: [-0.2, 0, 0.4] }, { hunch: 0.55 });
    }
    case 'sentinel': {
      const rig = buildHumanoid({ skin: 0x8a8f96, cloth: 0x6f747c, cloth2: 0x5a5f66, accent: 0x4a7a4a, headwear: 'none', eyes: 0x6fe8ff, eyeGlow: true, bulk: 1.4, scale: 1.35, stone: true });
      const hammer = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), toon(0x5a5f66));
      handle.position.y = -0.4;
      hammer.add(handle);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.6), toon(0x7a7f86));
      head.position.y = -0.95;
      hammer.add(head);
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.3), toon(0x6fe8ff, { emissive: 0x3fb8ff, emissiveIntensity: 1.5 }));
      rune.position.y = -0.95;
      hammer.add(rune);
      rig.handR.add(hammer);
      const moss = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.44), toon(0x4a7a4a));
      moss.position.y = 0.64;
      rig.parts.torso.add(moss);
      return humanoidModel(rig, POSES.idleHeavy, { strideScale: 0.8 });
    }
    case 'acolyte': {
      const rig = buildHumanoid({ skin: 0x9a8aa8, cloth: 0x2a1f3a, cloth2: 0x4b2f5c, accent: 0xb03a3a, headwear: 'mask', maskColor: 0xf2ede2, skirt: true });
      for (const hand of [rig.handR, rig.handL]) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xc07aff, { emissive: 0x8a3aff, emissiveIntensity: 2 }));
        orb.position.y = -0.12;
        orb.userData.noOutline = true;
        hand.add(orb);
      }
      const m = humanoidModel(rig, { armR: [-0.5, 0, -0.3], foreR: [-0.6, 0, 0], armL: [-0.5, 0, 0.3], foreL: [-0.6, 0, 0] });
      const inner = m.animate;
      m.animate = (s, dt) => {
        inner({ ...s, pose: s.pose ?? 'cast' }, dt);
        if (s.mode === 'windup') applyPose(rig, POSES.cast, dt, 10);
      };
      return m;
    }
    case 'fox':
      return buildFox({ body: 0x2a2236, tip: 0x6a3a8a, eyes: 0xff4ad8, tails: 1, scale: 1.05 });
    case 'spiderling':
      return buildSpider({ body: 0x3a2a4a, mark: 0xc04aff, scale: 0.55 });
    case 'wisp':
      return buildWisp();
    case 'oni': {
      const rig = buildHumanoid({ skin: 0xa8322a, cloth: 0x2a2a2a, cloth2: 0xd9a54a, accent: 0x1a1a1a, hair: 0xe8e2d0, headwear: 'horns', eyes: 0xffe04a, eyeGlow: true, bulk: 1.5, scale: 2.1 });
      const club = buildWeapon('kanabo', 0);
      club.group.scale.setScalar(1.6);
      rig.handR.add(club.group);
      // Wild mane
      const mane = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), toon(0xe8e2d0));
      mane.position.set(0, 0.2, -0.06);
      rig.parts.head.add(mane);
      // Tusks
      for (const sd of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), toon(0xffffff));
        tusk.position.set(sd * 0.06, 0.08, 0.17);
        rig.parts.head.add(tusk);
      }
      return humanoidModel(rig, POSES.idleHeavy, { strideScale: 0.7 });
    }
    case 'widow':
      return buildSpider({ body: 0x2a1d33, mark: 0xff2a4a, scale: 1.9, widow: true });
    case 'yomikage':
      return buildYomikage();
    default: {
      const rig = buildHumanoid({ skin: 0x888888, cloth: 0x444444 });
      return humanoidModel(rig, POSES.idle);
    }
  }
}

export function buildKohaku(): Model {
  return buildFox({ body: 0xf4f0ea, tip: 0xf0b040, eyes: 0xffa020, tails: 3, scale: 0.85, ribbon: 0xd8452f });
}

