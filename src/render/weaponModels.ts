// Procedural weapon meshes. Each weapon group's origin is the grip and the
// business end extends along local -Y (continuing the line of the forearm).

import * as THREE from 'three';
import type { WeaponType } from '../data/weapons';
import { addOutlines, toon } from './toon';

export const RARITY_GLOW = [0x000000, 0x2e7a2a, 0x2a5aa8, 0x6a2aa8, 0xb07a10];

export interface WeaponModel {
  group: THREE.Group;
  /** Local points for the swing trail (base and tip). */
  trailBase: THREE.Vector3;
  trailTip: THREE.Vector3;
  /** Optional second weapon for the off hand (twin tanto) or bow. */
  offhand?: THREE.Group;
}

function steel(rarity: number) {
  return toon(0xdfe6ee, { emissive: RARITY_GLOW[rarity] ?? 0, emissiveIntensity: rarity > 0 ? 0.9 : 0 });
}

function katana(rarity: number): WeaponModel {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.26, 6), toon(0x2a1d2e));
  handle.position.y = 0.02;
  g.add(handle);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), toon(0xc9a24a));
  guard.position.y = -0.12;
  g.add(guard);
  const bladeGeo = new THREE.BoxGeometry(0.035, 0.9, 0.012);
  bladeGeo.translate(0, -0.45, 0);
  const blade = new THREE.Mesh(bladeGeo, steel(rarity));
  blade.position.y = -0.13;
  blade.rotation.x = 0.06;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4), steel(rarity));
  tip.rotation.x = Math.PI;
  tip.position.set(0, -1.07, -0.055);
  g.add(tip);
  addOutlines(g, 0.012);
  return { group: g, trailBase: new THREE.Vector3(0, -0.3, 0), trailTip: new THREE.Vector3(0, -1.1, -0.06) };
}

function naginata(rarity: number): WeaponModel {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), toon(0x5a3a26));
  pole.position.y = -0.35;
  g.add(pole);
  for (const y of [0.4, -0.2, -1.2]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 6), toon(0xc9a24a));
    band.position.y = y;
    g.add(band);
  }
  const bladeGeo = new THREE.BoxGeometry(0.06, 0.62, 0.014);
  bladeGeo.translate(0, -0.31, 0);
  const blade = new THREE.Mesh(bladeGeo, steel(rarity));
  blade.position.y = -1.28;
  blade.rotation.x = 0.18;
  g.add(blade);
  addOutlines(g, 0.012);
  return { group: g, trailBase: new THREE.Vector3(0, -1.0, 0), trailTip: new THREE.Vector3(0, -1.9, -0.12) };
}

function tanto(rarity: number): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), toon(0x2a1d2e));
  g.add(handle);
  const bladeGeo = new THREE.BoxGeometry(0.035, 0.36, 0.01);
  bladeGeo.translate(0, -0.18, 0);
  const blade = new THREE.Mesh(bladeGeo, steel(rarity));
  blade.position.y = -0.08;
  g.add(blade);
  addOutlines(g, 0.01);
  return g;
}

function kanabo(rarity: number, scale = 1): WeaponModel {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), toon(0x3a2a20));
  g.add(handle);
  const clubGeo = new THREE.CylinderGeometry(0.1, 0.055, 0.95, 8);
  clubGeo.translate(0, -0.475, 0);
  const wood = toon(0x4a3426, { emissive: RARITY_GLOW[rarity] ?? 0, emissiveIntensity: rarity > 0 ? 0.6 : 0 });
  const club = new THREE.Mesh(clubGeo, wood);
  club.position.y = -0.14;
  g.add(club);
  const studMat = toon(0x9aa0a8);
  for (let i = 0; i < 18; i++) {
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), studMat);
    const y = -0.3 - (i % 6) * 0.13;
    const a = Math.floor(i / 6) * ((Math.PI * 2) / 3) + (i % 2) * 0.5;
    const r = 0.06 + ((-y - 0.14) / 0.95) * 0.04;
    stud.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    stud.lookAt(stud.position.x * 3, y, stud.position.z * 3);
    stud.rotateX(Math.PI / 2);
    stud.userData.noOutline = true;
    g.add(stud);
  }
  g.scale.setScalar(scale);
  addOutlines(g, 0.012);
  return { group: g, trailBase: new THREE.Vector3(0, -0.4 * scale, 0), trailTip: new THREE.Vector3(0, -1.1 * scale, 0) };
}

function bow(rarity: number): THREE.Group {
  // Held in the left hand: limbs extend along local ±Z, bulging toward -Y.
  const g = new THREE.Group();
  const R = 0.62;
  const arc = Math.PI * 0.75;
  const wood = toon(0x6a3a2a, { emissive: RARITY_GLOW[rarity] ?? 0, emissiveIntensity: rarity > 0 ? 0.6 : 0 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 6, 20, arc), wood);
  const holder = new THREE.Group();
  torus.rotation.z = -Math.PI / 2 - arc / 2;
  holder.add(torus);
  holder.position.y = R - 0.05;
  holder.rotation.y = Math.PI / 2;
  g.add(holder);
  // String between the two tips.
  const tipZ = Math.sin(arc / 2) * R;
  const tipY = R - 0.05 - Math.cos(arc / 2) * R;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, tipZ * 2, 3), toon(0xf0ead8));
  string.rotation.x = Math.PI / 2;
  string.position.y = tipY;
  string.userData.noOutline = true;
  g.add(string);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), toon(0xd8452f));
  grip.rotation.x = Math.PI / 2;
  grip.position.y = -0.05;
  g.add(grip);
  addOutlines(g, 0.01);
  return g;
}

export function buildWeapon(type: WeaponType, rarity = 0): WeaponModel {
  switch (type) {
    case 'katana':
      return katana(rarity);
    case 'naginata':
      return naginata(rarity);
    case 'kanabo':
      return kanabo(rarity);
    case 'tanto': {
      const r = tanto(rarity);
      return { group: r, offhand: tanto(rarity), trailBase: new THREE.Vector3(0, -0.1, 0), trailTip: new THREE.Vector3(0, -0.45, 0) };
    }
    case 'bow': {
      // The right hand holds an arrow; the bow goes in the off hand.
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), toon(0xe8dcc0));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = 0.3;
      arrow.add(shaft);
      return { group: arrow, offhand: bow(rarity), trailBase: new THREE.Vector3(0, 0, 0), trailTip: new THREE.Vector3(0, 0, 0.5) };
    }
  }
}

export function buildBigKanabo(): WeaponModel {
  return kanabo(0, 2.2);
}
