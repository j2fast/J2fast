// Villagers and other non-hostile characters.

import * as THREE from 'three';
import { approachAngle, yawTo } from '../core/math';
import { NPC_NAMES } from '../data/dialogue';
import { Model, buildKohaku, buildNpc } from '../render/creatures';
import { canvasTexture } from '../render/toon';

function markerTexture(symbol: string, color: string): THREE.Texture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(20,14,26,0.85)';
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 38px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 34);
  });
}

let newTex: THREE.Texture | null = null;
let turnTex: THREE.Texture | null = null;

export class Npc {
  readonly model: Model;
  readonly root: THREE.Group;
  readonly pos = new THREE.Vector3();
  yaw: number;
  private baseYaw: number;
  readonly name: string;
  readonly marker: THREE.Sprite;
  talking = false;
  private t = Math.random() * 10;

  constructor(
    readonly id: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ) {
    this.model = id === 'kohaku' ? buildKohaku() : buildNpc(id);
    this.root = this.model.root;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline) m.castShadow = true;
    });
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.baseYaw = yaw;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
    this.name = NPC_NAMES[id] ?? id;
    newTex ??= markerTexture('!', '#ffd27a');
    turnTex ??= markerTexture('?', '#8ad8ff');
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: newTex, depthTest: false, transparent: true }));
    this.marker.scale.set(0.7, 0.7, 0.7);
    this.marker.position.set(x, y + this.model.height + 0.6, z);
    this.marker.visible = false;
    this.marker.renderOrder = 10;
  }

  setMarker(kind: 'new' | 'turnin' | null) {
    this.marker.visible = !!kind;
    if (kind) (this.marker.material as THREE.SpriteMaterial).map = kind === 'new' ? newTex : turnTex;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    const d = this.pos.distanceTo(playerPos);
    const target = d < 5 || this.talking ? yawTo(this.pos.x, this.pos.z, playerPos.x, playerPos.z) : this.baseYaw;
    this.yaw = approachAngle(this.yaw, target, 3 * dt);
    this.root.rotation.y = this.yaw;
    this.model.animate({ mode: 'idle', t: this.t, speed: 0, progress: 0, pose: this.talking ? 'talk' : undefined }, dt);
    this.marker.position.y = this.pos.y + this.model.height + 0.6 + Math.sin(this.t * 3) * 0.08;
  }
}
