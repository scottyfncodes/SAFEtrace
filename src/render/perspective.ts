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
import { clamp, clamp01, damp, lerp, solveTwoBone, wrapAngle } from '../core/math';
import { hashString } from '../core/rng';
import type { Sim } from '../sim/sim';
import type { RockShape } from '../sim/slingshot';
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
/**
 * Where the four wheels are, in the board's own frame: forward, then across.
 *
 * The deck is 1.84 m long and 0.40 m wide here. The trucks sit inboard of the
 * ends and the wheels sit just inside the deck's edges, which is what a real
 * board looks like from above — you see deck, and a little wheel peeping out
 * at each corner, not a chassis wider than the plank on top of it.
 */
const WHEELS: ReadonlyArray<readonly [number, number]> = [
  [0.62, 0.13], [0.62, -0.13], [-0.62, 0.13], [-0.62, -0.13],
];
/** Half-width and half-height of a wheel, drawn as a billboard. */
const WHEEL_R = 0.06;

/**
 * Bone lengths, in metres, for a fourteen-year-old on a board.
 *
 * The legs together are longer than the distance from hip to foot in any pose
 * the rider actually holds, which is the point: a limb that can always reach
 * is a limb that always has a bend in it, and the deeper the crouch the more
 * of a bend it has, for free.
 */
const LEG_UPPER = 0.40;
const LEG_LOWER = 0.38;
const ARM_UPPER = 0.26;
const ARM_LOWER = 0.24;

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
   * A rock, not a floating cube, and not the same rock every time.
   *
   * The projectile was a steel bearing and it was drawn as a flat square card,
   * which at the size a small object subtends read as a blocky thing rather
   * than something you would pick up off a driveway. It is gravel now, which
   * suits a miniature town better than machined steel: a billboarded lump with
   * an irregular outline, a dark side and a lit side. Drawn a little larger
   * than life for the same reason a tracer is: at true scale it is two pixels
   * and a player cannot follow their own shot.
   *
   * The seven-sided outline used to be one hard-coded list of radii, so every
   * rock in the town was the same rock at the same angle — twenty identical
   * pebbles lying in a road is the sort of thing you only notice once and then
   * cannot stop noticing. The lumpiness now comes from the stone's own rolled
   * shape: slightly different size, slightly different proportion, turned to
   * its own angle, and a different set of dents. All of it stays inside a band
   * narrow enough that every one of them still plainly reads as gravel.
   */
  private rock(cam: Cam, p: Vec2, z: number, r: number, shape: RockShape): void {
    const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
    if (d > FAR || d < 0.25) return;
    const ux = -(p.y - cam.pos.y) / d, uy = (p.x - cam.pos.x) / d;
    const SIDES = 7;
    const rad = r * shape.size;
    const lump = (scale: number, dx: number, dz: number, fill: string): void => {
      const pts: P3[] = [];
      for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        // Two offset waves round the outline: enough to read as chipped stone,
        // never enough to read as a star or a blob.
        const wobble = 1 + shape.jag * 0.11 * (
          Math.sin(a * 3 + shape.phase) + 0.6 * Math.sin(a * 5 - shape.phase * 1.7)
        );
        // The squash, applied about the stone's own turn.
        const t = a + shape.spin;
        const c = Math.cos(t) * shape.squash;
        const s = Math.sin(t) / shape.squash;
        pts.push({
          x: p.x + ux * (c * rad * scale * wobble + dx),
          y: p.y + uy * (c * rad * scale * wobble + dx),
          z: z + s * rad * scale * wobble + dz,
        });
      }
      this.push(cam, pts, fill);
    };
    lump(1, 0, 0, '#565C63');
    lump(0.66, -rad * 0.18, rad * 0.18, '#7C838B');
  }

  private collectActors(sim: Sim, cam: Cam): void {
    for (const p of sim.world.propsNear({ x: cam.pos.x, y: cam.pos.y }, FAR)) {
      if (p.kind === 'tree') { this.card(cam, p.pos, 3.6, 2.0, 2.6, shade(VENEER.grass, -0.2)); continue; }
      const tall = p.kind === 'pole' || p.kind === 'sign';
      this.card(cam, p.pos, tall ? 1.8 : 0.5, tall ? 0.2 : 0.55, tall ? 1.8 : 0.5,
        p.tint && p.tint.startsWith('#') ? p.tint : VENEER.gravel);
    }
    /*
     * Who is who, at the size a person actually is on the glass.
     *
     * Everybody used to be a grey-blue lozenge. A resident was #6D7A88, an
     * officer #5A6470, and an officer only changed colour once he was already
     * standing next to you — so through every stage of an actual pursuit he
     * looked exactly like a neighbour, and all nineteen neighbours looked
     * exactly like him. Measured over three minutes of ordinary skating an
     * officer is in frame 0% of the time and a resident 31%, which means every
     * report of "a cop is hunting me" was a person walking to the shops.
     */
    for (const n of sim.npcs) {
      // Their own clothes, and the same clothes every time you pass them.
      const wear = VENEER.civilian[hashString(n.id) % VENEER.civilian.length];
      this.person(cam, n.pos, wear);
    }
    for (const p of sim.patrols) {
      // A uniform and a cap, so an officer is an officer at a hundred metres —
      // and a shoulder light that is dark unless he is actually doing
      // something, so "is he coming for me" is answered by looking at him.
      const light = p.state === 'INTERVENING' ? VENEER.intervening
        : p.state === 'RESPONDING' ? VENEER.responding
        : undefined;
      this.person(cam, p.pos, VENEER.uniform, { cap: VENEER.uniformDark, light });
    }
    if (!sim.devonStopped) this.skater(cam, sim.devonPos, sim.devon.vel, VENEER.friend);
    for (const d of sim.drones) {
      if (d.state === 'DESTABILISED') continue;
      this.card(cam, d.pos, d.z, 1.3, 0.45, '#F6F4EE');
      this.card(cam, d.pos, 0.02, 1.1, 0.01, alpha('#3A4C6B', 0.18));   // drone shadow
    }
    for (const pr of sim.projectiles) this.rock(cam, pr.pos, pr.z, 0.07, pr.shape);
    for (const b of sim.droppedRocks) this.rock(cam, b.pos, 0.05, 0.055, b.shape);
  }

  private person(
    cam: Cam, p: Vec2, tint: string,
    kit?: { cap?: string; light?: string },
  ): void {
    this.card(cam, p, 0.45, 0.22, 0.45, shade(tint, -0.22));   // legs
    this.card(cam, p, 1.28, 0.28, 0.38, tint);                 // torso
    this.card(cam, p, 1.75, 0.17, 0.17, VENEER.skin);          // head
    // A cap breaks the silhouette, which is what actually carries at distance:
    // the eye reads the outline long before it reads the colour.
    if (kit?.cap) this.card(cam, p, 1.95, 0.21, 0.06, kit.cap);
    if (kit?.light) this.card(cam, p, 1.46, 0.11, 0.09, kit.light);
  }

  /**
   * Somebody on a board, which is what Devon has been the whole time.
   *
   * Devon was drawn with `person` — bolt upright, no board — while following
   * the player at five and a half metres and matching their speed exactly,
   * from the first second of the session. A figure that holds station behind
   * you at your own speed and never gets on anything is not a friend skating
   * along, it is a tail. The board was the missing word.
   */
  private skater(cam: Cam, p: Vec2, vel: Vec2, tint: string): void {
    const speed = Math.hypot(vel.x, vel.y);
    const h = speed > 0.35 ? Math.atan2(vel.y, vel.x) : 0;
    const fx = Math.cos(h), fy = Math.sin(h);
    const rx = -fy, ry = fx;
    const L = 0.92, W = 0.20, z = 0.055;
    this.push(cam, [
      { x: p.x + fx * L + rx * W, y: p.y + fy * L + ry * W, z },
      { x: p.x + fx * L - rx * W, y: p.y + fy * L - ry * W, z },
      { x: p.x - fx * L - rx * W, y: p.y - fy * L - ry * W, z },
      { x: p.x - fx * L + rx * W, y: p.y - fy * L + ry * W, z },
    ], shade(tint, -0.45));
    // Riding low, the way you do when you are actually moving.
    this.card(cam, p, 0.42, 0.24, 0.36, shade(tint, -0.22));
    this.card(cam, p, 1.14, 0.29, 0.36, tint);
    this.card(cam, p, 1.58, 0.16, 0.16, VENEER.skin);
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
      // The trucks: a hanger under the deck that the wheels are on the ends of,
      // so there is something holding them up rather than two floating discs.
      for (const f of [0.62, -0.62]) {
        const a = tr ? onBoard(f, 0.13, rise(f) - 0.035) : { ...at(f, 0.13), z: z + 0.06 };
        const bnd = tr ? onBoard(f, -0.13, rise(f) - 0.035) : { ...at(f, -0.13), z: z + 0.06 };
        this.limb(cam, a, a.z, bnd, bnd.z, 0.022, '#39424C');
      }
      /*
       * Wheels go under the deck, not beside it.
       *
       * They were at 0.22 m from the centreline on a deck half that wide, so
       * they stuck out past both edges and the board read as a go-kart. A real
       * truck is about as wide as the deck and hangs the wheels *below* it: an
       * eight-inch deck runs an eight-inch axle, so the wheels tuck just
       * inside the edges with the hangers under the ply. Narrow enough to sit
       * under the board, wide enough to still be there.
       */
      for (const [f, r] of WHEELS) {
        if (tr) {
          // Off the ground and turning: the wheels go where the deck takes them.
          const w = onBoard(f, r, rise(f) - 0.05);
          this.card(cam, { x: w.x, y: w.y }, w.z, WHEEL_R, 0.045, '#2A3038');
        } else {
          // Planted. The only thing that lifts a wheel is leaving the ground.
          const w = at(f, r);
          this.card(cam, w, z + 0.045 + rise(f), WHEEL_R, 0.045, '#2A3038');
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
    const pushing = reach > 0.02 && p.onBoard;

    /*
     * Which way the rider is facing, and therefore which way a knee bends.
     *
     * This is the whole of the reverse-knee bug. A skater stands across the
     * board, and the side their toes point at is the side they push off — the
     * right foot comes down on +r, so +r is the front of this person. Knees
     * were being pushed to -r, which is behind them, so both legs folded
     * backwards like a bird's. Everything about the rig that has a front now
     * derives from this one vector instead of being decided separately.
     */
    const toe = { x: rx, y: ry };
    const back = { x: -rx, y: -ry };

    /*
     * Feet up while the board is turning. This is the whole of the rider's
     * part in a trick: they pull their knees up, the deck goes round beneath
     * them, and they put their feet back down on it on the way out.
     */
    const tuck = tr && !tr.landed ? Math.sin(ph * Math.PI) * 0.28 : 0;

    /*
     * Nobody rides a skateboard with straight legs, and nobody's knees know
     * what state the game is in.
     *
     * The rider used to be a stiff column, then a column with a joint jammed
     * into the middle of each leg at a fixed offset — which meant the bend was
     * a decoration that had to be re-tuned for every pose and came out wrong
     * in the ones nobody re-tuned. Both legs and both arms now go through one
     * solver: two bones of fixed length between two ends, with the joint put
     * wherever the geometry says it lands and pushed to whichever side is
     * anatomically forward. Crouch deeper and the knee comes further over the
     * toes on its own, because that is what the triangle does. Reach a foot to
     * the road and the leg straightens on its own, for the same reason.
     *
     * The hips sit low to begin with and drop further under load — into a
     * carve, through a pop, on a landing — so there is always bend in reserve
     * and the stance reads as *ready* rather than as standing to attention.
     */
    const load = clamp01(Math.abs(lean) * 0.55 + Math.max(0, -p.crouch) * 0.8 + tuck * 1.6);
    const hipZ = z + 0.80 - crouch - load * 0.17;

    /*
     * On foot, the legs do something else entirely: they run.
     *
     * A bail puts the player on the pavement at a running pace, and that is
     * now a real part of the chase rather than a penalty box — so it needs to
     * look like running. One phase drives both legs in opposition, taken from
     * the odometer so the stride is tied to ground actually covered.
     */
    const running = !p.onBoard && p.speed > 0.4;
    const stride = running ? p.odometer * 1.55 : 0;
    const swing = (side: number) => Math.sin(stride + (side > 0 ? 0 : Math.PI));

    let leftFoot: Vec2, leftZ: number, rightFoot: Vec2, rightZ: number;
    if (running) {
      // Feet fore and aft along the heading, lifting on the forward swing.
      const s0 = swing(1), s1 = swing(-1);
      leftFoot = at(s0 * 0.42, -0.12);
      rightFoot = at(s1 * 0.42, 0.12);
      leftZ = Math.max(0.02, s0 * 0.16);
      rightZ = Math.max(0.02, s1 * 0.16);
    } else {
      // Left foot forward on the deck, always, riding the roll.
      leftFoot = at(0.40, -0.13);
      leftZ = z + 0.12 - roll + tail * 0.35 + tuck;
      // Right foot on the tail, or off it and pushing.
      rightFoot = pushing ? at(-0.44 - reach * 0.30, 0.26 + reach * 0.34) : at(-0.46, 0.13);
      rightZ = pushing ? 0.03 : z + 0.12 + roll + tail + tuck;
    }

    const hipL = at(running ? 0 : 0.13, -0.09);
    const hipR = at(running ? 0 : -0.11, 0.09);
    this.twoBone(cam, hipL, hipZ, leftFoot, leftZ, LEG_UPPER, LEG_LOWER, toe, 0.072, legCol);
    this.twoBone(cam, hipR, hipZ, rightFoot, rightZ, LEG_UPPER, LEG_LOWER, toe, 0.072, legCol);
    this.card(cam, rightFoot, rightZ + 0.02, 0.10, 0.045, shade(VENEER.player, -0.7));
    this.card(cam, leftFoot, leftZ + 0.02, 0.10, 0.045, shade(VENEER.player, -0.7));

    /*
     * The rider is where the carve actually reads. Weight goes over the edge
     * being turned on, the shoulders lead the turn, and the whole body folds
     * down into it — a bigger signal than the deck angle, and it costs the
     * board nothing.
     */
    const dip = load * 0.09;
    const bodyF = reach * 0.20 + load * 0.05 + (running ? 0.06 : 0);
    const bodyAt = at(bodyF, lean * 0.30);
    // Torso: taller than it is wide, sitting straight on top of the hips, so
    // the body reads as a body and not as a bar floating over a pair of legs.
    const torsoH = 0.28 - dip * 0.5;
    this.card(cam, bodyAt, hipZ + torsoH, 0.18, torsoH, shade(VENEER.player, -0.42));

    /*
     * Arms, with elbows in them.
     *
     * There were two sticks running from somewhere near the chest out to a
     * hand, hinged nowhere, which is why the character read as a torso with
     * legs. Real arms hang from a shoulder, break at an elbow that points back
     * and down, and end in a hand that is doing something — and what they are
     * doing is most of how a person on a board reads: out and low for balance,
     * further out the harder the board is working, the leading one dropping
     * into a carve, both of them counter-swinging a run, and one of them
     * holding a slingshot when there is one to hold.
     */
    const shoulderZ = hipZ + torsoH * 1.92;
    const spread = 0.30 + load * 0.16 + (p.stance === 'AIR' ? 0.12 : 0);
    // Elbows fall back and down, the way an arm held out for balance hangs.
    const elbowTo = { x: back.x * 0.7 - fx * 0.3, y: back.y * 0.7 - fy * 0.3 };
    for (const side of [1, -1]) {
      // The shoulder is on the torso, not floating beside it.
      const shoulder = at(bodyF, side * 0.15 + lean * 0.30);
      const swingF = running ? -swing(side) * 0.34 : reach * 0.16;
      const hand = at(bodyF + swingF - side * lean * 0.10, side * spread + lean * 0.24);
      const handZ = shoulderZ - 0.34 - side * lean * 0.12 + (p.stance === 'AIR' ? 0.14 : 0);
      this.twoBone(cam, shoulder, shoulderZ, hand, handZ, ARM_UPPER, ARM_LOWER, elbowTo, 0.048, legCol);
      // A hand, so the arm ends in something.
      this.card(cam, hand, handZ, 0.05, 0.05, '#F2D3B8');
    }
    this.card(cam, bodyAt, shoulderZ + 0.16, 0.125, 0.125, '#F2D3B8');
  }

  /**
   * Draw a two-bone limb: hip → knee → ankle, or shoulder → elbow → hand.
   *
   * The joint comes from `solveTwoBone`, which is geometry and lives with the
   * rest of it. All this does is put two quads where the triangle says.
   */
  private twoBone(
    cam: Cam, root: Vec2, rootZ: number, end: Vec2, endZ: number,
    upper: number, lower: number, bendTo: Vec2, wide: number, fill: string,
  ): void {
    const j = solveTwoBone(
      { x: root.x, y: root.y, z: rootZ }, { x: end.x, y: end.y, z: endZ },
      upper, lower, bendTo,
    );
    this.limb(cam, root, rootZ, j, j.z, wide, fill);
    this.limb(cam, j, j.z, end, endZ, wide * 0.9, shade(fill, 0.06));
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
