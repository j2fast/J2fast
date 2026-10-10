# Implemented features and how they were verified

Legend: **U** = unit test (Vitest), **E** = end-to-end test in headless
Chromium (Playwright), **S** = checked by screenshot review, **B** = exercised
by the scripted bot during the full playthrough test.

| Area | Feature | Verified |
|---|---|---|
| Movement | Walk/run relative to camera, sprint with stamina, water slows | E (tutorial, gamepad) |
| Movement | Dodge roll with invulnerability frames, backstep with no direction | E (combat: dodge through a telegraphed attack takes no damage) |
| Camera | Orbit camera, mouse/arrow/stick look, sensitivity, invert Y, FOV, collision with walls, shake toggle | E (gamepad right stick), S |
| Targeting | Lock-on, target cycling, auto-face nearby enemy, hold/toggle mode | E (tutorial, combat) |
| Combat | 5 weapon families with combos, heavies, spirit abilities (dash, whirlwind, shadow step, earthshaker, ember rain) | E (one test per weapon family) |
| Combat | Hit-stop, knockback, crits, bleed, burn, poise and stagger, attack tokens | U (damage math), E, B |
| Combat | Weapon swap mid-fight (cancels recovery) | E (tutorial) |
| Combat | Healing items (quick-use and from the menu), Tea Ceremony skill | E (progression) |
| Enemies | 7 types: melee, ranged, skirmisher (evades), heavy (super armour), caster (teleports), swarm, dummy | E, B |
| Enemies | Telegraphs for every attack (cone, line, circle, ring, pillars, dive shadow) with a final-moment flash | E (telegraph appears before damage), S |
| Bosses | Kuroganemaru (2 phases), Itomaru (2 phases), Yomikage (3 phases); intros, phase lines, arena barrier, boss bar | B (all three defeated in the playthrough), S |
| Loot | Coins, materials and equipment drops in 5 rarities with random affixes; chests | U (loot), E |
| Progression | XP and levels (cap 20), skill points, 9 skills at the shrine, skill reset | U, E |
| Equipment | Two weapon slots, armor, charm; stat comparison; upgrades +1 to +5 at the forge | U, E |
| Economy | Merchant buy/sell, limited stock unlocked by story, stack caps | U, E |
| Quests | 4 main and 5 side quests; talk, kill, reach, interact, collect and boss objectives; tracker; waypoint routed across areas | U, E, B |
| Dialogue | Branching choices, conditions, actions (start quest, give/take items, flags, services, rest) | U, E |
| World | Hub village, bamboo grove, marsh, multi-room catacomb dungeon, summit; exits gated by story; wayshrines (rest, save, fast travel) | E, B, S |
| Companion | Kohaku fox spirit joins, follows, attacks, comments; can be turned off | B, E (playthrough) |
| Story | Prologue, 3 acts, ending cutscene, credits, post-game exploration | B (playthrough reaches credits) |
| Save/Load | 3 slots + autosave; checksum; validation; backup fallback; export/import; continue | U, E (incl. corrupted saves) |
| Settings | Persisted settings; difficulty; quality; FPS counter | U, E |
| Accessibility | Remappable keyboard and gamepad, subtitles on/off/size/background, sound captions, high-contrast telegraphs, reduced flashing, camera shake toggle, Story difficulty | U, E |
| Input | Keyboard + mouse, gamepad (standard mapping) for gameplay and menus, device-aware button prompts | E (simulated gamepad) |
| UI | Title, pause, inventory, quest log, skills, shop, forge, wayshrine, save/load, settings, controls, credits, death screens; HUD with minimap | E, S |
| Audio | Procedural SFX (35 cues, positional panning), 9 original music tracks with combat layers | Runs without errors in E; not verified by ear |
| Robustness | WebGL-missing message, storage-unavailable fallback, invalid save handling, autosave on transitions | E, U |
| Performance | Static mesh batching, instancing for foliage, quality presets | Draw calls measured (about 80–460 per area) |
