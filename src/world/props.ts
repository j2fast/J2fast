// Procedural environment props. Every builder returns a Group positioned at
// the origin; callers place them and register colliders.

import * as THREE from 'three';
import { Rng } from '../core/rng';
import { addOutlines, basic, toon, setShadows } from '../render/toon';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function house(opts: { w: number; d: number; h: number; wall?: number; roof?: number; wood?: number; door?: boolean; lanternColor?: number }): THREE.Group {
  const g = new THREE.Group();
  const wall = toon(opts.wall ?? 0xe9dfc9);
  const wood = toon(opts.wood ?? 0x4a3226);
  const roofMat = toon(opts.roof ?? 0x3a3f5a);
  const { w, d, h } = opts;
  // Stone foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), toon(0x7a756e));
  base.position.y = 0.2;
  g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.y = 0.4 + h / 2;
  g.add(body);
  // Timber frame posts and beams
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), wood);
      post.position.set((sx * w) / 2, 0.4 + h / 2, (sz * d) / 2);
      g.add(post);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), wood);
  beam.position.y = 0.4 + h;
  g.add(beam);
  const beamMid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.12, d + 0.05), wood);
  beamMid.position.y = 0.4 + h * 0.5;
  g.add(beamMid);
  // Gabled roof with overhang (two slabs + ridge).
  const over = 0.9;
  const rw = w / 2 + over;
  const pitch = 0.55;
  const slabLen = rw / Math.cos(pitch);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.18, d + over * 2), roofMat);
    slab.position.set((side * rw) / 2, 0.4 + h + Math.tan(pitch) * (rw / 2) + 0.05, 0);
    slab.rotation.z = -side * pitch;
    g.add(slab);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, d + over * 2 + 0.2), roofMat);
  ridge.position.y = 0.4 + h + Math.tan(pitch) * rw + 0.1;
  g.add(ridge);
  // Gable fill
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-w / 2, 0);
  gableShape.lineTo(w / 2, 0);
  gableShape.lineTo(0, Math.tan(pitch) * (w / 2));
  gableShape.closePath();
  const gableGeo = new THREE.ShapeGeometry(gableShape);
  for (const sz of [-1, 1]) {
    const gab = new THREE.Mesh(gableGeo, toon(opts.wall ?? 0xe9dfc9, { side: THREE.DoubleSide }));
    gab.position.set(0, 0.4 + h + 0.1, (sz * d) / 2);
    g.add(gab);
  }
  if (opts.door !== false) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 0.08), toon(0x6a4a32));
    door.position.set(0, 1.4, d / 2 + 0.03);
    g.add(door);
    const shoji = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.06), toon(0xf6efd8, { emissive: 0xffc070, emissiveIntensity: 0.35 }));
    for (const sx of [-1, 1]) {
      const win = shoji.clone();
      win.position.set(sx * (w / 2 - 1.2), 1.9, d / 2 + 0.03);
      g.add(win);
    }
    const lantern = paperLantern(opts.lanternColor ?? 0xd8452f);
    lantern.position.set(1.1, 2.6, d / 2 + 0.5);
    g.add(lantern);
  }
  addOutlines(g, 0.05);
  setShadows(g, true, true);
  return g;
}

export function torii(width = 5, height = 5, color = 0xc8322b): THREE.Group {
  const g = new THREE.Group();
  const red = toon(color);
  const black = toon(0x1c1820);
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, height, 10), red);
    pillar.position.set((s * width) / 2, height / 2, 0);
    g.add(pillar);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 10), black);
    foot.position.set((s * width) / 2, 0.2, 0);
    g.add(foot);
  }
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.3, 0.25), red);
  nuki.position.y = height * 0.78;
  g.add(nuki);
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 0.35, 0.5), black);
  kasagi.position.y = height + 0.15;
  g.add(kasagi);
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 0.3, 0.42), red);
  shimaki.position.y = height - 0.18;
  g.add(shimaki);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), black);
    tip.position.set(s * (width / 2 + 1.1), height + 0.28, 0);
    tip.rotation.z = s * 0.25;
    g.add(tip);
  }
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.12), black);
  plaque.position.y = height * 0.9;
  g.add(plaque);
  addOutlines(g, 0.05);
  setShadows(g);
  return g;
}

export function stoneLantern(lit = true): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x8f8a82);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 6), stone);
  base.position.y = 0.15;
  g.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 6), stone);
  post.position.y = 0.8;
  g.add(post);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.18, 6), stone);
  plat.position.y = 1.38;
  g.add(plat);
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    lit ? toon(0xffe0a0, { emissive: 0xffa040, emissiveIntensity: 1.4 }) : toon(0x4a4640),
  );
  light.position.y = 1.68;
  g.add(light);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 6), stone);
  cap.position.y = 2.1;
  g.add(cap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), stone);
  knob.position.y = 2.38;
  g.add(knob);
  addOutlines(g, 0.04);
  setShadows(g);
  return g;
}

export function paperLantern(color = 0xd8452f, size = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28 * size, 10, 8), toon(color, { emissive: color, emissiveIntensity: 0.9 }));
  body.scale.y = 1.3;
  g.add(body);
  const capMat = toon(0x1c1820);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.12 * size, 0.08, 8), capMat);
  top.position.y = 0.36 * size;
  g.add(top);
  const bot = top.clone();
  bot.position.y = -0.36 * size;
  g.add(bot);
  return g;
}

export function lanternPost(color = 0xd8452f): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), toon(0x3a2a20));
  pole.position.y = 1.3;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), toon(0x3a2a20));
  arm.position.set(0.3, 2.5, 0);
  g.add(arm);
  const l = paperLantern(color, 0.85);
  l.position.set(0.55, 2.05, 0);
  g.add(l);
  addOutlines(g, 0.03);
  return g;
}

export function tree(kind: 'pine' | 'sakura' | 'maple' | 'dead' | 'willow', rng: Rng, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const bark = toon(kind === 'dead' ? 0x3a3238 : 0x4a3428);
  const h = (kind === 'pine' ? 5 : 3.6) * scale;
  const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.35 * scale, h, 7);
  trunkGeo.translate(0, h / 2, 0);
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.rotation.z = (rng.next() - 0.5) * 0.15;
  g.add(trunk);
  const leafColor =
    kind === 'sakura' ? (rng.chance(0.5) ? 0xf4a8c0 : 0xf7bfd0) : kind === 'maple' ? (rng.chance(0.5) ? 0xd8502a : 0xe87a2a) : kind === 'willow' ? 0x6a8a4a : 0x2f5a46;
  const leaf = toon(leafColor);
  if (kind === 'pine') {
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((2.2 - i * 0.45) * scale, 1.8 * scale, 8), leaf);
      cone.position.y = h * 0.45 + i * 1.05 * scale;
      cone.rotation.y = rng.next() * 3;
      g.add(cone);
    }
  } else if (kind === 'dead') {
    for (let i = 0; i < 4; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.1 * scale, 1.6 * scale, 5), bark);
      br.position.y = h * (0.6 + i * 0.1);
      br.rotation.z = (i % 2 ? 1 : -1) * (0.7 + rng.next() * 0.4);
      br.rotation.y = rng.next() * 6;
      br.position.x = Math.sin(br.rotation.z) * -0.6 * scale;
      g.add(br);
    }
  } else {
    const n = kind === 'willow' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const r = (1.0 + rng.next() * 0.7) * scale;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
      const a = (i / n) * Math.PI * 2 + rng.next();
      const rad = i === 0 ? 0 : 1.1 * scale;
      blob.position.set(Math.cos(a) * rad, h + (i === 0 ? 0.8 * scale : rng.next() * 0.7 * scale), Math.sin(a) * rad);
      if (kind === 'willow') blob.scale.y = 1.6;
      g.add(blob);
    }
  }
  addOutlines(g, 0.05);
  setShadows(g);
  return g;
}

export function rock(rng: Rng, size = 1, color = 0x7a7680): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.8 + rng.next() * 0.4), pos.getY(i) * (0.6 + rng.next() * 0.3), pos.getZ(i) * (0.8 + rng.next() * 0.4));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toon(color));
  m.rotation.y = rng.next() * 6;
  m.castShadow = true;
  m.receiveShadow = true;
  addOutlines(m, 0.05);
  return m;
}

/** Instanced bamboo stalks for dense groves. */
export function bambooField(positions: { x: number; y: number; z: number; h: number }[]): THREE.Group {
  const g = new THREE.Group();
  const stalkGeo = new THREE.CylinderGeometry(0.09, 0.11, 1, 6);
  stalkGeo.translate(0, 0.5, 0);
  const stalkMat = toon(0x7fae4a);
  const nodeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 6);
  const nodeMat = toon(0x5a8a32);
  const leafGeo = new THREE.ConeGeometry(0.9, 2.2, 6);
  const leafMat = toon(0x4f8a3a);
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, positions.length);
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, positions.length * 4);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  positions.forEach((p, i) => {
    e.set((Math.sin(i * 7.1) * 0.06), 0, Math.cos(i * 3.3) * 0.06);
    q.setFromEuler(e);
    s.set(1, p.h, 1);
    m.compose(V(p.x, p.y, p.z), q, s);
    stalks.setMatrixAt(i, m);
    for (let k = 0; k < 4; k++) {
      m.compose(V(p.x, p.y + p.h * (0.2 + k * 0.2), p.z), q, V(1, 1, 1));
      nodes.setMatrixAt(i * 4 + k, m);
    }
    m.compose(V(p.x, p.y + p.h - 0.3, p.z), q, V(1, 1, 1));
    leaves.setMatrixAt(i, m);
  });
  stalks.castShadow = true;
  leaves.castShadow = true;
  g.add(stalks, nodes, leaves);
  return g;
}

/** Instanced grass / reed tufts. */
export function tufts(positions: { x: number; y: number; z: number; s: number }[], color: number, height = 0.6): THREE.InstancedMesh {
  const geo = new THREE.ConeGeometry(0.12, height, 4);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.InstancedMesh(geo, toon(color), positions.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (const p of positions) {
    for (let j = 0; j < 3; j++) {
      q.setFromEuler(new THREE.Euler((j - 1) * 0.35, j * 2, 0));
      m.compose(V(p.x + (j - 1) * 0.12, p.y, p.z + ((j * 7) % 3) * 0.08), q, V(p.s, p.s, p.s));
      mesh.setMatrixAt(k++, m);
    }
  }
  return mesh;
}

export function fence(length: number): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x5a4030);
  const n = Math.max(2, Math.round(length / 1.6));
  for (let i = 0; i <= n; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), wood);
    post.position.set(-length / 2 + (i * length) / n, 0.65, 0);
    g.add(post);
  }
  for (const y of [0.45, 1.0]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.08), wood);
    rail.position.y = y;
    g.add(rail);
  }
  addOutlines(g, 0.02);
  return g;
}

/** Tall wooden palisade / wall segment. */
export function palisade(length: number, height = 3.2): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x4a3428);
  const n = Math.max(2, Math.round(length / 0.45));
  const geo = new THREE.CylinderGeometry(0.22, 0.22, height, 6);
  const inst = new THREE.InstancedMesh(geo, wood, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const hh = height * (0.9 + ((i * 37) % 10) / 50);
    m.compose(V(-length / 2 + (i + 0.5) * (length / n), hh / 2, 0), new THREE.Quaternion(), V(1, hh / height, 1));
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  g.add(inst);
  const band = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.5), toon(0x2a1d16));
  band.position.y = height * 0.7;
  g.add(band);
  return g;
}

export function well(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x8a857c);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12, 1, true), toon(0x8a857c, { side: THREE.DoubleSide }));
  ring.position.y = 0.45;
  g.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.12, 6, 16), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  g.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), basic(0x1a3a5a));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  g.add(water);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), toon(0x4a3428));
    post.position.set(s * 1.1, 1.1, 0);
    g.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 4), toon(0x3a3f5a));
  roof.position.y = 2.5;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  addOutlines(g, 0.03);
  setShadows(g);
  return g;
}

export function forge(): THREE.Group {
  const g = new THREE.Group();
  const furnace = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6), toon(0x6a5a52));
  furnace.position.y = 0.8;
  g.add(furnace);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.1), toon(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 2 }));
  mouth.position.set(0, 0.7, 0.81);
  g.add(mouth);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 8), toon(0x5a4a42));
  chimney.position.set(0.4, 2.6, -0.3);
  g.add(chimney);
  const anvil = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), toon(0x3a3e46));
  top.position.y = 0.85;
  anvil.add(top);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), toon(0x3a3e46));
  leg.position.y = 0.4;
  anvil.add(leg);
  anvil.position.set(-1.8, 0, 1.5);
  g.add(anvil);
  addOutlines(g, 0.03);
  setShadows(g);
  return g;
}

export function parasol(color = 0xc8322b): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), toon(0x4a3428));
  pole.position.y = 1.3;
  g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.6, 16, 1, true), toon(color, { side: THREE.DoubleSide }));
  top.position.y = 2.6;
  g.add(top);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), toon(0xc8322b));
  bench.position.set(0, 0.5, 1.2);
  g.add(bench);
  const benchCloth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), toon(0xc8322b));
  benchCloth.position.set(0, 0.3, 1.6);
  g.add(benchCloth);
  addOutlines(g, 0.03);
  return g;
}

export function shrineBuilding(): THREE.Group {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 7), toon(0x6a5a4a));
  platform.position.y = 0.5;
  g.add(platform);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.33, 0.5), toon(0x8a7a6a));
    step.position.set(0, 0.17 + i * 0.33, 3.75 - i * 0.0 + (2 - i) * 0.5);
    g.add(step);
  }
  const red = toon(0xc8322b);
  for (const sx of [-3.6, -1.2, 1.2, 3.6]) {
    for (const sz of [-2.6, 2.6]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 8), red);
      p.position.set(sx, 2.7, sz);
      g.add(p);
    }
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 4.8), toon(0xf2ead8));
  wall.position.set(0, 2.5, -0.2);
  g.add(wall);
  const roofMat = toon(0x2f4a3a);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.4, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  roof.position.y = 5.4;
  g.add(roof);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), toon(0xc9a24a));
  bell.position.set(0, 3.9, 2.8);
  g.add(bell);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), toon(0xe8dcc0));
  rope.position.set(0, 3.0, 2.8);
  g.add(rope);
  addOutlines(g, 0.05);
  setShadows(g, true, true);
  return g;
}

export function brazier(lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x6a6e78);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.5, 8), stone);
  base.position.y = 0.25;
  g.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 8), stone);
  post.position.y = 1.0;
  g.add(post);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.5, 10, 1, true), toon(0x4a4e58, { side: THREE.DoubleSide }));
  bowl.position.y = 1.7;
  g.add(bowl);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 8), basic(0x6fd8ff, { transparent: true, opacity: 0.85, additive: true }));
  flame.position.y = 2.4;
  flame.name = 'flame';
  flame.visible = lit;
  g.add(flame);
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.75, 10), lit ? toon(0x6fd8ff, { emissive: 0x3fb8ff, emissiveIntensity: 2 }) : toon(0x2a2a2a));
  coal.rotation.x = -Math.PI / 2;
  coal.position.y = 1.8;
  coal.name = 'coal';
  g.add(coal);
  addOutlines(g, 0.03);
  setShadows(g);
  return g;
}

export function chest(opened: boolean, color = 0x8a3a2a): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), toon(color));
  body.position.y = 0.3;
  g.add(body);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.6, -0.35);
  lidPivot.name = 'lid';
  g.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.25, 0.75), toon(color));
  lid.position.set(0, 0.12, 0.35);
  lidPivot.add(lid);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.76), toon(0xc9a24a));
  trim.position.set(0, 0.0, 0.35);
  lidPivot.add(trim);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), toon(0xc9a24a));
  lock.position.set(0, 0.5, 0.37);
  g.add(lock);
  if (opened) lidPivot.rotation.x = -1.9;
  addOutlines(g, 0.03);
  setShadows(g);
  return g;
}

export function cage(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x3a2a20);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), wood);
  base.position.y = 0.1;
  g.add(base);
  const top = base.clone();
  top.position.y = 2;
  g.add(top);
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(i / 4);
    const k = (i % 4) / 3 - 0.5;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 4), wood);
    const off = 0.95;
    if (side === 0) bar.position.set(k * 1.9, 1.05, off);
    if (side === 1) bar.position.set(k * 1.9, 1.05, -off);
    if (side === 2) bar.position.set(off, 1.05, k * 1.9);
    if (side === 3) bar.position.set(-off, 1.05, k * 1.9);
    g.add(bar);
  }
  addOutlines(g, 0.02);
  return g;
}

export function wayshrine(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x8f8a82);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), stone);
  base.position.y = 0.2;
  g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.8), toon(0xc8322b));
  body.position.y = 0.95;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), toon(0x2a2a30));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.8;
  g.add(roof);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), toon(0xffe0a0, { emissive: 0xffb050, emissiveIntensity: 1.8 }));
  glow.position.set(0, 1.0, 0.41);
  g.add(glow);
  // Paper streamers
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.01), toon(0xffffff));
    strip.position.set(s * 0.3, 1.35, 0.42);
    g.add(strip);
  }
  addOutlines(g, 0.03);
  setShadows(g);
  return g;
}

/** The great Spirit Lantern frame atop Hinoyama. */
export function spiritLantern(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x5a5660);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.2, 8), stone);
  base.position.y = 0.6;
  g.add(base);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 8), stone);
  step.position.y = 1.6;
  g.add(step);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 4, 8), stone);
  pillar.position.y = 4;
  g.add(pillar);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 0.6, 8), stone);
  plat.position.y = 6.3;
  g.add(plat);
  const frameMat = toon(0x2a2228);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.2), frameMat);
    bar.position.set(Math.cos(a) * 1.7, 8.4, Math.sin(a) * 1.7);
    g.add(bar);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 1.8, 6), frameMat);
  roof.position.y = 11.1;
  g.add(roof);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), toon(0x6a6070, { emissive: 0x000000 }));
  core.position.y = 8.4;
  core.name = 'core';
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), basic(0xffc060, { transparent: true, opacity: 0.0, additive: true }));
  halo.position.y = 8.4;
  halo.name = 'halo';
  g.add(halo);
  addOutlines(g, 0.06);
  setShadows(g);
  return g;
}

export function gateDoors(width: number, height: number, color = 0x3a2a24): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(width / 2, height, 0.3), toon(color));
    door.position.set((s * width) / 4, height / 2, 0);
    door.name = s < 0 ? 'doorL' : 'doorR';
    g.add(door);
    const stud = new THREE.Mesh(new THREE.BoxGeometry(width / 2 - 0.2, 0.15, 0.35), toon(0x1a1a1a));
    stud.position.set((s * width) / 4, height * 0.7, 0);
    g.add(stud);
  }
  addOutlines(g, 0.03);
  return g;
}

export function barrier(width: number, height = 4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(0xff6a3a, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, additive: true, depthWrite: false }));
  m.position.y = height / 2;
  return m;
}

export function grave(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const stone = toon(0x6a6670);
  const h = 1 + rng.next() * 0.6;
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.35), stone);
  s.position.y = h / 2;
  s.rotation.z = (rng.next() - 0.5) * 0.2;
  g.add(s);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.45), stone);
  cap.position.y = h + 0.05;
  g.add(cap);
  addOutlines(g, 0.02);
  return g;
}

export function pillar(height: number, radius = 0.6, color = 0x6a6670): THREE.Group {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 8), toon(color));
  p.position.y = height / 2;
  g.add(p);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.4, radius * 2.4), toon(color));
  cap.position.y = height;
  g.add(cap);
  addOutlines(g, 0.03);
  setShadows(g, true, true);
  return g;
}

export function torch(): THREE.Group {
  const g = new THREE.Group();
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.6, 5), toon(0x3a2a20));
  holder.position.y = 0.3;
  g.add(holder);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), basic(0xffa040, { transparent: true, opacity: 0.9, additive: true }));
  fire.position.y = 0.75;
  fire.name = 'fire';
  g.add(fire);
  return g;
}

export function dock(length: number): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x5a4030);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, length), wood);
  deck.position.y = 0.3;
  g.add(deck);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 5), wood);
      post.position.set(s * 1.0, -0.2, -length / 2 + (i * length) / 3);
      g.add(post);
    }
  }
  const boat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 3.6), toon(0x6a4a32));
  boat.position.set(2.2, 0, length / 2 - 1);
  g.add(boat);
  addOutlines(g, 0.03);
  return g;
}

export function lilyPads(rng: Rng, count: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(0x4a7a3a);
  const flower = toon(0xf4c0d8, { emissive: 0xf4a0c0, emissiveIntensity: 0.3 });
  for (let i = 0; i < count; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rng.next() * 0.3, 8, 0.4, Math.PI * 1.8), mat);
    pad.rotation.x = -Math.PI / 2;
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    pad.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(pad);
    if (rng.chance(0.3)) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 6), flower);
      f.position.set(pad.position.x, 0.1, pad.position.z);
      g.add(f);
    }
  }
  return g;
}

/** Distant mountains ringing the play area to give a horizon. */
export function horizon(radius: number, color: number, rng: Rng, peakHeight = 30, snow = false): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const snowMat = new THREE.MeshBasicMaterial({ color: 0xe8e8f0, fog: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.next() * 0.2;
    const h = peakHeight * (0.5 + rng.next() * 0.8);
    const r = h * (1 + rng.next() * 0.6);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
    const d = radius * (0.95 + rng.next() * 0.2);
    m.position.set(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d);
    m.rotation.y = rng.next() * 6;
    g.add(m);
    if (snow && h > peakHeight) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, h * 0.3, 5), snowMat);
      cap.position.set(m.position.x, m.position.y + h * 0.35, m.position.z);
      cap.rotation.y = m.rotation.y;
      g.add(cap);
    }
  }
  return g;
}
