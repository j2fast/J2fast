// The five areas of Hinoyama Vale. All layouts are hand-placed in code.

import * as THREE from 'three';
import type { AreaId } from '../data/areaIds';
import { AREA_NAMES } from '../data/areaIds';
import { smoothstep } from '../core/math';
import { toon, basic } from '../render/toon';
import { AreaBuilder } from './builder';
import type { AreaBuild } from './areaTypes';
import { buildGround, makeHeightFn, pathDistance, PathSpec, TerrainSpec } from './terrain';
import * as P from './props';

function finish(b: AreaBuild['id'], builder: AreaBuilder, rest: Omit<AreaBuild, 'id' | 'name' | 'group' | 'colliders' | 'lights' | 'animate'>): AreaBuild {
  const anims = builder.animators;
  return {
    id: b,
    name: AREA_NAMES[b],
    group: builder.group,
    colliders: builder.colliders,
    lights: builder.lights,
    animate: (t, dt) => anims.forEach((a) => a(t, dt)),
    ...rest,
  };
}

function inCircle(x: number, z: number, cx: number, cz: number, r: number) {
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/** The distant sacred mountain with the dark (or relit) Lantern at its peak. */
function hinoyamaBackdrop(builder: AreaBuilder, x: number, z: number, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x3a3450, fog: false });
  const m = new THREE.Mesh(new THREE.ConeGeometry(70 * scale, 90 * scale, 7), mat);
  m.position.y = 40 * scale;
  g.add(m);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(18 * scale, 22 * scale, 7), new THREE.MeshBasicMaterial({ color: 0xcfc8e0, fog: false }));
  snow.position.y = 77 * scale;
  g.add(snow);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.4 * scale, 10, 8), basic(0x6a5a7a, { transparent: true, opacity: 0.8 }));
  beacon.position.y = 90 * scale;
  beacon.name = 'beacon';
  g.add(beacon);
  g.position.set(x, -6, z);
  g.name = 'hinoyama';
  builder.group.add(g);
}

// =================================================================== Village

export function buildVillage(): AreaBuild {
  const paths: PathSpec[] = [
    { points: [[0, -40], [0, -14], [0, 0], [0, 20], [0, 46]], width: 4.5 },
    { points: [[0, 0], [-20, 14], [-40, 32]], width: 4 },
    { points: [[0, 0], [20, 6], [44, 10]], width: 4 },
    { points: [[3, -6], [18, -6], [24, -6]], width: 3.5 },
  ];
  const spec: TerrainSpec = {
    size: 140,
    segments: 110,
    seed: 11,
    amp: 1.4,
    freq: 0.035,
    base: 0,
    flats: [
      { x: 0, z: 0, r: 20, h: 0, fall: 10 },
      { x: 0, z: 31, r: 9, h: 1.0, fall: 6 },
      { x: 24, z: -6, r: 8, h: 0, fall: 5 },
    ],
    paths,
    pathFlatten: 0.8,
    colorA: 0x6f9a52,
    colorB: 0x88a85a,
    pathColor: 0xb8a27a,
  };
  const heightAt = makeHeightFn(spec);
  const b = new AreaBuilder(heightAt, 101);
  b.group.add(buildGround(spec, heightAt));

  // Plaza
  b.place(P.well(), 0, 0);
  b.circle(0, 0, 1.4);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 32), toon(0xb8ab92));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = true;
  b.group.add(plaza);

  // Houses
  b.building(P.house({ w: 7, d: 6, h: 3, roof: 0x3a3f5a }), -17, 6, Math.PI / 2, 7, 6);
  b.place(P.forge(), -11.5, 1.5, Math.PI / 2);
  b.circle(-11.5, 1.5, 1.4);
  b.circle(-10, 3.3, 0.6);
  b.pointLight(-10.5, 1.2, 1.5, 0xff7a2a, 6, 10);
  b.building(P.house({ w: 8, d: 6, h: 3.2, roof: 0x5a2a2a, wall: 0xf2e8d2, lanternColor: 0xf0a0b0 }), 17, 8, -Math.PI / 2, 8, 6);
  b.place(P.parasol(0xc8322b), 11, 3, -Math.PI / 2);
  b.circle(11, 3, 0.4);
  b.building(P.house({ w: 7, d: 6, h: 3, roof: 0x2f4a3a }), -7, 14.5, Math.PI, 7, 6);
  b.building(P.house({ w: 6, d: 5, h: 2.8, roof: 0x3a3f5a }), -19, -10, Math.PI / 2, 6, 5);
  b.building(P.house({ w: 6, d: 5, h: 2.8, roof: 0x4a3a5a }), 12, -18, 0, 6, 5);
  b.building(P.house({ w: 6, d: 5, h: 2.8, roof: 0x2f4a3a }), -10, -24, Math.PI / 2, 6, 5);
  b.building(P.house({ w: 6, d: 5, h: 2.8, roof: 0x5a2a2a }), 12, 19, Math.PI, 6, 5);

  // Shrine on the north hill
  b.place(P.torii(5, 5), 0, 21);
  b.circle(-2.5, 21, 0.4);
  b.circle(2.5, 21, 0.4);
  b.place(P.shrineBuilding(), 0, 33, Math.PI);
  b.box(0, 33, 9.4, 7.4, 6);
  b.place(P.stoneLantern(), -3.5, 24.5);
  b.circle(-3.5, 24.5, 0.6);
  b.place(P.stoneLantern(), 3.5, 24.5);
  b.circle(3.5, 24.5, 0.6);
  // Summit gate behind the shrine
  b.place(P.torii(4, 4.5, 0x8a2a5a), 0, 44);
  b.circle(-2, 44, 0.4);
  b.circle(2, 44, 0.4);

  // Training ground (east)
  const tg = { x: 24, z: -6 };
  for (const [ax, az, bx, bz] of [
    [tg.x - 6, tg.z - 6, tg.x + 6, tg.z - 6],
    [tg.x + 6, tg.z - 6, tg.x + 6, tg.z + 6],
    [tg.x - 6, tg.z + 6, tg.x + 6, tg.z + 6],
  ]) {
    const len = Math.hypot(bx - ax, bz - az);
    const f = P.fence(len);
    f.position.set((ax + bx) / 2, heightAt((ax + bx) / 2, (az + bz) / 2), (az + bz) / 2);
    f.rotation.y = -Math.atan2(bz - az, bx - ax);
    b.group.add(f);
    const n = Math.ceil(len);
    for (let i = 0; i <= n; i++) b.circle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.3, 1.3);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), toon(0xd8452f, { side: THREE.DoubleSide }));
  b.place(banner, tg.x + 5.5, tg.z + 5.5, -Math.PI / 4, 2.5);

  // Palisade boundary with gaps for exits.
  const ring: [number, number][] = [
    [-30, -46], [0, -50], [30, -46], [46, -26], [50, 2],
    // gap for marsh gate at (44,10)
    [48, 18], [40, 38], [10, 50],
    // gap for summit path at (0,46)
    [-10, 50], [-30, 44],
    // gap for bamboo gate at (-40,32)
    [-48, 22], [-52, -4], [-46, -28], [-30, -46],
  ];
  const gaps = new Set(['50,2', '10,50', '-30,44']);
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[i + 1];
    if (gaps.has(`${ax},${az}`)) continue;
    b.wall(ax, az, bx, bz);
  }
  // Short wall pieces narrowing each gateway.
  b.wall(50, 2, 48.6, 6.5);
  b.wall(47.6, 13.5, 48, 18);
  b.wall(10, 50, 3.2, 49.4);
  b.wall(-3.2, 49.4, -10, 50);
  b.wall(-30, 44, -37, 36.5);
  b.wall(-44.5, 28, -48, 22);
  // Gate frames at the exits
  b.place(P.torii(5, 4.5, 0x6a4a32), -41, 32, Math.PI / 4 + Math.PI / 2);
  b.place(P.torii(5, 4.5, 0x6a4a32), 46, 10, Math.PI / 2);
  const marshBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 6), toon(0x3a2a20));
  marshBar.name = 'marshBar';
  b.place(marshBar, 46, 10, 0, 1.2);

  // Lantern posts along paths
  for (const [x, z] of [[3, -10], [-3, -20], [3, -30], [-14, 9], [-28, 21], [14, 3], [30, 8], [2.5, 12], [-2.5, 40], [2.5, 40]]) {
    b.place(P.lanternPost(), x, z, x > 0 ? Math.PI : 0);
    b.circle(x, z, 0.25);
  }
  // Trees: sakura inside, pines outside the walls
  for (const [x, z] of [[-8, -6], [8, -8], [-22, 2], [22, 18], [-26, -18], [30, -24], [-14, 30], [12, 32], [-34, 8], [36, -10], [-6, -36], [20, -36]]) b.tree('sakura', x, z, 1 + b.rng.next() * 0.4);
  b.scatter(70, -70, 70, -70, 70, (x, z) => Math.hypot(x, z) < 54 || pathDistance(paths, x, z).d < 6, (x, z) => b.tree(b.rng.chance(0.7) ? 'pine' : 'maple', x, z, 1 + b.rng.next() * 0.6));
  b.scatter(18, -45, 45, -45, 45, (x, z) => pathDistance(paths, x, z).d < 4 || Math.hypot(x, z) < 12 || inCircle(x, z, 24, -6, 8), (x, z) => b.rock(x, z, 0.4 + b.rng.next() * 0.6));
  const grass: { x: number; y: number; z: number; s: number }[] = [];
  b.scatter(260, -48, 48, -48, 48, (x, z) => pathDistance(paths, x, z).d < 3 || Math.hypot(x, z) < 10, (x, z) => grass.push({ x, y: heightAt(x, z), z, s: 0.8 + b.rng.next() * 0.6 }));
  b.group.add(P.tufts(grass, 0x5a8a3a, 0.5));
  b.group.add(P.horizon(150, 0x4a4a6a, b.rng, 30));
  hinoyamaBackdrop(b, 40, 190, 1.4);

  b.place(P.wayshrine(), -5, 24, Math.PI);
  b.circle(-5, 24, 0.8);

  return finish('village', b, {
    size: 140,
    heightAt,
    spawns: {
      start: { x: 0, z: -14, yaw: 0 },
      from_bamboo: { x: -34, z: 26, yaw: Math.PI * 0.75 },
      from_marsh: { x: 39, z: 9, yaw: -Math.PI / 2 },
      from_summit: { x: 0, z: 38, yaw: Math.PI },
      shrine: { x: -5, z: 21, yaw: Math.PI },
    },
    markers: {
      training_ground: { x: 24, z: -6, r: 7 },
      exit_bamboo: { x: -40, z: 32, r: 4 },
      exit_marsh: { x: 45, z: 10, r: 4 },
      exit_summit: { x: 0, z: 46, r: 3 },
    },
    exits: [
      { id: 'exit_bamboo', x: -41, z: 33, r: 3.2, to: 'bamboo', spawn: 'from_village', label: 'Sasagiri Bamboo Grove', requires: { done: 'mq_oath' }, lockedText: 'Elder Tsugumi wants to see your training first.' },
      { id: 'exit_marsh', x: 46, z: 10, r: 3.2, to: 'marsh', spawn: 'from_village', label: 'Mistfen Marsh', requires: { flag: 'marsh_open' }, lockedText: 'The east gate is barred. (Recover the first Ember Core)' },
      { id: 'exit_summit', x: 0, z: 47, r: 3, to: 'summit', spawn: 'from_village', label: 'Hinoyama Summit', requires: { flag: 'blessing' }, lockedText: "A ward seals the summit path. (Requires Mikoto's blessing)" },
    ],
    interactables: [{ id: 'village_shrine', kind: 'wayshrine', x: -5, z: 24 }],
    npcs: [
      { id: 'tsugumi', x: 0, z: 5, yaw: Math.PI },
      { id: 'kanetsugu', x: -9.5, z: 4.5, yaw: Math.PI / 2 },
      { id: 'ohana', x: 10, z: 7, yaw: -Math.PI / 2 },
      { id: 'mikoto', x: 3, z: 27, yaw: Math.PI },
    ],
    enemies: [
      { id: 'dummy1', enemy: 'training_dummy', x: 21.5, z: -3, level: 1, respawn: 4 },
      { id: 'dummy2', enemy: 'training_dummy', x: 26.5, z: -3, level: 1, respawn: 4 },
      { id: 'dummy3', enemy: 'training_dummy', x: 24, z: -9, level: 1, respawn: 4 },
    ],
    ambient: { kind: 'petals', color: 0xf8c0d0, count: 220, size: 0.35, rate: 22, radius: 22, yMin: 2, yMax: 12, vy: -0.7, wind: 0.8, wander: 0.8, life: 9 },
    env: {
      skyTop: 0x2c2f60,
      skyBottom: 0xf3a87a,
      fogColor: 0xd9a090,
      fogNear: 40,
      fogFar: 165,
      sunColor: 0xffd0a0,
      sunIntensity: 2.2,
      sunDir: [-0.6, 0.55, 0.4],
      hemiSky: 0xb0b8ff,
      hemiGround: 0x6a5a4a,
      hemiIntensity: 1.1,
      lanternIntensity: 1.5,
    },
    music: 'village',
    tier: 1,
  });
}

// =================================================================== Bamboo

export function buildBamboo(): AreaBuild {
  const main: PathSpec = { points: [[0, -66], [0, -40], [-8, -25], [5, -8], [15, 2], [8, 18], [0, 30], [0, 46], [0, 50]], width: 7 };
  const side: PathSpec[] = [
    { points: [[5, -8], [-20, 5], [-34, 10]], width: 5 },
    { points: [[8, 18], [-18, 22]], width: 5 },
    { points: [[0, 30], [16, 32]], width: 5 },
    { points: [[5, -8], [28, -20]], width: 4.5 },
  ];
  const paths = [main, ...side];
  const clearings = [
    { x: 15, z: 2, r: 12 },
    { x: -34, z: 10, r: 8 },
    { x: -18, z: 22, r: 10 },
    { x: 16, z: 33, r: 9 },
    { x: 28, z: -20, r: 6 },
    { x: 0, z: 62, r: 17 },
    { x: 0, z: -60, r: 8 },
  ];
  const spec: TerrainSpec = {
    size: 150,
    segments: 120,
    seed: 23,
    amp: 1.8,
    freq: 0.04,
    base: 0,
    flats: [...clearings.map((c) => ({ x: c.x, z: c.z, r: c.r * 0.7, h: 0, fall: 6 }))],
    paths,
    pathFlatten: 0.6,
    colorA: 0x5a7a3a,
    colorB: 0x6e8a42,
    pathColor: 0x9a8a62,
  };
  const heightAt = makeHeightFn(spec);
  const walkable = (x: number, z: number) => {
    if (Math.abs(x) > 72 || Math.abs(z) > 72) return false;
    if (pathDistance(paths, x, z).d < 3.6) return true;
    for (const c of clearings) if (inCircle(x, z, c.x, c.z, c.r)) return true;
    return false;
  };
  const b = new AreaBuilder(heightAt, 202);
  b.group.add(buildGround(spec, heightAt));

  // Dense bamboo outside walkable space (and a ring just inside the edges).
  const stalks: { x: number; y: number; z: number; h: number }[] = [];
  for (let x = -74; x <= 74; x += 1.7) {
    for (let z = -74; z <= 74; z += 1.7) {
      const jx = x + (b.rng.next() - 0.5) * 1.4;
      const jz = z + (b.rng.next() - 0.5) * 1.4;
      const pd = pathDistance(paths, jx, jz).d;
      let nearClear = false;
      for (const c of clearings) if (inCircle(jx, jz, c.x, c.z, c.r + 0.8)) nearClear = true;
      if (pd < 4.2 || nearClear) continue;
      // Thin out far from the play space for performance.
      const dist = Math.min(pd, ...clearings.map((c) => Math.hypot(jx - c.x, jz - c.z) - c.r));
      if (dist > 14 && b.rng.next() < 0.75) continue;
      stalks.push({ x: jx, y: heightAt(jx, jz) - 0.2, z: jz, h: 7 + b.rng.next() * 6 });
    }
  }
  b.group.add(P.bambooField(stalks));
  const grass: { x: number; y: number; z: number; s: number }[] = [];
  b.scatter(300, -70, 70, -70, 70, (x, z) => !walkable(x, z) || pathDistance(paths, x, z).d < 2, (x, z) => grass.push({ x, y: heightAt(x, z), z, s: 0.8 + b.rng.next() * 0.7 }));
  b.group.add(P.tufts(grass, 0x6a9a3a, 0.55));

  // Entrance
  b.place(P.torii(5, 4.5, 0x6a4a32), 0, -64);
  b.place(P.wayshrine(), 4.5, -57, -Math.PI / 2);
  b.circle(4.5, -57, 0.8);

  // Imp camp with a campfire and Kohaku's cage
  const fire = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 5), toon(0x3a2a20));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI;
    log.position.y = 0.1;
    fire.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), basic(0xff8a2a, { transparent: true, opacity: 0.85, additive: true }));
  flame.position.y = 0.7;
  fire.add(flame);
  b.place(fire, 14, 1);
  b.circle(14, 1, 0.8, 1);
  b.pointLight(14, 1.5, 1, 0xff8a3a, 8, 14);
  b.animators.push((t) => flame.scale.set(1 + Math.sin(t * 11) * 0.1, 1 + Math.sin(t * 7) * 0.2, 1));
  const cageObj = P.cage();
  cageObj.name = 'kohakuCage';
  b.place(cageObj, 21, 8);
  const cageCollider = b.circle(21, 8, 1.4, 2, 'kohakuCage');
  void cageCollider;
  for (const [x, z] of [[8, -4], [20, -5], [9, 8]]) b.rock(x, z, 0.8);

  // Hotaru's firefly clearing
  b.place(P.stoneLantern(true), -37, 13);
  b.circle(-37, 13, 0.6);
  b.pointLight(-34, 2, 10, 0x9ad8ff, 4, 10);

  // Broken gate leading to the Oni's arena
  const brokenTorii = P.torii(6, 5.5, 0x7a2a22);
  brokenTorii.rotation.z = 0.08;
  b.place(brokenTorii, 0, 46);
  b.circle(-3, 46, 0.45);
  b.circle(3, 46, 0.45);
  // Arena ring of rocks and lanterns
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.35) continue; // entrance (south)
    b.rock(Math.cos(a) * 18.5, 62 + Math.sin(a) * 18.5, 1.6 + b.rng.next(), 0x5a5660);
  }
  for (const a of [0.3, 1.2, 2.0, 2.8]) b.place(P.stoneLantern(), Math.cos(a) * 14, 62 + Math.sin(a) * 14);
  b.pointLight(0, 6, 62, 0xff9a5a, 5, 30);

  // Scattered rocks in clearings
  b.rock(-15, 18, 1.0);
  b.rock(19, 36, 1.1);
  b.rock(-30, 6, 0.7);
  b.group.add(P.horizon(160, 0x3a4a3a, b.rng, 28));

  return finish('bamboo', b, {
    size: 150,
    heightAt,
    walkable,
    spawns: {
      from_village: { x: 0, z: -59, yaw: 0 },
      shrine: { x: 2, z: -55, yaw: 0 },
      arena: { x: 0, z: 48, yaw: 0 },
    },
    markers: {
      imp_camp: { x: 15, z: 2, r: 12 },
      oni_gate: { x: 0, z: 44, r: 6 },
      oni_arena: { x: 0, z: 62, r: 16 },
      exit_village: { x: 0, z: -66, r: 4 },
    },
    exits: [{ id: 'exit_village', x: 0, z: -67, r: 3.5, to: 'village', spawn: 'from_bamboo', label: 'Akari Village' }],
    interactables: [
      { id: 'bamboo_shrine', kind: 'wayshrine', x: 4.5, z: -57 },
      { id: 'bamboo_chest_1', kind: 'chest', x: 29, z: -21, yaw: -Math.PI / 2, loot: { coins: 40, equipmentTier: 2, rarityLuck: 0.3 } },
      { id: 'bamboo_chest_2', kind: 'chest', x: -36, z: 7, yaw: Math.PI / 2, loot: { coins: 25, items: [{ id: 'dango', qty: 2 }, { id: 'spirit_ore', qty: 3 }] } },
      { id: 'bamboo_chest_3', kind: 'chest', x: 18, z: 37, yaw: Math.PI, loot: { coins: 30, items: [{ id: 'ember_incense', qty: 1 }], equipmentTier: 2 } },
    ],
    npcs: [
      { id: 'kohaku', x: 21, z: 8, yaw: -Math.PI / 2, showIf: { notFlag: 'kohaku_joined' } },
      { id: 'hotaru', x: -34, z: 11, yaw: Math.PI / 2, showIf: { notFlag: 'hotaru_saved' } },
    ],
    enemies: [
      { id: 'b_imp1', enemy: 'ashen_imp', x: -7, z: -28, level: 1 },
      { id: 'b_imp2', enemy: 'ashen_imp', x: -3, z: -23, level: 1 },
      { id: 'b_imp3', enemy: 'ashen_imp', x: -10, z: -21, level: 1 },
      { id: 'b_imp4', enemy: 'ashen_imp', x: 11, z: -1, level: 2 },
      { id: 'b_imp5', enemy: 'ashen_imp', x: 18, z: -2, level: 2 },
      { id: 'b_imp6', enemy: 'ashen_imp', x: 13, z: 6, level: 2 },
      { id: 'b_imp7', enemy: 'ashen_imp', x: 19, z: 4, level: 2 },
      { id: 'b_wisp1', enemy: 'ember_wisp', x: -20, z: 24, level: 2 },
      { id: 'b_wisp2', enemy: 'ember_wisp', x: -15, z: 19, level: 2 },
      { id: 'b_wisp3', enemy: 'ember_wisp', x: 26, z: -18, level: 2 },
      { id: 'b_fox1', enemy: 'shade_fox', x: 16, z: 35, level: 2 },
      { id: 'b_fox2', enemy: 'shade_fox', x: 19, z: 30, level: 2 },
      { id: 'b_imp8', enemy: 'ashen_imp', x: -2, z: 36, level: 3 },
      { id: 'b_imp9', enemy: 'ashen_imp', x: 3, z: 38, level: 3 },
    ],
    boss: {
      enemy: 'kuroganemaru',
      x: 0,
      z: 68,
      yaw: Math.PI,
      arena: { x: 0, z: 62, r: 16.5 },
      trigger: { x: 0, z: 62, r: 12 },
      gate: { x: 0, z: 45.5, width: 8, yaw: 0 },
    },
    ambient: { kind: 'ash', color: 0xb8b0b0, count: 260, size: 0.16, rate: 30, radius: 20, yMin: 2, yMax: 12, vy: -0.6, wind: 0.3, wander: 0.4, life: 9 },
    env: {
      skyTop: 0x47645a,
      skyBottom: 0xe0dcb0,
      fogColor: 0xa8b894,
      fogNear: 14,
      fogFar: 85,
      sunColor: 0xfff0c0,
      sunIntensity: 2.0,
      sunDir: [0.4, 0.8, 0.3],
      hemiSky: 0xd0f0c0,
      hemiGround: 0x4a5a3a,
      hemiIntensity: 1.0,
      lanternIntensity: 1.5,
    },
    music: 'field',
    tier: 2,
  });
}

// =================================================================== Marsh

export function buildMarsh(): AreaBuild {
  const causeways: PathSpec[] = [
    { points: [[-66, 0], [-40, 0], [0, 0]], width: 4 },
    { points: [[0, 0], [-8, 46]], width: 3.5 },
    { points: [[0, 0], [46, 4]], width: 3.5 },
    { points: [[0, 0], [-4, -46]], width: 3.5 },
    { points: [[-8, 46], [34, 46]], width: 3.5 },
    { points: [[46, 4], [36, 40]], width: 3.5 },
  ];
  const islands = [
    { x: -60, z: 0, r: 11 },
    { x: 0, z: 0, r: 10 },
    { x: -8, z: 46, r: 8 },
    { x: 46, z: 4, r: 8 },
    { x: -4, z: -46, r: 8 },
    { x: 34, z: 44, r: 9 },
  ];
  const waterLevel = -0.25;
  const spec: TerrainSpec = {
    size: 160,
    segments: 120,
    seed: 37,
    amp: 0.5,
    freq: 0.06,
    base: -0.7,
    flats: islands.map((i) => ({ x: i.x, z: i.z, r: i.r, h: 0.35, fall: 4 })),
    paths: causeways,
    pathFlatten: 0,
    extra: (x, z) => {
      const pd = pathDistance(causeways, x, z);
      return (1 - smoothstep(1.4, 2.6, pd.d)) * 0.95;
    },
    colorA: 0x4a6a4a,
    colorB: 0x5a6a42,
    pathColor: 0x8a8578,
  };
  const heightAt = makeHeightFn(spec);
  const walkable = (x: number, z: number) => Math.hypot(x, z - 2) < 74 && !(x > 22 && z > 52);
  const b = new AreaBuilder(heightAt, 303);
  b.group.add(buildGround(spec, heightAt));

  // Water plane
  const water = new THREE.Mesh(new THREE.PlaneGeometry(170, 170, 1, 1), toon(0x3a6a7a, { transparent: true, opacity: 0.72 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterLevel;
  water.receiveShadow = true;
  b.group.add(water);
  for (const i of islands.slice(1)) {
    const pads = P.lilyPads(b.rng, 10, 6);
    pads.position.set(i.x + i.r + 3, waterLevel + 0.02, i.z);
    b.group.add(pads);
  }

  // Reeds everywhere in the shallows
  const reeds: { x: number; y: number; z: number; s: number }[] = [];
  b.scatter(420, -75, 75, -75, 75, (x, z) => pathDistance(causeways, x, z).d < 3 || islands.some((i) => inCircle(x, z, i.x, i.z, i.r - 1)), (x, z) => reeds.push({ x, y: heightAt(x, z), z, s: 1 + b.rng.next() }));
  b.group.add(P.tufts(reeds, 0x7a8a4a, 1.2));
  // Willows and dead trees on the edges
  b.scatter(40, -78, 78, -78, 78, (x, z) => Math.hypot(x, z) < 62, (x, z) => b.tree(b.rng.chance(0.6) ? 'willow' : 'dead', x, z, 1 + b.rng.next() * 0.5));
  for (const i of islands.slice(1)) {
    b.tree(b.rng.chance(0.5) ? 'willow' : 'dead', i.x + i.r * 0.6, i.z - i.r * 0.6, 1.1);
  }
  // Boundary cliffs (big rocks in a ring)
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    const x = Math.cos(a) * 76;
    const z = 2 + Math.sin(a) * 76;
    if (Math.abs(x + 72) < 6 && Math.abs(z) < 6) continue;
    b.rock(x, z, 3 + b.rng.next() * 2, 0x4a4a52, false);
  }

  // Ibuki's dock
  b.place(P.dock(8), -54, 9, Math.PI / 2);
  b.box(-54, 9, 8, 2.4, 1);
  b.place(P.wayshrine(), -61, -6);
  b.circle(-61, -6, 0.8);
  b.place(P.lanternPost(0x6fd8ff), -63, 4, 0);

  // Central ruins
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const h = 2 + b.rng.next() * 3;
    b.place(P.pillar(h, 0.5, 0x7a7680), Math.cos(a) * 7, Math.sin(a) * 7);
    b.circle(Math.cos(a) * 7, Math.sin(a) * 7, 0.6, h);
  }

  // Braziers are interactables; place stone platforms under them.
  for (const [x, z] of [[-8, 46], [46, 4], [-4, -46]]) {
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.4, 8), toon(0x6a6670));
    b.place(plat, x, z, 0, 0.1);
  }

  // Catacomb entrance carved into a cliff.
  const cliff = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const r = P.rock(b.rng, 4 + b.rng.next() * 2, 0x4a4652);
    r.position.set(-14 + k * 3.5, 2, 4 + b.rng.next() * 2);
    cliff.add(r);
  }
  b.place(cliff, 34, 50);
  b.box(34, 55, 34, 5, 8);
  const doorFrame = P.torii(5, 5, 0x3a2a3a);
  b.place(doorFrame, 34, 51);
  const doors = P.gateDoors(4.4, 4.6, 0x2a2228);
  doors.name = 'catacombDoors';
  b.place(doors, 34, 51.4);
  b.box(34, 51.8, 5, 1, 5, 'catacombDoor');

  b.group.add(P.horizon(170, 0x2a3a42, b.rng, 26));
  hinoyamaBackdrop(b, -40, 200, 1.3);
  b.animators.push((t) => {
    water.position.y = waterLevel + Math.sin(t * 0.7) * 0.03;
  });

  return finish('marsh', b, {
    size: 160,
    heightAt,
    walkable,
    spawns: {
      from_village: { x: -64, z: 0, yaw: Math.PI / 2 },
      from_catacombs: { x: 34, z: 46, yaw: Math.PI },
      shrine: { x: -60, z: -3, yaw: Math.PI / 2 },
    },
    markers: {
      exit_village: { x: -71, z: 0, r: 4 },
      exit_catacombs: { x: 34, z: 49, r: 3 },
      brazier_n: { x: -8, z: 46, r: 3 },
      brazier_e: { x: 46, z: 4, r: 3 },
      brazier_s: { x: -4, z: -46, r: 3 },
    },
    exits: [
      { id: 'exit_village', x: -72, z: 0, r: 3.5, to: 'village', spawn: 'from_marsh', label: 'Akari Village' },
      { id: 'exit_catacombs', x: 34, z: 50, r: 2.4, to: 'catacombs', spawn: 'from_marsh', label: 'Hollow Catacombs', requires: { flag: 'catacombs_open' }, lockedText: 'The stone doors are sealed. Three braziers must burn.' },
    ],
    interactables: [
      { id: 'marsh_shrine', kind: 'wayshrine', x: -61, z: -6 },
      { id: 'brazier_n', kind: 'brazier', x: -8, z: 46 },
      { id: 'brazier_e', kind: 'brazier', x: 46, z: 4 },
      { id: 'brazier_s', kind: 'brazier', x: -4, z: -46 },
      { id: 'marsh_chest_1', kind: 'chest', x: 3, z: 4, yaw: Math.PI, loot: { coins: 60, equipmentTier: 3, rarityLuck: 0.3 } },
      { id: 'marsh_chest_2', kind: 'chest', x: 49, z: 8, yaw: -Math.PI / 2, loot: { coins: 50, items: [{ id: 'hollow_essence', qty: 1 }, { id: 'spirit_ore', qty: 4 }] } },
      { id: 'marsh_chest_3', kind: 'chest', x: -2, z: -50, yaw: 0, loot: { coins: 50, items: [{ id: 'dango', qty: 3 }], equipmentTier: 3 } },
    ],
    npcs: [{ id: 'ibuki', x: -56, z: 5, yaw: Math.PI / 2 }],
    enemies: [
      { id: 'm_sent1', enemy: 'stone_sentinel', x: 2, z: -3, level: 4 },
      { id: 'm_lurk1', enemy: 'bog_lurker', x: -6, z: 4, level: 4 },
      { id: 'm_lurk2', enemy: 'bog_lurker', x: -20, z: 1, level: 4 },
      { id: 'm_wisp1', enemy: 'ember_wisp', x: -30, z: 6, level: 4 },
      { id: 'm_lurk3', enemy: 'bog_lurker', x: -10, z: 42, level: 4 },
      { id: 'm_lurk4', enemy: 'bog_lurker', x: -4, z: 48, level: 4 },
      { id: 'm_wisp2', enemy: 'ember_wisp', x: -12, z: 30, level: 4 },
      { id: 'm_sent2', enemy: 'stone_sentinel', x: 43, z: 6, level: 5 },
      { id: 'm_wisp3', enemy: 'ember_wisp', x: 30, z: 2, level: 4 },
      { id: 'm_wisp4', enemy: 'ember_wisp', x: 48, z: -2, level: 4 },
      { id: 'm_sent3', enemy: 'stone_sentinel', x: -2, z: -42, level: 5 },
      { id: 'm_lurk5', enemy: 'bog_lurker', x: -7, z: -40, level: 4 },
      { id: 'm_fox1', enemy: 'shade_fox', x: 2, z: -28, level: 4 },
      { id: 'm_fox2', enemy: 'shade_fox', x: 30, z: 42, level: 5 },
      { id: 'm_fox3', enemy: 'shade_fox', x: 38, z: 40, level: 5 },
      { id: 'm_wisp5', enemy: 'ember_wisp', x: 15, z: 46, level: 5 },
    ],
    ambient: { kind: 'fireflies', color: 0xd8ff7a, count: 160, size: 0.22, rate: 14, radius: 22, yMin: 0.5, yMax: 4, vy: 0.05, wind: 0, wander: 0.8, life: 7 },
    env: {
      skyTop: 0x1a3040,
      skyBottom: 0x8ab4b0,
      fogColor: 0x7a9ea2,
      fogNear: 10,
      fogFar: 78,
      sunColor: 0xc8e0ff,
      sunIntensity: 1.4,
      sunDir: [0.3, 0.7, -0.5],
      hemiSky: 0xa0d0e0,
      hemiGround: 0x2a3a3a,
      hemiIntensity: 1.0,
      lanternIntensity: 2.2,
    },
    music: 'marsh',
    tier: 3,
    water: { level: waterLevel, slow: 0.72 },
  });
}

// =================================================================== Catacombs (dungeon)

export function buildCatacombs(): AreaBuild {
  // Rooms and corridors as axis-aligned rectangles [minX, maxX, minZ, maxZ].
  const rects: [number, number, number, number][] = [
    [-7, 7, -7, 7], // A entry
    [-2.5, 2.5, 6, 24], // A->B corridor
    [-10, 10, 23, 41], // B hall
    [9, 23, 29.5, 34.5], // B->C corridor
    [22, 38, 24, 40], // C east room
    [-23, -9, 29.5, 34.5], // B->D corridor
    [-38, -22, 24, 40], // D west room
    [-3, 3, 40, 53], // B->E corridor (sealed door at z=46)
    [-17, 17, 52, 86], // E boss arena
  ];
  const heightAt = () => 0;
  const walkable = (x: number, z: number) => rects.some(([a, b2, c, d]) => x > a && x < b2 && z > c && z < d);
  const b = new AreaBuilder(heightAt, 404);

  // Tile the floor and wall up the edges using a 2 m grid.
  const cell = 2;
  const minX = -40;
  const maxX = 40;
  const minZ = -10;
  const maxZ = 88;
  const floorCells: [number, number][] = [];
  const wallSegs: { x: number; z: number; horiz: boolean }[] = [];
  const isWalk = (cx: number, cz: number) => walkable(cx + cell / 2, cz + cell / 2);
  for (let x = minX; x < maxX; x += cell) {
    for (let z = minZ; z < maxZ; z += cell) {
      if (!isWalk(x, z)) continue;
      floorCells.push([x + cell / 2, z + cell / 2]);
      if (!isWalk(x - cell, z)) wallSegs.push({ x, z: z + cell / 2, horiz: false });
      if (!isWalk(x + cell, z)) wallSegs.push({ x: x + cell, z: z + cell / 2, horiz: false });
      if (!isWalk(x, z - cell)) wallSegs.push({ x: x + cell / 2, z, horiz: true });
      if (!isWalk(x, z + cell)) wallSegs.push({ x: x + cell / 2, z: z + cell, horiz: true });
    }
  }
  const floorGeo = new THREE.BoxGeometry(cell * 0.98, 0.2, cell * 0.98);
  const floor = new THREE.InstancedMesh(floorGeo, toon(0x4a4652), floorCells.length);
  const m = new THREE.Matrix4();
  floorCells.forEach(([x, z], i) => {
    const shade = ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) * 0.04;
    m.makeTranslation(x, -0.1 - shade, z);
    floor.setMatrixAt(i, m);
  });
  floor.receiveShadow = true;
  b.group.add(floor);
  const wallH = 5;
  const wallGeo = new THREE.BoxGeometry(cell + 0.6, wallH, 0.8);
  const walls = new THREE.InstancedMesh(wallGeo, toon(0x3a3640), wallSegs.length);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  wallSegs.forEach((w, i) => {
    q.setFromAxisAngle(up, w.horiz ? 0 : Math.PI / 2);
    m.compose(new THREE.Vector3(w.x, wallH / 2, w.z), q, new THREE.Vector3(1, 1, 1));
    walls.setMatrixAt(i, m);
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  b.group.add(walls);
  // Wall trim
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(cell + 0.7, 0.3, 1.0), toon(0x6a2a3a), wallSegs.length);
  wallSegs.forEach((w, i) => {
    q.setFromAxisAngle(up, w.horiz ? 0 : Math.PI / 2);
    m.compose(new THREE.Vector3(w.x, wallH, w.z), q, new THREE.Vector3(1, 1, 1));
    trim.setMatrixAt(i, m);
  });
  b.group.add(trim);

  // Torches on some walls
  const fires: THREE.Object3D[] = [];
  wallSegs.forEach((w, i) => {
    if (i % 9 !== 0) return;
    const t = P.torch();
    const dirIn = w.horiz ? (walkable(w.x, w.z + 0.5) ? 1 : -1) : walkable(w.x + 0.5, w.z) ? 1 : -1;
    t.position.set(w.horiz ? w.x : w.x + dirIn * 0.5, 2.2, w.horiz ? w.z + dirIn * 0.5 : w.z);
    b.group.add(t);
    fires.push(t.getObjectByName('fire')!);
  });
  b.animators.push((t) => fires.forEach((f, i) => f.scale.set(1, 1 + Math.sin(t * 12 + i) * 0.25, 1)));
  for (const [x, z] of [[0, 0], [0, 32], [30, 32], [-30, 32], [0, 62], [0, 78]]) b.pointLight(x, 4, z, 0xff9a5a, 9, 22);

  // Graves, pillars, webs
  for (const [x, z] of [[-5, 26], [5, 26], [-5, 38], [5, 38]]) {
    b.place(P.pillar(5, 0.6, 0x4a4652), x, z);
    b.circle(x, z, 0.7, 5);
  }
  b.scatter(18, 23, 37, 25, 39, (x, z) => Math.hypot(x - 34, z - 36) < 3, (x, z) => b.place(P.grave(b.rng), x, z, b.rng.next() * 0.5));
  b.scatter(18, -37, -23, 25, 39, (x, z) => Math.hypot(x + 34, z - 36) < 3, (x, z) => b.place(P.grave(b.rng), x, z, b.rng.next() * 0.5));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.place(P.pillar(6, 0.8, 0x4a4652), Math.cos(a) * 12, 69 + Math.sin(a) * 12);
    b.circle(Math.cos(a) * 12, 69 + Math.sin(a) * 12, 0.9, 6);
  }
  const webMat = basic(0xe8e0f0, { transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  for (let k = 0; k < 10; k++) {
    const web = new THREE.Mesh(new THREE.CircleGeometry(2 + b.rng.next() * 2, 8), webMat);
    web.position.set(b.rng.range(-15, 15), 3 + b.rng.next() * 2, b.rng.range(55, 84));
    web.rotation.set(b.rng.next(), b.rng.next() * 3, 0);
    b.group.add(web);
  }
  // Stairs up to the marsh
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.8), toon(0x5a5660));
    step.position.set(0, 0.15 + i * 0.3, -5.6 - i * 0.3);
    b.group.add(step);
  }
  // Sealed door to the boss arena
  const door = P.gateDoors(6, 5, 0x2a2228);
  door.name = 'bossDoor';
  b.place(door, 0, 46);
  b.box(0, 46, 6, 1, 5, 'bossDoor');
  // Seal stones
  b.place(P.wayshrine(), 4, 3, -Math.PI / 2);
  b.circle(4, 3, 0.8);

  return finish('catacombs', b, {
    size: 100,
    heightAt,
    walkable,
    indoor: true,
    spawns: {
      from_marsh: { x: 0, z: -3, yaw: 0 },
      shrine: { x: 2, z: 1, yaw: 0 },
      arena: { x: 0, z: 50, yaw: 0 },
    },
    markers: {
      exit_marsh: { x: 0, z: -6, r: 2 },
      seal_east: { x: 34, z: 36, r: 2 },
      seal_west: { x: -34, z: 36, r: 2 },
      widow_arena: { x: 0, z: 69, r: 15 },
    },
    exits: [{ id: 'exit_marsh', x: 0, z: -6.3, r: 1.8, to: 'marsh', spawn: 'from_catacombs', label: 'Mistfen Marsh' }],
    interactables: [
      { id: 'cat_shrine', kind: 'wayshrine', x: 4, z: 3 },
      { id: 'seal_east', kind: 'seal', x: 34, z: 36 },
      { id: 'seal_west', kind: 'seal', x: -34, z: 36 },
      { id: 'cat_chest_1', kind: 'chest', x: 35, z: 27, yaw: -Math.PI / 2, loot: { coins: 90, equipmentTier: 3, rarityLuck: 0.6 } },
      { id: 'cat_chest_2', kind: 'chest', x: -35, z: 27, yaw: Math.PI / 2, loot: { coins: 80, items: [{ id: 'hollow_essence', qty: 2 }, { id: 'dango', qty: 2 }] } },
    ],
    npcs: [],
    enemies: [
      { id: 'c_sp1', enemy: 'spiderling', x: -4, z: 30, level: 6 },
      { id: 'c_sp2', enemy: 'spiderling', x: 4, z: 31, level: 6 },
      { id: 'c_sp3', enemy: 'spiderling', x: 0, z: 35, level: 6 },
      { id: 'c_sp4', enemy: 'spiderling', x: -3, z: 36, level: 6 },
      { id: 'c_aco1', enemy: 'masked_acolyte', x: 0, z: 38, level: 5 },
      { id: 'c_sent1', enemy: 'stone_sentinel', x: 30, z: 34, level: 6 },
      { id: 'c_lurk1', enemy: 'bog_lurker', x: 27, z: 28, level: 6 },
      { id: 'c_lurk2', enemy: 'bog_lurker', x: 33, z: 29, level: 6 },
      { id: 'c_aco2', enemy: 'masked_acolyte', x: -30, z: 35, level: 6 },
      { id: 'c_aco3', enemy: 'masked_acolyte', x: -27, z: 28, level: 5 },
      { id: 'c_sp5', enemy: 'spiderling', x: -32, z: 30, level: 6 },
      { id: 'c_sp6', enemy: 'spiderling', x: -28, z: 32, level: 6 },
      { id: 'c_sp7', enemy: 'spiderling', x: -30, z: 27, level: 6 },
    ],
    boss: {
      enemy: 'itomaru',
      x: 0,
      z: 76,
      yaw: Math.PI,
      arena: { x: 0, z: 69, r: 15 },
      trigger: { x: 0, z: 66, r: 11 },
      gate: { x: 0, z: 52.5, width: 6, yaw: 0 },
    },
    ambient: { kind: 'motes', color: 0x8ab0ff, count: 140, size: 0.18, rate: 10, radius: 16, yMin: 0.3, yMax: 4, vy: 0.1, wind: 0, wander: 0.3, life: 8 },
    env: {
      skyTop: 0x050409,
      skyBottom: 0x0d0a14,
      fogColor: 0x0d0a14,
      fogNear: 8,
      fogFar: 42,
      sunColor: 0x8a8ab0,
      sunIntensity: 0.6,
      sunDir: [0.2, 1, 0.3],
      hemiSky: 0x6a6a9a,
      hemiGround: 0x1a1420,
      hemiIntensity: 0.9,
      lanternIntensity: 5,
    },
    music: 'dungeon',
    tier: 3,
  });
}

// =================================================================== Summit

export function buildSummit(): AreaBuild {
  const path: PathSpec = { points: [[0, -78], [0, -52], [-24, -36], [-20, -12], [20, 4], [16, 24], [0, 36], [0, 44]], width: 8 };
  const sideA: PathSpec = { points: [[-24, -36], [-36, -28]], width: 6 };
  const sideB: PathSpec = { points: [[20, 4], [32, 12]], width: 6 };
  const paths = [path, sideA, sideB];
  const plateau = { x: 0, z: 58, r: 21 };
  const climb = (z: number) => 24 * smoothstep(-70, 40, z);
  const spec: TerrainSpec = {
    size: 170,
    segments: 120,
    seed: 51,
    amp: 3,
    freq: 0.05,
    base: 0,
    flats: [
      { x: plateau.x, z: plateau.z, r: plateau.r, h: climb(40) + 0.5, fall: 6 },
      { x: 0, z: -70, r: 8, h: 0, fall: 5 },
    ],
    paths,
    pathFlatten: 0.85,
    extra: (x, z) => {
      const pd = pathDistance(paths, x, z).d;
      const cliff = smoothstep(5, 14, pd) * 9 * (Math.hypot(x - plateau.x, z - plateau.z) > plateau.r + 3 ? 1 : 0);
      return climb(z) + cliff;
    },
    colorA: 0x5a5060,
    colorB: 0x6a5a62,
    pathColor: 0x9a8a80,
  };
  const heightAt = makeHeightFn(spec);
  const walkable = (x: number, z: number) => pathDistance(paths, x, z).d < 4.5 || inCircle(x, z, plateau.x, plateau.z, plateau.r) || inCircle(x, z, -36, -28, 6) || inCircle(x, z, 32, 12, 6);
  const b = new AreaBuilder(heightAt, 505);
  b.group.add(buildGround(spec, heightAt));

  // Rocks and dead trees lining the trail
  b.scatter(160, -80, 80, -80, 80, (x, z) => walkable(x, z) || pathDistance(paths, x, z).d > 16, (x, z) => {
    if (b.rng.chance(0.35)) b.tree('dead', x, z, 1 + b.rng.next() * 0.5, false);
    else b.rock(x, z, 1 + b.rng.next() * 2.5, 0x4a4250, false);
  });
  // Entrance torii and wayshrine
  b.place(P.torii(6, 5, 0x8a2a5a), 0, -70);
  b.place(P.wayshrine(), 5, -66, -Math.PI / 2);
  b.circle(5, -66, 0.8);
  // Lantern posts up the trail (unlit, ominous violet)
  for (let i = 1; i < path.points.length - 1; i++) {
    const [x, z] = path.points[i];
    b.place(P.lanternPost(0x8a4aff), x + 3.5, z, 0);
    b.circle(x + 3.5, z, 0.3);
  }
  // Summit plateau: ring of broken pillars and the Spirit Lantern
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.4) continue;
    const h = 2 + b.rng.next() * 4;
    b.place(P.pillar(h, 0.7, 0x5a5660), plateau.x + Math.cos(a) * 19, plateau.z + Math.sin(a) * 19);
    b.circle(plateau.x + Math.cos(a) * 19, plateau.z + Math.sin(a) * 19, 0.9, h);
  }
  const lantern = P.spiritLantern();
  lantern.name = 'spiritLantern';
  b.place(lantern, 0, 74, 0);
  b.circle(0, 74, 3.8, 10);
  b.pointLight(0, 9, 74, 0xffc070, 0, 60).name = 'lanternLight';
  b.group.add(P.horizon(170, 0x2a1a30, b.rng, 40, true));

  return finish('summit', b, {
    size: 170,
    heightAt,
    walkable,
    spawns: {
      from_village: { x: 0, z: -67, yaw: 0 },
      shrine: { x: 3, z: -64, yaw: 0 },
      arena: { x: 0, z: 40, yaw: 0 },
    },
    markers: {
      exit_village: { x: 0, z: -74, r: 4 },
      summit_top: { x: 0, z: 44, r: 6 },
      lantern: { x: 0, z: 70, r: 4 },
    },
    exits: [{ id: 'exit_village', x: 0, z: -75, r: 3.5, to: 'village', spawn: 'from_summit', label: 'Akari Village' }],
    interactables: [
      { id: 'summit_shrine', kind: 'wayshrine', x: 5, z: -66 },
      { id: 'lantern', kind: 'lantern', x: 0, z: 69.5, requires: { active: 'mq_summit:3' } },
      { id: 'summit_chest_1', kind: 'chest', x: -37, z: -29, yaw: Math.PI / 2, loot: { coins: 120, equipmentTier: 4, rarityLuck: 0.5 } },
      { id: 'summit_chest_2', kind: 'chest', x: 33, z: 13, yaw: -Math.PI / 2, loot: { coins: 100, items: [{ id: 'hollow_essence', qty: 3 }, { id: 'dango', qty: 3 }] } },
    ],
    npcs: [],
    enemies: [
      { id: 's_aco1', enemy: 'masked_acolyte', x: -2, z: -48, level: 7 },
      { id: 's_fox1', enemy: 'shade_fox', x: -20, z: -38, level: 7 },
      { id: 's_fox2', enemy: 'shade_fox', x: -24, z: -32, level: 7 },
      { id: 's_sent1', enemy: 'stone_sentinel', x: -18, z: -14, level: 7 },
      { id: 's_wisp1', enemy: 'ember_wisp', x: -10, z: -10, level: 7 },
      { id: 's_wisp2', enemy: 'ember_wisp', x: 6, z: -2, level: 7 },
      { id: 's_aco2', enemy: 'masked_acolyte', x: 18, z: 6, level: 7 },
      { id: 's_imp1', enemy: 'ashen_imp', x: 17, z: 20, level: 8 },
      { id: 's_imp2', enemy: 'ashen_imp', x: 14, z: 24, level: 8 },
      { id: 's_lurk1', enemy: 'bog_lurker', x: 4, z: 34, level: 7 },
      { id: 's_aco3', enemy: 'masked_acolyte', x: -4, z: 36, level: 7 },
    ],
    boss: {
      enemy: 'yomikage',
      x: 0,
      z: 62,
      yaw: Math.PI,
      arena: { x: 0, z: 58, r: 20 },
      trigger: { x: 0, z: 52, r: 14 },
      gate: { x: 0, z: 38, width: 9, yaw: 0 },
    },
    ambient: { kind: 'embers', color: 0xff8a4a, count: 200, size: 0.2, rate: 20, radius: 20, yMin: 0, yMax: 6, vy: 0.8, wind: 0.6, wander: 0.5, life: 6 },
    env: {
      skyTop: 0x150c28,
      skyBottom: 0xb04a5a,
      fogColor: 0x6a3a5a,
      fogNear: 22,
      fogFar: 120,
      sunColor: 0xff9a8a,
      sunIntensity: 1.6,
      sunDir: [-0.4, 0.4, 0.8],
      hemiSky: 0xb08ad0,
      hemiGround: 0x3a2030,
      hemiIntensity: 1.0,
      lanternIntensity: 2,
      stars: true,
      moon: true,
    },
    music: 'summit',
    tier: 4,
  });
}

export const AREA_BUILDERS: Record<AreaId, () => AreaBuild> = {
  village: buildVillage,
  bamboo: buildBamboo,
  marsh: buildMarsh,
  catacombs: buildCatacombs,
  summit: buildSummit,
};
