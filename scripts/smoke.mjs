// Dev smoke script: boots the built game headlessly, captures screenshots and console errors.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots';
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5199/?test=1');
await page.waitForFunction(() => window.__lanternbound, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-title.png` });
const steps = process.argv.slice(3);
for (const s of steps) {
  const r = await page.evaluate(s);
  console.log('eval:', s.slice(0, 80), '=>', JSON.stringify(r)?.slice(0, 600));
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-after.png` });
console.log('ERRORS:\n' + errors.slice(0, 20).join('\n'));
await browser.close();
await server.close();
