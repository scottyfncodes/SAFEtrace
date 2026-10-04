import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { markersFor, sightlinesFor, SIGHTLINE_MAX } from '../src/render/evidence';
import { figure, type Build } from '../src/render/figures';
import { INK, Ink, brushOutline } from '../src/render/ink';
import { MACHINE, PRINT, SIGNAL, SKY, TECH, VENEER, weather } from '../src/render/palette';
import { MATERIAL, streetDressingFor, terminalFor } from '../src/render/perspective';
import type { Vec2 } from '../src/core/math';

/*
 * The inked town (docs/40), held to the rules that make it recognisable and
 * keep it readable: three colours mean something and the street may not
 * borrow them; the ink has a hierarchy and a person tops it; the people can
 * be told apart by outline before colour; the player's investigation is
 * marked only where they have earned it; and none of the dressing that makes
 * the town look drawn is allowed to stand where anybody skates.
 */

function rgb(c: string): [number, number, number] {
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g)!;
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** Chroma (max − min channel) and lightness, 0..1, and hue in degrees. */
function hcl(c: string): { h: number; chroma: number; l: number } {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, chroma: d, l: (max + min) / 2 };
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Every colour the street itself is printed in: no person, no signal. */
const ENVIRONMENT: Array<[string, string]> = [
  ...Object.entries(PRINT).filter(([, v]) => typeof v === 'string').map(([k, v]) => [`PRINT.${k}`, v] as [string, string]),
  ...Object.entries(SKY).map(([k, v]) => [`SKY.${k}`, v] as [string, string]),
  ...Object.entries(MATERIAL).flatMap(([k, vs]) => (vs ?? []).map((v, i) => [`MATERIAL.${k}[${i}]`, v] as [string, string])),
];

describe('three colours mean something, and the street may not borrow them', () => {
  const SIGNALS = Object.entries(SIGNAL);

  it('has an amber player, a cyan system and an orange warning', () => {
    expect(hcl(SIGNAL.player).h).toBeGreaterThanOrEqual(35);
    expect(hcl(SIGNAL.player).h).toBeLessThanOrEqual(52);
    expect(hcl(SIGNAL.system).h).toBeGreaterThanOrEqual(175);
    expect(hcl(SIGNAL.system).h).toBeLessThanOrEqual(200);
    expect(hcl(SIGNAL.warning).h).toBeGreaterThanOrEqual(8);
    expect(hcl(SIGNAL.warning).h).toBeLessThanOrEqual(28);
  });

  it('keeps the three far enough apart to read as three things', () => {
    // Amber and warning orange were nine degrees apart in the noir pass.
    for (const [a, ca] of SIGNALS) for (const [b, cb] of SIGNALS) {
      if (a >= b) continue;
      expect({ a, b, gap: hueGap(hcl(ca).h, hcl(cb).h) >= 22 }).toEqual({ a, b, gap: true });
    }
  });

  it('makes each of them unmistakably saturated', () => {
    for (const [k, c] of SIGNALS) expect({ k, strong: hcl(c).chroma > 0.6 }).toEqual({ k, strong: true });
  });

  it('routes every use of a meaning through the signal table', () => {
    expect(VENEER.player).toBe(SIGNAL.player);
    expect(VENEER.warning).toBe(SIGNAL.player);       // the flow ring and ripple are the player's
    expect(VENEER.responding).toBe(SIGNAL.warning);   // an officer coming for you is a warning
    expect(SIGNAL.system).toBe(TECH.cyan);
    expect(SIGNAL.warning).toBe(TECH.orange);
    expect(MACHINE.data).toBe(SIGNAL.system);
    expect(MACHINE.riskMid).toBe(SIGNAL.warning);
  });

  it('prints the street in muted colour only', () => {
    for (const [k, c] of ENVIRONMENT) expect({ k, muted: hcl(c).chroma < 0.25 }).toEqual({ k, muted: true });
  });

  it('never lets the street wear a signal\'s hue at any strength', () => {
    // Paper is a warm off-white and may sit near amber's hue; what it may not
    // do is carry amber's colour. Near a signal's hue, the street stays grey.
    for (const [k, c] of ENVIRONMENT) {
      const { h, chroma } = hcl(c);
      for (const [sig, sc] of SIGNALS) {
        if (hueGap(h, hcl(sc).h) >= 25) continue;
        expect({ k, sig, quiet: chroma < 0.15 }).toEqual({ k, sig, quiet: true });
      }
    }
  });

  it('keeps the people stronger than the ground they stand on', () => {
    const ground = [PRINT.road, PRINT.footway, PRINT.forecourt, PRINT.verge];
    for (const who of [VENEER.player, VENEER.friend]) {
      for (const g of ground) expect(hcl(who).chroma - hcl(g).chroma).toBeGreaterThan(0.3);
    }
  });

  it('gives the street a value structure: black road, pale paper, skateable ground lighter than the verge', () => {
    expect(hcl(PRINT.road).l).toBeLessThan(0.2);
    expect(hcl(PRINT.paper).l).toBeGreaterThan(0.75);
    expect(hcl(PRINT.ink).l).toBeLessThan(0.12);
    for (const sk of [PRINT.footway, PRINT.forecourt, PRINT.tile]) expect(hcl(sk).l).toBeGreaterThan(hcl(PRINT.verge).l);
  });

  it('weathers authored paint down, never up', () => {
    for (const c of ['#F0E3D0', '#DCE4E8', '#C4714E', '#5FBF52', '#E8563F']) {
      const before = hcl(c), after = hcl(weather(c));
      expect(after.chroma).toBeLessThan(before.chroma);
      expect(after.l).toBeLessThanOrEqual(before.l + 0.02);
    }
  });

  it('removes the record scan line entirely under reduced motion', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*#inspect\.show::after\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/html\.reduce-motion #inspect\.show::after\s*\{\s*animation:\s*none/);
  });

  it('keeps the interface and the canvas on the same cyan and orange', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(new RegExp(`--st-teal-bright:\\s*${TECH.cyan}`, 'i'));
    expect(css).toMatch(new RegExp(`--st-acid:\\s*${TECH.acid}`, 'i'));
    expect(css).toMatch(new RegExp(`--st-orange:\\s*${TECH.orange}`, 'i'));
  });
});

describe('the ink has a hierarchy, and a person tops it', () => {
  const order = [Ink.Person, Ink.Interactable, Ink.Building, Ink.Furniture, Ink.Detail];

  it('never out-inks a person', () => {
    for (let i = 1; i < order.length; i++) {
      const a = INK[order[i - 1]], b = INK[order[i]];
      expect(a.width).toBeGreaterThanOrEqual(b.width);
      expect(a.alpha).toBeGreaterThanOrEqual(b.alpha);
      expect(a.breakAt).toBeGreaterThanOrEqual(b.breakAt);
    }
  });

  it('never breaks up a person\'s line, however far away', () => {
    expect(INK[Ink.Person].breakAt).toBeGreaterThan(400);
  });

  it('draws the same line every frame for the same thing', () => {
    // Seeded from the thing, never the frame: a line that changes between
    // two identical calls would boil on screen.
    const record = () => {
      const out: number[] = [];
      const ctx = {
        moveTo: (x: number, y: number) => out.push(x, y),
        lineTo: (x: number, y: number) => out.push(x, y),
        closePath: () => out.push(NaN),
      } as unknown as CanvasRenderingContext2D;
      brushOutline(ctx, [10, 90, 90, 10], [10, 10, 70, 70], 4, Ink.Building, 1.7, 0.7, 12345);
      return out;
    };
    expect(record()).toEqual(record());
    expect(record().length).toBeGreaterThan(0);
  });
});

describe('people are told apart by outline first', () => {
  const builds: Build[] = ['coat', 'hoodie', 'skirt', 'brim', 'satchel', 'officer', 'devon'];
  const hatSpan = (b: Build) => Math.max(0, ...figure(b).shapes.filter((s) => s.fill === 'hat').flatMap((s) => s.pts.map(([u]) => Math.abs(u))));
  const outline = (b: Build) => JSON.stringify(figure(b).shapes.map((s) => s.pts));

  it('gives Devon the one wide brim in town, so he is Devon before he is green', () => {
    for (const b of builds) if (b !== 'devon') expect(hatSpan('devon')).toBeGreaterThan(hatSpan(b));
  });

  it('gives every build its own outline', () => {
    expect(new Set(builds.map(outline)).size).toBe(builds.length);
  });

  it('keeps the officer the broadest-shouldered figure on the street', () => {
    const shoulders = (b: Build) => Math.max(...figure(b).shapes.filter((s) => s.fill === 'garment').flatMap((s) => s.pts.filter(([, z]) => z > 1.3).map(([u]) => Math.abs(u))));
    for (const b of builds) if (b !== 'officer') expect(shoulders('officer')).toBeGreaterThan(shoulders(b));
  });
});

describe('the street marks only what the player has earned', () => {
  const places = [
    { id: 'a', pos: { x: 0, y: 0 }, visible: true },
    { id: 'b', pos: { x: 10, y: 0 }, visible: false },
    { id: 'c', pos: { x: 20, y: 0 }, visible: true },
  ];

  it('numbers markers in the order things were found, and only those', () => {
    expect(markersFor(places, [], new Set())).toEqual([]);
    const m = markersFor(places, ['c', 'b', 'a'], new Set(['a']));
    // b is found but has nothing to stand beside now; its number is kept.
    expect(m.map((x) => [x.id, x.n, x.again])).toEqual([['c', 1, false], ['a', 3, true]]);
  });

  it('rules a sightline only in front of a camera the player has noticed', () => {
    const sensors = [
      { id: 's1', pos: { x: 0, y: 0 }, facing: 0, range: 100 },
      { id: 's2', pos: { x: 5, y: 5 }, facing: Math.PI / 2, range: 20 },
    ];
    expect(sightlinesFor(sensors, new Set())).toEqual([]);
    const sl = sightlinesFor(sensors, new Set(['s1']));
    expect(sl).toHaveLength(1);
    expect(Math.hypot(sl[0].to.x - sl[0].from.x, sl[0].to.y - sl[0].from.y)).toBeLessThanOrEqual(SIGHTLINE_MAX);
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

  it('grows grass only on grass', () => {
    const top = (q: Vec2) => {
      let best: typeof world.surfaces[number] | null = null;
      for (const sf of world.surfaces) if (inside(q, sf.poly) && (!best || sf.priority >= best.priority)) best = sf;
      return best?.kind;
    };
    expect(dressing.tufts.length).toBeGreaterThan(100);
    expect(dressing.hatch.length).toBeGreaterThan(500);
    for (const t of dressing.tufts) expect({ at: t.at, on: top(t.at) }).toEqual({ at: t.at, on: 'grass' });
    for (const g of dressing.hatch) {
      const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
      expect({ mid, on: top(mid) }).toEqual({ mid, on: 'grass' });
    }
  });

  it('is the same town every time', () => {
    const again = streetDressingFor(buildBellhaven());
    expect(again.poles).toEqual(dressing.poles);
    expect(again.signs).toEqual(dressing.signs);
    expect(again.tufts).toEqual(dressing.tufts);
    expect(again.hatch).toEqual(dressing.hatch);
  });
});
