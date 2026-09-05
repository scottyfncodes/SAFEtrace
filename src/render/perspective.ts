/**
 * The perspective view: third-person chase, and first-person aiming.
 *
 * Bellhaven's world layer has always been oblique top-down — polygon footprints
 * with a `ROOF_K` lift faking height. That reads as a map, and three human
 * playtests said the same thing in three different ways: the character is a
 * marker on it, and the board underneath them is invisible.
 *
 * This is not a rewrite of the world. It is a second camera over the same data.
 * The pinhole projection here was already written for the stationary aiming
 * mode; a chase camera is that projection with the eye pulled back behind the
 * rider and pitched down. Nothing in the simulation, the surveillance model or
 * the content changed to make it work.
 *
 * What it deliberately does NOT try to do is carry the machine layer. Coverage
 * cones, network edges, prediction fans and evidence rings are all authored
 * against the flat camera, and they are *more* legible from above, not less.
 * So VISION stays a plan view — see `docs/24`. Your body is third person; the
 * system's picture of you is a map. That the two do not look alike is the
 * point.
 */
import type { Vec2 } from '../core/math';
import { clamp, clamp01, damp, lerp, wrapAngle } from '../core/math';
import type { Sim } from '../sim/sim';
import type { Building } from '../sim/worldTypes';
import { SURFACE_COLOUR, VENEER, alpha, shade } from './palette';

/** Eye height of a teenager standing on a board. */
export const EYE_Z = 1.62;
/**
 * Narrower than it was, to buy back some of the rider's size after the camera
 * moved half again as far out. Dollying back and tightening the lens is how you
 * get more world in frame without the subject becoming a speck.
 */
/*
 * A long lens, on purpose. This is most of the miniature.
 *
 * A wide lens is what makes a place feel big: it stretches the near ground,
 * throws the far ground away, and puts you inside the scene. A long one does
 * the opposite — it flattens the depth between near and far until a street
 * reads as a set of objects arranged on a table, which is exactly the trick
 * every photograph of a model railway plays and exactly what a Micro Machines
 * track looks like. So the field of view keeps narrowing: 54 degrees, then 46,
 * now 34. It also happens to make the rider *larger* on the glass than a wider
 * lens would from the same place, which is what pays for the higher vantage.
 */
const VFOV = (40 * Math.PI) / 180;
const NEAR = 0.25;
/*
 * How far the world is drawn.
 *
 * This used to be 105 m, which was generous for a rig sitting at eye height
 * behind the rider — everything past it was below the horizon line anyway. It
 * is not generous for a camera looking down from sixteen metres up: the top of
 * that frame lands nearly two hundred metres out, and at 105 the far third of
 * the shot was flat green fill with no town in it. A miniature only reads if
 * you can see the far edge of the thing.
 */
const FAR = 195;

export interface CamState {
  /** Where the eye is, in world metres. */
  pos: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
}

interface Cam extends CamState { f: number; w: number; h: number }

/** Camera-space point: x right, y up, z forward. */
interface CP { x: number; y: number; z: number }

function toCamera(cam: Cam, wx: number, wy: number, wz: number): CP {
  const dx = wx - cam.pos.x;
  const dy = wy - cam.pos.y;
  const dz = wz - cam.pos.z;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  // Facing east, the rider's right hand points south: +y in this world.
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

/**
 * Faces sort in two classes, and that distinction is the fix for the worst
 * visual bug this build had.
 *
 * Ground surfaces are all coplanar at z = 0. Sorting coplanar polygons by their
 * average distance is meaningless — a large lawn whose centroid happens to be
 * nearer than the rider will paint straight over them, which is exactly how the
 * skater kept disappearing under the grass and how grass grew over the road.
 *
 * So the ground plane is painted first, in the authored `priority` order the
 * flat renderer has always used (grass 0, pavement 1, carriageway 2, driveways
 * 3, plazas 4 …), and only then is everything that stands up sorted back to
 * front by depth. The rider is not special-cased and still goes behind walls,
 * props and trees exactly as it should.
 */
const enum Layer { Ground = 0, Standing = 1 }

interface Face {
  pts: CP[];
  depth: number;
  layer: Layer;
  /** Authored paint order within the ground plane. */
  order: number;
  fill: string;
  stroke?: string;
  wide?: number;
}
type P3 = { x: number; y: number; z: number };

/**
 * The chase camera.
 *
 * It trails the board rather than being bolted to it: the yaw eases toward the
 * direction of travel, the distance opens with speed so there is more road to
 * read, and the whole rig lags a little under acceleration. None of that is
 * cinematic garnish — it is how the player is told how fast they are going.
 */
export class ChaseCamera {
  yaw = 0;
  private dist = 24.6;
  private height = 12.4;
  /** Negative is downward: the rig looks down at the rider from behind. */
  private pitch = -0.40;
  private look: Vec2 = { x: 0, y: 0 };

  reset(sim: Sim): void {
    this.yaw = sim.player.heading;
    this.look = { ...sim.player.pos };
  }

  update(sim: Sim, dt: number): void {
    const p = sim.player;
    const speed = p.speed;
    const cap = Math.max(1, sim.playerMaxSpeed);
    const t = clamp01(speed / cap);

    // Face the way the board is pointed. Travel direction would judder every
    // time the board washed out; the nose is what the rider is looking over.
    const want = speed > 0.6 ? p.heading : this.yaw;
    const turn = wrapAngle(want - this.yaw);
    // Quicker to catch up on a hard turn, so the camera never falls behind the
    // player's own intention, but still eased.
    this.yaw = wrapAngle(this.yaw + turn * clamp01(dt * (3.4 + Math.abs(turn) * 2.2)));

    /*
     * The other half of the miniature: more town in the frame at once.
     *
     * A model reads as a model because you can see the whole of it. The rig
     * carries further back and a little higher, and the long lens flattens
     * what that distance would otherwise stretch — so the frame now holds
     * something like a hundred and seventy metres of Bellhaven, front to
     * back, instead of eighty. Streets become blocks, houses become things
     * arranged along them, and the board is a small object crossing a town
     * rather than a vehicle on a road.
     *
     * The angle is left where it was, at about two parts back to one part up.
     * Steeper was tried and it is worse: past thirty degrees the horizon
     * leaves the frame, taking every drone in the sky and the top of every
     * building with it, and what is left is flat ground in two colours. A
     * miniature needs to be a thing you can see the far edge of.
     */
    this.dist = damp(this.dist, lerp(23.5, 29.0, t), 0.24, dt);
    this.height = damp(this.height, lerp(11.8, 14.0, t), 0.24, dt);
    // Slightly flatter at speed, so a little more of the road ahead is in shot.
    this.pitch = damp(this.pitch, lerp(-0.42, -0.36, t), 0.3, dt);

    // The point the rig is looking at lags the rider under acceleration.
    this.look = {
      x: damp(this.look.x, p.pos.x, 0.055, dt),
      y: damp(this.look.y, p.pos.y, 0.055, dt),
    };
  }

  /**
   * Where the eye sits. Pulled in if a building is between it and the rider,
   * so the camera never ends up inside a wall.
   */
  state(sim: Sim): CamState {
    const p = sim.player;
    const back = { x: -Math.cos(this.yaw), y: -Math.sin(this.yaw) };
    let dist = this.dist;
    for (let i = 1; i <= 5; i++) {
      const probe = { x: p.pos.x + back.x * dist, y: p.pos.y + back.y * dist };
      if (!sim.world.buildingAt(probe)) break;
      dist = this.dist * (1 - i / 6);
    }
    return {
      pos: {
        x: this.look.x + back.x * dist,
        y: this.look.y + back.y * dist,
        z: this.height + p.z * 0.6,
      },
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
}

export class PerspectiveRenderer {
  private faces: Face[] = [];

  private cam(state: CamState, w: number, h: number): Cam {
    return { ...state, f: (h / 2) / Math.tan(VFOV / 2), w, h };
  }

  draw(ctx: CanvasRenderingContext2D, sim: Sim, state: CamState, w: number, h: number, firstPerson: boolean): void {
    const cam = this.cam(state, w, h);
    this.drawSkyAndGround(ctx, cam);
    this.faces.length = 0;
    this.collectSurfaces(sim, cam);
    this.collectBuildings(sim, cam);
    this.collectSensors(sim, cam);
    this.collectActors(sim, cam);
    if (!firstPerson) this.collectRider(sim, cam);

    this.faces.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.layer === Layer.Ground) return a.order - b.order || b.depth - a.depth;
      return b.depth - a.depth;
    });
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
      if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = f.wide ?? 1; ctx.stroke(); }
    }
    if (!firstPerson) this.drawMiniatureHaze(ctx, cam);
  }

  /**
   * The far field, softened.
   *
   * This is the third leg of the miniature, and it is the one that does the
   * most for the least: every photograph of a model is shot with a shallow
   * depth of field, so the top and bottom of the frame fall out of focus, and
   * the eye reads that fall-off as *closeness to a small thing* rather than as
   * a lens setting. A real blur would cost a full-frame filter pass on a
   * phone; a wash of the sky's own colour over the far ground does the same
   * job to the same eye, because what it is really saying is "this edge is not
   * where you are looking".
   */
  private drawMiniatureHaze(ctx: CanvasRenderingContext2D, cam: Cam): void {
    const band = cam.h * 0.3;
    const g = ctx.createLinearGradient(0, 0, 0, band);
    g.addColorStop(0, alpha('#C4D6E4', 0.62));
    g.addColorStop(0.45, alpha('#C4D6E4', 0.2));
    g.addColorStop(1, alpha('#C4D6E4', 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.w, band);
  }

  private drawSkyAndGround(ctx: CanvasRenderingContext2D, cam: Cam): void {
    const horizon = cam.h / 2 + Math.tan(cam.pitch) * cam.f;
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, '#BBD8EC');
    sky.addColorStop(1, VENEER.void);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cam.w, Math.max(0, horizon));
    ctx.fillStyle = VENEER.grass;
    ctx.fillRect(0, Math.max(0, horizon), cam.w, cam.h - Math.max(0, horizon));
    const haze = ctx.createLinearGradient(0, horizon - 26, 0, horizon + 34);
    haze.addColorStop(0, alpha(VENEER.void, 0));
    haze.addColorStop(0.5, alpha(VENEER.void, 0.55));
    haze.addColorStop(1, alpha(VENEER.void, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 26, cam.w, 60);
  }

  private push(
    cam: Cam, world: P3[], fill: string, stroke?: string, wide?: number,
    layer: Layer = Layer.Standing, order = 0,
  ): void {
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
    this.faces.push({ pts: clipped, depth: sum / world.length, layer, order, fill, stroke, wide });
  }

  private collectSurfaces(sim: Sim, cam: Cam): void {
    for (const s of sim.world.data.surfaces) {
      let near = Infinity;
      for (const p of s.poly) near = Math.min(near, Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y));
      if (near > FAR) continue;
      this.push(
        cam, s.poly.map((p) => ({ x: p.x, y: p.y, z: 0 })),
        SURFACE_COLOUR[s.kind] ?? VENEER.grass, undefined, undefined,
        Layer.Ground, s.priority,
      );
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
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      const nx = -(c.y - a.y), ny = c.x - a.x;
      const facing = nx * (mx - cam.pos.x) + ny * (my - cam.pos.y);
      this.push(cam, [
        { x: a.x, y: a.y, z: 0 }, { x: c.x, y: c.y, z: 0 },
        { x: c.x, y: c.y, z: b.height }, { x: a.x, y: a.y, z: b.height },
      ], shade(b.wall, facing < 0 ? 0 : -0.14), alpha('#2E3944', 0.16));
    }
    this.push(cam, poly.map((p) => ({ x: p.x, y: p.y, z: b.height })), b.roof, alpha('#2E3944', 0.14));
  }

  /**
   * Cameras, as objects on walls rather than radii on a map.
   *
   * A housing, a bracket down to the wall, and a lens disc on the front that
   * turns with the sweep. This is the whole of the surveillance change: the
   * model underneath is untouched, but the thing doing the watching is now a
   * physical object you can see pointing at you.
   */
  private collectSensors(sim: Sim, cam: Cam): void {
    for (const s of sim.sensors) {
      const d = s.data;
      const dist = Math.hypot(d.pos.x - cam.pos.x, d.pos.y - cam.pos.y);
      if (dist > 58) continue;
      const face = s.facing;
      const fx = Math.cos(face), fy = Math.sin(face);
      const rx = -fy, ry = fx;
      const live = s.state === 'ONLINE' || s.state === 'DEGRADED';
      const body = live ? '#F2EFE7' : '#9AA3A9';
      const z = d.height;

      // Bracket: a short arm from the wall out to the housing.
      this.push(cam, [
        { x: d.pos.x, y: d.pos.y, z: z + 0.16 },
        { x: d.pos.x, y: d.pos.y, z: z - 0.16 },
        { x: d.pos.x + fx * 0.34, y: d.pos.y + fy * 0.34, z: z - 0.16 },
        { x: d.pos.x + fx * 0.34, y: d.pos.y + fy * 0.34, z: z + 0.16 },
      ], shade(body, -0.35));

      // Housing: a box, with its long axis along the way it is looking.
      const hx = d.pos.x + fx * 0.5, hy = d.pos.y + fy * 0.5;
      for (const side of [1, -1]) {
        this.push(cam, [
          { x: hx - fx * 0.34 + rx * 0.2 * side, y: hy - fy * 0.34 + ry * 0.2 * side, z: z + 0.22 },
          { x: hx + fx * 0.34 + rx * 0.2 * side, y: hy + fy * 0.34 + ry * 0.2 * side, z: z + 0.22 },
          { x: hx + fx * 0.34 + rx * 0.2 * side, y: hy + fy * 0.34 + ry * 0.2 * side, z: z - 0.22 },
          { x: hx - fx * 0.34 + rx * 0.2 * side, y: hy - fy * 0.34 + ry * 0.2 * side, z: z - 0.22 },
        ], shade(body, side > 0 ? -0.05 : -0.22));
      }
      this.push(cam, [
        { x: hx - fx * 0.34 - rx * 0.2, y: hy - fy * 0.34 - ry * 0.2, z: z + 0.22 },
        { x: hx - fx * 0.34 + rx * 0.2, y: hy - fy * 0.34 + ry * 0.2, z: z + 0.22 },
        { x: hx + fx * 0.34 + rx * 0.2, y: hy + fy * 0.34 + ry * 0.2, z: z + 0.22 },
        { x: hx + fx * 0.34 - rx * 0.2, y: hy + fy * 0.34 - ry * 0.2, z: z + 0.22 },
      ], shade(body, 0.08));

      // The lens, on the front face. Dark, and lit when it is actually seeing.
      const lx = hx + fx * 0.35, ly = hy + fy * 0.35;
      const watching = live && sim.playerObserved && dist < d.range;
      this.push(cam, [
        { x: lx - rx * 0.15, y: ly - ry * 0.15, z: z + 0.15 },
        { x: lx + rx * 0.15, y: ly + ry * 0.15, z: z + 0.15 },
        { x: lx + rx * 0.15, y: ly + ry * 0.15, z: z - 0.15 },
        { x: lx - rx * 0.15, y: ly - ry * 0.15, z: z - 0.15 },
      ], watching ? VENEER.player : '#20272E');
    }
  }

  /** A camera-facing card, for anything that does not need real geometry. */
  private card(cam: Cam, p: Vec2, z: number, halfW: number, halfH: number, fill: string): void {
    const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
    if (d > FAR || d < 0.25) return;
    const ux = -(p.y - cam.pos.y) / d, uy = (p.x - cam.pos.x) / d;
    this.push(cam, [
      { x: p.x - ux * halfW, y: p.y - uy * halfW, z: z - halfH },
      { x: p.x + ux * halfW, y: p.y + uy * halfW, z: z - halfH },
      { x: p.x + ux * halfW, y: p.y + uy * halfW, z: z + halfH },
      { x: p.x - ux * halfW, y: p.y - uy * halfW, z: z + halfH },
    ], fill);
  }

  /**
   * A rock, not a floating cube.
   *
   * The projectile was a steel bearing and it was drawn as a flat square card,
   * which at the size a small object subtends read as a blocky thing rather
   * than something you would pick up off a driveway. It is gravel now, which
   * suits a miniature town better than machined steel: a billboarded lump with
   * an irregular outline, a dark side and a lit side. Drawn a little larger
   * than life for the same reason a tracer is: at true scale it is two pixels
   * and a player cannot follow their own shot.
   */
  private rock(cam: Cam, p: Vec2, z: number, r: number): void {
    const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
    if (d > FAR || d < 0.25) return;
    const ux = -(p.y - cam.pos.y) / d, uy = (p.x - cam.pos.x) / d;
    // A seven-sided lump: irregular enough not to read as a machined ball.
    const JAG = [1, 0.82, 1.05, 0.88, 1.0, 0.79, 0.94];
    const lump = (rad: number, dx: number, dz: number, fill: string): void => {
      const pts: P3[] = [];
      for (let i = 0; i < JAG.length; i++) {
        const a = (i / JAG.length) * Math.PI * 2;
        const c = Math.cos(a) * rad * JAG[i] + dx, sz = Math.sin(a) * rad * JAG[i] + dz;
        pts.push({ x: p.x + ux * c, y: p.y + uy * c, z: z + sz });
      }
      this.push(cam, pts, fill);
    };
    lump(r, 0, 0, '#565C63');
    lump(r * 0.66, -r * 0.18, r * 0.18, '#7C838B');
  }

  private collectActors(sim: Sim, cam: Cam): void {
    for (const p of sim.world.propsNear({ x: cam.pos.x, y: cam.pos.y }, FAR)) {
      if (p.kind === 'tree') { this.card(cam, p.pos, 3.6, 2.0, 2.6, shade(VENEER.grass, -0.2)); continue; }
      const tall = p.kind === 'pole' || p.kind === 'sign';
      this.card(cam, p.pos, tall ? 1.8 : 0.5, tall ? 0.2 : 0.55, tall ? 1.8 : 0.5,
        p.tint && p.tint.startsWith('#') ? p.tint : VENEER.gravel);
    }
    for (const n of sim.npcs) this.person(cam, n.pos, '#6D7A88');
    for (const p of sim.patrols) this.person(cam, p.pos, p.state === 'INTERVENING' ? VENEER.warning : '#5A6470');
    if (!sim.devonStopped) this.person(cam, sim.devonPos, VENEER.friend);
    for (const d of sim.drones) {
      if (d.state === 'DESTABILISED') continue;
      this.card(cam, d.pos, d.z, 1.3, 0.45, '#F6F4EE');
      this.card(cam, d.pos, 0.02, 1.1, 0.01, alpha('#3A4C6B', 0.18));   // drone shadow
    }
    for (const pr of sim.projectiles) this.rock(cam, pr.pos, pr.z, 0.07);
    for (const b of sim.droppedRocks) this.rock(cam, b.pos, 0.05, 0.055);
  }

  private person(cam: Cam, p: Vec2, tint: string): void {
    this.card(cam, p, 0.45, 0.22, 0.45, shade(tint, -0.2));
    this.card(cam, p, 1.28, 0.28, 0.38, tint);
    this.card(cam, p, 1.75, 0.17, 0.17, '#F2D3B8');
  }

  /**
   * The rider, from behind, on a board.
   *
   * The board is real geometry laid on the ground and turned with the heading —
   * not a billboard — because the whole point is that the board is the thing
   * being steered and you can see it turn under you. The legs, torso and head
   * are cards, which is enough: this is a flat-colour world and a kid on a
   * board is a silhouette.
   */
  private collectRider(sim: Sim, cam: Cam): void {
    const p = sim.player;
    const h = p.heading;
    const fx = Math.cos(h), fy = Math.sin(h);
    const rx = -fy, ry = fx;              // the rider's right hand
    const z = p.z;
    const lean = p.lean;
    const at = (f: number, r: number): Vec2 => ({ x: p.pos.x + fx * f + rx * r, y: p.pos.y + fy * f + ry * r });

    // Contact shadow, painted onto the ground plane rather than sorted against
    // the world: it is a mark on the road, not an object standing on it.
    const sh = at(0, 0);
    this.push(cam, [
      { x: sh.x + fx * 0.95, y: sh.y + fy * 0.95, z: 0.01 },
      { x: sh.x + rx * 0.34, y: sh.y + ry * 0.34, z: 0.01 },
      { x: sh.x - fx * 0.95, y: sh.y - fy * 0.95, z: 0.01 },
      { x: sh.x - rx * 0.34, y: sh.y - ry * 0.34, z: 0.01 },
    ], alpha('#3A4C6B', 0.22 - clamp01(z / 1.2) * 0.1), undefined, undefined, Layer.Ground, 99);

    /*
     * The board rolls into the turn.
     *
     * The deck used to stay flat while the rider rotated around it, which is
     * the single clearest tell that a thing is a vehicle rather than a board.
     * The whole deck now banks on its long axis — the toe edge drops going one
     * way, the heel edge the other — and the rider follows it rather than the
     * other way round.
     */
    /*
     * A skateboard turns on its trucks, and the trucks pivot: the deck tilts
     * over them and all four wheels stay on the road. Rolling the whole thing
     * about its long axis was lifting two wheels clear of the pavement, which
     * reads as tipping over rather than carving.
     *
     * So the deck tilts modestly — about ten degrees at full lock — the wheels
     * are pinned to the ground whatever the deck is doing, and the rider leans
     * more than the board does, which is where most of the carve is read from
     * anyway. None of this touches steering: the turning radius is a simulation
     * number and it has not moved.
     */
    const roll = lean * 0.035;
    /*
     * A pop, not a hop. The knees fold as it loads, the body extends through
     * the rise, the tail snaps down and the nose comes up, and the landing is
     * absorbed. `crouch` comes from the simulation's own vertical state, so
     * none of it can drift out of time with the board.
     */
    const crouch = -p.crouch * 0.22;
    const rising = p.stance === 'AIR' && p.vz > 0;
    const tail = p.stance === 'AIR' ? (rising ? 0.30 : 0.10) : Math.max(0, -p.crouch) * 0.12;

    /*
     * The trick is the board's, not the rider's.
     *
     * Every one of these is the deck turning under a pair of feet: a kickflip
     * rolls it about its own long axis, a shove-it swings it about the vertical
     * with the deck staying flat, a varial does both at once. Spinning the
     * whole character instead — the shortcut — produces a 180, which is a
     * different trick and looks like one. So the deck's four corners are
     * transformed properly here, in the board's own frame, and the rider does
     * nothing but tuck their feet up out of its way and catch it.
     */
    const tr = p.trick;
    const ph = tr ? tr.phase : 0;
    const spin = tr ? tr.spec.shove * Math.PI * 2 * ph : 0;
    // The carve bank and the flip are the same rotation about the same axis,
    // so they are one angle. Ten degrees at full lock, from the roll above.
    const bank = (tr ? tr.spec.flip * Math.PI * 2 * ph : 0) + Math.asin(clamp01(Math.abs(roll) / 0.2)) * Math.sign(roll);
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const cs = Math.cos(spin), ss = Math.sin(spin);
    /** A point in the board's own frame — forward, right, up — put into the world. */
    const onBoard = (f: number, r: number, u = 0): P3 => {
      // Bank and flip, about the board's long axis.
      const r1 = r * cb - u * sb;
      const u1 = r * sb + u * cb;
      // Shove, about the board's vertical.
      const f2 = f * cs - r1 * ss;
      const r2 = f * ss + r1 * cs;
      return { x: p.pos.x + fx * f2 + rx * r2, y: p.pos.y + fy * f2 + ry * r2, z: z + 0.09 + u1 };
    };
    // Nose up as the tail snaps down: a pitch, applied before the board turns.
    const rise = (f: number) => (f < 0 ? tail : tail * 0.35);

    if (p.onBoard) {
      this.push(cam, [
        onBoard(0.92, 0.20, rise(0.92)),
        onBoard(0.92, -0.20, rise(0.92)),
        onBoard(-0.92, -0.20, rise(-0.92)),
        onBoard(-0.92, 0.20, rise(-0.92)),
      ], VENEER.player, alpha('#2E3944', 0.45), 1.4);
      for (const [f, r] of [[0.66, 0.22], [0.66, -0.22], [-0.66, 0.22], [-0.66, -0.22]] as Array<[number, number]>) {
        if (tr) {
          // Off the ground and turning: the wheels go where the deck takes them.
          const w = onBoard(f, r, rise(f) - 0.05);
          this.card(cam, { x: w.x, y: w.y }, w.z, 0.07, 0.045, '#2A3038');
        } else {
          // Planted. The only thing that lifts a wheel is leaving the ground.
          const w = at(f, r);
          this.card(cam, w, z + 0.045 + rise(f), 0.07, 0.045, '#2A3038');
        }
      }
    }

    /*
     * One pushing leg, and it is always the right one.
     *
     * Which foot pushes used to flip with the lean, so the rider swapped stance
     * mid-carve. A skater has a stance and keeps it: left foot forward on the
     * deck, right foot off the tail and down to the road.
     */
    const reach = p.pushPhase > 0 && p.stance !== 'AIR' ? Math.sin(p.pushPhase * Math.PI) : 0;
    const legCol = shade(VENEER.player, -0.6);

    /*
     * Feet up while the board is turning. This is the whole of the rider's
     * part in a trick: they pull their knees up, the deck goes round beneath
     * them, and they put their feet back down on it on the way out.
     */
    const tuck = tr && !tr.landed ? Math.sin(ph * Math.PI) * 0.28 : 0;

    /*
     * Nobody rides a skateboard with straight legs.
     *
     * The rider used to be a stiff column: hips at a fixed height and one
     * straight quad from each foot up to them, which is a figure standing on a
     * vehicle rather than a person riding a board. Two things fix it, and both
     * are things a skater actually does.
     *
     * The hips sit low to start with and drop further under load — into a
     * carve, through a pop, on a landing — so there is always some bend in
     * reserve and the stance reads as *ready*. And the legs have a knee: two
     * segments with a joint pushed out over the toes, so the bend is visible
     * as a shape rather than implied by a height. The deeper the crouch, the
     * further the knees come forward, which is the geometry of squatting.
     */
    const load = clamp01(Math.abs(lean) * 0.55 + Math.max(0, -p.crouch) * 0.8 + tuck * 1.6);
    const hipZ = z + 0.78 - crouch - load * 0.15;
    // Knees track out over the toe edge, and lead a little into a turn.
    const kneeLead = 0.09 + load * 0.13;
    const bend = {
      x: -rx * kneeLead + fx * lean * 0.05,
      y: -ry * kneeLead + fy * lean * 0.05,
    };

    // Left foot: forward on the deck, always, riding the roll.
    const leftFoot = at(0.40, -0.15);
    this.leg(cam, leftFoot, z + 0.12 - roll + tail * 0.35 + tuck, at(0.13, -0.08), hipZ, bend, legCol);

    // Right foot: on the tail, or off it and pushing.
    const pushing = reach > 0.02;
    const rightFoot = pushing
      ? at(-0.44 - reach * 0.30, 0.24 + reach * 0.30)
      : at(-0.46, 0.15);
    const rightZ = pushing ? 0.03 : z + 0.12 + roll + tail + tuck;
    // A pushing leg straightens as it reaches for the road; a planted one is
    // bent like the other.
    const rightBend = pushing
      ? { x: bend.x * (1 - reach * 0.8), y: bend.y * (1 - reach * 0.8) }
      : bend;
    this.leg(cam, rightFoot, rightZ, at(-0.11, 0.08), hipZ, rightBend, legCol);
    this.card(cam, rightFoot, rightZ + 0.02, 0.11, 0.05, shade(VENEER.player, -0.7));

    /*
     * The rider is where the carve actually reads. Weight goes over the edge
     * being turned on, the shoulders lead the turn, and the whole body folds
     * down into it — a bigger signal than the deck angle, and it costs the
     * board nothing.
     */
    const dip = load * 0.09;
    const bodyAt = at(reach * 0.20 + load * 0.05, lean * 0.30);
    // Torso: taller than it is wide, sitting straight on top of the hips, so
    // the body reads as a body and not as a bar floating over a pair of legs.
    const torsoH = 0.30 - dip * 0.5;
    const torsoZ = hipZ + torsoH;
    this.card(cam, bodyAt, torsoZ, 0.19, torsoH, shade(VENEER.player, -0.42));
    // Arms out for balance, further out the harder the board is working, and
    // the leading one drops into the turn.
    const shoulderZ = hipZ + torsoH * 1.8;
    const spread = 0.24 + load * 0.18;
    for (const side of [1, -1]) {
      const hand = at(reach * 0.18 - side * lean * 0.12, side * spread + lean * 0.26);
      this.limb(cam, hand, shoulderZ - 0.10 - side * lean * 0.12, bodyAt, shoulderZ, 0.05, legCol);
    }
    this.card(cam, bodyAt, shoulderZ + 0.15, 0.13, 0.13, '#F2D3B8');
  }

  /**
   * A leg with a knee in it: two segments meeting at a joint pushed out over
   * the toes. `bend` is the world-space offset applied to the midpoint, so the
   * deeper the crouch the further the knee travels forward.
   */
  private leg(
    cam: Cam, foot: Vec2, footZ: number, hip: Vec2, hipZ: number, bend: Vec2, fill: string,
  ): void {
    const knee = { x: (foot.x + hip.x) / 2 + bend.x, y: (foot.y + hip.y) / 2 + bend.y };
    const kneeZ = footZ + (hipZ - footZ) * 0.48;
    this.limb(cam, foot, footZ, knee, kneeZ, 0.07, fill);
    this.limb(cam, knee, kneeZ, hip, hipZ, 0.078, shade(fill, 0.06));
  }

  /** A leg: a narrow quad from a foot on the ground up to the hip. */
  private limb(cam: Cam, foot: Vec2, footZ: number, hip: Vec2, hipZ: number, wide: number, fill: string): void {
    const dx = hip.x - foot.x, dy = hip.y - foot.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = -dy / l * wide, uy = dx / l * wide;
    this.push(cam, [
      { x: foot.x + ux, y: foot.y + uy, z: footZ },
      { x: foot.x - ux, y: foot.y - uy, z: footZ },
      { x: hip.x - ux, y: hip.y - uy, z: hipZ },
      { x: hip.x + ux, y: hip.y + uy, z: hipZ },
    ], fill);
  }

  /** Screen position of a world point, or null if it is behind the camera. */
  screenOf(state: CamState, p: Vec2, z: number, w: number, h: number): { x: number; y: number } | null {
    const cam = this.cam(state, w, h);
    const cp = toCamera(cam, p.x, p.y, z);
    if (cp.z <= NEAR) return null;
    return project(cam, cp);
  }

  static clampPitch(p: number): number { return clamp(p, -0.55, 0.95); }
}
