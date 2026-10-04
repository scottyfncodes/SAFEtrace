import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { MACHINE, TECH, VENEER, weather } from '../src/render/palette';
import { streetDressingFor, terminalFor } from '../src/render/perspective';
import type { Vec2 } from '../src/core/math';

/*
 * Near-future urban noir (docs/39), held to the few rules that make it
 * recognisable: the town is muted and the machine is not; the machine owns
 * three accents and the town owns none of them; and none of the dressing that
 * makes the town look lived-in is allowed to stand where anybody skates.
 */

function rgb(c: string): [number, number, number] {
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g)!;
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** HSL saturation and lightness, 0..1. */
function sl(c: string): { s: number; l: number } {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

const TOWN = [
  VENEER.asphalt, VENEER.smoothConcrete, VENEER.roughConcrete, VENEER.tile,
  VENEER.grass, VENEER.gravel, VENEER.dirt, VENEER.water,
  VENEER.wallWarm, VENEER.wallCool, VENEER.roofTerracotta, VENEER.roofSlate,
  VENEER.tree, VENEER.treeLight,
];

describe('the town is muted and the machine is not', () => {
  it('keeps every surface of the physical town desaturated', () => {
    for (const c of TOWN) expect({ c, s: sl(c).s < 0.3 }).toEqual({ c, s: true });
  });

  it('gives SAFEtrace accents that are unmistakably saturated', () => {
    for (const c of [TECH.cyan, TECH.acid, TECH.orange]) expect(sl(c).s).toBeGreaterThan(0.8);
  });

  it('weathers authored paint down, never up', () => {
    // The pastel walls Bellhaven was authored with, and a loud one.
    for (const c of ['#F0E3D0', '#DCE4E8', '#C4714E', '#5FBF52', '#E8563F']) {
      const before = sl(c), after = sl(weather(c));
      expect(after.s).toBeLessThan(before.s);
      expect(after.l).toBeLessThanOrEqual(before.l + 0.02);
    }
  });

  it('draws the machine only in its own accents', () => {
    expect(MACHINE.data).toBe(TECH.cyan);
    expect(MACHINE.confirm).toBe(TECH.acid);
    expect(MACHINE.prediction).toBe(TECH.acid);
    expect(MACHINE.riskLow).toBe(TECH.cyan);
    expect(MACHINE.riskMid).toBe(TECH.orange);
  });

  it('lends none of its accents to the town or the player', () => {
    // The flow ring, a stone's ripple and the ammo cache are the player's;
    // a sign's lettering may be SAFEtrace's, and is its ink cyan, not the light.
    const owned = new Set<string>([TECH.cyan, TECH.acid, TECH.orange].map((c) => c.toLowerCase()));
    for (const [k, v] of Object.entries(VENEER)) {
      if (k === 'accent') continue;
      for (const c of Array.isArray(v) ? v : [v]) expect({ k, owned: owned.has(String(c).toLowerCase()) }).toEqual({ k, owned: false });
    }
  });

  it('removes the record scan line entirely under reduced motion', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*#inspect\.show::after\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/html\.reduce-motion #inspect\.show::after\s*\{\s*animation:\s*none/);
  });

  it('keeps the interface and the canvas on the same cyan', () => {
    // A DOM panel and a world-space label for the same system must not be two
    // slightly different products.
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(new RegExp(`--st-teal-bright:\\s*${TECH.cyan}`, 'i'));
    expect(css).toMatch(new RegExp(`--st-acid:\\s*${TECH.acid}`, 'i'));
    expect(css).toMatch(new RegExp(`--st-orange:\\s*${TECH.orange}`, 'i'));
  });
});

describe('the dressing stays out of the way', () => {
  const world = buildBellhaven();
  const dressing = streetDressingFor(world);
  const nodes = new Map(world.roadNodes.map((r) => [r.id, r.pos]));

  const segDist = (p: Vec2, a: Vec2, b: Vec2) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };
  const inside = (q: Vec2, poly: Vec2[]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) r = !r;
    }
    return r;
  };

  it('dresses the town: poles, wire between them, and street names at the corners', () => {
    expect(dressing.poles.length).toBeGreaterThan(40);
    expect(dressing.wires.length).toBeGreaterThan(40);
    expect(dressing.signs.length).toBeGreaterThan(6);
  });

  const cabinets = world.network.nodes
    .filter((n) => n.kind === 'JUNCTION')
    .map((n) => terminalFor(world, n.id, n.pos))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const standing = () => [
    ...dressing.poles.map((p) => ({ what: 'pole', at: p.at })),
    ...dressing.signs.map((p) => ({ what: 'sign', at: p.at })),
    ...cabinets.map((c) => ({ what: 'cabinet', at: c.at })),
  ];

  it('never stands anything on a carriageway', () => {
    for (const t of standing()) {
      for (const e of world.roadEdges) {
        const a = nodes.get(e.a)!, b = nodes.get(e.b)!;
        expect({ ...t, clear: segDist(t.at, a, b) > e.width / 2 + 2.2 }).toEqual({ ...t, clear: true });
      }
    }
  });

  it('never stands anything on a footway, a plaza or a forecourt', () => {
    // Modelled surfaces are exactly where people are expected to move.
    for (const t of standing()) {
      const on = world.surfaces.filter((s) => s.modelled && inside(t.at, s.poly)).map((s) => s.id);
      expect({ ...t, on }).toEqual({ ...t, on: [] });
    }
  });

  it('never stands anything inside a building or on a skate feature', () => {
    for (const t of standing()) {
      for (const b of world.buildings) expect({ ...t, b: b.id, inside: inside(t.at, b.poly) }).toEqual({ ...t, b: b.id, inside: false });
      for (const f of world.features) expect({ ...t, f: f.id, inside: inside(t.at, f.poly) }).toEqual({ ...t, f: f.id, inside: false });
    }
  });

  it('draws a cabinet only for a street junction, within reach of reading it', () => {
    expect(cabinets.length).toBeGreaterThan(0);
    for (const n of world.network.nodes) {
      const t = terminalFor(world, n.id, n.pos);
      if (n.kind !== 'JUNCTION') continue;
      // NODE_REACH is 16 m; the cabinet must be comfortably inside it.
      if (t) expect(Math.hypot(t.at.x - n.pos.x, t.at.y - n.pos.y)).toBeLessThan(12);
    }
  });

  it('strings wire high enough that nothing on the ground meets it', () => {
    for (const w of dressing.wires) expect(w.z - w.sag).toBeGreaterThan(5);
  });

  it('is the same town every time', () => {
    const again = streetDressingFor(buildBellhaven());
    expect(again.poles).toEqual(dressing.poles);
    expect(again.signs).toEqual(dressing.signs);
  });
});
