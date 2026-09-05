/**
 * The beautiful world.
 *
 * Oblique top-down: the camera looks down and slightly from the south, so we
 * see south-facing walls and buildings extrude upward on screen. One sun, fixed
 * at about four in the afternoon, throwing long soft shadows to the south-east.
 */
import { type Vec2, type Rect, pointInPoly, rectsOverlap, polyBounds } from '../core/math';
import type { World } from '../sim/world';
import type { Building, Prop } from '../sim/worldTypes';
import type { Sim } from '../sim/sim';
import type { ViewCamera } from './camera';
import { SURFACE_COLOUR, VENEER, alpha, shade } from './palette';

/** Screen-space offset per metre of height. */
export const ROOF_K = 0.42;
/** Shadow offset per metre of height. */
export const SHADOW_K = { x: 0.55, y: 0.34 };
const STATIC_SCALE = 6;

export class VeneerRenderer {
  private ground: HTMLCanvasElement | null = null;
  private groundOrigin: Vec2 = { x: 0, y: 0 };
  /** Depth order is fixed: nothing in the veneer moves. Sorted once. */
  private sortedBuildings: Building[] = [];
  private buildingBounds = new Map<string, Rect>();
  private sortedProps: Prop[] = [];

  constructor(private world: World) {
    this.sortedBuildings = [...world.data.buildings]
      .sort((a, b) => polyBounds(a.poly).y - polyBounds(b.poly).y);
    for (const b of this.sortedBuildings) this.buildingBounds.set(b.id, polyBounds(b.poly));
    this.sortedProps = [...world.data.props].sort((a, b) => a.pos.y - b.pos.y);
  }

  /** Composite all static ground surfaces once. */
  prepare(): void {
    const { min, max } = this.world.data.bounds;
    const w = Math.ceil((max.x - min.x) * STATIC_SCALE);
    const h = Math.ceil((max.y - min.y) * STATIC_SCALE);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return;
    this.groundOrigin = { x: min.x, y: min.y };

    g.fillStyle = VENEER.grass;
    g.fillRect(0, 0, w, h);

    const surfaces = [...this.world.data.surfaces].sort((a, b) => a.priority - b.priority);
    for (const s of surfaces) {
      g.beginPath();
      for (let i = 0; i < s.poly.length; i++) {
        const p = s.poly[i];
        const x = (p.x - min.x) * STATIC_SCALE, y = (p.y - min.y) * STATIC_SCALE;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = SURFACE_COLOUR[s.kind] ?? VENEER.grass;
      g.fill();
      // Grass gets a soft second tone so lawns are not flat colour fields.
      if (s.kind === 'grass') {
        g.fillStyle = alpha(VENEER.grassDark, 0.28);
        g.fill();
      }
    }

    this.ground = c;
  }

  drawGround(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number): void {
    if (!this.ground) return;
    const o = cam.toScreen(this.groundOrigin, w, h);
    const s = cam.zoom / STATIC_SCALE;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    ctx.drawImage(this.ground, 0, 0);
    ctx.restore();
  }

  /**
   * Ground linework, drawn per frame in vector so it stays a hairline at any
   * zoom. Flat colour tolerates being a bitmap; edges do not.
   */
  drawGroundDetail(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect): void {
    const z = cam.zoom;

    // Paving joints. A plaza is not a flat colour field, and at street scale
    // the joints are what tell you how big the space is.
    ctx.save();
    ctx.lineWidth = Math.max(0.5, z * 0.035);
    ctx.strokeStyle = 'rgba(96,102,100,0.16)';
    for (const s of this.world.surfacesIn(view)) {
      if (s.kind !== 'smoothConcrete' && s.kind !== 'roughConcrete' && s.kind !== 'tile') continue;
      const bb = polyBounds(s.poly);
      if (bb.w * bb.h < 150) continue;
      ctx.save();
      this.polyPath(ctx, s.poly, cam, w, h);
      ctx.clip();
      const pitch = s.kind === 'tile' ? 2.5 : 5;
      const x0 = Math.max(bb.x, view.x), x1 = Math.min(bb.x + bb.w, view.x + view.w);
      const y0 = Math.max(bb.y, view.y), y1 = Math.min(bb.y + bb.h, view.y + view.h);
      ctx.beginPath();
      for (let x = Math.ceil(x0 / pitch) * pitch; x <= x1; x += pitch) {
        const a = cam.toScreen({ x, y: y0 }, w, h);
        const b = cam.toScreen({ x, y: y1 }, w, h);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (let y = Math.ceil(y0 / pitch) * pitch; y <= y1; y += pitch) {
        const a = cam.toScreen({ x: x0, y }, w, h);
        const b = cam.toScreen({ x: x1, y }, w, h);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Road centre markings.
    ctx.save();
    ctx.lineWidth = Math.max(1, z * 0.14);
    ctx.setLineDash([z * 1.6, z * 2.0]);
    ctx.strokeStyle = VENEER.roadMark;
    ctx.beginPath();
    for (const e of this.world.data.roadEdges) {
      if (e.width < 8) continue;
      const a = this.world.roadNodeById.get(e.a);
      const b = this.world.roadNodeById.get(e.b);
      if (!a || !b) continue;
      if (Math.max(a.pos.x, b.pos.x) < view.x || Math.min(a.pos.x, b.pos.x) > view.x + view.w) continue;
      if (Math.max(a.pos.y, b.pos.y) < view.y || Math.min(a.pos.y, b.pos.y) > view.y + view.h) continue;
      const sa = cam.toScreen(a.pos, w, h), sb = cam.toScreen(b.pos, w, h);
      ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Shadows for every solid, drawn before any body so they never overlap wrongly. */
  drawShadows(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect, sim: Sim): void {
    ctx.fillStyle = VENEER.shadow;
    for (const b of this.sortedBuildings) {
      const bb = this.buildingBounds.get(b.id)!;
      if (!rectsOverlap(bb, view)) continue;
      this.polyPath(ctx, b.poly, cam, w, h, { x: SHADOW_K.x * b.height, y: SHADOW_K.y * b.height });
      ctx.fill();
    }
    ctx.fillStyle = VENEER.shadowSoft;
    for (const p of this.sortedProps) {
      if (p.pos.x < view.x || p.pos.x > view.x + view.w || p.pos.y < view.y || p.pos.y > view.y + view.h) continue;
      if (p.kind === 'fenceGate') continue;
      const hgt = p.kind === 'tree' ? 6 : p.kind === 'pole' || p.kind === 'sign' ? 3.4 : 0.9;
      const r = this.propRadius(p);
      const c = cam.toScreen({ x: p.pos.x + SHADOW_K.x * hgt, y: p.pos.y + SHADOW_K.y * hgt }, w, h);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * cam.zoom * 1.05, r * cam.zoom * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The drone's shadow arrives before it does. On a sunny afternoon that is
    // both beautiful and horrible.
    for (const d of sim.drones) {
      const c = cam.toScreen({ x: d.pos.x + sim.sun.x * d.z, y: d.pos.y + sim.sun.y * d.z }, w, h);
      ctx.fillStyle = alpha('#3A4C6B', 0.20);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 1.5 * cam.zoom, 1.1 * cam.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBuildings(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect): void {
    for (const b of this.sortedBuildings) {
      if (!rectsOverlap(this.buildingBounds.get(b.id)!, view)) continue;
      this.drawBuilding(ctx, b, cam, w, h);
    }
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, cam: ViewCamera, w: number, h: number): void {
    const lift = ROOF_K * b.height;
    const poly = b.poly;

    // South-facing walls, drawn back to front so corners read correctly.
    const walls: Array<{ a: Vec2; b: Vec2; depth: number }> = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], c = poly[i];
      // Outward normal with a positive y component faces the viewer.
      const nx = c.y - a.y, ny = -(c.x - a.x);
      const centroidY = (a.y + c.y) / 2;
      if (ny > 0 || (Math.abs(ny) < 0.01 && nx !== 0)) walls.push({ a, b: c, depth: centroidY });
    }
    walls.sort((x, y) => x.depth - y.depth);

    ctx.lineJoin = 'round';
    for (const wall of walls) {
      const a1 = cam.toScreen(wall.a, w, h);
      const b1 = cam.toScreen(wall.b, w, h);
      const a2 = cam.toScreen({ x: wall.a.x, y: wall.a.y - lift }, w, h);
      const b2 = cam.toScreen({ x: wall.b.x, y: wall.b.y - lift }, w, h);
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y);
      ctx.closePath();
      ctx.fillStyle = shade(b.wall, -0.16);
      ctx.fill();

      // Windows: two per wall, evenly placed. Cheap, and it makes houses read.
      if (b.height > 3.4 && Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) > 5) {
        ctx.save();
        ctx.clip();
        const n = b.kind === 'house' ? 2 : 4;
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          const px = wall.a.x + (wall.b.x - wall.a.x) * t;
          const py = wall.a.y + (wall.b.y - wall.a.y) * t;
          const s1 = cam.toScreen({ x: px, y: py - lift * 0.32 }, w, h);
          const s2 = cam.toScreen({ x: px, y: py - lift * 0.78 }, w, h);
          ctx.fillStyle = VENEER.glass;
          ctx.fillRect(s1.x - 0.55 * cam.zoom, s2.y, 1.1 * cam.zoom, s1.y - s2.y);
        }
        ctx.restore();
      }
    }

    // Roof.
    this.polyPath(ctx, poly, cam, w, h, { x: 0, y: -lift });
    ctx.fillStyle = b.roof;
    ctx.fill();
    ctx.strokeStyle = alpha(shade(b.roof, -0.35), 0.9);
    ctx.lineWidth = Math.max(1, cam.zoom * 0.14);
    ctx.stroke();

    // Ridge line, so roofs are not flat rectangles.
    if (b.kind === 'house' || b.kind === 'shed' || b.kind === 'garage') {
      const bb = polyBounds(poly);
      const horizontal = bb.w > bb.h;
      const a = horizontal
        ? { x: bb.x + 1, y: bb.y + bb.h / 2 - lift }
        : { x: bb.x + bb.w / 2, y: bb.y + 1 - lift };
      const c = horizontal
        ? { x: bb.x + bb.w - 1, y: bb.y + bb.h / 2 - lift }
        : { x: bb.x + bb.w / 2, y: bb.y + bb.h - 1 - lift };
      const s1 = cam.toScreen(a, w, h), s2 = cam.toScreen(c, w, h);
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
      ctx.strokeStyle = alpha(shade(b.roof, 0.25), 0.7);
      ctx.lineWidth = Math.max(1, cam.zoom * 0.2);
      ctx.stroke();
    }
  }

  drawProps(ctx: CanvasRenderingContext2D, cam: ViewCamera, w: number, h: number, view: Rect): void {
    for (const p of this.sortedProps) {
      if (p.pos.y < view.y - 8) continue;
      // Sorted by y, so once past the bottom of the view there is nothing left.
      if (p.pos.y > view.y + view.h + 8) break;
      if (p.pos.x < view.x - 8 || p.pos.x > view.x + view.w + 8) continue;
      this.drawProp(ctx, p, cam, w, h);
    }
  }

  private propRadius(p: Prop): number {
    switch (p.kind) {
      case 'tree': return 3.2 * p.scale;
      case 'car': return 2.2;
      case 'planter': return 1.4 * p.scale;
      case 'bench': return 1.2;
      case 'hoop': return 1.0;
      default: return 0.55;
    }
  }

  private drawProp(ctx: CanvasRenderingContext2D, p: Prop, cam: ViewCamera, w: number, h: number): void {
    const z = cam.zoom;
    const c = cam.toScreen(p.pos, w, h);

    switch (p.kind) {
      case 'fenceGate': {
        const a = cam.toScreen({ x: p.pos.x - Math.cos(p.rot) * p.scale / 2, y: p.pos.y - Math.sin(p.rot) * p.scale / 2 }, w, h);
        const b = cam.toScreen({ x: p.pos.x + Math.cos(p.rot) * p.scale / 2, y: p.pos.y + Math.sin(p.rot) * p.scale / 2 }, w, h);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = alpha('#7C8892', 0.85);
        ctx.lineWidth = Math.max(1, z * 0.24);
        ctx.stroke();
        break;
      }
      case 'tree': {
        const r = 3.2 * p.scale * z;
        const top = cam.toScreen({ x: p.pos.x, y: p.pos.y - 2.4 * p.scale }, w, h);
        ctx.fillStyle = '#6B5541';
        ctx.fillRect(c.x - 0.24 * z, top.y, 0.48 * z, c.y - top.y);
        ctx.beginPath();
        ctx.arc(top.x, top.y, r, 0, Math.PI * 2);
        ctx.fillStyle = VENEER.tree;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(top.x - r * 0.26, top.y - r * 0.26, r * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = VENEER.treeLight;
        ctx.fill();
        break;
      }
      case 'car': {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(p.rot);
        const lift = 1.5 * ROOF_K * z;
        ctx.fillStyle = shade(p.tint ?? '#8FA0AC', -0.25);
        roundRect(ctx, -2.2 * z, -0.95 * z, 4.4 * z, 1.9 * z, 0.5 * z);
        ctx.fill();
        ctx.translate(0, -lift);
        ctx.fillStyle = p.tint ?? '#8FA0AC';
        roundRect(ctx, -2.2 * z, -0.95 * z, 4.4 * z, 1.9 * z, 0.5 * z);
        ctx.fill();
        ctx.fillStyle = VENEER.glass;
        roundRect(ctx, -0.85 * z, -0.7 * z, 1.7 * z, 1.4 * z, 0.28 * z);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'bin': {
        const top = cam.toScreen({ x: p.pos.x, y: p.pos.y - 1.1 }, w, h);
        ctx.fillStyle = p.knocked ? '#7E8B75' : '#4E7A57';
        roundRect(ctx, c.x - 0.55 * z, top.y, 1.1 * z, c.y - top.y, 0.18 * z);
        ctx.fill();
        ctx.fillStyle = alpha('#2F4E37', 0.9);
        ctx.fillRect(c.x - 0.6 * z, top.y - 0.12 * z, 1.2 * z, 0.28 * z);
        break;
      }
      case 'hydrant':
        ctx.fillStyle = '#C9503F';
        ctx.beginPath(); ctx.arc(c.x, c.y - 0.4 * z, 0.38 * z, 0, Math.PI * 2); ctx.fill();
        break;
      case 'bench':
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(p.rot);
        ctx.fillStyle = '#A98455';
        ctx.fillRect(-1.1 * z, -0.35 * z, 2.2 * z, 0.7 * z);
        ctx.restore();
        break;
      case 'planter': {
        const r = 1.4 * p.scale * z;
        ctx.fillStyle = '#C7BDA8';
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = VENEER.tree;
        ctx.beginPath(); ctx.arc(c.x, c.y - 0.3 * z, r * 0.68, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pole': case 'sign': {
        const top = cam.toScreen({ x: p.pos.x, y: p.pos.y - 3.2 }, w, h);
        ctx.strokeStyle = '#8E959B';
        ctx.lineWidth = Math.max(1, 0.2 * z);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        if (p.kind === 'sign') {
          ctx.fillStyle = VENEER.accent;
          roundRect(ctx, top.x - 1.5 * z, top.y - 0.9 * z, 3 * z, 1.2 * z, 0.2 * z);
          ctx.fill();
        }
        break;
      }
      case 'hoop': {
        const top = cam.toScreen({ x: p.pos.x, y: p.pos.y - 3.0 }, w, h);
        ctx.strokeStyle = '#8E959B'; ctx.lineWidth = Math.max(1, 0.18 * z);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.fillStyle = '#E8E3D6';
        ctx.fillRect(top.x - 1.1 * z, top.y - 0.8 * z, 2.2 * z, 1.3 * z);
        break;
      }
      case 'mailbox': {
        const top = cam.toScreen({ x: p.pos.x, y: p.pos.y - 1.1 }, w, h);
        ctx.strokeStyle = '#9A8F7E'; ctx.lineWidth = Math.max(1, 0.13 * z);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.fillStyle = '#C7BDA8';
        ctx.fillRect(top.x - 0.4 * z, top.y - 0.35 * z, 0.8 * z, 0.5 * z);
        break;
      }
      case 'cone':
        ctx.fillStyle = '#E07B3C';
        ctx.beginPath(); ctx.arc(c.x, c.y, 0.34 * z, 0, Math.PI * 2); ctx.fill();
        break;
      case 'speaker': case 'ammoCache': {
        ctx.fillStyle = p.kind === 'ammoCache' ? VENEER.warning : '#B9C0C6';
        ctx.beginPath(); ctx.arc(c.x, c.y, 0.5 * z, 0, Math.PI * 2); ctx.fill();
        break;
      }
      default:
        ctx.fillStyle = '#AEB6BC';
        ctx.beginPath(); ctx.arc(c.x, c.y, 0.4 * z, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * Surveillance hardware, drawn as nice-looking consumer products. A porch
   * camera looks like something you would be glad to own, which is why nobody
   * in Bellhaven objects to them and why the player does not notice them at first.
   */
  drawSensors(ctx: CanvasRenderingContext2D, sim: Sim, cam: ViewCamera, w: number, h: number, view: Rect): void {
    for (const s of sim.sensors) {
      const d = s.data;
      if (d.pos.x < view.x - 10 || d.pos.x > view.x + view.w + 10) continue;
      if (d.pos.y < view.y - 10 || d.pos.y > view.y + view.h + 10) continue;
      const base = cam.toScreen(d.pos, w, h);
      const head = cam.toScreen({ x: d.pos.x, y: d.pos.y - d.height * ROOF_K }, w, h);
      const z = cam.zoom;

      ctx.strokeStyle = alpha('#9AA3A9', 0.9);
      ctx.lineWidth = Math.max(1, 0.16 * z);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(head.x, head.y); ctx.stroke();

      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(s.facing);
      const offline = s.state === 'OFFLINE';
      ctx.fillStyle = offline ? '#8A8F93' : '#F4F2EC';
      roundRect(ctx, -0.42 * z, -0.34 * z, 1.05 * z, 0.68 * z, 0.3 * z);
      ctx.fill();
      ctx.fillStyle = offline ? '#4A4E52' : (s.state === 'LOOPED' ? '#2C8C8C' : '#2A3138');
      ctx.beginPath(); ctx.arc(0.42 * z, 0, 0.22 * z, 0, Math.PI * 2); ctx.fill();
      if (!offline) {
        ctx.fillStyle = alpha(VENEER.accent, 0.9);
        ctx.beginPath(); ctx.arc(-0.28 * z, 0, 0.08 * z, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  polyPath(
    ctx: CanvasRenderingContext2D, poly: Vec2[], cam: ViewCamera, w: number, h: number,
    offset: Vec2 = { x: 0, y: 0 },
  ): void {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const s = cam.toScreen({ x: poly[i].x + offset.x, y: poly[i].y + offset.y }, w, h);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
  }

  /** Is a world point under a roof? Used to fade cover so the player can read it. */
  covered(p: Vec2): boolean {
    for (const c of this.world.data.covers) if (pointInPoly(c.poly, p)) return true;
    return false;
  }
}

/**
 * A stroke that gets thinner as it goes, along a curve.
 *
 * Canvas has one line width per path, so anything that tapers — a branch, a
 * limb, a twig — has to be drawn as a run of short segments with round joins
 * doing the smoothing. That is the whole trick, and it is worth having in one
 * place because a slingshot cut from a hedge is the difference between an
 * object and a letter Y.
 *
 * `bend` bows the curve sideways by that many pixels at its midpoint, which is
 * what stops a branch reading as a ruler.
 */
export function taperedStroke(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number }, b: { x: number; y: number },
  w0: number, w1: number, bend = 0, steps = 7,
): void {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // The control point, pushed off the chord's midpoint at right angles.
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
    };
  };
  let prev = a;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = at(t);
    ctx.lineWidth = w0 + (w1 - w0) * (t - 0.5 / steps);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
