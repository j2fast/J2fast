// Loot on the ground. Coins and materials fly to the player automatically;
// equipment drops show a coloured pillar of light and are collected on touch.

import * as THREE from 'three';
import { RARITY_COLORS } from '../data/items';
import { basic } from '../render/toon';
import type { GeneratedEquipment } from '../systems/loot';

export type PickupContent = { kind: 'coins'; amount: number } | { kind: 'item'; id: string; qty: number } | { kind: 'equipment'; gen: GeneratedEquipment };

interface Pickup {
  content: PickupContent;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  mesh: THREE.Object3D;
  magnet: boolean;
}

export class Pickups {
  readonly group = new THREE.Group();
  private list: Pickup[] = [];

  spawn(content: PickupContent, x: number, y: number, z: number) {
    const g = new THREE.Group();
    let color = 0xffd27a;
    if (content.kind === 'item') color = 0x8ad8ff;
    if (content.kind === 'equipment') color = parseInt(RARITY_COLORS[content.gen.rarity].slice(1), 16);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(content.kind === 'equipment' ? 0.28 : 0.16), basic(color));
    g.add(core);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(content.kind === 'equipment' ? 0.6 : 0.35, 10, 8), basic(color, { transparent: true, opacity: 0.3, additive: true }));
    g.add(halo);
    if (content.kind === 'equipment') {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 6, 8, 1, true), basic(color, { transparent: true, opacity: 0.35, additive: true, side: THREE.DoubleSide }));
      beam.position.y = 3;
      g.add(beam);
    }
    g.position.set(x, y + 0.5, z);
    this.group.add(g);
    const a = Math.random() * Math.PI * 2;
    this.list.push({
      content,
      pos: new THREE.Vector3(x, y + 0.5, z),
      vel: new THREE.Vector3(Math.cos(a) * 2.5, 5, Math.sin(a) * 2.5),
      t: 0,
      mesh: g,
      magnet: false,
    });
  }

  /** Returns contents collected this frame. */
  update(dt: number, player: THREE.Vector3, groundY: (x: number, z: number) => number): PickupContent[] {
    const got: PickupContent[] = [];
    for (const p of this.list) {
      p.t += dt;
      const d = p.pos.distanceTo(new THREE.Vector3(player.x, player.y + 1, player.z));
      const auto = p.content.kind !== 'equipment';
      if ((auto && p.t > 0.6 && d < 7) || (!auto && d < 2.2) || p.magnet) {
        p.magnet = true;
        const dir = new THREE.Vector3(player.x - p.pos.x, player.y + 1 - p.pos.y, player.z - p.pos.z);
        const len = dir.length();
        p.pos.addScaledVector(dir.normalize(), Math.min(len, (8 + p.t * 6) * dt));
        if (len < 0.5) {
          got.push(p.content);
          p.t = -999;
        }
      } else {
        p.vel.y -= 14 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const gy = groundY(p.pos.x, p.pos.z) + 0.4;
        if (p.pos.y < gy) {
          p.pos.y = gy;
          p.vel.set(0, 0, 0);
        }
      }
      p.mesh.position.copy(p.pos);
      p.mesh.position.y += Math.sin(p.t * 3) * 0.08;
      p.mesh.rotation.y += dt * 2;
    }
    for (const p of this.list.filter((x) => x.t < 0)) this.group.remove(p.mesh);
    this.list = this.list.filter((x) => x.t >= 0);
    return got;
  }

  clear() {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list = [];
  }

  get count() {
    return this.list.length;
  }
}
