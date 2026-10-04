/*
 * Character lineup for art passes.
 *
 *   npm run dev            # in another shell
 *   node scripts/lineup.mjs <outdir> [label]
 *
 * Stands one of every kind of person in front of the rider on Maple Court —
 * each resident kind, the named cast, the officer, Devon riding and standing —
 * and frames them at phone and desktop size, at the chase camera's normal
 * distance and at the closer conversation framing. People keep walking (their
 * routes are frozen in place, not their animation), so each shot is a fair
 * picture of how they read in play. Dev builds only (`window.__safetrace`).
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const out = process.argv[2] ?? 'lineup';
const label = process.argv[3] ?? 'lineup';
const url = process.env.SHOT_URL ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const vp of [{ name: 'phone', width: 390, height: 844, scale: 2 }, { name: 'desk', width: 1280, height: 760, scale: 1 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(url);
  await page.click('#pref-go');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__safetrace?.phase === 'play', null, { timeout: 60000 });
  await page.addStyleTag({ content: '#ui, #boot, #ad { display: none !important; }' });
  await page.evaluate(() => {
    Object.defineProperty(window.__safetrace.renderer, 'controlVisual', { get: () => null, set() {}, configurable: true });
  });
  for (const framing of ['chase', 'close']) {
    await page.evaluate((framing) => {
      const g = window.__safetrace, sim = g.sim;
      const p = sim.player;
      p.pos = { x: 158, y: 214 }; p.vel = { x: 0, y: 0 }; p.speed = 0; p.heading = Math.PI / 2;
      // A row across Maple Court, twelve metres ahead, each walking along it
      // on a tiny loop so they are mid-stride rather than posed.
      const row = (i, n) => ({ x: 147 + (i * 22) / Math.max(1, n - 1), y: framing === 'close' ? 222 : 228 });
      const walkers = [];
      const kinds = ['adult', 'child', 'dogWalker', 'jogger', 'adult', 'adult'];
      sim.npcs.slice(0, kinds.length).forEach((n, i) => { n.kind = kinds[i]; walkers.push(n); });
      const cast = sim.people.filter((q) => ['mara', 'priya', 'courier', 'carvalho'].includes(q.id));
      for (const c of cast) c.visible = true;
      const everyone = [...walkers, ...cast, sim.patrols[0]];
      everyone.forEach((who, i) => {
        const at = row(i, everyone.length + 1);
        who.pos = { ...at };
        const dir = i % 2 ? 1 : -1;
        if (who.route) { who.route = [{ x: at.x - 3 * dir, y: at.y }, { x: at.x + 3 * dir, y: at.y }]; who.routeIndex = 1; }
        if ('path' in who) { who.path = []; who.task = null; }
      });
      // Devon at the end of the row, standing; the rider beside him for scale.
      sim.devonFollowing = false;
      sim.devonPos = { ...row(everyone.length, everyone.length + 1) };
      g.renderer.chase.focus = framing === 'close' ? { x: 158, y: 226 } : null;
      g.renderer.chase.reset(sim);
    }, framing);
    await page.waitForTimeout(framing === 'close' ? 2600 : 1400);
    await page.screenshot({ path: `${out}/${label}-${vp.name}-${framing}.png` });
  }
  await ctx.close();
}
await browser.close();
