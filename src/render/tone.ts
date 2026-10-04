/**
 * Tone: what a printed page uses instead of gradients.
 *
 * A wall in shade is not a darker wall, it is a wall with hatching over it; a
 * shadow on the road is a wash with lines through it; a crown of leaves is a
 * dark shape with a dot screen. These are fills, made once per canvas and
 * reused, in the screen's own pixels — which is how screentone on a printed
 * page behaves too: it belongs to the page, not to the thing it shades.
 *
 * The cost of that is the "shower door": while the camera moves, the tone
 * stays put and the wall slides under it. On a page that is invisible; in
 * motion it is faint, and at this pitch it reads as print rather than as a
 * bug. It is noted in docs/40 as the first thing to revisit if it does not.
 */
import { PRINT, alpha } from './palette';

export const enum Tone {
  /** Diagonal hatching: the side of a building away from the light. */
  Hatch = 0,
  /** Cross-hatched, sparser and steeper: a cast shadow on the ground. */
  Shadow = 1,
  /** A coarse dot screen: foliage, and a roof slope away from the sun. */
  Dots = 2,
}

const cache = new WeakMap<CanvasRenderingContext2D, Map<Tone, CanvasPattern | null>>();

/**
 * The pattern for a tone, on this context. Built on first use at the
 * context's device scale and pinned to device pixels, so a hatch line is one
 * crisp line on a phone's glass rather than a blurred two.
 */
export function tone(ctx: CanvasRenderingContext2D, t: Tone): CanvasPattern | null {
  let m = cache.get(ctx);
  if (!m) { m = new Map(); cache.set(ctx, m); }
  if (m.has(t)) return m.get(t)!;
  let p: CanvasPattern | null = null;
  try { p = build(ctx, t); } catch { p = null; }
  m.set(t, p);
  return p;
}

function build(ctx: CanvasRenderingContext2D, t: Tone): CanvasPattern | null {
  if (typeof document === 'undefined') return null;
  const dpr = Math.max(1, Math.round(ctx.getTransform().a));
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (!g) return null;
  // Tile sizes in CSS pixels; drawn at device resolution.
  const size = t === Tone.Dots ? 6 : t === Tone.Shadow ? 7 : 5;
  const S = size * dpr;
  c.width = S; c.height = S;
  g.scale(dpr, dpr);
  g.lineCap = 'square';
  if (t === Tone.Hatch) {
    // One diagonal per tile, wrapped so the lines are continuous.
    g.strokeStyle = alpha(PRINT.ink, 0.42);
    g.lineWidth = 0.9;
    for (const o of [-size, 0, size]) {
      g.beginPath(); g.moveTo(o, size); g.lineTo(o + size, 0); g.stroke();
    }
  } else if (t === Tone.Shadow) {
    g.strokeStyle = alpha(PRINT.ink, 0.5);
    g.lineWidth = 0.8;
    for (const o of [-size, 0, size]) {
      g.beginPath(); g.moveTo(o, 0); g.lineTo(o + size, size); g.stroke();
    }
  } else {
    g.fillStyle = alpha(PRINT.ink, 0.38);
    for (const [x, y] of [[1.5, 1.5], [4.5, 4.5]]) {
      g.beginPath(); g.arc(x, y, 0.95, 0, Math.PI * 2); g.fill();
    }
  }
  const p = ctx.createPattern(c, 'repeat');
  if (p && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  return p;
}
