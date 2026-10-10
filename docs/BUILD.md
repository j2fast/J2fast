# Building, running and testing

## Requirements

* Node.js 20 or newer (developed with Node 22) and npm.
* A modern desktop browser with WebGL 2: Chrome, Edge or Firefox. Safari 16+
  should work but is untested.
* For the automated browser tests: Playwright's Chromium. The project pins
  `@playwright/test@1.56.1`. Run `npx playwright install chromium` once if
  Chromium is not already installed.

## Play the prebuilt game (no install)

`release/Lanternbound.html` is a single self-contained file holding all code,
generated art, music and sound. Double-click it to open it in your browser. It
runs fully offline, and saves are kept in the browser's local storage.

> Saves made from `file://` belong to that file location. If you move the file,
> use **Load Game → Export** first, then **Import** the save at the new location.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 with hot reload
```

## Build the single-file release

```bash
npm run build        # type-checks, then writes dist/index.html
cp dist/index.html release/Lanternbound.html
npm run preview      # serves dist/ at http://localhost:4173
```

## Tests

```bash
npm test             # Vitest unit tests (pure game systems + data integrity)
npm run typecheck    # TypeScript strict type-check
npx playwright test  # end-to-end tests against the built game (run `npm run build` first)
npx playwright test playthrough   # the full story playthrough only (~10–20 min in software WebGL)
npm run test:all     # everything
```

The end-to-end tests open the game with `?test=1`. This exposes a small hook
object, `window.__lanternbound`, that can advance the simulation frame by
frame, read game state, teleport the player and run a scripted test bot. The
bot plays fights with normal inputs (move, attack, dodge, heal). Without
`?test` these hooks do not exist.

Headless Chromium uses software WebGL (SwiftShader), so rendering in tests is
slow. The tests therefore step the simulation directly and render only when a
screenshot is needed. Screenshots are written to `test-screens/`.

## Dev tools

* `node scripts/smoke.mjs <outdir> [js expressions...]` starts the dev server,
  opens the game headlessly, evaluates the expressions in the page and saves
  before/after screenshots. It's useful for quick visual checks.

## Project layout

See [DESIGN.md](DESIGN.md#6-architecture).

## Unreal Engine 5.8 port

The C++ port lives in `unreal/Lanternbound`. Open it in Unreal as described in
[unreal/Lanternbound/README_UNREAL.md](../unreal/Lanternbound/README_UNREAL.md).
Two helper commands run from the repository root:

```bash
node scripts/export-unreal.mjs              # regenerate unreal/Lanternbound/Content/Data from the web build
python3 unreal/tools/syntaxcheck/check.py   # clang syntax check of the port against stand-in engine headers
```

The exporter starts a Vite dev server and drives the game headlessly through
the `?test=1` hooks (`exportData`, `exportArea`, `exportAreaMesh`, `exportWalk`,
`exportProps`). The syntax check needs clang 15 or newer. It is **not** a
substitute for compiling in Unreal.
