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
screenshot is needed. Screenshots are written to `test-results/screens/`.

## Project layout

See [DESIGN.md](DESIGN.md#6-architecture).
