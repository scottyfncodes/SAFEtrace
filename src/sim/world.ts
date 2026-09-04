/**
 * Runtime queries over the town. Pure: no rendering, no DOM.
 * All the expensive spatial questions the surveillance sim asks live here.
 */
import {
  type Vec2, type Rect, dist2, pointInPoly, polyBounds, segmentsIntersect,
  rectExpand, closestOnSegment, rectsOverlap,
} from '../core/math';
import { SpatialHash, unique } from '../core/spatial';
import type {
  WorldData, SurfaceKind, SurfacePatch, Building, Occluder, Cover, Prop,
  SkateFeature, RoadNode, RoadEdge, District, SensorData,
} from './worldTypes';

export interface SurfaceProps { friction: number; grip: number; bailRisk: number; }

export const SURFACE: Record<SurfaceKind, SurfaceProps> = {
  asphalt:        { friction: 0.55, grip: 1.00, bailRisk: 0.00 },
  smoothConcrete: { friction: 0.38, grip: 1.04, bailRisk: 0.00 },
  roughConcrete:  { friction: 0.95, grip: 0.98, bailRisk: 0.00 },
  tile:           { friction: 0.62, grip: 0.92, bailRisk: 0.01 },
  grass:          { friction: 6.20, grip: 0.70, bailRisk: 0.00 },
  gravel:         { friction: 4.00, grip: 0.55, bailRisk: 0.05 },
  dirt:           { friction: 2.60, grip: 0.72, bailRisk: 0.01 },
  water:          { friction: 9.00, grip: 0.40, bailRisk: 0.00 },
};

interface RoadAdj { to: string; edge: RoadEdge; }

export class World {
  readonly data: WorldData;

  private surfaceHash = new SpatialHash<SurfacePatch>(10);
  private occluderHash = new SpatialHash<Occluder>(10);
  private coverHash = new SpatialHash<Cover>(12);
  private buildingHash = new SpatialHash<Building>(12);
  private propHash = new SpatialHash<Prop>(8);
  private featureHash = new SpatialHash<SkateFeature>(8);
  private roadNodeHash = new SpatialHash<RoadNode>(16);

  readonly roadNodeById = new Map<string, RoadNode>();
  readonly adjacency = new Map<string, RoadAdj[]>();
  private scratch: unknown[] = [];

  constructor(data: WorldData) {
    this.data = data;
    this.build();
  }

  private build(): void {
    for (const s of this.data.surfaces) this.surfaceHash.insertRect(polyBounds(s.poly), s);
    for (const o of this.data.occluders) {
      const r: Rect = {
        x: Math.min(o.a.x, o.b.x), y: Math.min(o.a.y, o.b.y),
        w: Math.abs(o.a.x - o.b.x), h: Math.abs(o.a.y - o.b.y),
      };
      this.occluderHash.insertRect(rectExpand(r, 0.5), o);
    }
    for (const c of this.data.covers) this.coverHash.insertRect(polyBounds(c.poly), c);
    for (const b of this.data.buildings) this.buildingHash.insertRect(polyBounds(b.poly), b);
    for (const p of this.data.props) this.propHash.insert(p.pos, p);
    for (const f of this.data.features) this.featureHash.insertRect(polyBounds(f.poly), f);

    for (const n of this.data.roadNodes) {
      this.roadNodeById.set(n.id, n);
      this.roadNodeHash.insert(n.pos, n);
      this.adjacency.set(n.id, []);
    }
    for (const e of this.data.roadEdges) {
      this.adjacency.get(e.a)?.push({ to: e.b, edge: e });
      this.adjacency.get(e.b)?.push({ to: e.a, edge: e });
    }
  }

  // --- surfaces ----------------------------------------------------------

  surfaceAt(p: Vec2): SurfaceKind {
    const cands = this.surfaceHash.queryRadius(p, 0.1, this.scratch as SurfacePatch[]);
    let best: SurfacePatch | null = null;
    for (const s of cands) {
      if (best && s.priority <= best.priority) continue;
      if (pointInPoly(s.poly, p)) best = s;
    }
    return best ? best.kind : 'grass';
  }

  surfaceProps(p: Vec2): SurfaceProps { return SURFACE[this.surfaceAt(p)]; }

  /** Surfaces overlapping a view rectangle, for per-frame linework. */
  surfacesIn(r: Rect): SurfacePatch[] {
    return unique(this.surfaceHash.queryRect(r, this.scratch as SurfacePatch[]));
  }

  // --- occlusion ---------------------------------------------------------

  /** Does anything block sight from a to b? `viewerHeight` lets tall cameras see over low walls. */
  blocked(a: Vec2, b: Vec2, viewerHeight = 0): boolean {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = Math.hypot(a.x - b.x, a.y - b.y) / 2 + 1;
    const cands = unique(this.occluderHash.queryRadius(mid, r, this.scratch as Occluder[]));
    for (const o of cands) {
      if (o.height <= viewerHeight - 2.2) continue;
      if (segmentsIntersect(a, b, o.a, o.b)) return true;
    }
    return false;
  }

  /** Is `p` under overhead cover? Defeats drone observation. */
  underCover(p: Vec2): Cover | null {
    const cands = unique(this.coverHash.queryRadius(p, 0.1, this.scratch as Cover[]));
    for (const c of cands) if (pointInPoly(c.poly, p)) return c;
    return null;
  }

  buildingAt(p: Vec2): Building | null {
    const cands = unique(this.buildingHash.queryRadius(p, 0.1, this.scratch as Building[]));
    for (const b of cands) if (pointInPoly(b.poly, p)) return b;
    return null;
  }

  /**
   * Solid collision against building footprints, ignoring anything shorter than
   * `clearHeight`. That is what makes an ollie mean something: a ledge, a curb
   * and a low wall are obstacles on the ground and gaps in the air.
   */
  resolveCollision(from: Vec2, to: Vec2, radius = 0.45, clearHeight = 0): Vec2 {
    const cands = unique(this.buildingHash.queryRadius(to, radius + 2, this.scratch as Building[]))
      .filter((b) => b.height > clearHeight);
    let p = { x: to.x, y: to.y };
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of cands) {
        if (!this.nearPoly(b.poly, p, radius)) continue;
        const push = this.pushOutOfPoly(b.poly, p, radius);
        if (push) { p = push; moved = true; }
      }
      if (!moved) break;
    }
    // Never let a resolve teleport the player far.
    if (dist2(p, from) > 36) return { x: from.x, y: from.y };
    return p;
  }

  private nearPoly(poly: Vec2[], p: Vec2, r: number): boolean {
    if (pointInPoly(poly, p)) return true;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSegment(poly[j], poly[i], p);
      if (dist2(c, p) < r * r) return true;
    }
    return false;
  }

  private pushOutOfPoly(poly: Vec2[], p: Vec2, r: number): Vec2 | null {
    let bestD = Infinity;
    let bestPt: Vec2 | null = null;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSegment(poly[j], poly[i], p);
      const d = dist2(c, p);
      if (d < bestD) { bestD = d; bestPt = c; }
    }
    if (!bestPt) return null;
    const inside = pointInPoly(poly, p);
    let nx = p.x - bestPt.x, ny = p.y - bestPt.y;
    const l = Math.hypot(nx, ny);
    if (l < 1e-6) { nx = 1; ny = 0; }
    else { nx /= l; ny /= l; }
    if (inside) { nx = -nx; ny = -ny; }
    const target = inside ? r : r;
    return { x: bestPt.x + nx * target, y: bestPt.y + ny * target };
  }

  // --- props & features --------------------------------------------------

  propsNear(p: Vec2, r: number): Prop[] {
    return unique(this.propHash.queryRadius(p, r, this.scratch as Prop[]))
      .filter((q) => dist2(q.pos, p) <= r * r);
  }

  featureAt(p: Vec2): SkateFeature | null {
    const cands = unique(this.featureHash.queryRadius(p, 0.1, this.scratch as SkateFeature[]));
    for (const f of cands) if (pointInPoly(f.poly, p)) return f;
    return null;
  }

  // --- road graph --------------------------------------------------------

  nearestRoadNode(p: Vec2, maxR = 40): RoadNode | null {
    const cands = unique(this.roadNodeHash.queryRadius(p, maxR, this.scratch as RoadNode[]));
    let best: RoadNode | null = null;
    let bd = maxR * maxR;
    for (const n of cands) {
      const d = dist2(n.pos, p);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /**
   * How far p is from anything SAFEtrace modelled.
   *
   * Zero inside modelled space — carriageway, footway, plaza, school forecourt —
   * because being in a place people are expected to be is ordinary. Otherwise
   * the distance to the nearest road centreline. This is the quantity that
   * drives UNUSUAL_ROUTE and prediction error, and it is the mechanical
   * statement of the world design: the spaces nobody modelled are the spaces
   * you are free in.
   */
  distanceOffModel(p: Vec2): number {
    for (const s of this.surfaceHash.queryRadius(p, 0.1, this.scratch as SurfacePatch[])) {
      if (s.modelled && pointInPoly(s.poly, p)) return 0;
    }
    const n = this.nearestRoadNode(p, 60);
    if (!n) return 999;
    let best = Math.hypot(n.pos.x - p.x, n.pos.y - p.y);
    for (const adj of this.adjacency.get(n.id) ?? []) {
      const o = this.roadNodeById.get(adj.to);
      if (!o) continue;
      const c = closestOnSegment(n.pos, o.pos, p);
      best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y));
    }
    return best;
  }

  /** @deprecated Use distanceOffModel; kept as the name the docs use. */
  distanceToRoad(p: Vec2): number { return this.distanceOffModel(p); }

  neighbours(id: string): RoadAdj[] { return this.adjacency.get(id) ?? []; }

  /** Dijkstra path between road nodes. Used for patrol routing. */
  path(fromId: string, toId: string): string[] {
    if (fromId === toId) return [fromId];
    const distMap = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const frontier: string[] = [fromId];

    while (frontier.length) {
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) {
        if ((distMap.get(frontier[i]) ?? Infinity) < (distMap.get(frontier[bi]) ?? Infinity)) bi = i;
      }
      const cur = frontier.splice(bi, 1)[0];
      if (cur === toId) break;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const cd = distMap.get(cur) ?? Infinity;
      const cp = this.roadNodeById.get(cur);
      if (!cp) continue;
      for (const adj of this.neighbours(cur)) {
        const np = this.roadNodeById.get(adj.to);
        if (!np) continue;
        const nd = cd + Math.hypot(np.pos.x - cp.pos.x, np.pos.y - cp.pos.y);
        if (nd < (distMap.get(adj.to) ?? Infinity)) {
          distMap.set(adj.to, nd);
          prev.set(adj.to, cur);
          if (!visited.has(adj.to)) frontier.push(adj.to);
        }
      }
    }

    if (!prev.has(toId) && fromId !== toId) return [];
    const out: string[] = [toId];
    let c = toId;
    let guard = 0;
    while (c !== fromId && guard++ < 2000) {
      const p = prev.get(c);
      if (!p) return [];
      out.push(p);
      c = p;
    }
    return out.reverse();
  }

  pathPoints(fromId: string, toId: string): Vec2[] {
    return this.path(fromId, toId)
      .map((id) => this.roadNodeById.get(id))
      .filter((n): n is RoadNode => !!n)
      .map((n) => n.pos);
  }

  districtAt(p: Vec2): District | null {
    let best: District | null = null;
    let bd = Infinity;
    for (const d of this.data.districts) {
      const dd = dist2(d.centre, p);
      if (dd < d.radius * d.radius && dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  clampToBounds(p: Vec2): Vec2 {
    const { min, max } = this.data.bounds;
    return {
      x: p.x < min.x ? min.x : p.x > max.x ? max.x : p.x,
      y: p.y < min.y ? min.y : p.y > max.y ? max.y : p.y,
    };
  }
}

// --- content validation ---------------------------------------------------

export interface ValidationIssue { severity: 'error' | 'warning'; message: string; }

/**
 * Structural assertions over the shipped town. Run in dev and in CI.
 * This catches design mistakes a texture pack never could.
 */
export function validateWorld(data: WorldData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (m: string) => issues.push({ severity: 'error', message: m });
  const warn = (m: string) => issues.push({ severity: 'warning', message: m });

  const nodeIds = new Set(data.network.nodes.map((n) => n.id));
  const segIds = new Set(data.network.segments.map((s) => s.id));

  for (const n of data.network.nodes) {
    // Uplinks are segment roots and services sit outside the segment tree.
    if (n.kind !== 'SERVICE' && n.kind !== 'UPLINK' && !segIds.has(n.segmentId)) {
      err(`node ${n.id} references unknown segment ${n.segmentId}`);
    }
    for (const e of n.edges) if (!nodeIds.has(e)) err(`node ${n.id} has dangling edge -> ${e}`);
  }
  for (const s of data.network.segments) {
    if (!nodeIds.has(s.uplinkId)) err(`segment ${s.id} references unknown uplink ${s.uplinkId}`);
  }
  for (const s of data.sensors) {
    if (!nodeIds.has(s.nodeId)) err(`sensor ${s.id} has no network node (${s.nodeId})`);
    if (s.fov <= 0 || s.fov > Math.PI * 1.6) err(`sensor ${s.id} has implausible fov ${s.fov}`);
    if (s.range <= 0) err(`sensor ${s.id} has non-positive range`);
  }

  // Road graph connectivity.
  const ids = data.roadNodes.map((n) => n.id);
  if (ids.length) {
    const adj = new Map<string, string[]>();
    for (const n of data.roadNodes) adj.set(n.id, []);
    for (const e of data.roadEdges) {
      if (!adj.has(e.a)) { err(`road edge references unknown node ${e.a}`); continue; }
      if (!adj.has(e.b)) { err(`road edge references unknown node ${e.b}`); continue; }
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
    const seen = new Set<string>([ids[0]]);
    const stack = [ids[0]];
    while (stack.length) {
      const c = stack.pop()!;
      for (const n of adj.get(c) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    if (seen.size !== ids.length) {
      err(`road graph is not connected: ${ids.length - seen.size} of ${ids.length} nodes unreachable`);
    }
  }

  // Cameras must sit on a facade, not buried in a wall. Cameras declared
  // interior are mounted inside a structure on purpose.
  for (const s of data.sensors) {
    if (s.interior) continue;
    for (const b of data.buildings) {
      if (pointInPoly(b.poly, s.pos)) {
        // Wall-mounted cameras sit on the facade; a small inset is fine, deep is a bug.
        const bounds = polyBounds(b.poly);
        const inset = Math.min(
          s.pos.x - bounds.x, bounds.x + bounds.w - s.pos.x,
          s.pos.y - bounds.y, bounds.y + bounds.h - s.pos.y,
        );
        if (inset > 0.9) warn(`sensor ${s.id} is ${inset.toFixed(1)}m inside building ${b.id}`);
        break;
      }
    }
  }

  // --- guardrails earned by real authoring failures ------------------------
  //
  // Each of these exists because a hand-authored district actually broke this
  // way. They are general on purpose: the next district gets the check for
  // free, which is the whole point of hand-authoring content at scale.

  // A camera that can see nothing is either buried, boxed in by the thing it is
  // mounted on, or aimed into a wall. This caught a bus-shelter camera mounted
  // behind its own shelter.
  const world = new World(data);
  for (const s of data.sensors) {
    if (s.interior) continue;
    if (!sensorHasVisibleGround(s, world)) {
      err(`sensor ${s.id} (${s.label}) can see no open ground: buried, boxed in, or aimed at a wall`);
    }
  }

  // Two buildings occupying the same ground means a district was authored twice.
  // This is exactly how a duplicated terrace row got shipped.
  const bounds = data.buildings.map((b) => ({ b, r: polyBounds(b.poly) }));
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], c = bounds[j];
      if (!rectsOverlap(a.r, c.r)) continue;
      const ox = Math.min(a.r.x + a.r.w, c.r.x + c.r.w) - Math.max(a.r.x, c.r.x);
      const oy = Math.min(a.r.y + a.r.h, c.r.y + c.r.h) - Math.max(a.r.y, c.r.y);
      const smaller = Math.min(a.r.w * a.r.h, c.r.w * c.r.h);
      if (smaller > 0 && ox * oy > smaller * 0.6) {
        err(`buildings ${a.b.id} and ${c.b.id} occupy the same ground: content authored twice?`);
      }
    }
  }

  // A district with buildings but no coverage, or with no way to reach it, is
  // half-authored. Better to fail loudly than to ship a hole in the town.
  const districtBuildings = new Map<string, number>();
  for (const b of data.buildings) {
    districtBuildings.set(b.district, (districtBuildings.get(b.district) ?? 0) + 1);
  }
  //
  // Road reachability is deliberately *not* checked per district. The Channel
  // has no roads on purpose — being unmodelled is the whole point of it — so a
  // per-district rule would only encode an exception. Global graph connectivity
  // is checked above, which is the property that actually matters.
  const districtSensors = new Set(data.sensors.map((s) => s.district));
  for (const [id, count] of districtBuildings) {
    if (count < 3) continue;
    if (!districtSensors.has(id)) warn(`district ${id} has ${count} buildings and no sensors`);
  }

  // Generated ids shift whenever content is reordered, so anything the story or
  // a test names must be authored with an explicit, stable id.
  for (const id of STABLE_IDS) {
    const found = data.network.nodes.some((n) => n.id === id) || data.sensors.some((s) => s.id === id);
    if (!found) err(`stable identifier ${id} is missing: story and tests reference it by name`);
  }

  if (data.spawns.dronePads.length === 0) warn('no drone pads defined');
  if (data.covers.length < 3) warn('fewer than three overhead cover areas: drone counterplay will be thin');

  return issues;
}

/**
 * Identifiers that must never be generated, because something outside the
 * content layer refers to them.
 */
export const STABLE_IDS = [
  'CM-207', 'JX-207', 'JX-N3', 'TX-1', 'TX-2',
  'SVC-VISION', 'SVC-REVIEW', 'SVC-PREDICT', 'SVC-RECORD',
];

/**
 * Can this sensor see any open ground at all, anywhere in its sweep?
 *
 * Sight is traced from a point just in front of the housing rather than from
 * the housing itself, because almost every camera in Bellhaven is bolted to a
 * wall and would otherwise be reported as blocked by the building it is mounted
 * on. What this catches is the real failure: a camera boxed in by the structure
 * it is supposed to be looking past.
 */
function sensorHasVisibleGround(s: SensorData, world: World): boolean {
  const half = s.fov / 2;
  const steps = s.sweep > 0 ? 7 : 1;
  const standoff = Math.min(2, s.range * 0.2);

  for (let k = 0; k < steps; k++) {
    const facing = s.facing + (steps === 1 ? 0 : (k / (steps - 1) - 0.5) * 2 * s.sweep);
    for (const off of [-half * 0.7, -half * 0.3, 0, half * 0.3, half * 0.7]) {
      const a = facing + off;
      const from = { x: s.pos.x + Math.cos(a) * standoff, y: s.pos.y + Math.sin(a) * standoff };
      // Still inside a structure a couple of metres out: genuinely boxed in.
      if (world.buildingAt(from)) continue;
      // Near-field first: a tripwire camera watching a six-metre alley across
      // its width is legitimate, and sampling only the far field would call it
      // blind.
      for (const d of [s.range * 0.15, s.range * 0.35, s.range * 0.6, s.range * 0.85]) {
        const p = { x: s.pos.x + Math.cos(a) * d, y: s.pos.y + Math.sin(a) * d };
        if (world.buildingAt(p)) continue;
        if (!world.blocked(from, p, s.height)) return true;
      }
    }
  }
  return false;
}
