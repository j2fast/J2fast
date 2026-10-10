# Lanternbound: Embers of Hinoyama

An original third-person action RPG of lanterns, spirits and steel. The Spirit
Lantern that guides the dead has been shattered by a masked spirit. As a newly
sworn Lantern Warden, you fight through a bamboo grove, a misty marsh, a buried
catacomb and a burning summit to relight it.

**Play now:** open [`release/Lanternbound.html`](release/Lanternbound.html) in
Chrome, Edge or Firefox. It's one self-contained file: no install, no server,
works offline.

## Features

* Fast third-person combat: light combos, heavy attacks, dodge-roll with
  invulnerability frames, lock-on with target switching, hit-stop and stagger.
* **Five weapon families**, each with its own combo, heavy attack and spirit
  ability: Katana, Naginata, Twin Tanto, Kanabo, Spirit Bow. Carry two and swap
  mid-fight.
* **Readable enemies**: every attack telegraphs its exact area on the ground.
  There are 7 enemy types, and an attack-token system limits how many attack at once.
* **Three bosses** with phase changes and distinct patterns: leaps,
  fissures, shockwave rings, ceiling dives, sweeping beams and bullet spirals.
* Progression: 20 levels, 9 trainable skills, randomized loot in 5 rarities
  with affixes, blacksmith upgrades (+1 to +5), a merchant, consumables.
* A short complete story: 4 main quests and 5 side quests, branching
  dialogue, a fox-spirit companion, and an ending with credits.
* Five connected areas: a hub village, two open combat zones, a multi-room
  dungeon and the summit finale. Wayshrines let you rest, save and fast travel.
* Save/load with 3 manual slots and an autosave. Saves carry a checksum, are
  validated on load, keep a backup copy, and can be exported and imported.
* Full keyboard/mouse and gamepad support, all remappable. Accessibility
  options: subtitle size and background, sound captions, high-contrast
  warnings, reduced flashing, camera shake toggle, FOV and sensitivity, Story
  difficulty.
* An original procedural soundtrack (koto, shakuhachi, shamisen and
  taiko-inspired synthesis on Japanese pentatonic scales) and synthesised
  sound effects.
* Stylised cel-shaded visuals with ink outlines. All models and textures are
  generated in code.

## Documentation

* [docs/CONTROLS.md](docs/CONTROLS.md): controls and combat basics
* [docs/BUILD.md](docs/BUILD.md): building, running and testing
* [docs/DESIGN.md](docs/DESIGN.md): design, architecture and the engine decision
* [docs/FEATURES.md](docs/FEATURES.md): implemented features and how each was verified
* [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md): known issues and limitations
* [docs/PROGRESS_LOG.md](docs/PROGRESS_LOG.md): development log

## Engine note

This was requested as an Unreal Engine project. Unreal is not available in the
build environment: it needs an Epic account sign-in, and the environment is a
headless Linux container with no GPU. The game is built instead on
**Three.js + TypeScript**, so it could be fully built and automatically tested
here. See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning and an Unreal
porting map.

## Originality

Lanternbound is an original work. It draws on the broad genre of
folklore-flavoured action RPGs, but its title, characters, story, dialogue,
maps, art, music and code were all made for this project. It is not
affiliated with or endorsed by the makers of any other game.
