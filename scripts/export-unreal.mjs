// Exports Lanternbound's game data and area layouts from the web build into
// JSON files read by the Unreal Engine port (unreal/Lanternbound/Content/Data).
// Usage: node scripts/export-unreal.mjs
//
// Coordinates are exported in the web game's convention (metres, Y up,
// yaw 0 = +Z). The C++ side converts them (see LBMath.h).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'unreal/Lanternbound/Content/Data';
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5196/?test=1');
await page.waitForFunction(() => window.__lanternbound);
const raw = await page.evaluate(() => window.__lanternbound.exportData());
const areas = {};
for (const id of ['village', 'bamboo', 'marsh', 'catacombs', 'summit']) {
  areas[id] = await page.evaluate((id) => window.__lanternbound.exportArea(id, 2), id);
}
await browser.close();
await server.close();

const n = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v) => (typeof v === 'string' ? v : '');
const stats = (o) => Object.entries(o ?? {}).map(([Stat, Value]) => ({ Stat, Value }));
const cond = (c) => ({
  Active: s(c?.active),
  ActiveFrom: s(c?.activeFrom),
  Done: s(c?.done),
  NotDone: s(c?.notDone),
  Available: s(c?.available),
  Flag: s(c?.flag),
  NotFlag: s(c?.notFlag),
  Has: s(c?.has),
});
const write = (name, obj) => {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(obj));
  console.log('wrote', name);
};

// ------------------------------------------------------------------ Weapons
const attack = (a) => ({
  Name: a.name,
  Kind: a.kind,
  Pose: a.pose,
  Damage: a.damage,
  Windup: a.windup,
  Active: a.active,
  Recovery: a.recovery,
  ComboWindow: a.comboWindow,
  Range: a.range,
  Arc: a.arc,
  Lunge: a.lunge,
  Knockback: a.knockback,
  Poise: a.poise,
  Stamina: a.stamina,
  Bleed: n(a.bleed),
  ShockwaveRadius: n(a.shockwave?.radius),
  ShockwaveDamage: n(a.shockwave?.damage),
  ProjSpeed: n(a.projectile?.speed),
  ProjCount: n(a.projectile?.count),
  ProjSpread: n(a.projectile?.spread),
  ProjPierce: !!a.projectile?.pierce,
  ProjRadius: n(a.projectile?.radius),
});
write('weapons', {
  Weapons: Object.values(raw.WEAPON_FAMILIES).map((w) => ({
    Type: w.type,
    Name: w.name,
    Description: w.description,
    MoveSpeed: w.moveSpeed,
    Light: w.light.map(attack),
    Heavy: attack(w.heavy),
    Ability: { Kind: w.ability.kind, Name: w.ability.name, Description: w.ability.description, Cost: w.ability.cost, Cooldown: w.ability.cooldown, Damage: w.ability.damage, Radius: w.ability.radius, Duration: w.ability.duration },
  })),
});

// ------------------------------------------------------------------ Items
write('items', {
  Items: Object.values(raw.ITEMS).map((i) => ({
    Id: i.id,
    Name: i.name,
    Kind: i.kind,
    Description: i.description,
    Value: i.value,
    Tier: i.tier,
    WeaponType: s(i.weaponType),
    BaseStats: stats(i.baseStats),
    FixedAffixes: (i.fixedAffixes ?? []).map((a) => ({ Stat: a.stat, Value: a.value })),
    Stackable: !!i.stackable,
    MaxStack: n(i.maxStack, 1),
    UseHeal: n(i.use?.heal),
    UseSpirit: n(i.use?.spirit),
    UseBuffAtk: n(i.use?.buffAtk),
    UseBuffTime: n(i.use?.buffTime),
    FixedRarity: n(i.fixedRarity, -1),
  })),
});

// ------------------------------------------------------------------ Enemies
write('enemies', {
  Enemies: Object.values(raw.ENEMIES).map((e) => ({
    Id: e.id,
    Name: e.name,
    Model: e.model,
    Behavior: e.behavior,
    Hp: e.hp,
    Atk: e.atk,
    Def: e.def,
    Speed: e.speed,
    Radius: e.radius,
    Scale: e.scale,
    Poise: e.poise,
    AggroRange: e.aggroRange,
    Leash: e.leash,
    PreferredRange: n(e.preferredRange),
    Flying: !!e.flying,
    SuperArmor: !!e.superArmor,
    Xp: e.xp,
    CoinsMin: e.coins[0],
    CoinsMax: e.coins[1],
    Drops: e.drops.map((d) => ({ Item: d.item, Chance: d.chance, QtyMin: d.qty ? d.qty[0] : 1, QtyMax: d.qty ? d.qty[1] : 1 })),
    EquipChance: e.equipChance,
    Evade: n(e.evade),
    IsBoss: !!e.boss,
    BossTitle: s(e.boss?.title),
    PhaseThresholds: e.boss?.phaseThresholds ?? [],
    BossMusic: s(e.boss?.music),
    BossReward: e.boss?.reward ?? [],
    Attacks: e.attacks.map((a) => ({
      Id: a.id,
      Name: a.name,
      Kind: a.kind,
      Windup: a.windup,
      Active: a.active,
      Recovery: a.recovery,
      Damage: a.damage,
      Range: a.range,
      MinRange: n(a.minRange),
      Arc: n(a.arc, 90),
      Radius: n(a.radius),
      Cooldown: a.cooldown,
      Weight: a.weight,
      Phase: n(a.phase, 1),
      Count: n(a.count, 1),
      Speed: n(a.speed),
      Spread: n(a.spread),
      StatusType: s(a.status?.type),
      StatusTime: n(a.status?.time),
      SummonEnemy: s(a.summon?.enemy),
      SummonCount: n(a.summon?.count),
      Callout: s(a.callout),
      Interval: n(a.interval),
    })),
  })),
});

// ------------------------------------------------------------------ Quests
const reward = (r) => ({ Id: r.id, Qty: n(r.qty, 1), Rarity: n(r.rarity, -1) });
write('quests', {
  Quests: Object.values(raw.QUESTS).map((q) => ({
    Id: q.id,
    Title: q.title,
    Kind: q.kind,
    Giver: q.giver,
    Summary: q.summary,
    Prereqs: q.prereqs ?? [],
    RequiresFlags: q.requiresFlags ?? [],
    Objectives: q.objectives.map((o) => ({ Type: o.type, Target: o.target, Count: n(o.count, 1), Text: o.text, Area: s(o.area), Waypoint: s(o.waypoint), Consume: !!o.consume, Hint: s(o.hint) })),
    RewardXp: n(q.rewards.xp),
    RewardCoins: n(q.rewards.coins),
    RewardItems: (q.rewards.items ?? []).map(reward),
    RewardFlags: q.rewards.flags ?? [],
    StartItems: (q.startItems ?? []).map(reward),
    Next: q.next ?? [],
  })),
});

// ------------------------------------------------------------------ Dialogue
write('dialogue', {
  Dialogues: Object.values(raw.DIALOGUES).map((d) => ({
    Id: d.id,
    Start: d.start,
    Nodes: Object.entries(d.nodes).map(([id, nd]) => ({
      Id: id,
      Speaker: nd.speaker,
      Text: nd.text,
      Next: s(nd.next),
      Actions: nd.actions ?? [],
      Choices: (nd.choices ?? []).map((c) => ({ Text: c.text, Next: s(c.next), Actions: c.actions ?? [], Cond: cond(c.cond) })),
    })),
  })),
  NpcDialogue: Object.entries(raw.NPC_DIALOGUE).map(([npc, entries]) => ({
    Npc: npc,
    Entries: entries.map((e) => ({ Cond: cond(e.cond), Dialogue: e.dialogue, Quest: s(e.quest), NoTalk: !!e.noTalk })),
  })),
  NpcNames: Object.entries(raw.NPC_NAMES).map(([Id, Name]) => ({ Id, Name })),
  BossLines: Object.entries(raw.BOSS_LINES).map(([Boss, l]) => ({ Boss, Intro: l.intro, Phase: l.phase, Defeat: l.defeat })),
  Ending: raw.ENDING_LINES.map((l) => ({ Speaker: l.speaker, Text: l.text })),
});

// ------------------------------------------------------------------ Skills & shop
write('skills', {
  Skills: raw.SKILLS.map((k) => ({ Id: k.id, Name: k.name, Description: k.description, MaxRank: k.maxRank, PerRank: stats(k.perRank), Special: s(k.special), RequiresLevel: n(k.requiresLevel, 0) })),
  Shop: raw.SHOP_STOCK.map((e) => ({ Item: e.item, Price: e.price, Rarity: n(e.rarity, -1), Requires: cond(e.requires), Once: !!e.once })),
});

// ------------------------------------------------------------------ Areas
for (const [id, a] of Object.entries(areas)) {
  const env = a.env;
  write(`area_${id}`, {
    Id: a.id,
    Name: a.name,
    Size: a.size,
    Indoor: a.indoor,
    GridStep: a.grid.step,
    GridN: a.grid.n,
    GridOrigin: a.grid.origin,
    Heights: a.grid.heights,
    Walkable: a.grid.walkable,
    Colors: a.grid.colors,
    Colliders: a.colliders.map((c) => ({
      Kind: c.kind,
      X: n(c.x),
      Z: n(c.z),
      R: n(c.r),
      MinX: n(c.minX),
      MaxX: n(c.maxX),
      MinZ: n(c.minZ),
      MaxZ: n(c.maxZ),
      H: n(c.h, 3),
      Id: s(c.id),
      Tag: s(c.tag),
    })),
    Spawns: Object.entries(a.spawns).map(([Id, p]) => ({ Id, X: p.x, Z: p.z, Yaw: p.yaw })),
    Markers: Object.entries(a.markers).map(([Id, m]) => ({ Id, X: m.x, Z: m.z, R: m.r })),
    Exits: a.exits.map((e) => ({ Id: e.id, X: e.x, Z: e.z, R: e.r, To: e.to, Spawn: e.spawn, Label: e.label, Requires: cond(e.requires), LockedText: s(e.lockedText) })),
    Interactables: a.interactables.map((i) => ({
      Id: i.id,
      Kind: i.kind,
      X: i.x,
      Z: i.z,
      Yaw: n(i.yaw),
      Requires: cond(i.requires),
      LootCoins: n(i.loot?.coins),
      LootItems: (i.loot?.items ?? []).map((it) => ({ Id: it.id, Qty: n(it.qty, 1), Rarity: -1 })),
      LootEquipTier: n(i.loot?.equipmentTier),
      LootRarityLuck: n(i.loot?.rarityLuck),
    })),
    Npcs: a.npcs.map((p) => ({ Id: p.id, X: p.x, Z: p.z, Yaw: p.yaw, ShowIf: cond(p.showIf) })),
    Enemies: a.enemies.map((e) => ({ Id: e.id, Enemy: e.enemy, X: e.x, Z: e.z, Level: e.level, Respawn: n(e.respawn) })),
    HasBoss: !!a.boss,
    Boss: a.boss
      ? { Enemy: a.boss.enemy, X: a.boss.x, Z: a.boss.z, Yaw: a.boss.yaw, ArenaX: a.boss.arena.x, ArenaZ: a.boss.arena.z, ArenaR: a.boss.arena.r, TriggerX: a.boss.trigger.x, TriggerZ: a.boss.trigger.z, TriggerR: a.boss.trigger.r, GateX: a.boss.gate.x, GateZ: a.boss.gate.z, GateWidth: a.boss.gate.width }
      : {},
    Env: {
      SkyTop: env.skyTop,
      SkyBottom: env.skyBottom,
      FogColor: env.fogColor,
      FogNear: env.fogNear,
      FogFar: env.fogFar,
      SunColor: env.sunColor,
      SunIntensity: env.sunIntensity,
      SunDirX: env.sunDir[0],
      SunDirY: env.sunDir[1],
      SunDirZ: env.sunDir[2],
      HemiSky: env.hemiSky,
      HemiGround: env.hemiGround,
      LanternIntensity: env.lanternIntensity,
    },
    Music: a.music,
    Tier: a.tier,
    HasWater: !!a.water,
    WaterLevel: n(a.water?.level),
    WaterSlow: n(a.water?.slow, 1),
  });
}
console.log('done');
