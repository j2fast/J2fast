# Known issues and limitations

This is an honest list of what is missing, rough or unverified.

## Scope and platform

* **Not an Unreal Engine project.** Unreal could not be installed in the build
  environment (it needs an Epic account sign-in and a GPU desktop). The game is
  built with Three.js and runs in a desktop web browser. DESIGN.md §9 maps the
  architecture onto Unreal for a future port.
* **Single-player only.** Systems are structured so co-op could be added
  later, but no networking exists.
* **Not based on the user's installed game.** The reference game on the user's
  PC could not be accessed, and the brief required original content anyway.
  Lanternbound shares only broad genre ideas.

## Art, animation and audio

* **All art is procedural placeholder-quality.** Characters, props and
  environments are assembled from primitive shapes with cel shading and
  outlines. They look coherent and readable, but they are not production
  models: no sculpted meshes, skinned skeletons or hand-painted textures.
* Animation is procedural pose blending, not motion-captured or keyframed by
  an animator. There is no foot IK, no cloth simulation and no facial
  animation.
* No voice acting. All dialogue is text (subtitled).
* Music and sound effects are synthesised at runtime. They were verified by
  automated runs (the audio context starts and nodes are created without
  errors) but were **not listened to** during development, so the mix and
  levels may need tuning by ear.

## Verification gaps

* All automated testing ran in **headless Chromium with software WebGL**.
  Frame rate and visual quality on real GPUs, and in Firefox or Safari, have
  not been measured. Draw calls are batched (about 80–460 per area), so
  typical desktop GPUs should hold 60 fps, but this is unverified.
* Gamepad support was tested with a **simulated standard-mapping
  controller**, not physical hardware. Non-standard controllers may map
  buttons differently; they can be rebound in Settings.
* Boss beatability was verified by a scripted bot that reads attack
  telegraphs very reliably. Human difficulty may feel higher. Story difficulty
  halves incoming damage.
* Mouse-look needs pointer lock (click the game first). In some embedded or
  sandboxed browsers pointer lock is unavailable; use the arrow keys or a
  gamepad for the camera instead.

## Gameplay rough edges

* Enemies steer directly toward the player rather than path-finding, so they
  can get stuck behind rocks or pillars.
* Movement and collision are 2D: there is no jumping, and characters follow
  the ground height.
* The camera pulls in for walls and buildings but can still pass through
  foliage and thin props.
* Defeated enemies respawn when you re-enter an area or rest at a wayshrine,
  by design.
* Saves are stored in browser local storage for the page's origin. Clearing
  site data deletes them, and moving `Lanternbound.html` to a different folder
  changes the origin. Use **Export** and **Import** in the Load menu to move
  saves.

## Test suite notes

* Across 8 full-playthrough runs (game seeds vary by run), one run failed to
  move into the Hollow Catacombs on the first frames after teleporting to the
  door straight after a fight. The transition works when tested in isolation,
  and in the following runs. The test now gives the transition up to
  30 frames and prints diagnostics if it fails again; the root cause is
  unconfirmed. Earlier intermittent failures had a test-side cause (pressing
  interact during an attack's recovery) and were fixed.
