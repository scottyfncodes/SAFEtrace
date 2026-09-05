/** Core math. No game knowledge, no DOM, no randomness. */

export interface Vec2 { x: number; y: number; }

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const fromAngle = (a: number, s = 1): Vec2 => ({ x: Math.cos(a) * s, y: Math.sin(a) * s });
export const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x);
export const perp = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const invLerp = (a: number, b: number, v: number): number => (b - a === 0 ? 0 : (v - a) / (b - a));
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number): number =>
  lerp(b0, b1, clamp01(invLerp(a0, a1, v)));

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/** Shortest signed angular difference from `a` to `b`. */
export const angleDelta = (a: number, b: number): number => wrapAngle(b - a);

/** Move angle `a` toward `b` by at most `maxStep`. */
export function angleToward(a: number, b: number, maxStep: number): number {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return wrapAngle(b);
  return wrapAngle(a + Math.sign(d) * maxStep);
}

/** Move a scalar toward a target by at most maxStep. */
export function toward(a: number, b: number, maxStep: number): number {
  const d = b - a;
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

/** Frame-rate independent exponential smoothing. */
export function damp(a: number, b: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return b;
  return b + (a - b) * Math.pow(2, -dt / halfLife);
}

export function dampV(a: Vec2, b: Vec2, halfLife: number, dt: number): Vec2 {
  return { x: damp(a.x, b.x, halfLife, dt), y: damp(a.y, b.y, halfLife, dt) };
}

// --- easing ---------------------------------------------------------------
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

// --- geometry -------------------------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number; }

export const rectContains = (r: Rect, p: Vec2): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function rectExpand(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
}

/** Axis-aligned bounds of a polygon. */
export function polyBounds(poly: readonly Vec2[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Even-odd point-in-polygon. */
export function pointInPoly(poly: readonly Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const t = (p.y - a.y) / (b.y - a.y);
      if (p.x < a.x + t * (b.x - a.x)) inside = !inside;
    }
  }
  return inside;
}

/** Closest point on segment ab to p. */
export function closestOnSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-12) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

export function distToSegment(a: Vec2, b: Vec2, p: Vec2): number {
  const c = closestOnSegment(a, b, p);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

/** Segment/segment intersection test. Returns t along ab, or null. */
export function segmentIntersectT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const acx = c.x - a.x, acy = c.y - a.y;
  const t = (acx * s.y - acy * s.x) / denom;
  const u = (acx * r.y - acy * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

export const segmentsIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean =>
  segmentIntersectT(a, b, c, d) !== null;

/** Build a rectangle polygon centred at c, size w x h, rotated by `rot`. */
export function rectPoly(c: Vec2, w: number, h: number, rot = 0): Vec2[] {
  const hw = w / 2, hh = h / 2;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return corners.map(([x, y]) => ({ x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs }));
}

/** Is `p` inside the cone at `origin` facing `facing` with half-angle `half` and radius `range`? */
export function inCone(origin: Vec2, facing: number, half: number, range: number, p: Vec2): boolean {
  const dx = p.x - origin.x, dy = p.y - origin.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > range * range) return false;
  if (d2 < 1e-9) return true;
  return Math.abs(angleDelta(facing, Math.atan2(dy, dx))) <= half;
}

/** Polygon area (signed). */
export function polyArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return a / 2;
}

export function polyCentroid(poly: readonly Vec2[]): Vec2 {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) return polyBounds(poly) as unknown as Vec2;
  a *= 3;
  return { x: cx / a, y: cy / a };
}

/** A point in the world with a height. Enough to rig a limb with. */
export interface Vec3 { x: number; y: number; z: number }

/**
 * Where the joint of a two-bone limb goes.
 *
 * Given where a limb starts, where it ends, and how long each half of it is,
 * there are only two places the joint can be: mirror images of each other
 * across the line between the ends. `bendTo` picks which — forward for a knee,
 * back for an elbow — and picking it explicitly is the whole reason a knee
 * cannot fold the wrong way in a pose nobody thought to check. If the ends are
 * further apart than the limb is long the limb straightens rather than tearing.
 *
 * This lives here rather than in the renderer because it is geometry: the same
 * triangle solves a leg, an arm, and anything else with an elbow in it.
 */
export function solveTwoBone(
  root: Vec3, end: Vec3, upper: number, lower: number, bendTo: Vec2,
): Vec3 {
  const vx = end.x - root.x, vy = end.y - root.y, vz = end.z - root.z;
  const span = Math.hypot(vx, vy, vz);
  if (span < 1e-6) return { x: root.x, y: root.y, z: root.z };
  // Never longer than the limb: past full extension the joint sits on the line.
  const d = Math.min(span, (upper + lower) * 0.999);
  const ux = vx / span, uy = vy / span, uz = vz / span;

  // How far along the limb the joint sits, and how far off that line.
  const a = (upper * upper - lower * lower + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));

  // The bend direction with everything along the limb taken out of it, so the
  // joint is pushed square to the line between the ends.
  const dot = bendTo.x * ux + bendTo.y * uy;
  let bx = bendTo.x - ux * dot, by = bendTo.y - uy * dot, bz = -uz * dot;
  const bl = Math.hypot(bx, by, bz);
  if (bl < 1e-6) {
    // Bend direction is along the limb: fall back to any square direction.
    bx = -uy; by = ux; bz = 0;
    const fl = Math.hypot(bx, by) || 1;
    bx /= fl; by /= fl;
  } else {
    bx /= bl; by /= bl; bz /= bl;
  }

  return {
    x: root.x + ux * a + bx * h,
    y: root.y + uy * a + by * h,
    z: root.z + uz * a + bz * h,
  };
}
