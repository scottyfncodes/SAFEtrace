/**
 * Stationary first-person aiming.
 *
 * Bellhaven is drawn oblique top-down everywhere else, and this is the one
 * place it is not. A human could see what the slingshot was for and still not
 * land a shot, because exploring and shooting were being asked of the same two
 * thumbs at once. So the sling now has a state of its own: the board stops, the
 * view drops to the character's eyeline, and the only thing on the screen is
 * the thing you are pointing at.
 *
 * This is an aiming mode, not a first-person game. The character does not walk
 * here, the view exists for the length of one shot, and it deliberately keeps
 * the flat-colour vector language of the veneer rather than reaching for
 * texture or detail it does not have.
 *
 * The projection is a plain pinhole: yaw and pitch from the aim, a fixed eye
 * height, near-plane clipping per polygon, and painter's-order by depth. There
 * is no z-buffer and there does not need to be one — a suburb is a small number
 * of large convex boxes on a flat plane.
 */
import type { Vec2 } from '../core/math';
import { clamp } from '../core/math';
import type { Sim } from '../sim/sim';
import type { Building } from '../sim/worldTypes';
import { SURFACE_COLOUR, VENEER, alpha, shade } from './palette';

/** Eye height of a teenager standing on a board. */
export const EYE_Z = 1.62;
const VFOV = (62 * Math.PI) / 180;
const NEAR = 0.25;
/** Nothing beyond this is worth drawing; a bearing does not reach it either. */
const FAR = 95;

interface Cam {
  pos: Vec2;
  yaw: number;
  pitch: number;
  f: number;
  w: number;
  h: number;
}

/** Camera-space point: x right, y up, z forward. */
interface CP { x: number; y: number; z: number }

function toCamera(cam: Cam, wx: number, wy: number, wz: number): CP {
  const dx = wx - cam.pos.x;
  const dy = wy - cam.pos.y;
  const dz = wz - EYE_Z;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  // Facing east, the player's right hand points south: +y in this world.
  const fwd = dx * cy + dy * sy;
  const right = -dx * sy + dy * cy;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  return { x: right, y: dz * cp - fwd * sp, z: fwd * cp + dz * sp };
}

function project(cam: Cam, p: CP): { x: number; y: number } {
  return { x: cam.w / 2 + (p.x / p.z) * cam.f, y: cam.h / 2 - (p.y / p.z) * cam.f };
}

/** Sutherland–Hodgman against the single plane that matters: z > NEAR. */
function clipNear(poly: CP[]): CP[] {
  const out: CP[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const ain = a.z > NEAR, bin = b.z > NEAR;
    if (ain !== bin) {
      const t = (NEAR - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
    }
    if (bin) out.push(b);
  }
  return out;
}

interface Face { pts: CP[]; depth: number; fill: string; stroke?: string }

export class FirstPersonRenderer {
  private faces: Face[] = [];

  draw(ctx: CanvasRenderingContext2D, sim: Sim, w: number, h: number): void {
    const cam: Cam = {
      pos: sim.aimAnchor ?? sim.player.pos,
      yaw: sim.aim.angle,
      pitch: sim.lookPitch,
      f: (h / 2) / Math.tan(VFOV / 2),
      w, h,
    };

    this.drawSkyAndGround(ctx, cam);
    this.faces.length = 0;
    this.collectSurfaces(sim, cam);
    this.collectBuildings(sim, cam);
    this.collectActors(sim, cam);

    // Painter's order: far first. Everything here is opaque and convex.
    this.faces.sort((a, b) => b.depth - a.depth);
    for (const f of this.faces) {
      if (f.pts.length < 3) continue;
      ctx.beginPath();
      const s0 = project(cam, f.pts[0]);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < f.pts.length; i++) {
        const s = project(cam, f.pts[i]);
        ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  /**
   * Sky and ground as two bands about the horizon. Everything drawn afterwards
   * sits on top; the ground band is what a surface polygon fails to cover.
   */
  private drawSkyAndGround(ctx: CanvasRenderingContext2D, cam: Cam): void {
    const horizon = cam.h / 2 + Math.tan(cam.pitch) * cam.f;
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, '#BBD8EC');
    sky.addColorStop(1, VENEER.void);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cam.w, Math.max(0, horizon));
    ctx.fillStyle = VENEER.grass;
    ctx.fillRect(0, Math.max(0, horizon), cam.w, cam.h - Math.max(0, horizon));
    // A soft band at the horizon so the far distance does not read as a wall.
    const haze = ctx.createLinearGradient(0, horizon - 26, 0, horizon + 34);
    haze.addColorStop(0, alpha(VENEER.void, 0));
    haze.addColorStop(0.5, alpha(VENEER.void, 0.55));
    haze.addColorStop(1, alpha(VENEER.void, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 26, cam.w, 60);
  }

  private push(cam: Cam, world: Array<{ x: number; y: number; z: number }>, fill: string, stroke?: string): void {
    let minZ = Infinity;
    let sum = 0;
    const pts: CP[] = [];
    for (const p of world) {
      const cp = toCamera(cam, p.x, p.y, p.z);
      pts.push(cp);
      minZ = Math.min(minZ, cp.z);
      sum += cp.z;
    }
    if (minZ > FAR) return;
    const clipped = clipNear(pts);
    if (clipped.length < 3) return;
    this.faces.push({ pts: clipped, depth: sum / world.length, fill, stroke });
  }

  private collectSurfaces(sim: Sim, cam: Cam): void {
    for (const s of sim.world.data.surfaces) {
      // Cheap reject on the footprint's nearest corner.
      let near = Infinity;
      for (const p of s.poly) near = Math.min(near, Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y));
      if (near > FAR) continue;
      const fill = SURFACE_COLOUR[s.kind] ?? VENEER.grass;
      this.push(cam, s.poly.map((p) => ({ x: p.x, y: p.y, z: 0 })), fill);
    }
  }

  private collectBuildings(sim: Sim, cam: Cam): void {
    for (const b of sim.world.data.buildings) {
      let near = Infinity;
      for (const p of b.poly) near = Math.min(near, Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y));
      if (near > FAR) continue;
      this.collectBuilding(b, cam);
    }
  }

  private collectBuilding(b: Building, cam: Cam): void {
    const poly = b.poly;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], c = poly[i];
      // Face away from the camera: skip. Keeps interiors from painting over
      // the front of their own building.
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      const nx = -(c.y - a.y), ny = c.x - a.x;
      const vx = mx - cam.pos.x, vy = my - cam.pos.y;
      const facing = nx * vx + ny * vy;
      const lit = facing < 0 ? 0.0 : -0.14;
      this.push(cam, [
        { x: a.x, y: a.y, z: 0 }, { x: c.x, y: c.y, z: 0 },
        { x: c.x, y: c.y, z: b.height }, { x: a.x, y: a.y, z: b.height },
      ], shade(b.wall, lit), alpha('#2E3944', 0.16));
    }
    this.push(cam, poly.map((p) => ({ x: p.x, y: p.y, z: b.height })), b.roof, alpha('#2E3944', 0.14));
  }

  /** Drones, people and hittable props, as upright cards facing the camera. */
  private collectActors(sim: Sim, cam: Cam): void {
    const card = (p: Vec2, z: number, halfW: number, halfH: number, fill: string) => {
      const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
      if (d > FAR || d < 0.4) return;
      const ux = -(p.y - cam.pos.y) / d, uy = (p.x - cam.pos.x) / d;
      this.push(cam, [
        { x: p.x - ux * halfW, y: p.y - uy * halfW, z: z - halfH },
        { x: p.x + ux * halfW, y: p.y + uy * halfW, z: z - halfH },
        { x: p.x + ux * halfW, y: p.y + uy * halfW, z: z + halfH },
        { x: p.x - ux * halfW, y: p.y - uy * halfW, z: z + halfH },
      ], fill);
    };

    for (const s of sim.sensors) {
      if (s.state === 'OFFLINE') continue;
      card(s.data.pos, s.data.height, 0.34, 0.24, s.state === 'ONLINE' ? '#F2EFE7' : '#9AA3A9');
    }
    for (const p of sim.world.propsNear(cam.pos, FAR)) {
      if (p.kind === 'tree') { card(p.pos, 3.6, 2.0, 2.6, shade(VENEER.grass, -0.18)); continue; }
      const tall = p.kind === 'pole' || p.kind === 'sign';
      card(p.pos, tall ? 1.8 : 0.5, tall ? 0.2 : 0.55, tall ? 1.8 : 0.5,
        p.tint && p.tint.startsWith('#') ? p.tint : VENEER.gravel);
    }
    for (const n of sim.npcs) card(n.pos, 0.9, 0.32, 0.9, '#6D7A88');
    for (const p of sim.patrols) card(p.pos, 0.9, 0.34, 0.9, p.state === 'INTERVENING' ? VENEER.warning : '#5A6470');
    if (!sim.devonStopped) card(sim.devonPos, 0.9, 0.32, 0.9, VENEER.friend);
    for (const d of sim.drones) {
      if (d.state === 'DESTABILISED') continue;
      card(d.pos, d.z, 1.3, 0.5, '#F6F4EE');
    }
    for (const pr of sim.projectiles) card(pr.pos, pr.z, 0.12, 0.12, '#2E3944');
  }

  /** Screen position of a world point, or null if it is behind the camera. */
  screenOf(sim: Sim, p: Vec2, z: number, w: number, h: number): { x: number; y: number } | null {
    const cam: Cam = {
      pos: sim.aimAnchor ?? sim.player.pos,
      yaw: sim.aim.angle, pitch: sim.lookPitch,
      f: (h / 2) / Math.tan(VFOV / 2), w, h,
    };
    const cp = toCamera(cam, p.x, p.y, z);
    if (cp.z <= NEAR) return null;
    return project(cam, cp);
  }

  /** Vertical look, clamped to a human neck. */
  static clampPitch(p: number): number {
    return clamp(p, -0.55, 0.95);
  }
}
