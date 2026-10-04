import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { MACHINE, TECH, VENEER, weather } from '../src/render/palette';
import { streetDressingFor } from '../src/render/perspective';
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
    expect(dressing.signs.length).toBeGreaterThan(8);
  });

  it('never stands a pole or a sign on a carriageway or a footway', () => {
    for (const thing of [...dressing.poles, ...dressing.signs]) {
      for (const e of world.roadEdges) {
        const a = nodes.get(e.a)!, b = nodes.get(e.b)!;
        // Half the carriageway, plus the 2.2 m footway every road is laid with.
        expect(segDist(thing.at, a, b)).toBeGreaterThan(e.width / 2 + 0.3);
      }
    }
  });

  it('never stands one inside a building or on a skate feature', () => {
    for (const thing of [...dressing.poles, ...dressing.signs]) {
      for (const b of world.buildings) expect(inside(thing.at, b.poly)).toBe(false);
      for (const f of world.features) expect(inside(thing.at, f.poly)).toBe(false);
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
