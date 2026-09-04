/**
 * Town authoring DSL.
 *
 * Each helper emits geometry, surfaces, occluders, network nodes and road-graph
 * edges *together*, so it is structurally impossible to author a house with a
 * camera that is not on a segment. Correctness comes from the authoring layer
 * rather than from discipline.
 */
import { type Vec2, DEG, norm, perp, rectPoly, sub } from '../core/math';
import type {
  Building, BuildingKind, Cover, District, NetworkNodeData, NetworkNodeKind,
  NetworkSegmentData, Prop, PropKind, RoadEdge, RoadNode, SensorData, SensorKind,
  SkateFeature, SurfaceKind, SurfacePatch, WorldData, FeatureKind,
} from '../sim/worldTypes';

const P = (x: number, y: number): Vec2 => ({ x, y });

export class TownBuilder {
  private surfaces: SurfacePatch[] = [];
  private buildings: Building[] = [];
  private occluders: WorldData['occluders'] = [];
  private covers: Cover[] = [];
  private props: Prop[] = [];
  private features: SkateFeature[] = [];
  private roadNodes: RoadNode[] = [];
  private roadEdges: RoadEdge[] = [];
  private sensors: SensorData[] = [];
  private nodes: NetworkNodeData[] = [];
  private segments: NetworkSegmentData[] = [];
  private districts: District[] = [];

  private counters = new Map<string, number>();
  private currentDistrict = 'bellhaven';
  private currentSegment = 'S-0';

  private id(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${n.toString().padStart(3, '0')}`;
  }

  district(id: string, name: string, centre: Vec2, radius: number): this {
    this.districts.push({ id, name, centre, radius });
    this.currentDistrict = id;
    return this;
  }

  in(districtId: string): this { this.currentDistrict = districtId; return this; }

  uplink(id: string, pos: Vec2, label: string): this {
    this.nodes.push({ id, kind: 'UPLINK', pos, segmentId: id, label, edges: [], records: [] });
    return this;
  }

  segment(id: string, uplinkId: string, label: string): this {
    this.segments.push({ id, uplinkId, label, nodeIds: [] });
    this.currentSegment = id;
    return this;
  }

  useSegment(id: string): this { this.currentSegment = id; return this; }

  private addNode(
    kind: NetworkNodeKind, pos: Vec2, label: string, idOverride?: string, records: string[] = [],
  ): NetworkNodeData {
    const prefix = kind === 'CAMERA' ? 'CM' : kind === 'JUNCTION' ? 'JX'
      : kind === 'PLATE_READER' ? 'PR' : kind === 'SPEAKER' ? 'SP'
      : kind === 'SIGN' ? 'SG' : kind === 'DOOR' ? 'DR' : 'ND';
    const id = idOverride ?? this.id(prefix);
    const seg = this.segments.find((s) => s.id === this.currentSegment);
    const node: NetworkNodeData = {
      id, kind, pos, segmentId: this.currentSegment, label,
      edges: seg ? [seg.uplinkId] : [], records,
    };
    if (seg) seg.nodeIds.push(id);
    this.nodes.push(node);
    return node;
  }

  service(id: string, label: string, pos: Vec2, records: string[]): this {
    this.nodes.push({ id, kind: 'SERVICE', pos, segmentId: 'SVC', label, edges: [], records });
    return this;
  }

  /** Connect two existing nodes with a graph edge, both ways. */
  link(a: string, b: string): this {
    const na = this.nodes.find((n) => n.id === a);
    const nb = this.nodes.find((n) => n.id === b);
    if (na && !na.edges.includes(b)) na.edges.push(b);
    if (nb && !nb.edges.includes(a)) nb.edges.push(a);
    return this;
  }

  surface(poly: Vec2[], kind: SurfaceKind, priority = 0, modelled = false): this {
    this.surfaces.push({ id: this.id('SF'), kind, poly, priority, modelled });
    return this;
  }

  rectSurface(
    x: number, y: number, w: number, h: number, kind: SurfaceKind, priority = 0, modelled = false,
  ): this {
    return this.surface(
      [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], kind, priority, modelled,
    );
  }

  /** A road: emits a paved strip, graph nodes at each point, and edges between them. */
  road(
    name: string, pts: Vec2[],
    opts: { width?: number; surface?: SurfaceKind; prior?: number; sidewalk?: boolean } = {},
  ): string[] {
    const width = opts.width ?? 7;
    const surface = opts.surface ?? 'asphalt';
    const prior = opts.prior ?? 1;
    const ids: string[] = [];

    for (let i = 0; i < pts.length; i++) {
      const id = this.id('RN');
      this.roadNodes.push({ id, pos: pts[i], district: this.currentDistrict });
      ids.push(id);
      if (i > 0) {
        this.roadEdges.push({ a: ids[i - 1], b: id, width, prior, surface });
        const a = pts[i - 1], b = pts[i];
        const n = perp(norm(sub(b, a)));
        const hw = width / 2;
        this.surface([
          P(a.x + n.x * hw, a.y + n.y * hw), P(b.x + n.x * hw, b.y + n.y * hw),
          P(b.x - n.x * hw, b.y - n.y * hw), P(a.x - n.x * hw, a.y - n.y * hw),
        ], surface, 2, true);
        if (opts.sidewalk !== false) {
          const sw = 2.2;
          for (const s of [1, -1]) {
            this.surface([
              P(a.x + n.x * s * hw, a.y + n.y * s * hw),
              P(b.x + n.x * s * hw, b.y + n.y * s * hw),
              P(b.x + n.x * s * (hw + sw), b.y + n.y * s * (hw + sw)),
              P(a.x + n.x * s * (hw + sw), a.y + n.y * s * (hw + sw)),
            ], 'roughConcrete', 1, true);
          }
        }
      }
    }
    void name;
    return ids;
  }

  /**
   * A paved path. It exists physically and it is excellent to skate, but it is
   * deliberately NOT on the road graph — so SAFEtrace's forecast cannot run
   * along it. The spaces the system did not model are the spaces you are free in.
   */
  path(pts: Vec2[], width = 3.4, surface: SurfaceKind = 'roughConcrete'): this {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = perp(norm(sub(b, a)));
      const hw = width / 2;
      this.surface([
        P(a.x + n.x * hw, a.y + n.y * hw), P(b.x + n.x * hw, b.y + n.y * hw),
        P(b.x - n.x * hw, b.y - n.y * hw), P(a.x - n.x * hw, a.y - n.y * hw),
      ], surface, 3);
    }
    return this;
  }

  /** Join two existing road node ids (for loops and junctions). */
  joinRoad(a: string, b: string, prior = 1, width = 7): this {
    const na = this.roadNodes.find((n) => n.id === a);
    const nb = this.roadNodes.find((n) => n.id === b);
    if (!na || !nb) return this;
    this.roadEdges.push({ a, b, width, prior, surface: 'asphalt' });
    const n = perp(norm(sub(nb.pos, na.pos)));
    const hw = width / 2;
    this.surface([
      P(na.pos.x + n.x * hw, na.pos.y + n.y * hw), P(nb.pos.x + n.x * hw, nb.pos.y + n.y * hw),
      P(nb.pos.x - n.x * hw, nb.pos.y - n.y * hw), P(na.pos.x - n.x * hw, na.pos.y - n.y * hw),
    ], 'asphalt', 2, true);
    return this;
  }

  building(
    kind: BuildingKind, poly: Vec2[],
    opts: { height?: number; wall?: string; roof?: string; occupants?: number; label?: string; id?: string } = {},
  ): Building {
    const b: Building = {
      id: opts.id ?? this.id('BLD'),
      kind,
      poly,
      height: opts.height ?? 5.5,
      wall: opts.wall ?? '#F0E3D0',
      roof: opts.roof ?? '#C4714E',
      district: this.currentDistrict,
      occupants: opts.occupants,
      label: opts.label,
      nodeIds: [],
    };
    this.buildings.push(b);
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      this.occluders.push({ a: poly[j], b: poly[i], height: b.height });
    }
    return b;
  }

  /**
   * A suburban house: footprint, lawn, driveway apron (a genuinely useful
   * one-metre strip of smooth concrete), an optional porch camera, and a
   * mailbox. Everything a house is, in the fiction and in the simulation.
   */
  house(opts: {
    at: Vec2; w?: number; d?: number; rot?: number; roof?: string; wall?: string;
    occupants?: number; camera?: { facing: number; fov?: number; range?: number; sweep?: number };
    drivewayDir?: number; label?: string; garage?: boolean;
  }): Building {
    const w = opts.w ?? 11, d = opts.d ?? 9, rot = (opts.rot ?? 0) * DEG;
    const lawnPoly = rectPoly(opts.at, w + 9, d + 11, rot);
    this.surface(lawnPoly, 'grass', 0);

    const poly = rectPoly(opts.at, w, d, rot);
    const b = this.building('house', poly, {
      height: 5.4 + (opts.occupants ?? 3) * 0.1,
      wall: opts.wall,
      roof: opts.roof,
      occupants: opts.occupants ?? 3,
      label: opts.label ?? `RES ${this.buildings.length + 100}`,
    });

    const dd = (opts.drivewayDir ?? 90) * DEG;
    const dx = Math.cos(dd), dy = Math.sin(dd);
    // How far the facade is from the centre along the direction we are facing.
    // A house is not square, so using the depth for a frontage that faces along
    // the width puts the camera and the driveway inside the building.
    const reach = halfExtent(w, d, rot, dd);
    const drivewayCentre = P(opts.at.x + dx * (reach + 5.5), opts.at.y + dy * (reach + 5.5));
    this.surface(rectPoly(drivewayCentre, 4.2, 12, dd), 'smoothConcrete', 3, true);

    if (opts.garage) {
      const gp = rectPoly(P(opts.at.x + dx * (reach + 2.6), opts.at.y + dy * (reach + 2.6)), 6, 5.5, rot);
      this.building('garage', gp, { height: 3.2, wall: opts.wall, roof: opts.roof });
      this.covers.push({ id: this.id('CV'), poly: gp, height: 3.2, kind: 'carport' });
    }

    if (opts.camera) {
      // On the facade, not behind it — and beside the garage door rather than
      // behind it, which is where a porch actually is.
      const lateral = opts.garage ? Math.min(w, d) * 0.34 : 0;
      const camPos = P(
        opts.at.x + dx * (reach - 0.35) - dy * lateral,
        opts.at.y + dy * (reach - 0.35) + dx * lateral,
      );
      this.camera({
        pos: camPos, facing: opts.camera.facing, kind: 'porch',
        fov: opts.camera.fov ?? 74, range: opts.camera.range ?? 24,
        sweep: opts.camera.sweep ?? 0, height: 3.1,
        label: `${b.label} PORCH`,
      });
      b.nodeIds.push(this.nodes[this.nodes.length - 1].id);
    }

    this.prop('mailbox', P(opts.at.x + dx * (reach + 11), opts.at.y + dy * (reach + 11)), dd);
    return b;
  }

  camera(opts: {
    pos: Vec2; facing: number; kind?: SensorKind; fov?: number; range?: number;
    sweep?: number; sweepPeriod?: number; sweepPhase?: number; height?: number;
    bias?: number; label?: string; id?: string; interior?: boolean;
  }): SensorData {
    const node = this.addNode('CAMERA', opts.pos, opts.label ?? 'CAMERA', opts.id, [
      `FEED: NOMINAL`,
      `RETENTION: 90 DAYS`,
      `SERVICES: SVC-VISION, SVC-PREDICT`,
    ]);
    const s: SensorData = {
      id: node.id,
      nodeId: node.id,
      kind: opts.kind ?? 'street',
      pos: opts.pos,
      height: opts.height ?? 4.2,
      facing: opts.facing * DEG,
      fov: (opts.fov ?? 68) * DEG,
      range: opts.range ?? 30,
      sweep: (opts.sweep ?? 0) * DEG,
      sweepPeriod: opts.sweepPeriod ?? 11,
      sweepPhase: opts.sweepPhase ?? (this.sensors.length * 0.137) % 1,
      recognitionBias: opts.bias ?? 0.92,
      district: this.currentDistrict,
      label: opts.label ?? node.id,
      interior: opts.interior,
    };
    this.sensors.push(s);
    return s;
  }

  junction(pos: Vec2, label: string, id?: string): NetworkNodeData {
    return this.addNode('JUNCTION', pos, label, id, ['SEGMENT RELAY', 'SELF-HEAL: 90S']);
  }

  plateReader(pos: Vec2, label: string): NetworkNodeData {
    return this.addNode('PLATE_READER', pos, label, undefined, ['READS TODAY: 1,842', 'RETENTION: 90 DAYS']);
  }

  speaker(pos: Vec2, label: string): NetworkNodeData {
    return this.addNode('SPEAKER', pos, label, undefined, ['PUBLIC ADDRESS', 'SAFEtrace CITY']);
  }

  fence(a: Vec2, b: Vec2, height = 1.9): this {
    this.occluders.push({ a, b, height });
    this.props.push({
      id: this.id('PR'), kind: 'fenceGate',
      pos: P((a.x + b.x) / 2, (a.y + b.y) / 2),
      rot: Math.atan2(b.y - a.y, b.x - a.x),
      scale: Math.hypot(b.x - a.x, b.y - a.y),
      district: this.currentDistrict,
    });
    return this;
  }

  /** Low wall: blocks a person but a 4 m camera sees over it. */
  lowWall(a: Vec2, b: Vec2): this { return this.fence(a, b, 1.1); }

  cover(poly: Vec2[], kind: Cover['kind'], height = 3.4): this {
    this.covers.push({ id: this.id('CV'), poly, height, kind });
    return this;
  }

  prop(kind: PropKind, pos: Vec2, rot = 0, opts: { scale?: number; tint?: string; hittable?: boolean } = {}): Prop {
    const p: Prop = {
      id: this.id('PR'), kind, pos, rot,
      scale: opts.scale ?? 1, tint: opts.tint,
      hittable: opts.hittable ?? ['bin', 'sign', 'car', 'hydrant', 'cone', 'planter', 'pole'].includes(kind),
      district: this.currentDistrict,
    };
    this.props.push(p);
    return p;
  }

  trees(pts: Vec2[], scale = 1): this {
    for (const p of pts) {
      this.prop('tree', p, 0, { scale });
      this.covers.push({
        id: this.id('CV'),
        poly: rectPoly(p, 6.4 * scale, 6.4 * scale, 0),
        height: 7, kind: 'canopy',
      });
    }
    return this;
  }

  feature(kind: FeatureKind, poly: Vec2[], facing: number, rise: number, boost: number): SkateFeature {
    const f: SkateFeature = {
      id: this.id('FT'), kind, poly, facing: facing * DEG, rise, boost,
      district: this.currentDistrict,
    };
    this.features.push(f);
    return f;
  }

  bank(centre: Vec2, w: number, h: number, facing: number, rise = 2.2, boost = 3.4): SkateFeature {
    const poly = rectPoly(centre, w, h, facing * DEG);
    this.surface(poly, 'smoothConcrete', 4);
    return this.feature('bank', poly, facing, rise, boost);
  }

  kicker(centre: Vec2, w: number, h: number, facing: number, boost = 4.2): SkateFeature {
    const poly = rectPoly(centre, w, h, facing * DEG);
    this.surface(poly, 'smoothConcrete', 4);
    return this.feature('kicker', poly, facing, 1.2, boost);
  }

  /**
   * A ledge: knee-high, solid on the ground, and clear in the air. The single
   * most useful piece of geometry in a plaza, for skating and for cover alike.
   */
  ledge(a: Vec2, b: Vec2, thickness = 0.8, height = 0.45): Building {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * (thickness / 2), ny = dx / l * (thickness / 2);
    const poly = [
      P(a.x + nx, a.y + ny), P(b.x + nx, b.y + ny),
      P(b.x - nx, b.y - ny), P(a.x - nx, a.y - ny),
    ];
    const built = this.building('structure', poly, {
      height, wall: '#CFC8B8', roof: '#DDD6C6', label: 'LEDGE',
    });
    this.features.push({
      id: this.id('FT'), kind: 'curb', poly, facing: Math.atan2(dy, dx),
      rise: height, boost: 0, district: this.currentDistrict,
    });
    return built;
  }

  /** A stair set with a run-out, plus the kicker beside it for the gap. */
  stairs(centre: Vec2, w: number, d: number, facing: number, drop: number): this {
    const poly = rectPoly(centre, w, d, facing * DEG);
    this.surface(poly, 'roughConcrete', 5);
    this.feature('drop', poly, facing, drop, 0);
    return this;
  }

  ammoCache(pos: Vec2, label: string): this {
    this.prop('ammoCache', pos, 0, { tint: label });
    return this;
  }

  build(opts: {
    bounds: WorldData['bounds'];
    spawns: WorldData['spawns'];
    npcRoutes: Vec2[][];
    droneRoutes: Vec2[][];
    patrolRoutes: Vec2[][];
  }): WorldData {
    return {
      bounds: opts.bounds,
      districts: this.districts,
      surfaces: this.surfaces,
      buildings: this.buildings,
      occluders: this.occluders,
      covers: this.covers,
      props: this.props,
      features: this.features,
      roadNodes: this.roadNodes,
      roadEdges: this.roadEdges,
      sensors: this.sensors,
      network: { nodes: this.nodes, segments: this.segments },
      spawns: opts.spawns,
      npcRoutes: opts.npcRoutes,
      droneRoutes: opts.droneRoutes,
      patrolRoutes: opts.patrolRoutes,
    };
  }
}

/**
 * Half-extent of a rotated rectangle along a world direction: the distance from
 * its centre to the facade you would walk up to from that side.
 */
function halfExtent(w: number, d: number, rot: number, dir: number): number {
  const c = Math.cos(dir - rot), s = Math.sin(dir - rot);
  return Math.abs((w / 2) * c) + Math.abs((d / 2) * s);
}

export const pt = P;
