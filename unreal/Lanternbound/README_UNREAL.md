# Lanternbound: Unreal Engine 5 port

This folder is an Unreal Engine C++ project, a port of the web version of
Lanternbound (the browser game in the repository root). It targets
**Unreal Engine 5.8**. Everything is generated at runtime from data files, so
the project has no `.uasset` content, map or Blueprint you need to open first.

> **Status: written for UE 5.8 but not yet compiled in Unreal.**
> Unreal Engine could not be installed in the environment where the port was
> written, so this code has **never been compiled or run in the engine**.
> What was checked:
>
> * every C++ file passes a syntax check with clang against stand-in engine
>   headers (`unreal/tools/syntaxcheck`), which catches typos and mismatches
>   inside the port;
> * the joint-rotation and coordinate conversions were verified numerically
>   against the web build's math;
> * the exported mesh files decode correctly with a reference decoder.
>
> Expect to fix some compile errors on the first build, mostly where engine
> function signatures differ from what the code assumes. The likely spots are
> listed under [If the build fails](#if-the-build-fails).

## What you need

* Windows 10/11 with **Unreal Engine 5.8** installed from the Epic Games
  Launcher.
* **Visual Studio 2022** with the "Game development with C++" workload
  (or JetBrains Rider), which Unreal needs to compile C++ projects.
* About 3 GB of free disk space for the build intermediates.

## Open and play

1. Right-click `Lanternbound.uproject` and choose **Generate Visual Studio
   project files**. (If you don't see that menu item, open the `.uproject`
   directly; Unreal will offer to build the missing modules. Answer **Yes**.)
2. Open `Lanternbound.sln`, select the **Development Editor / Win64**
   configuration and build (Ctrl+Shift+B). Alternatively, double-click
   `Lanternbound.uproject` and let the editor build it.
3. The editor opens on the engine's empty *Entry* map. That is expected: the
   game builds the world itself.
4. Optional, but recommended once: open the console (backtick key **`**) and
   run `lb.SaveMaterials`. This saves the four vertex-colour materials the game
   uses into `Content/Lanternbound/`. Without them the editor creates the same
   materials in memory each session. **They are required for packaged builds.**
5. Press **Play** (Alt+P). Click inside the viewport so it captures the mouse.
   The title screen appears; choose **New Game**.

### Play-in-editor notes

* In the editor, **Esc stops the play session** (an editor default). Use **P**
  to open the pause menu instead, or change *Editor Preferences → Play →
  Stop play session* to another key.
* **Shift+F1** releases the mouse from the viewport.
* Saves go to `Saved/SaveGames/` (four slots, each with a backup copy).

## Packaging a standalone game

1. Run `lb.SaveMaterials` in the editor at least once (see above).
2. *Platforms → Windows → Package Project*.
3. The JSON and mesh data in `Content/Data` are staged as loose files
   (`DirectoriesToAlwaysStageAsNonUFS` in `Config/DefaultGame.ini`), and the
   materials in `/Game/Lanternbound` are always cooked.

## Controls

These are the same defaults as the web version. All of them can be remapped in
*Settings → Controls*, which has two keyboard/mouse slots and one gamepad slot per
action.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | W A S D | Left stick |
| Camera | Mouse, or arrow keys | Right stick |
| Sprint (hold) | Left Shift | L3 |
| Dodge roll | Space | B |
| Light attack | LMB or J | X or RB |
| Heavy attack | RMB or K | Y or RT |
| Spirit ability | Q | LT |
| Interact / talk / advance dialogue | E | A |
| Use Healing Dango | F | D-pad Up |
| Lock on / release | Middle mouse or Tab | R3 |
| Switch target | Wheel down or T | D-pad Right |
| Swap weapon | R | LB |
| Inventory | I | D-pad Down |
| Quest log | L | Back |
| Pause | Esc or P | Start |

Menus work with the mouse, the keyboard (arrows/WASD, Enter, Esc/Backspace,
Left/Right to change settings) and the gamepad (D-pad/stick, A, B, LB/RB for
tabs). Number keys 1–9 pick dialogue choices.

## How the port works

| Piece | Files |
|---|---|
| Game data (weapons, items, enemies, quests, dialogue, skills, shop, areas), loaded from JSON into `USTRUCT`s | `LBTypes.h`, `LBData.*` |
| Pure rules (stats, damage, inventory, loot, XP, quests, dialogue conditions) ported from `src/systems` | `LBRules.*` |
| Area scenery (exact meshes exported from the web build), lights, sky dome, fog, interactable props, and the web build's 2D movement collision | `LBScene.*`, `LBArea.*` |
| Procedural characters: humanoid and creature rigs with the web build's poses | `LBRig.*`, `LBMeshKit.*` |
| Player, enemies and bosses, projectiles, hazards, pickups, NPCs, companion | `LBEntities.h`, `LBPlayer.cpp`, `LBEnemy.cpp`, `LBMisc.cpp` |
| Game loop, camera, quests, dialogue, bosses, ending, save/load | `LBGame.*`, `LBGameMode.*` |
| Menus (title, pause, inventory, quests, skills, shop, forge, wayshrine, save/load, settings with remapping, controls, credits, death) | `LBGameUI.cpp` |
| Canvas HUD (vitals, minimap, tracker, boss bar, prompts, markers, damage numbers, toasts, captions, dialogue, menus) | `LBHUD.*` |
| Particles, attack telegraphs, shockwaves, weapon trails | `LBFx.*` |
| Input polling and key capture for remapping | `LBPlayerController.*`, `LBSettings.*` |
| Synthesised sound effects and music (rendered to PCM at startup) | `LBAudio.*` |
| Save slots and settings persistence | `LBSave.*`, `LBGameInstance.*` |

Design choices:

* **No pawns or physics.** Characters move with the web build's collision
  (circles and boxes plus a walkability grid), so movement, dodges and enemy
  spacing behave exactly as in the browser. Actors only display the result.
* **No imported art.** `scripts/export-unreal.mjs` runs the web build
  headlessly and writes `Content/Data/*.json` and `*.lbm` (binary meshes with
  vertex colours, instanced where the web build instances). Re-run it after
  changing the web game's content:
  `npm install && node scripts/export-unreal.mjs` (needs Playwright's Chromium).
* Coordinates: the web build uses metres with y up; Unreal uses centimetres
  with z up. The mapping `X = z, Y = -x, Z = y` keeps the layout unmirrored
  (`LBMath.h`).

## Differences from the web version

* **Shading**: standard lit vertex colours, not the web build's three-band
  toon ramp. The ink outlines are kept: they are part of the exported meshes.
* **Particles** are camera-facing quads rebuilt each frame. Weapon trails and
  telegraphs are procedural meshes.
* **Hit flashes** use a short-lived point light on the character, because all
  characters share one material.
* **Audio** is not stereo-panned (volume still falls off with distance).
* Save **export/import to a file** (a browser feature) is not ported; save
  files live in `Saved/SaveGames`.
* The minimap is square rather than round.
* The lighting values (sun, sky light, fog, point lights) are converted from
  the web build's numbers by formula and have not been tuned by eye. Use
  *Settings → Graphics → Brightness* if a scene looks too dark or bright.

## If the build fails

The most likely compile problems are where engine APIs differ between
versions. The code was written against UE 5.x APIs as documented:

* `LBMeshKit.cpp` (editor-only material graph code and `lb.SaveMaterials`):
  `UMaterial::GetEditorOnlyData()`, `GetExpressionCollection()`,
  `UPackage::SavePackage(…, FSavePackageArgs)`. If this block fails, you can
  delete everything inside `#if WITH_EDITOR` in `LBMaterials::Get`. Then create
  `Content/Lanternbound/M_LBLit` by hand (Vertex Color → Base Color, roughness
  0.9) and the game will use it.
* `LBArea.cpp`: light, sky light and fog setters
  (`SetFogInscatteringColor`, `SetFogCutoffDistance`,
  `SetLowerHemisphereColor`, `SetIntensityUnits`).
* `LBAudio.cpp`: `USoundWaveProcedural` (`SetSampleRate`, `QueueAudio`,
  `GetAvailableAudioByteCount`).
* `LBGame.cpp`: camera post-process field names (`AutoExposureMethod`,
  `AutoExposureApplyPhysicalCameraExposure`).
* `LBVisual.h`: `UWorld::bIsTearingDown`.

These are small, local fixes. Please report the exact error text and the
missing function can be swapped for its 5.8 equivalent.

## If something looks wrong at runtime

* **Everything looks inside-out** (you see the inside of houses, or the ground
  is missing): set `bFlipWinding=True` under `[Lanternbound]` in
  `Config/DefaultGame.ini`. The exporter orders triangles for Unreal's
  front-face convention, and this switch reverses all of them.
* **"Lanternbound could not start"**: the data files in `Content/Data` are
  missing or unreadable; re-run the exporter.
* **Mouse turning too fast or slow**: *Settings → Controls → Mouse
  sensitivity*. `Config/DefaultInput.ini` disables mouse smoothing and sets
  the raw mouse axes to sensitivity 1.0, which the camera expects.

## Licensing

All game content (code, data, generated meshes, music) is original to this
project. Unreal Engine is used under Epic Games' EULA. Lanternbound is not
affiliated with, endorsed by, or connected to the makers of any other game.
