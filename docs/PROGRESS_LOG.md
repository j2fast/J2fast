# Progress log

Concise record of each milestone, what was verified and what was fixed.

## M0: Inspection and scaffold
* Inspected the environment: an empty repository; headless Linux with no GPU; **no Unreal
  Engine**, which can't be installed without an Epic account login. Node 22,
  npm registry access and Playwright Chromium (SwiftShader WebGL 2) were
  available.
* Decision: Three.js + TypeScript single-file web build (see DESIGN.md §1).
* Verified: headless WebGL2 + WebAudio work; `vite build` produces one HTML file.

## M1–M3: Core, combat, progression (pure systems first)
* Wrote data tables (weapons, items, enemies, skills, quests, dialogue) and
  pure systems (stats, inventory, loot, progression, quests, dialogue, save
  codec, input bindings, settings).
* Verified: 63 unit tests passing, strict TypeScript.

## M4–M6: World, entities, UI, audio
* Procedural toon rendering, five areas, player controller, enemy and boss
  AI with ground telegraphs, projectiles, hazards, companion, pickups, HUD,
  menus, settings, saves, procedural SFX and soundtrack.
* Verified by screenshots of every area in headless Chromium.
* Fixed: masks facing sideways, a tree spawning on the marsh entry point, and
  boss barriers and thin props pulling the camera in.

## M7: Automated play testing
* Added a scripted test bot that plays fights through normal inputs, reading
  telegraphs the same way a player does.
* Found and fixed through tests:
  * Enemies could be stun-locked by fast combos. Reworked poise, flinch
    cooldowns and stagger immunity.
  * The HUD stayed hidden after any conversation.
  * Key presses made in menus leaked into gameplay (a stale Escape opened the
    pause menu on the first frame).
  * "Ore for the Forge" consumed the ore before the hand-in.
  * Weapon swap was ignored during attack recovery; it now cancels recovery.
  * Enemies spawned at runtime shared one id.
* Performance: static batching per material cut draw calls from about 1,100
  to 80–460 per area. Area builds take 40–300 ms.

## M7 (cont.): Full playthrough and balance
* The full-story end-to-end test passes. Playing as a scripted player on Normal
  difficulty, the bot finishes the prologue, all three acts, all three bosses,
  the ending and the credits, then continues into post-game exploration. Run
  summary: Kuroganemaru defeated at Lv 5, Itomaru at Lv 11, Yomikage at Lv 13;
  57 kills, 0 deaths, 7 quests completed.
* Balance: the first runs reached Lv 9 by the end of Act I, so the XP curve was
  steepened (40 + 40·level) and boss/quest XP reduced.
* More fixes found by the playthrough:
  * Pressing interact during an attack's recovery was dropped; it is now buffered.
  * Toast notifications of type "item" inherited the inventory grid's
    square layout (CSS class clash).
  * Boss phase lines repeated on every phase change.
  * Leftover enemies and captions intruded on the ending cutscene; the remaining
    Hollowed now cross over when the Lantern is relit.
* Added ambient villagers whose lines change after the ending, and a
  one-time hint the first time spirit is full.

## Final verification (shipped build)
* `release/Lanternbound.html` is byte-identical to `npm run build` output and
  was verified to run from `file://` (new game, save to slot, no errors, test
  hooks absent without `?test`).
* Unit: 63/63 passed. End-to-end: 26/26 passed on the full-suite run
  before the last polish commit. On the final build, 25/26 passed, with the
  playthrough hitting the intermittent catacomb transition noted in
  KNOWN_ISSUES. Two further playthrough runs on the final build passed.

## M8: Unreal Engine 5.8 port (requested after delivery)
* The user asked for a version that opens in Unreal Engine (they have 5.8.3).
  Unreal still cannot run in this environment, so the port was written as a
  data-driven C++ project that needs no binary assets.
* `scripts/export-unreal.mjs` exports all content (weapons, items, enemies,
  quests, dialogue, skills, shop), area layouts (heights, a 0.5 m walkability
  grid, colliders, spawns, exits, NPCs, enemies, bosses, lights, ambient
  particles) and **the exact scenery meshes** as compact binary files
  (instanced where the web build instances: the bamboo grove went from 26 MB
  to 2.9 MB).
* The C++ port covers the rules, procedural character rigs and poses, player
  combat, enemy and boss AI, projectiles, hazards, pickups, NPCs, the
  companion, quests, dialogue, the ending, every menu, the HUD, remappable
  input, save slots and the synthesised audio.
* Verification so far:
  * all 21 C++ files pass a clang syntax check against stand-in engine
    headers (`unreal/tools/syntaxcheck`). The check found real bugs: mixed
    float/double math and inconsistent smart-pointer use;
  * the joint-rotation mapping was checked numerically against three.js's
    Euler order (max error 6e-16). This led to replacing single `FRotator`
    joints, which were wrong for compound poses, with per-axis component
    chains, and to fixing an inverted roll axis;
  * the binary mesh files decode correctly with a reference decoder.
* Not verified: compiling and running inside Unreal Engine.
* Web build re-verified after adding the export hooks (they are test-mode
  only): typecheck clean, unit tests 63/63, end-to-end 25/25 (the long
  playthrough test was not re-run). `release/Lanternbound.html` was rebuilt
  and checked from `file://` (new game starts, HUD visible, no errors, test
  hooks absent).
