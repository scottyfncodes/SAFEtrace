/**
 * The world as data.
 *
 * Nothing here is overlaid on a picture. Every line is drawn from the same
 * records the simulation actually uses, which is what makes "you are finally
 * seeing what was underneath" literally true rather than a figure of speech.
 *
 * Annotations are drawn in world space, at world scale, with leader lines.
 * That is the difference between a HUD and a revelation.
 */
import { type Rect, type Vec2, dist, polyBounds, rectsOverlap } from '../core/math';
import type { Sim } from '../sim/sim';
import { sensorActive } from '../sim/surveillance/sensors';
import { coneRadius } from '../sim/drone';
import type { ViewCamera } from './camera';
import { MACHINE, MACHINE_SAFE, alpha, riskColour } from './palette';
import { ROOF_K } from './veneer';
import { SYSTEM } from '../content/copy';

export interface MachineOptions { colourSafe: boolean; }

export class MachineRenderer {
  constructor(private sim: Sim) {}

  private M(o: MachineOptions) { return o.colourSafe ? MACHINE_SAFE : MACHINE; }

  voidColour(o: MachineOptions): string { return this.M(o).void; }

  /**
   * The substrate: ground grid, surfaces as dark fills, and the road graph —
   * which is the shape the forecast actually runs on.
   *
   * The void fill is the caller's job, because it is the only operation that
   * may run under a masking composite; everything below must be source-over or
   * each stroke would erase the fill beneath it.
   */
  drawGround(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect, o: MachineOptions): void {
    const m = this.M(o);
    // Paving reads brighter than ground, so streets and plazas stay legible as
    // the places people are expected to be.
    for (const s of this.sim.world.data.surfaces) {
      if (s.priority < 1) continue;
      const bb = polyBounds(s.poly);
      if (!rectsOverlap(bb, view)) continue;
      ctx.fillStyle = s.priority >= 2 ? m.surfaceAlt : m.surface;
      this.path(ctx, s.poly, cam, w, h);
      ctx.fill();
    }

    // A 20 m grid. Architectural, not a game grid.
    ctx.strokeStyle = m.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 20;
    const x0 = Math.floor(view.x / step) * step, x1 = view.x + view.w;
    const y0 = Math.floor(view.y / step) * step, y1 = view.y + view.h;
    for (let x = x0; x <= x1; x += step) {
      const a = cam.toScreen({ x, y: view.y }, w, h);
      const b = cam.toScreen({ x, y: y1 }, w, h);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (let y = y0; y <= y1; y += step) {
      const a = cam.toScreen({ x: view.x, y }, w, h);
      const b = cam.toScreen({ x: x1, y }, w, h);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // The road graph, which is the shape the forecast actually runs on.
    ctx.strokeStyle = alpha(m.structureBright, 0.5);
    ctx.lineWidth = Math.max(1.5, cam.zoom * 0.14);
    ctx.beginPath();
    for (const e of this.sim.world.data.roadEdges) {
      const a = this.sim.world.roadNodeById.get(e.a);
      const b = this.sim.world.roadNodeById.get(e.b);
      if (!a || !b) continue;
      const sa = cam.toScreen(a.pos, w, h), sb = cam.toScreen(b.pos, w, h);
      ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
  }

  /** Buildings become drawings of themselves: corners extend past intersections. */
  drawStructure(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect, o: MachineOptions): void {
    const m = this.M(o);
    const z = cam.zoom;
    ctx.lineWidth = Math.max(1, z * 0.075);

    for (const b of this.sim.world.data.buildings) {
      const bb = polyBounds(b.poly);
      if (!rectsOverlap(bb, view)) continue;
      const lift = ROOF_K * b.height;

      ctx.strokeStyle = alpha(m.structure, 0.85);
      this.path(ctx, b.poly, cam, w, h);
      ctx.stroke();
      this.path(ctx, b.poly, cam, w, h, { x: 0, y: -lift });
      ctx.strokeStyle = alpha(m.structureBright, 0.95);
      ctx.stroke();

      ctx.strokeStyle = alpha(m.structure, 0.6);
      ctx.beginPath();
      for (const p of b.poly) {
        const a = cam.toScreen(p, w, h);
        const c = cam.toScreen({ x: p.x, y: p.y - lift }, w, h);
        ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
        // Corner ticks: the drawing overshoots its own corners, the way a plan does.
        ctx.moveTo(c.x - 4, c.y); ctx.lineTo(c.x + 4, c.y);
        ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x, c.y + 4);
      }
      ctx.stroke();

      // A house is no longer merely a house.
      if (z > 2.2 && b.occupants) {
        const c = cam.toScreen({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 - lift }, w, h);
        this.label(ctx, c, [
          b.label ?? b.id,
          `${b.occupants} OCCUPANTS`,
          b.nodeIds.length ? `NODE ${b.nodeIds[0]}` : 'NO NODE',
        ], m.data, 0.55);
      }
    }

    // Overhead cover: the geometry that defeats drones, made explicit.
    ctx.strokeStyle = alpha(m.data, 0.32);
    ctx.setLineDash([6, 6]);
    for (const c of this.sim.world.data.covers) {
      if (!rectsOverlap(polyBounds(c.poly), view)) continue;
      this.path(ctx, c.poly, cam, w, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Camera cones as volumes of light, and the network edges between nodes. */
  drawSurveillance(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect, o: MachineOptions): void {
    const m = this.M(o);

    for (const s of this.sim.sensors) {
      const d = s.data;
      if (!rectsOverlap({ x: d.pos.x - d.range, y: d.pos.y - d.range, w: d.range * 2, h: d.range * 2 }, view)) continue;
      const origin = cam.toScreen(d.pos, w, h);
      const half = d.fov / 2;
      const r = d.range * cam.zoom;
      const live = sensorActive(s);

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, r, s.facing - half, s.facing + half);
      ctx.closePath();

      const grad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, Math.max(r, 1));
      if (live) {
        grad.addColorStop(0, alpha(m.data, s.state === 'LOOPED' ? 0.05 : 0.20));
        grad.addColorStop(1, alpha(m.data, 0));
      } else {
        grad.addColorStop(0, alpha('#6E7A85', 0.06));
        grad.addColorStop(1, alpha('#6E7A85', 0));
      }
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = live ? alpha(m.coverageEdge, s.state === 'LOOPED' ? 0.25 : 0.7) : alpha('#6E7A85', 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = live ? m.data : '#6E7A85';
      ctx.beginPath(); ctx.arc(origin.x, origin.y, Math.max(2, cam.zoom * 0.4), 0, Math.PI * 2); ctx.fill();

      if (cam.zoom > 2.4) {
        this.label(ctx, origin, [
          d.id,
          s.state === 'ONLINE' ? d.label : s.state,
          `SEG ${this.sim.network.get(d.nodeId)?.segmentId ?? '—'}`,
        ], live ? m.data : '#8A939A', 0.6);
      }
    }

    // Network edges: following them is how the player learns that the porch
    // camera and the school gate camera are the same system.
    ctx.strokeStyle = alpha(m.edge, 0.5);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    for (const n of this.sim.network.nodes.values()) {
      if (n.kind === 'SERVICE') continue;
      if (n.pos.x < view.x - 60 || n.pos.x > view.x + view.w + 60) continue;
      for (const eid of n.edges) {
        const other = this.sim.network.get(eid);
        if (!other || other.kind === 'SERVICE') continue;
        const a = cam.toScreen(n.pos, w, h), b = cam.toScreen(other.pos, w, h);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const n of this.sim.network.nodes.values()) {
      if (n.kind === 'CAMERA' || n.kind === 'SERVICE') continue;
      if (n.pos.x < view.x - 20 || n.pos.x > view.x + view.w + 20) continue;
      if (n.pos.y < view.y - 20 || n.pos.y > view.y + view.h + 20) continue;
      const c = cam.toScreen(n.pos, w, h);
      const isUplink = n.kind === 'UPLINK';
      ctx.strokeStyle = isUplink ? m.identity : m.structureBright;
      ctx.lineWidth = isUplink ? 2 : 1.4;
      const r = isUplink ? 9 : 5;
      ctx.beginPath(); ctx.rect(c.x - r, c.y - r, r * 2, r * 2); ctx.stroke();
      if (cam.zoom > 2.2) this.label(ctx, c, [n.id, n.label], isUplink ? m.identity : m.structureBright, 0.6);
    }
  }

  /** Drone footprints, routes, and their current tasking reason. */
  drawAerial(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, o: MachineOptions): void {
    const m = this.M(o);
    for (const d of this.sim.drones) {
      const c = cam.toScreen(d.pos, w, h);
      const r = coneRadius(d) * cam.zoom;

      ctx.strokeStyle = alpha(m.data, 0.55);
      ctx.setLineDash([5, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = alpha(m.structureBright, 0.35);
      ctx.beginPath();
      d.route.forEach((p, i) => {
        const s = cam.toScreen(p, w, h);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = m.data;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill();
      // Knowing why it is coming is what turns fear into play.
      this.label(ctx, c, [d.id, `ALT ${d.z.toFixed(0)} M`, d.reason], m.data, 0.62);
    }

    for (const p of this.sim.patrols) {
      const c = cam.toScreen(p.pos, w, h);
      ctx.strokeStyle = p.state === 'INTERVENING' ? m.riskHigh : m.structureBright;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.stroke();
      if (p.path.length) {
        ctx.strokeStyle = alpha(p.state === 'INTERVENING' ? m.riskHigh : m.structureBright, 0.5);
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        const from = cam.toScreen(p.pos, w, h);
        ctx.moveTo(from.x, from.y);
        for (let i = p.pathIndex; i < p.path.length; i++) {
          const s = cam.toScreen(p.path[i], w, h);
          ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.label(ctx, c, [p.id, p.reason], m.structureBright, 0.62);
    }
  }

  /** People become tracked entities. The dissonance is the game's argument. */
  drawSubjects(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect, o: MachineOptions): void {
    const m = this.M(o);
    const subjects = this.sim.allSubjects;
    const tracks = this.sim.allTracks;

    for (let i = 0; i < subjects.length; i++) {
      const s = subjects[i];
      const t = tracks[i];
      if (s.pos.x < view.x - 10 || s.pos.x > view.x + view.w + 10) continue;
      if (s.pos.y < view.y - 10 || s.pos.y > view.y + view.h + 10) continue;

      const c = cam.toScreen(s.pos, w, h);
      const held = t.confidence > 0.28;
      const col = held ? riskColour(t.risk.total, o.colourSafe) : alpha(m.structure, 0.8);
      const r = Math.max(9, cam.zoom * 1.5);

      // Brackets, not a box: the system frames a person the way a viewfinder does.
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      const k = r * 0.45;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
        ctx.moveTo(c.x + sx * r, c.y + sy * r - sy * k);
        ctx.lineTo(c.x + sx * r, c.y + sy * r);
        ctx.lineTo(c.x + sx * r - sx * k, c.y + sy * r);
      }
      ctx.stroke();

      // The estimate, when it has drifted from the truth. The gap between what
      // is and what the system believes is the whole game, so it is drawn.
      if (held && dist(t.estimate, s.pos) > 2) {
        const e = cam.toScreen(t.estimate, w, h);
        ctx.strokeStyle = alpha(col, 0.4);
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.stroke();
      }

      const lines = [
        t.attributedIdentity === 'UNKNOWN' ? SYSTEM.identityUnresolved : t.attributedIdentity,
        `${[...t.flags].join(' / ')}`,
      ];
      if (held) lines.push(`PREDICTIVE RISK ${Math.round(t.risk.total)}%`);
      if (t.attributionConfidence > 0.5) lines.push(`MATCH ${(t.attributionConfidence * 100).toFixed(1)}%`);
      this.label(ctx, { x: c.x + r, y: c.y - r }, lines, col, 0.68);
    }
  }

  /**
   * Where the player is, on a map that is only a map.
   *
   * The plan view opens from the first frame on every device, and before
   * SAFEtrace VISION it draws the town and nothing else: streets, buildings,
   * the road graph. That is a plan of a suburb, which is a thing a resident is
   * entitled to have — and it is useless without a "you are here", so the
   * player gets exactly that. One dot, a heading, and the district they are
   * standing in. No brackets, no identity, no score, because the system's
   * reading of a person is precisely what has not been unlocked yet.
   */
  drawLocator(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, o: MachineOptions): void {
    const m = this.M(o);
    const p = this.sim.player;
    const c = cam.toScreen(p.pos, w, h);
    const r = Math.max(7, cam.zoom * 1.1);

    ctx.strokeStyle = alpha(m.structureBright, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = m.structureBright;
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, r * 0.3), 0, Math.PI * 2); ctx.fill();

    // Which way they are facing, so the map can be read while moving.
    const dir = { x: Math.cos(p.heading), y: Math.sin(p.heading) };
    ctx.beginPath();
    ctx.moveTo(c.x + dir.x * r, c.y + dir.y * r);
    ctx.lineTo(c.x + dir.x * (r + 9), c.y + dir.y * (r + 9));
    ctx.stroke();

    const district = this.sim.world.districtAt(p.pos);
    this.label(ctx, { x: c.x + r * 0.7, y: c.y - r * 0.7 }, [
      SYSTEM.planView,
      (district?.name ?? 'BELLHAVEN').toUpperCase(),
    ], alpha(m.structureBright, 0.85), 0.62);
  }

  /** The player's own forecast, unrolled ahead of them along the road. */
  drawPrediction(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, o: MachineOptions): void {
    const m = this.M(o);
    const t = this.sim.playerTrack;
    if (t.prediction.length < 2) return;

    ctx.strokeStyle = alpha(m.prediction, 0.35 + t.predictionConfidence * 0.5);
    ctx.lineWidth = Math.max(2, cam.zoom * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    t.prediction.forEach((p, i) => {
      const s = cam.toScreen(p, w, h);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    ctx.fillStyle = m.prediction;
    for (const p of t.prediction) {
      const s = cam.toScreen(p, w, h);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    const tip = cam.toScreen(t.prediction[t.prediction.length - 1], w, h);
    this.label(ctx, tip, [
      'FORECAST — 15 S',
      `CONFIDENCE ${Math.round(t.predictionConfidence * 100)}%`,
      `ANOMALY ${Math.round(t.predictionError * 100)}%`,
    ], m.prediction, 0.68);
  }

  /** Evidence, and the disc SAFEtrace is searching inside. */
  drawEvidence(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, o: MachineOptions): void {
    const m = this.M(o);
    for (const e of this.sim.evidence.values()) {
      if (this.sim.tick - e.tick > 3600) continue;
      const c = cam.toScreen(e.pos, w, h);
      ctx.strokeStyle = alpha(m.riskMid, 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x - 9, c.y); ctx.lineTo(c.x + 9, c.y);
      ctx.moveTo(c.x, c.y - 9); ctx.lineTo(c.x, c.y + 9);
      ctx.stroke();

      if (e.originEstimate) {
        const o2 = cam.toScreen(e.originEstimate, w, h);
        ctx.strokeStyle = alpha(m.riskMid, 0.45);
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(o2.x, o2.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(o2.x, o2.y, e.originUncertainty * cam.zoom, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        this.label(ctx, o2, ['ORIGIN ESTIMATE', `±${e.originUncertainty.toFixed(0)} M`], m.riskMid, 0.6);
      }
      this.label(ctx, c, [e.id, e.label, e.stage], m.riskMid, 0.6);
    }

    for (const a of this.sim.dispatcher.activeAnomalies) {
      const c = cam.toScreen(a.pos, w, h);
      ctx.strokeStyle = alpha(m.riskMid, 0.5);
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ------------------------------------------------------------------ helpers

  private path(
    ctx: CanvasRenderingContext2D, poly: Vec2[], cam: ViewCamera, w: number, h: number,
    off: Vec2 = { x: 0, y: 0 },
  ): void {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const s = cam.toScreen({ x: poly[i].x + off.x, y: poly[i].y + off.y }, w, h);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
  }

  /** A world-space annotation with a leader line. Not screen furniture. */
  private label(
    ctx: CanvasRenderingContext2D, at: Vec2, lines: string[], colour: string, scale = 1,
  ): void {
    const size = Math.round(9 * scale + 2);
    ctx.font = `${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textBaseline = 'top';
    const lead = 12;
    const x = at.x + lead, y = at.y - lead - lines.length * (size + 2);

    ctx.strokeStyle = alpha(colour, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x + lead * 0.6, at.y - lead * 0.6);
    ctx.lineTo(x, y + lines.length * (size + 2));
    ctx.stroke();

    ctx.fillStyle = colour;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + 3, y + i * (size + 2));
    }
  }
}
