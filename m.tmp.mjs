import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-SAFEtrace/bc42f5dc-c0ff-51b0-b89e-6037a8fbf1a5/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
});
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_CONNECTION|favicon|404/.test(m.text())) errors.push(m.text()); });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/m1-prefs.png` });
await p.tap('#pref-go');
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/m2-ad.png` });
await p.touchscreen.tap(200, 400);
await p.waitForTimeout(1600);
await p.screenshot({ path: `${OUT}/m3-play.png` });

const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

await touch('touchStart', [{ x: 90, y: 700, id: 1 }]);
for (let i = 1; i <= 30; i++) {
  await touch('touchMove', [{ x: 90 + Math.sin(i/7)*46, y: 700 - 44, id: 1 }]);
  await p.waitForTimeout(42);
}
await p.screenshot({ path: `${OUT}/m4-skating.png` });
const mid = await p.evaluate(() => { const s = window.safetrace.sim;
  return { v:+s.player.speed.toFixed(2), flow:+s.player.flow.toFixed(2), odo:+s.player.odometer.toFixed(0),
           surf:s.world.surfaceAt(s.player.pos), stance:s.player.stance }; });

await p.evaluate(() => window.safetrace.sim.unlockVision());
await touch('touchStart', [{ x: 90, y: 656, id: 1 }, { x: 300, y: 700, id: 2 }]);
await touch('touchStart', [{ x: 90, y: 656, id: 1 }, { x: 300, y: 700, id: 2 }, { x: 350, y: 655, id: 3 }]);
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/m5-peel.png` });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/m6-machine.png` });
const vis = await p.evaluate(() => ({ active: window.safetrace.sim.visionActive, blend: +window.safetrace.sim.visionBlend.toFixed(2) }));
// Lift every finger before the next gesture, the way a hand actually works.
await touch('touchEnd', [{ x: 350, y: 655, id: 3 }]);
await touch('touchEnd', [{ x: 300, y: 700, id: 2 }]);
await touch('touchEnd', [{ x: 90, y: 656, id: 1 }]);
await p.waitForTimeout(800);
const cleared = await p.evaluate(() => window.safetrace.sim.visionActive);

await touch('touchStart', [{ x: 300, y: 680, id: 5 }]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: 300, y: 680 + i*12, id: 5 }]); await p.waitForTimeout(26); }
await p.screenshot({ path: `${OUT}/m7-sling.png` });
const bBefore = await p.evaluate(() => window.safetrace.sim.player.bearings);
await touch('touchEnd', [{ x: 300, y: 776, id: 5 }]);
await p.waitForTimeout(900);
const shot = await p.evaluate(() => ({ bearings: window.safetrace.sim.player.bearings }));

const scroll = await p.evaluate(() => ({ sx: scrollX, sy: scrollY, bodyH: document.body.scrollHeight, innerH: innerHeight,
  canvasW: document.getElementById('game').width, cssW: document.getElementById('game').clientWidth, dpr: devicePixelRatio }));
const fps = await p.evaluate(() => new Promise(r => { let n=0; const t0=performance.now();
  const t=()=>{n++; performance.now()-t0<2000?requestAnimationFrame(t):r(Math.round(n/((performance.now()-t0)/1000)));}; requestAnimationFrame(t);}));
console.log(JSON.stringify({ errors, mid, vis, cleared, bBefore, shot, scroll, fps }, null, 2));
await b.close();
