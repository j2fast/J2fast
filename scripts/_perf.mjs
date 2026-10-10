import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5197/?test=1');
await page.waitForFunction(() => window.__lanternbound);
const r = await page.evaluate(() => {
  const lb = __lanternbound; lb.manual(true);
  document.querySelector('[data-action=newGame]').click();
  const out = {};
  for (const [a, sp] of [['village','start'],['bamboo','from_village'],['marsh','from_village'],['catacombs','from_marsh'],['summit','from_village']]) {
    const t0 = performance.now();
    lb.game.enterArea(a, sp);
    const t1 = performance.now();
    lb.game.render(1/60);
    out[a] = { build: Math.round(t1 - t0), draws: lb.game.renderer.info.render.calls, batch: lb.game.world.batchStats };
  }
  lb.game.enterArea('village','start');
  lb.teleport(0, 10); lb.game.camRig.yaw = Math.PI; lb.step(30);
  return out;
});
console.log(JSON.stringify(r));
await page.waitForTimeout(1000);
await page.screenshot({ path: process.argv[2] + '/batched-village.png' });
console.log('errors', errors);
await browser.close(); await server.close();
