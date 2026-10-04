/**
 * The ink: how SAFEtrace's street is drawn, as opposed to what colour it is.
 *
 * A uniform outline round every polygon is what a "comic shader" does, and it
 * is the look this replaces. Here every inked thing belongs to a class, the
 * class decides how heavy its line is, and the line itself is a brush stroke:
 * thick through the middle, tapering at the ends, slightly off true, and on
 * architecture carried a little past the corner the way a draughtsman's line
 * overshoots. Far away the line breaks up and then stops, so the distance is
 * drawn with less ink than the foreground rather than with the same line made
 * thinner.
 *
 * The wobble is seeded from the world, never from the frame, so a wall's line
 * is the same line every frame as the camera moves past it — drawn once, by
 * somebody, rather than boiling.
 */

/** Who a line belongs to, strongest first. */
export const enum Ink {
  /** People and the rider: always the strongest edge in the frame. */
  Person = 0,
  /** Things the player can use or read: cameras, cabinets, evidence. */
  Interactable = 1,
  /** Buildings and major architecture. */
  Building = 2,
  /** Street furniture, trees, poles, fences. */
  Furniture = 3,
  /** Windows, doors, signs: detail on a face, near the eye only. */
  Detail = 4,
}

export interface InkWeight {
  /** Width in CSS pixels at the eye. */
  width: number;
  /** Metres over which the line thins to its floor. */
  falloff: number;
  /** The thinnest it gets before it starts to break up. */
  floor: number;
  /** Beyond this distance the line starts dropping strokes; beyond 2x, none. */
  breakAt: number;
  /** How far a stroke runs past its corner, as a fraction of its length. */
  overshoot: number;
  /** How far off true, as a fraction of the stroke's width. */
  wobble: number;
  /** How much of the ink's darkness survives, 0..1. */
  alpha: number;
}

/**
 * The hierarchy, in one table. The brief's ordering is the test
 * (tests/art-direction.test.ts): a person is never out-inked by anything.
 */
export const INK: Record<Ink, InkWeight> = {
  [Ink.Person]: { width: 2.3, falloff: 55, floor: 0.9, breakAt: 999, overshoot: 0, wobble: 0.25, alpha: 0.95 },
  [Ink.Interactable]: { width: 1.9, falloff: 60, floor: 0.8, breakAt: 90, overshoot: 0.04, wobble: 0.25, alpha: 0.9 },
  [Ink.Building]: { width: 1.7, falloff: 70, floor: 0.55, breakAt: 75, overshoot: 0.06, wobble: 0.45, alpha: 0.85 },
  [Ink.Furniture]: { width: 1.15, falloff: 45, floor: 0.45, breakAt: 50, overshoot: 0.02, wobble: 0.35, alpha: 0.75 },
  [Ink.Detail]: { width: 0.8, falloff: 30, floor: 0.4, breakAt: 30, overshoot: 0, wobble: 0.2, alpha: 0.6 },
};

/** A stable pseudo-random in [0, 1) from an integer seed. */
export function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A seed for a polygon from where it is in the world: same wall, same line. */
export function seedOf(x: number, y: number, z: number): number {
  return (Math.round(x * 7.3) * 73856093) ^ (Math.round(y * 7.3) * 19349663) ^ (Math.round(z * 7.3) * 83492791);
}

/** How wide a class's line is at a distance, and how much of it survives. */
export function inkAt(cls: Ink, depth: number): { width: number; keep: number } {
  const w = INK[cls];
  const width = Math.max(w.floor, w.width * (1 - depth / (w.falloff * 2.2)));
  const keep = depth <= w.breakAt ? 1 : Math.max(0, 1 - (depth - w.breakAt) / w.breakAt);
  return { width, keep };
}

/**
 * Add one closed polygon's outline to the current path as brush strokes.
 *
 * Each edge becomes a six-point tapered stroke: a fraction of full width at
 * its ends, full width through the middle, with the middle nudged off true by
 * the seeded wobble. Strokes are added as sub-paths of whatever path is open,
 * so a whole face's ink is one `fill()`.
 *
 * `skip(i)` lets the caller leave out an edge — the one the near plane cut,
 * which is not an edge of anything.
 */
export function brushOutline(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>, ys: ArrayLike<number>, n: number,
  cls: Ink, width: number, keep: number, seed: number,
  skip?: (i: number) => boolean,
): void {
  const w = INK[cls];
  for (let i = 0; i < n; i++) {
    if (skip && skip(i)) continue;
    const r = hash01(seed + i * 7919);
    // Far off, a line is drawn with fewer strokes rather than a thinner one.
    if (keep < 1 && r > keep) continue;
    const j = (i + 1) % n;
    let ax = xs[i], ay = ys[i], bx = xs[j], by = ys[j];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1.2) continue;
    const ux = dx / len, uy = dy / len;
    // Past the corner, a little, on the things a draughtsman would rule.
    const over = Math.min(4, len * w.overshoot * (0.4 + r));
    ax -= ux * over; ay -= uy * over; bx += ux * over; by += uy * over;
    // A broken line in the middle distance: some strokes stop short.
    if (keep < 1) {
      const cut = (1 - keep) * 0.5 * len * hash01(seed + i * 104729);
      if (r > 0.5) { bx -= ux * cut; by -= uy * cut; } else { ax += ux * cut; ay += uy * cut; }
    }
    const nx = -uy, ny = ux;
    // A stroke is heavier where the hand pressed: varies by stroke, not frame.
    const full = width * (0.75 + 0.5 * hash01(seed + i * 31337));
    const end = full * 0.32;
    const mt = 0.35 + 0.3 * r;
    const mx = ax + (bx - ax) * mt + nx * (r - 0.5) * full * w.wobble * 2;
    const my = ay + (by - ay) * mt + ny * (r - 0.5) * full * w.wobble * 2;
    const h = full / 2, e = end / 2;
    ctx.moveTo(ax + nx * e, ay + ny * e);
    ctx.lineTo(mx + nx * h, my + ny * h);
    ctx.lineTo(bx + nx * e, by + ny * e);
    ctx.lineTo(bx - nx * e, by - ny * e);
    ctx.lineTo(mx - nx * h, my - ny * h);
    ctx.lineTo(ax - nx * e, ay - ny * e);
    ctx.closePath();
  }
}
