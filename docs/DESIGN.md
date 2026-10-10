# Lanternbound: Embers of Hinoyama — Design & Development Plan

An original third-person action RPG set in a folklore-inspired mountain valley.
It borrows only *broad genre ideas* (weapon-based action combat, loot,
progression, quests, a yokai-flavoured setting). All names, characters, story,
maps, dialogue, art, music and code are original to this project. The game is
not affiliated with or endorsed by the makers of any other game.

## 1. Engine decision (blocker and alternative)

The brief asked for Unreal Engine. In the development environment:

* Unreal Engine is **not installed**. Installing it legitimately needs an Epic
  Games account sign-in and EULA acceptance (credentials we are not permitted
  to use), roughly 100 GB of disk, and a GPU desktop session for the editor. The
  build machine is a headless Linux container with no GPU.
* The player's own PC (and their installed copy of the reference game) is not
  reachable from the build machine.

**Chosen alternative:** a 3D engine built on **Three.js (MIT) + TypeScript**,
bundled with Vite into **one self-contained HTML file** that runs offline in any
modern desktop browser (Chrome, Edge, Firefox). This lets every feature be
built, run, and *tested automatically* here: unit tests (Vitest) and scripted
playthroughs in headless Chromium (Playwright, software WebGL).

Gameplay logic (stats, combat math, loot, inventory, quests, dialogue, saves,
input bindings) is kept in pure TypeScript modules with no rendering
dependency, so it maps cleanly onto an Unreal port (see §9).

## 2. Pillars

1. **Fast, readable combat.** Every enemy attack has a wind-up and a visible
   ground telegraph. Dodge has invulnerability frames. Hit-stop, knockback and
   camera shake make hits feel heavy.
2. **Weapon identity.** Five weapon families with their own combos, heavy
   attacks and spirit abilities. You carry two and can swap mid-fight.
3. **Steady progression.** Levels, skill ranks, randomized loot with
   rarity and affixes, and blacksmith upgrades.
4. **A short, complete story.** A hub, two open combat areas, a dungeon and
   a summit finale, with three bosses and an ending.

## 3. Setting & story

The **Spirit Lantern** on Mount Hinoyama guides the souls of the departed across
the Veil. A masked spirit, **Yomikage the Hollow Mask**, shatters it to keep
every soul for itself. The three **Ember Cores** scatter, and lost souls curdle
into the *Hollowed*: ash imps, ember wisps, stone sentinels and worse.

The player is a newly sworn **Lantern Warden** of **Akari Village**. Elder
**Tsugumi** sends them to recover the Ember Cores:

| Act | Area | Goal | Boss |
|-----|------|------|------|
| Prologue | Akari Village (hub) | Training, meet the villagers | — |
| I | Sasagiri Bamboo Grove | Drive out the ash imps, reclaim Core I | **Kuroganemaru, the Iron-Gate Oni** |
| II | Mistfen Marsh → Hollow Catacombs (dungeon) | Relight three marsh braziers, descend, reclaim Core II | **Itomaru, the Silk Widow** |
| III | Hinoyama Summit | Climb to the broken Lantern | **Yomikage, the Hollow Mask** (3 phases) |
| Ending | Summit / Village | Relight the Lantern, credits | — |

Supporting cast: blacksmith **Kanetsugu**, tea-house keeper and merchant
**Ohana**, shrine keeper **Mikoto** (skill training), ferryman **Ibuki**, a lost
child spirit **Hotaru**, and **Kohaku**, a fox spirit who joins as an AI ally.

## 4. Systems

* **Movement:** walk/run/sprint, dodge-roll with i-frames, stamina.
* **Camera:** orbit third-person camera with collision-free framing, adjustable
  sensitivity/invert/FOV, and **lock-on** with target cycling.
* **Combat:** data-defined attacks (wind-up / active / recovery, range, arc,
  lunge, knockback, poise damage). Combo buffering, heavy attacks, spirit
  abilities, weapon swap, hit-stop, crits, status effects (burn, slow, bleed).
* **Weapons:** Katana, Naginata, Twin Tanto, Kanabo, Spirit Bow.
* **Enemies:** 7 regular archetypes with distinct behaviours plus 3 bosses with
  phase-based patterns. Attack-token system limits simultaneous attackers.
* **Progression:** XP levels (cap 20), skill points spent at the shrine.
* **Items:** weapons/armor/charms with 5 rarities and random affixes;
  consumables; materials; key items. Blacksmith upgrades (+1…+5), merchant.
* **Quests:** main + side quests, sequential objectives (talk, kill, reach,
  collect, interact, defeat boss), tracker HUD, waypoint marker, rewards.
* **Dialogue:** branching nodes with choices, conditions and actions; shown as
  subtitles with speaker names.
* **Save/Load:** 3 manual slots + autosave, versioned schema, checksum,
  validation with safe fallback, backup copy, export/import.
* **Audio:** procedural SFX and an original procedurally-sequenced soundtrack
  (title, village, field, dungeon, boss, finale) using a Japanese *in* scale.
* **Accessibility:** full keyboard + gamepad remapping, mouse & stick
  sensitivity, invert Y, FOV, subtitle size & background, sound captions,
  camera-shake toggle, reduced flashing, high-contrast telegraphs, hold/toggle
  lock-on, difficulty (Story / Normal / Hard), damage-number toggle.

## 5. Visual target

Stylised "ink-and-lantern" cel shading: toon materials with a 3-band ramp,
dark inverted-hull outlines on characters, dusky indigo skies, vermilion torii
and warm lantern glow, drifting petals and fireflies, distance fog for depth.
All geometry is procedural (built from primitives in code) and all textures are
generated at runtime, so there are no third-party art assets. These are
**polished placeholders**, not final production art — see KNOWN_ISSUES.md.

## 6. Architecture

```
src/
  core/      loop, input (kb/mouse/gamepad + remap), audio, music, storage, settings, events, rng, math
  data/      weapons, items, enemies, skills, quests, dialogue (pure data)
  systems/   stats, combat math, inventory, loot, progression, quests, dialogue runner, save codec (pure logic)
  render/    toon materials, procedural models, effects (particles, trails, telegraphs)
  world/     area definitions & builders, terrain, collision
  entities/  player, enemies, bosses, NPCs, companion, projectiles, pickups, interactables
  ui/        HUD, menus, screens, icons, styles
  game.ts    state machine + orchestration
  main.ts    entry point
tests/unit   Vitest tests for every pure system and data integrity
tests/e2e    Playwright tests: boot, menus, real-input combat, quests, save/load, full playthrough
```

The simulation runs at a fixed 60 Hz step. Tests can advance it frame-by-frame
via a debug hook (`window.__lanternbound`), which is only present to drive
automated tests and dev tooling.

**Co-op readiness (not implemented):** all gameplay mutations flow through the
`Game` orchestrator and pure systems keyed by actor id; player input is read
through an `InputState` snapshot per actor. A future netcode layer could
replicate the snapshot + authoritative state. The game is **single-player
only**; no networking is implemented or simulated.

## 7. Milestones

| # | Milestone | Verification |
|---|-----------|--------------|
| M0 | Scaffold, toolchain, plan | build + WebGL smoke test |
| M1 | Loop, input, camera, movement, dodge | unit + e2e movement |
| M2 | Combat, weapons, enemies, drops | unit combat math + e2e real-input hits |
| M3 | Progression, inventory, equipment, upgrades, shop | unit + e2e UI |
| M4 | Quests, dialogue, NPCs, hub & areas, tutorial | unit + e2e quest flow |
| M5 | Dungeon, bosses, ending, credits | e2e boss fights by bot |
| M6 | Audio/music, menus, settings, accessibility, save/load | unit + e2e |
| M7 | Polish, full playthrough, single-file build, docs | full e2e suite |

## 8. Data-driven content

Weapons, enemies, items, skills, quests and dialogue live in `src/data/*.ts`
as typed tables. Balance changes (damage, timings, XP, prices, drop rates) are
edits to those tables; data-integrity unit tests catch broken references.

## 9. Unreal port notes

| This project | Unreal equivalent |
|---|---|
| `data/*.ts` tables | DataTables / Primary Data Assets |
| `systems/*` pure logic | C++ UObject subsystems / GAS attribute sets |
| `entities/Player` state machine | Character + Gameplay Abilities + Anim Montages |
| Telegraph meshes | Decal actors with dynamic material |
| `ui/*` HTML | UMG widgets |
| `core/input` remap | Enhanced Input + user key mappings |
| Save codec | `USaveGame` with versioned struct |
