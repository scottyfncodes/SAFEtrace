/*
 * Screenshot harness for art-direction passes.
 *
 *   npm run dev            # in another shell
 *   node scripts/shots.mjs <outdir> [label]
 *
 * Boots the dev build, skips the advertisement, hides every piece of HUD
 * (DOM and canvas controls), parks the rider at a few fixed places in the
 * representative slice, and saves each frame at phone size and desktop size.
 * Uses the dev-only `window.__underwatch` handle; it never ships.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Playwright is not a project dependency; use the project's if present, else the global one.
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
const label = process.argv[3] ?? 'shot';
const url = process.env.SHOT_URL ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });

/* The slice: Maple Court down to Devon, plus a corner with a cabinet. */
const SHOTS = process.env.SHOT_ONLY ? [{ name: 'maple-doorbell', pos: { x: 158, y: 236 }, heading: Math.PI - 0.1 }, { name: 'officer', near: 'patrol' }, { name: 'parade', pos: { x: 404, y: 82 }, heading: -Math.PI / 2 }] : [
  { name: 'maple-start', pos: { x: 158, y: 214 }, heading: Math.PI / 2 },
  { name: 'maple-devon', pos: { x: 158, y: 262 }, heading: Math.PI / 2 },
  { name: 'maple-doorbell', pos: { x: 158, y: 236 }, heading: Math.PI - 0.1 },
  { name: 'maple-back', pos: { x: 160, y: 270 }, heading: -Math.PI / 2 },
  // Fourteen metres from the nearest patrol officer, facing them.
  { name: 'officer', near: 'patrol' },
];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true, scale: 2 },
  { name: 'desk', width: 1280, height: 760, touch: false, scale: 1 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const perf = {};
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale, hasTouch: vp.touch, isMobile: vp.touch,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(url);
  await page.waitForSelector('#title-story');
  await page.click('#title-story');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__underwatch?.phase === 'play', null, { timeout: 60000 }).catch(async () => {
    // A tap skips on touch.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await page.waitForFunction(() => window.__underwatch?.phase === 'play', null, { timeout: 60000 });
  });
  await page.addStyleTag({ content: '#ui, #boot { display: none !important; }' });
  // The thumb controls are drawn on the canvas and reassigned every frame.
  await page.evaluate(() => {
    Object.defineProperty(window.__underwatch.renderer, 'controlVisual', { get: () => null, set() {}, configurable: true });
  });
  // An afternoon partly investigated: the two places nearest Maple Court have
  // been looked at, and the cameras around it noticed. The game builds these
  // up as you play; the harness puts them down so the shots show them.
  if (process.env.SHOT_FRESH !== '1') {
    await page.evaluate(() => {
      const g = window.__underwatch;
      const at = { x: 160, y: 250 };
      const d = (p) => Math.hypot(p.x - at.x, p.y - at.y);
      for (const id of ['p-dropin', 'p-doorbell', 'p-noticeboard']) g.seenPlaces.add(id);
      for (const s of g.sim.sensors) if (d(s.data.pos) < 60) g.sim.knownSensors.add(s.data.id);
    });
  }
  // Pin the town's mood for the shot (docs/41): SHOT_MOOD=-1..1.
  if (process.env.SHOT_MOOD !== undefined) {
    const m = Number(process.env.SHOT_MOOD);
    await page.evaluate((m) => { const r = window.__underwatch.renderer; r.moodOverride = m; }, m);
    await page.waitForTimeout(6000);
  }
  for (const s of SHOTS) {
    await page.evaluate((s) => {
      const g = window.__underwatch;
      const p = g.sim.player;
      if (s.near === 'patrol') {
        const o = g.sim.patrols[0].pos;
        s = { pos: { x: o.x - 14, y: o.y + 4 }, heading: Math.atan2(-4, 14) };
      }
      p.pos = { ...s.pos }; p.vel = { x: 0, y: 0 }; p.speed = 0; p.heading = s.heading;
      g.renderer.chase.reset(g.sim);
    }, s);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${label}-${vp.name}-${s.name}.png` });
  }
  // What drawing the world actually costs, per frame, at the busiest shot —
  // and again with the CPU slowed 4x, which is roughly a mid-range phone.
  const measure = () => page.evaluate(() => new Promise((res) => {
    const r = window.__underwatch.renderer;
    const pr = r.perspective;
    const orig = pr.draw;
    const times = [];
    pr.draw = function (...a) { const t0 = performance.now(); orig.apply(this, a); times.push(performance.now() - t0); };
    setTimeout(() => {
      pr.draw = orig;
      times.sort((a, b) => a - b);
      res({ frames: times.length, median: +times[times.length >> 1].toFixed(2), p95: +times[Math.floor(times.length * 0.95)].toFixed(2), faces: pr.faces.length });
    }, 3000);
  }));
  perf[vp.name] = await measure();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  perf[vp.name + '@4x'] = await measure();
  await ctx.close();
}
console.log(JSON.stringify(perf));
await browser.close();
