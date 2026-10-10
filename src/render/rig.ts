// Procedural humanoid rig built from primitives, with pose blending and a
// procedural locomotion cycle. Characters face +Z; their right side is -X.

import * as THREE from 'three';
import { damp } from '../core/math';
import { addOutlines, toon, toonUnique } from './toon';

export type PartName = 'torso' | 'head' | 'armR' | 'foreR' | 'armL' | 'foreL' | 'legR' | 'shinR' | 'legL' | 'shinL';
export const PART_NAMES: PartName[] = ['torso', 'head', 'armR', 'foreR', 'armL', 'foreL', 'legR', 'shinR', 'legL', 'shinL'];
export type Pose = Partial<Record<PartName, [number, number, number]>>;

export interface Rig {
  root: THREE.Group;
  /** Pivot at mid-body used for rolls, falls and leans. */
  spinner: THREE.Group;
  hips: THREE.Group;
  parts: Record<PartName, THREE.Group>;
  handR: THREE.Group;
  handL: THREE.Group;
  headTop: THREE.Group;
  height: number;
  flashMats: THREE.MeshToonMaterial[];
  current: Record<PartName, THREE.Vector3>;
}

export interface HumanoidOpts {
  skin: number;
  cloth: number;
  cloth2?: number;
  accent?: number;
  hair?: number;
  scale?: number;
  bulk?: number;
  headwear?: 'kasa' | 'horns' | 'hood' | 'mask' | 'bun' | 'hair' | 'topknot' | 'none';
  maskColor?: number;
  skirt?: boolean;
  eyes?: number;
  eyeGlow?: boolean;
  outline?: boolean;
  stone?: boolean;
}

function limb(len: number, r0: number, r1: number, mat: THREE.Material, stone = false): THREE.Mesh {
  const g = stone ? new THREE.BoxGeometry(r0 * 2, len, r0 * 2) : new THREE.CylinderGeometry(r0, r1, len, 8);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, mat);
}

export function buildHumanoid(o: HumanoidOpts): Rig {
  const s = o.scale ?? 1;
  const b = o.bulk ?? 1;
  const skin = toonUnique(o.skin);
  const cloth = toonUnique(o.cloth);
  const cloth2 = toonUnique(o.cloth2 ?? o.cloth);
  const accent = toon(o.accent ?? 0xc9a24a);
  const flashMats = [skin, cloth, cloth2];

  const root = new THREE.Group();
  const spinner = new THREE.Group();
  spinner.position.y = 0.55;
  root.add(spinner);
  const hips = new THREE.Group();
  hips.position.y = 0.4;
  spinner.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  // Torso: tapered body + sash.
  const chestGeo = o.stone ? new THREE.BoxGeometry(0.62 * b, 0.62, 0.4 * b) : new THREE.CylinderGeometry(0.27 * b, 0.21 * b, 0.62, 10);
  chestGeo.translate(0, 0.31, 0);
  const chest = new THREE.Mesh(chestGeo, cloth);
  torso.add(chest);
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.225 * b, 0.225 * b, 0.09, 10), accent);
  sash.position.y = 0.08;
  torso.add(sash);
  // Collar / lapel stripe
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16 * b, 0.035, 6, 12), cloth2);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.6;
  torso.add(collar);

  if (o.skirt) {
    const skirtGeo = new THREE.CylinderGeometry(0.22 * b, 0.36 * b, 0.55, 10, 1, true);
    skirtGeo.translate(0, -0.25, 0);
    const skirt = new THREE.Mesh(skirtGeo, cloth2);
    skirt.material = cloth2;
    hips.add(skirt);
    (cloth2 as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  }

  // Head
  const head = new THREE.Group();
  head.position.y = 0.7;
  torso.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6), skin);
  neck.position.y = -0.02;
  head.add(neck);
  const skull = new THREE.Mesh(o.stone ? new THREE.BoxGeometry(0.34, 0.34, 0.34) : new THREE.SphereGeometry(0.19, 14, 12), skin);
  skull.position.y = 0.17;
  head.add(skull);
  const eyeMat = o.eyeGlow ? toon(o.eyes ?? 0xffd36b, { emissive: o.eyes ?? 0xffd36b, emissiveIntensity: 2 }) : toon(o.eyes ?? 0x1a1420);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
    eye.position.set(side * 0.07, 0.19, 0.17);
    eye.scale.set(1, o.eyeGlow ? 0.6 : 1.3, 0.6);
    eye.userData.noOutline = true;
    head.add(eye);
  }
  const headTop = new THREE.Group();
  headTop.position.y = 0.36;
  head.add(headTop);

  const hairMat = toon(o.hair ?? 0x1d1a22);
  switch (o.headwear) {
    case 'kasa': {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.2, 14), toon(0xc8a46a));
      hat.position.y = 0.33;
      head.add(hat);
      break;
    }
    case 'horns': {
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), toon(0xe9dcc0));
        horn.position.set(side * 0.11, 0.36, 0.02);
        horn.rotation.z = -side * 0.35;
        head.add(horn);
      }
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      hair.position.y = 0.2;
      head.add(hair);
      break;
    }
    case 'hood': {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth2);
      hood.position.y = 0.17;
      hood.rotation.x = -0.25;
      head.add(hood);
      break;
    }
    case 'mask': {
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, -Math.PI / 2, Math.PI, 0, Math.PI), toon(o.maskColor ?? 0xf2ede2));
      mask.position.set(0, 0.17, 0.02);
      mask.scale.set(1, 1.15, 1);
      head.add(mask);
      const slitMat = toon(0x120c16);
      for (const side of [-1, 1]) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), slitMat);
        slit.position.set(side * 0.07, 0.2, 0.215);
        slit.rotation.z = side * 0.25;
        slit.userData.noOutline = true;
        head.add(slit);
      }
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth2);
      hood.position.y = 0.16;
      hood.rotation.x = -0.4;
      head.add(hood);
      break;
    }
    case 'bun': {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      hair.position.y = 0.18;
      hair.rotation.x = -0.2;
      head.add(hair);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hairMat);
      bun.position.set(0, 0.36, -0.08);
      head.add(bun);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), accent);
      pin.position.set(0, 0.38, -0.08);
      pin.rotation.z = 1.2;
      head.add(pin);
      break;
    }
    case 'topknot': {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      hair.position.y = 0.18;
      head.add(hair);
      const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), hairMat);
      knot.position.set(0, 0.38, -0.05);
      knot.rotation.x = -0.6;
      head.add(knot);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 16), accent);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.23;
      head.add(band);
      break;
    }
    case 'hair': {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
      hair.position.y = 0.18;
      hair.rotation.x = -0.3;
      head.add(hair);
      break;
    }
    default:
      break;
  }

  // Arms
  const mkArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.3 * b, 0.56, 0);
    arm.rotation.order = 'YXZ';
    torso.add(arm);
    const upper = limb(0.32, 0.075 * b, 0.065 * b, cloth, o.stone);
    arm.add(upper);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * b, 0.14 * b, 0.2, 8, 1, true), cloth2);
    sleeve.position.y = -0.25;
    sleeve.userData.noOutline = true;
    arm.add(sleeve);
    const fore = new THREE.Group();
    fore.position.y = -0.32;
    fore.rotation.order = 'YXZ';
    arm.add(fore);
    fore.add(limb(0.28, 0.06 * b, 0.05 * b, skin, o.stone));
    const hand = new THREE.Group();
    hand.position.y = -0.3;
    fore.add(hand);
    const fist = new THREE.Mesh(o.stone ? new THREE.BoxGeometry(0.14, 0.14, 0.14) : new THREE.SphereGeometry(0.065 * b, 8, 6), skin);
    hand.add(fist);
    return { arm, fore, hand };
  };
  const R = mkArm(-1);
  const L = mkArm(1);

  // Legs
  const mkLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.12 * b, 0, 0);
    hips.add(leg);
    leg.add(limb(0.42, 0.095 * b, 0.08 * b, cloth2, o.stone));
    const shin = new THREE.Group();
    shin.position.y = -0.42;
    leg.add(shin);
    shin.add(limb(0.42, 0.075 * b, 0.06 * b, o.stone ? cloth : skin, o.stone));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12 * b, 0.07, 0.22), toon(0x2b2430));
    foot.position.set(0, -0.44, 0.04);
    shin.add(foot);
    return { leg, shin };
  };
  const LR = mkLeg(-1);
  const LL = mkLeg(1);

  const parts: Record<PartName, THREE.Group> = {
    torso,
    head,
    armR: R.arm,
    foreR: R.fore,
    armL: L.arm,
    foreL: L.fore,
    legR: LR.leg,
    shinR: LR.shin,
    legL: LL.leg,
    shinL: LL.shin,
  };
  torso.rotation.order = 'YXZ';
  root.scale.setScalar(s);
  if (o.outline !== false) addOutlines(root, 0.035);

  const current = {} as Record<PartName, THREE.Vector3>;
  for (const p of PART_NAMES) current[p] = new THREE.Vector3();
  return { root, spinner, hips, parts, handR: R.hand, handL: L.hand, headTop, height: 1.85 * s, flashMats, current };
}

/** Blend the rig toward a target pose. `rate` is the exponential blend speed. */
export function applyPose(rig: Rig, pose: Pose, dt: number, rate = 18): void {
  const k = damp(rate, dt);
  for (const p of PART_NAMES) {
    const t = pose[p];
    const c = rig.current[p];
    const tx = t ? t[0] : 0;
    const ty = t ? t[1] : 0;
    const tz = t ? t[2] : 0;
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    c.z += (tz - c.z) * k;
    rig.parts[p].rotation.set(c.x, c.y, c.z);
  }
}

/** Snap the rig to a pose immediately. */
export function setPose(rig: Rig, pose: Pose): void {
  applyPose(rig, pose, 1, 1e6);
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const p of PART_NAMES) {
    const x = a[p] ?? [0, 0, 0];
    const y = b[p] ?? [0, 0, 0];
    out[p] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out;
}

export function addPose(a: Pose, b: Pose): Pose {
  const out: Pose = { ...a };
  for (const p of PART_NAMES) {
    const y = b[p];
    if (!y) continue;
    const x = a[p] ?? [0, 0, 0];
    out[p] = [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
  }
  return out;
}

// --------------------------------------------------------------------- Poses

export const POSES: Record<string, Pose> = {
  idle: { armR: [-0.35, 0, -0.12], foreR: [-0.9, 0, 0], armL: [0.05, 0, 0.18], foreL: [-0.3, 0, 0] },
  idleBow: { armR: [0.05, 0, -0.15], foreR: [-0.3, 0, 0], armL: [-0.5, 0, 0.15], foreL: [-0.6, 0, 0] },
  idleTwin: { armR: [-0.4, 0, -0.2], foreR: [-1.0, 0, 0], armL: [-0.4, 0, 0.2], foreL: [-1.0, 0, 0] },
  idleHeavy: { armR: [-0.7, -0.3, -0.2], foreR: [-1.3, 0, 0], armL: [-0.6, 0.4, 0.2], foreL: [-1.2, 0, 0], torso: [0.1, 0, 0] },
  idleNpc: { armR: [0.05, 0, -0.08], foreR: [-0.2, 0, 0], armL: [0.05, 0, 0.08], foreL: [-0.2, 0, 0] },
  armsCrossed: { armR: [-0.5, 0.5, -0.1], foreR: [-1.7, 0, 0], armL: [-0.5, -0.5, 0.1], foreL: [-1.7, 0, 0] },
  slashR_wind: { torso: [0, -0.6, 0], armR: [-1.45, -1.5, 0], foreR: [-0.1, 0, 0], armL: [0.1, 0, 0.4] },
  slashR_hit: { torso: [0.1, 0.55, 0], armR: [-1.45, 1.3, 0], foreR: [0, 0, 0], armL: [0.1, 0, 0.5] },
  slashL_wind: { torso: [0, 0.55, 0], armR: [-1.45, 1.3, 0], foreR: [-0.1, 0, 0], armL: [0.1, 0, 0.4] },
  slashL_hit: { torso: [0.1, -0.6, 0], armR: [-1.45, -1.5, 0], foreR: [0, 0, 0], armL: [0.1, 0, 0.5] },
  slashUp_wind: { torso: [0.15, -0.5, 0], armR: [-0.3, -0.9, 0], foreR: [0, 0, 0] },
  slashUp_hit: { torso: [-0.15, 0.5, 0], armR: [-2.6, 0.7, 0], foreR: [0, 0, 0] },
  overhead_wind: { torso: [-0.3, 0, 0], armR: [-2.9, 0, 0], foreR: [-0.4, 0, 0], armL: [-2.7, 0, 0], foreL: [-0.4, 0, 0] },
  overhead_hit: { torso: [0.45, 0, 0], armR: [-1.0, 0, 0], foreR: [0, 0, 0], armL: [-1.0, 0, 0], foreL: [0, 0, 0] },
  thrust_wind: { torso: [0, -0.5, 0], armR: [-1.1, -0.4, 0], foreR: [-1.4, 0, 0], legR: [0.3, 0, 0], legL: [-0.3, 0, 0] },
  thrust_hit: { torso: [0.25, 0.15, 0], armR: [-1.6, 0, 0], foreR: [0, 0, 0], legR: [0.5, 0, 0], legL: [-0.6, 0, 0], shinR: [0.4, 0, 0] },
  spin_wind: { torso: [0.1, -0.7, 0], armR: [-1.5, -1.4, 0], foreR: [0, 0, 0], armL: [-1.2, 1.2, 0] },
  spin_hit: { torso: [0.1, 0.7, 0], armR: [-1.5, -1.5, 0], foreR: [0, 0, 0], armL: [-1.2, 1.3, 0] },
  stabTwin_wind: { torso: [-0.1, 0, 0], armR: [-0.7, -0.3, 0], foreR: [-1.6, 0, 0], armL: [-0.7, 0.3, 0], foreL: [-1.6, 0, 0] },
  stabTwin_hit: { torso: [0.3, 0, 0], armR: [-1.6, 0.15, 0], foreR: [0, 0, 0], armL: [-1.6, -0.15, 0], foreL: [0, 0, 0] },
  shoot_wind: { torso: [0, -0.9, 0], armL: [-1.55, 0.9, 0], foreL: [0, 0, 0], armR: [-1.5, 0.6, 0], foreR: [-2.2, 0, 0] },
  shoot_hit: { torso: [0, -0.9, 0], armL: [-1.55, 0.9, 0], foreL: [0, 0, 0], armR: [-1.4, 0.2, 0], foreR: [-0.6, 0, 0] },
  chargeShot_wind: { torso: [0.05, -1.0, 0], armL: [-1.55, 1.0, 0], foreL: [0, 0, 0], armR: [-1.5, 0.8, 0], foreR: [-2.5, 0, 0] },
  chargeShot_hit: { torso: [0, -0.9, 0], armL: [-1.55, 0.9, 0], foreL: [0, 0, 0], armR: [-1.3, 0, 0], foreR: [-0.4, 0, 0] },
  roll: { torso: [0.6, 0, 0], head: [0.4, 0, 0], armR: [-1.2, 0, 0], foreR: [-1.8, 0, 0], armL: [-1.2, 0, 0], foreL: [-1.8, 0, 0], legR: [-1.6, 0, 0], shinR: [2.2, 0, 0], legL: [-1.6, 0, 0], shinL: [2.2, 0, 0] },
  hit: { torso: [-0.35, 0, 0.1], head: [-0.3, 0, 0], armR: [-0.6, 0, -0.5], armL: [-0.4, 0, 0.6] },
  heal: { armR: [-2.0, 0.4, 0], foreR: [-1.9, 0, 0], head: [-0.2, 0, 0] },
  cast: { torso: [-0.2, 0, 0], armR: [-2.6, -0.3, 0], foreR: [-0.3, 0, 0], armL: [-2.6, 0.3, 0], foreL: [-0.3, 0, 0] },
  talk: { armR: [-0.6, 0.3, -0.2], foreR: [-0.9, 0, 0], armL: [0.05, 0, 0.1] },
  bow: { torso: [0.5, 0, 0], head: [0.3, 0, 0], armR: [0.2, 0, 0], armL: [0.2, 0, 0] },
  dead: { torso: [-0.2, 0, 0], armR: [-2.8, 0, -0.6], armL: [-2.8, 0, 0.6], legR: [-0.2, 0, 0], legL: [0.2, 0, 0] },
  // Enemy attack poses (claws / big weapons)
  claw_wind: { torso: [-0.2, -0.4, 0], armR: [-2.4, -0.6, 0], foreR: [-0.5, 0, 0], armL: [-0.8, 0.4, 0] },
  claw_hit: { torso: [0.4, 0.4, 0], armR: [-0.9, 0.6, 0], foreR: [0, 0, 0], armL: [-0.4, 0, 0] },
  smash_wind: { torso: [-0.35, 0, 0], armR: [-3.0, 0, 0], foreR: [-0.3, 0, 0], armL: [-3.0, 0, 0], foreL: [-0.3, 0, 0] },
  smash_hit: { torso: [0.55, 0, 0], armR: [-1.1, 0, 0], foreR: [0, 0, 0], armL: [-1.1, 0, 0], foreL: [0, 0, 0] },
  crouch: { torso: [0.5, 0, 0], legR: [-1.0, 0, 0], shinR: [1.6, 0, 0], legL: [-1.0, 0, 0], shinL: [1.6, 0, 0], armR: [0.4, 0, -0.3], armL: [0.4, 0, 0.3] },
};

/** Additive locomotion offsets. `phase` advances with distance travelled. */
export function locomotionPose(phase: number, amount: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const a = amount;
  return {
    legR: [s * 0.75 * a, 0, 0],
    legL: [-s * 0.75 * a, 0, 0],
    shinR: [Math.max(0, -c) * 1.0 * a + 0.1 * a, 0, 0],
    shinL: [Math.max(0, c) * 1.0 * a + 0.1 * a, 0, 0],
    armR: [-s * 0.4 * a, 0, 0],
    armL: [s * 0.5 * a, 0, 0],
    torso: [0.12 * a, s * 0.12 * a, 0],
  };
}

/** Flash the rig's materials (e.g. on hit). intensity 0 = off. */
export function setFlash(mats: THREE.MeshToonMaterial[], color: number, intensity: number): void {
  for (const m of mats) {
    m.emissive.setHex(color);
    m.emissiveIntensity = intensity;
  }
}
