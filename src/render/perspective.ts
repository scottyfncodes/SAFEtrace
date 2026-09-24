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
import type { Building, Prop } from '../sim/worldTypes';
import { SURFACE_COLOUR, VENEER, alpha, shade } from './palette';

/** Eye height of a teenager standing on a board. */
export const EYE_Z = 1.62;
/*
 * A long lens, on purpose. This is most of the miniature.
 *
 * A wide lens is what makes a place feel big: it stretches the near ground,
 * throws the far ground away, and puts you inside the scene. A long one does
 * the opposite — it flattens the depth between near and far until a street
 * reads as a set of objects arranged on a table, which is exactly the trick
 * every photograph of a model railway plays and exactly what a Micro Machines
 * track looks like. It narrowed across three passes — 54 degrees, then 46,
 * then 34 — each time to buy the rider's size back after the rig moved
 * further out, which is a real trade-off and not a free one: a longer lens is
 * also a narrower window onto whatever is beside you, and the next report was
 * "skating feels more limiting than it does freeing" the very session after
 * the 34-degree pass shipped. A rider has to see what's coming up alongside
 * them to carve around it, weave through it, use it — that field of view is
 * not scenery, it is the input the whole skill is built on, and a diorama
 * that costs a player their peripheral vision has made the wrong trade. Back
 * to 40, which is where it sat for every pass before the one that went too
 * far. The rig still sits further out than it used to — see `ChaseCamera`
 * below — so the rider still reads smaller against more of the town; that
 * half of "smaller and further away" cost nothing to keep.
 */
const VFOV = (40 * Math.PI) / 180;
/*
 * ...and a floor on the horizontal, because forty degrees vertical on a phone
 * held upright is twenty-four degrees across: a letterbox slot of town either
 * side of the rider, which is the whole of why skating on a phone felt like
 * looking down a corridor. Landscape screens never reach the floor, so the
 * desktop picture is exactly what it was.
 */
const HFOV_MIN = (48 * Math.PI) / 180;

/** Focal length, in pixels, for a viewport. */
export function focalFor(w: number, h: number): number {
  return Math.min((h / 2) / Math.tan(VFOV / 2), (w / 2) / Math.tan(HFOV_MIN / 2));
}
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
  /**
   * Words printed on the face: a shop sign, a poster, a sprayed wall. Drawn
   * in the face's own plane, so a sign reads as a thing on a wall rather than
   * a label floating over the town, and sorts behind whatever is in front of
   * it like any other face.
   */
  text?: { str: string; colour: string; aspect: number; weight?: number };
  /**
   * Things on this face — windows, a door, a shop sign — painted straight
   * after it. They share its place in the sort, so a window can never end up
   * behind its own wall or in front of the house next door.
   */
  decals?: Array<{ pts: CP[]; fill: string; text?: Face['text'] }>;
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
  /**
   * How far the rig is currently allowed to sit, after walls have had their
   * say. Eased, so a building sliding between the eye and the rider pulls the
   * camera in smoothly and lets it back out smoothly, instead of the snap the
   * old per-frame probe produced every time a corner passed.
   */
  private reach = 1;
  /**
   * A scripted aerial shot, in the same terms the advertisement has always
   * authored its beats in: a point on the ground and a zoom.
   *
   * The advertisement used to drive only the flat plan camera. The world has
   * been drawn in third person since pass 24, so every "shot" of the tour —
   * the Commons, the school, Relay 12 — was the same frame behind a kid
   * standing on Maple Court. The advertisement is the front end; this puts
   * the tour back.
   */
  cinematic: { pos: Vec2; zoom: number } | null = null;
  private cineYaw = -2.2;
  private cineTime = 0;
  /** The last frame the rig showed, so leaving a shot is a move rather than a cut. */
  private lastState: CamState | null = null;
  private handoff: { from: CamState; t: number } | null = null;
  /**
   * Something the player has stopped to talk to or look at. The rig eases
   * in and turns to hold both of them in frame, which is the whole of
   * "investigation framing": you are looking at a thing, so is the camera.
   */
  focus: Vec2 | null = null;
  private focusBlend = 0;
  /**
   * Where the player has swung the camera to, as an offset from behind the
   * board. A drag on empty glass (or the right mouse button) turns it; it
   * holds for a moment after the thumb lifts and then eases back behind the
   * rider once they are moving — so looking round is free, and forgetting to
   * put it back costs nothing.
   */
  private freeLook = 0;
  /** Set by the host: the viewport, which decides how far back is far enough. */
  viewport = { w: 1280, h: 760 };
  /** How far over a wall the rig has had to lift, 0..1. */
  private crane = 0;

  /** Swing the camera round the rider by this many radians. */
  swing(radians: number): void {
    this.yaw = wrapAngle(this.yaw + radians);
    // Held where the player put it for a moment after they let go. The stick
    // is camera-relative, so a camera that kept chasing the board while the
    // player was turning it would spin the two of them round each other.
    this.freeLook = 1.4;
  }

  /** True while the player is looking round rather than being followed. */
  get lookingRound(): boolean { return this.freeLook > 0; }

  reset(sim: Sim): void {
    this.yaw = sim.player.heading;
    this.look = { ...sim.player.pos };
    this.freeLook = 0;
  }

  update(sim: Sim, dt: number): void {
    this.cineTime += dt;
    if (this.cinematic) {
      // A slow orbit: nothing in the advertisement is ever still.
      this.cineYaw += dt * 0.045;
      this.handoff = null;
      return;
    }
    if (this.lastState && !this.handoff && this.wasCinematic) {
      this.handoff = { from: this.lastState, t: 0 };
    }
    this.wasCinematic = false;
    if (this.handoff) {
      this.handoff.t += dt / 2.2;
      if (this.handoff.t >= 1) this.handoff = null;
    }

    const p = sim.player;
    const speed = p.speed;
    const cap = Math.max(1, sim.playerMaxSpeed);
    const t = clamp01(speed / cap);

    this.focusBlend = damp(this.focusBlend, this.focus && speed < 2 ? 1 : 0, 0.35, dt);

    // Face the way the board is pointed. Travel direction would judder every
    // time the board washed out; the nose is what the rider is looking over.
    this.freeLook = Math.max(0, this.freeLook - dt);
    let want = speed > 0.6 && this.freeLook <= 0 ? p.heading : this.yaw;
    if (this.focus && this.focusBlend > 0.05) {
      // Look past the rider toward the thing, from a little off their shoulder.
      const toward = Math.atan2(this.focus.y - p.pos.y, this.focus.x - p.pos.x);
      want = toward + 0.35;
    }
    const turn = wrapAngle(want - this.yaw);
    // Quicker to catch up on a hard turn, so the camera never falls behind the
    // player's own intention, but still eased.
    // Coming back from a look round is slower than following a carve, so it
    // reads as the camera settling rather than being yanked.
    const settle = this.freeLook > 0 ? 0 : 1;
    this.yaw = wrapAngle(this.yaw + turn * settle * clamp01(dt * (2.6 + Math.abs(turn) * 1.6) * (this.focus ? 0.5 : 1)));

    /*
     * The other half of the miniature: more town in the frame at once.
     *
     * A model reads as a model because you can see the whole of it. The rig
     * carries further back and a little higher again, and the long lens
     * flattens what that distance would otherwise stretch, so the player
     * reads smaller against a wider slice of Bellhaven.
     *
     * The angle is left at about two parts back to one part up. Steeper was
     * tried and it is worse: past thirty degrees the horizon leaves the frame,
     * taking every drone in the sky and the top of every building with it.
     */
    /*
     * Further out again, and by the screen rather than by one number.
     *
     * The rig sat at 29–36 m, which on a desktop is a comfortable street and
     * on an upright phone — where the lens used to be twenty-four degrees
     * across — was a corridor. With a floor on the horizontal field of view
     * the phone now sees as wide as a laptop does, and the distance is set so
     * the rider stays about the same size on the glass whatever the glass:
     * the focal length says how big a metre is, and the rig backs off until
     * the board is a readable size and no bigger.
     */
    const f = this.focusBlend;
    const k = clamp(focalFor(this.viewport.w, this.viewport.h) / 1040, 0.5, 1.15);
    const far = lerp(lerp(36.0, 44.0, t), 20.0, f) * k;
    this.dist = damp(this.dist, far, 0.3, dt);
    this.height = damp(this.height, lerp(lerp(17.0, 20.0, t), 9.0, f) * k + this.crane * 5 * k, 0.3, dt);
    // Slightly flatter at speed, so a little more of the road ahead is in shot.
    this.pitch = damp(this.pitch, lerp(lerp(-0.41, -0.36, t), -0.36, f) - this.crane * 0.08, 0.3, dt);

    // The point the rig is looking at lags the rider under acceleration, and
    // slides toward whatever they are talking to.
    const target = this.focus
      ? { x: lerp(p.pos.x, (p.pos.x + this.focus.x) / 2, f), y: lerp(p.pos.y, (p.pos.y + this.focus.y) / 2, f) }
      : p.pos;
    this.look = {
      x: damp(this.look.x, target.x, 0.055, dt),
      y: damp(this.look.y, target.y, 0.055, dt),
    };

    // Walls. The line from the rider back to the eye is sampled against the
    // buildings tall enough to block it; the rig pulls in to the nearest clear
    // point, quickly, and drifts back out slowly once the wall has passed.
    const back = { x: -Math.cos(this.yaw), y: -Math.sin(this.yaw) };
    let clear = 1;
    for (let i = 1; i <= 8; i++) {
      const k = i / 8;
      const probe = { x: p.pos.x + back.x * this.dist * k, y: p.pos.y + back.y * this.dist * k };
      const b = sim.world.buildingAt(probe);
      // The sight line rises from the rider toward the eye; a wall lower than
      // the line at that point does not block anything.
      if (b && b.height > 1.2 + this.height * k) { clear = Math.max(0.28, k - 0.14); break; }
    }
    /*
     * Walls: lift over them rather than push through them.
     *
     * Pulling straight in toward the rider when a house slid between them was
     * the camera-on-a-rope feeling at its worst — a sudden close-up of a
     * back, with nothing else in frame. Now the rig mostly rises (a crane
     * shot, looking over the roof line down at the street) and only closes
     * in by what rising cannot fix.
     */
    const blocked = 1 - clear;
    this.crane = blocked > this.crane ? damp(this.crane, blocked, 0.12, dt) : damp(this.crane, blocked, 0.6, dt);
    const wantReach = 1 - blocked * 0.5;
    this.reach = wantReach < this.reach ? damp(this.reach, wantReach, 0.1, dt) : damp(this.reach, wantReach, 0.5, dt);
  }

  private wasCinematic = false;

  /**
   * Where the eye sits.
   */
  state(sim: Sim): CamState {
    if (this.cinematic) {
      this.wasCinematic = true;
      const c = this.cinematic;
      // The advertisement authored its shots as pixels-per-metre over a flat
      // map. The same number reads naturally as a distance: tighter framing,
      // closer rig.
      const d = clamp(720 / Math.max(4, c.zoom), 40, 110);
      const yaw = this.cineYaw + Math.sin(this.cineTime * 0.07) * 0.1;
      const h = d * 0.62;
      const s: CamState = {
        pos: { x: c.pos.x - Math.cos(yaw) * d, y: c.pos.y - Math.sin(yaw) * d, z: h },
        yaw,
        pitch: -Math.atan2(h, d) * 0.92,
      };
      this.lastState = s;
      // The rig itself is parked where the shot hands over, so the first
      // frame of play is a continuous move rather than a cut.
      this.yaw = sim.player.heading;
      this.look = { ...sim.player.pos };
      return s;
    }
    const p = sim.player;
    const back = { x: -Math.cos(this.yaw), y: -Math.sin(this.yaw) };
    const dist = this.dist * this.reach;
    const live: CamState = {
      pos: {
        x: this.look.x + back.x * dist,
        y: this.look.y + back.y * dist,
        z: lerp(this.height * 0.55, this.height, this.reach) + p.z * 0.6,
      },
      yaw: this.yaw,
      pitch: this.pitch,
    };
    if (!this.handoff) { this.lastState = live; return live; }
    const k = easeHandoff(this.handoff.t);
    const a = this.handoff.from;
    const out: CamState = {
      pos: {
        x: lerp(a.pos.x, live.pos.x, k),
        y: lerp(a.pos.y, live.pos.y, k),
        z: lerp(a.pos.z, live.pos.z, k),
      },
      yaw: a.yaw + wrapAngle(live.yaw - a.yaw) * k,
      pitch: lerp(a.pitch, live.pitch, k),
    };
    this.lastState = out;
    return out;
  }
}

const easeHandoff = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class PerspectiveRenderer {
  private faces: Face[] = [];
  /** Trees currently shivering from a stone, by prop id, 1 → 0. Set by the host. */
  readonly treeShake = new Map<string, number>();
  /**
   * The lens, as a multiplier on the focal length. The aiming view narrows a
   * little as the draw comes up — attention, not a scope — and the host sets it.
   */
  lens = 1;

  private cam(state: CamState, w: number, h: number): Cam {
    return { ...state, f: focalFor(w, h) * this.lens, w, h };
  }

  /**
   * A point in the world, on the glass, with how many pixels one metre is
   * there. Null behind the eye.
   */
  project3(state: CamState, x: number, y: number, z: number, w: number, h: number): { x: number; y: number; s: number } | null {
    const cam = this.cam(state, w, h);
    const cp = toCamera(cam, x, y, z);
    if (cp.z <= NEAR) return null;
    const pt = project(cam, cp);
    return { x: pt.x, y: pt.y, s: cam.f / cp.z };
  }

  /**
   * Where on the ground a point on the glass is, or null above the horizon.
   * The pointer's answer to "where is that", in a view that is not a map.
   */
  groundAt(state: CamState, sx: number, sy: number, w: number, h: number): Vec2 | null {
    const cam = this.cam(state, w, h);
    // Ray in camera space, then back into the world.
    const rx = (sx - w / 2) / cam.f, ry = -(sy - h / 2) / cam.f, rz = 1;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    // Invert toCamera: fwd/dz from camera y,z.
    const fwd = rz * cp - ry * sp;
    const dz = ry * cp + rz * sp;
    if (dz >= -1e-4) return null;
    const cy = Math.cos(cam.yaw), sy2 = Math.sin(cam.yaw);
    const dx = fwd * cy - rx * sy2;
    const dy = fwd * sy2 + rx * cy;
    const t = -cam.pos.z / dz;
    return { x: cam.pos.x + dx * t, y: cam.pos.y + dy * t };
  }

  draw(ctx: CanvasRenderingContext2D, sim: Sim, state: CamState, w: number, h: number, firstPerson: boolean): void {
    const cam = this.cam(state, w, h);
    this.drawSkyAndGround(ctx, cam);
    this.faces.length = 0;
    this.collectSurfaces(sim, cam);
    this.collectShadows(sim, cam);
    this.collectBuildings(sim, cam);
    this.collectSensors(sim, cam);
    this.collectSceneProps(sim, cam);
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
      if (f.text && f.pts.length === 4) this.drawFaceText(ctx, cam, f.pts, f.text);
      if (f.decals) {
        for (const d of f.decals) {
          if (d.pts.length < 3) continue;
          ctx.beginPath();
          const q0 = project(cam, d.pts[0]);
          ctx.moveTo(q0.x, q0.y);
          for (let i = 1; i < d.pts.length; i++) { const q = project(cam, d.pts[i]); ctx.lineTo(q.x, q.y); }
          ctx.closePath();
          ctx.fillStyle = d.fill;
          ctx.fill();
          if (d.text && d.pts.length === 4) this.drawFaceText(ctx, cam, d.pts, d.text);
        }
      }
    }
    if (!firstPerson) this.drawMiniatureHaze(ctx, cam);
  }

  private drawFaceText(ctx: CanvasRenderingContext2D, cam: Cam, pts: CP[], t: NonNullable<Face['text']>): void {
    // Quads are authored bottom-left, bottom-right, top-right, top-left.
    const bl = project(cam, pts[0]), br = project(cam, pts[1]), tl = project(cam, pts[3]);
    const wpx = Math.hypot(br.x - bl.x, br.y - bl.y);
    if (wpx < 14) return;
    // Mirrored means we are looking at the back of it.
    const cross = (br.x - bl.x) * (tl.y - bl.y) - (br.y - bl.y) * (tl.x - bl.x);
    if (cross > 0) return;
    const W = 100 * t.aspect, H = 100;
    ctx.save();
    ctx.transform((br.x - bl.x) / W, (br.y - bl.y) / W, (bl.x - tl.x) / H, (bl.y - tl.y) / H, tl.x, tl.y);
    ctx.fillStyle = t.colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 46;
    ctx.font = `${t.weight ?? 700} ${size}px Inter, system-ui, sans-serif`;
    const m = ctx.measureText(t.str).width;
    if (m > W * 0.9) { size *= (W * 0.9) / m; ctx.font = `${t.weight ?? 700} ${size}px Inter, system-ui, sans-serif`; }
    ctx.fillText(t.str, W / 2, H / 2 + 2);
    ctx.restore();
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
    // Four in the afternoon: blue overhead, warming toward the horizon.
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, '#A9CDE8');
    sky.addColorStop(0.7, '#D9E6EE');
    sky.addColorStop(1, '#F1E6D2');
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

  /** A vertical panel in a wall's plane, facing along `rot`, optionally printed on. */
  private panel(
    cam: Cam, c: Vec2, rot: number, w: number, h: number, z: number, fill: string,
    text?: Face['text'], out = 0.04,
  ): void {
    const nx = Math.cos(rot), ny = Math.sin(rot);
    // Right-hand along the wall as seen by someone facing it.
    const rx = ny, ry = -nx;
    const cx = c.x + nx * out, cy = c.y + ny * out;
    const before = this.faces.length;
    this.push(cam, [
      { x: cx - rx * w / 2, y: cy - ry * w / 2, z: z - h / 2 },
      { x: cx + rx * w / 2, y: cy + ry * w / 2, z: z - h / 2 },
      { x: cx + rx * w / 2, y: cy + ry * w / 2, z: z + h / 2 },
      { x: cx - rx * w / 2, y: cy - ry * w / 2, z: z + h / 2 },
    ], fill);
    const f = this.faces[before];
    if (f && text) {
      // Pull it just in front of the wall it hangs on, for the sort.
      f.depth -= 0.05;
      if (f.pts.length === 4) f.text = text;
    }
  }

  private box(cam: Cam, c: Vec2, rot: number, w: number, d: number, h: number, fill: string): void {
    this.boxAt(cam, c, rot, w, d, 0, h, fill);
  }

  /** A box between two heights: a car's cabin, a bench seat, a mailbox on its post. */
  private boxAt(cam: Cam, c: Vec2, rot: number, w: number, d: number, z0: number, z1: number, fill: string): void {
    const fx = Math.cos(rot), fy = Math.sin(rot);
    const rx = -fy, ry = fx;
    const corner = (a: number, b: number): Vec2 => ({ x: c.x + fx * a * w / 2 + rx * b * d / 2, y: c.y + fy * a * w / 2 + ry * b * d / 2 });
    const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      this.push(cam, [
        { x: a.x, y: a.y, z: z0 }, { x: b.x, y: b.y, z: z0 }, { x: b.x, y: b.y, z: z1 }, { x: a.x, y: a.y, z: z1 },
      ], shade(fill, i % 2 ? -0.12 : -0.04));
    }
    this.push(cam, ring.map((p) => ({ x: p.x, y: p.y, z: z1 })), shade(fill, 0.1));
  }

  private collectSceneProps(sim: Sim, cam: Cam): void {
    for (const sp of sim.sceneProps) {
      if (!sp.visible) continue;
      if (Math.hypot(sp.pos.x - cam.pos.x, sp.pos.y - cam.pos.y) > 90) continue;
      switch (sp.kind) {
        case 'tape': {
          const dx = Math.cos(sp.rot), dy = Math.sin(sp.rot);
          const a = { x: sp.pos.x - dx * sp.w / 2, y: sp.pos.y - dy * sp.w / 2 };
          const b = { x: sp.pos.x + dx * sp.w / 2, y: sp.pos.y + dy * sp.w / 2 };
          for (const post of [a, b]) this.card(cam, post, 0.5, 0.04, 0.5, '#3B3F44');
          for (const z of [sp.z, sp.z - 0.32]) {
            this.push(cam, [
              { x: a.x, y: a.y, z: z - 0.05 }, { x: b.x, y: b.y, z: z - 0.05 },
              { x: b.x, y: b.y, z: z + 0.05 }, { x: a.x, y: a.y, z: z + 0.05 },
            ], sp.tint);
          }
          break;
        }
        case 'parcel':
          this.box(cam, sp.pos, sp.rot, 0.55, 0.42, 0.34, sp.tint);
          break;
        case 'screen':
          this.panel(cam, sp.pos, sp.rot, sp.w + 0.1, sp.w * 0.75 + 0.1, sp.z, '#2A3138', undefined, 0.02);
          this.panel(cam, sp.pos, sp.rot, sp.w, sp.w * 0.75, sp.z, sp.tint,
            sp.text ? { str: sp.text, colour: '#C8412F', aspect: 1.33, weight: 800 } : undefined, 0.05);
          break;
        case 'poster':
          this.panel(cam, sp.pos, sp.rot, sp.w, sp.w * 0.62, sp.z, sp.tint,
            sp.text ? { str: sp.text, colour: sp.tint === '#FFFFFF' || sp.tint === '#F4EFE4' ? '#1F2A33' : '#FFFFFF', aspect: 1.6 } : undefined);
          break;
        case 'notice':
          this.panel(cam, sp.pos, sp.rot, sp.w, sp.w * 0.7, sp.z, sp.tint,
            sp.text ? { str: sp.text, colour: '#2C8C8C', aspect: 1.43 } : undefined);
          break;
        case 'graffiti':
          this.panel(cam, sp.pos, sp.rot, sp.w, 0.9, sp.z, alpha(sp.tint, 0.18),
            sp.text ? { str: sp.text, colour: sp.tint, aspect: sp.w / 0.9, weight: 800 } : undefined);
          break;
        case 'board': {
          // A deck leaning against the step, nose up.
          const nx = Math.cos(sp.rot), ny = Math.sin(sp.rot);
          const rx = -ny, ry = nx;
          const foot = { x: sp.pos.x - nx * 0.35, y: sp.pos.y - ny * 0.35 };
          this.push(cam, [
            { x: foot.x - rx * 0.1, y: foot.y - ry * 0.1, z: 0.02 },
            { x: foot.x + rx * 0.1, y: foot.y + ry * 0.1, z: 0.02 },
            { x: sp.pos.x + rx * 0.1, y: sp.pos.y + ry * 0.1, z: 0.78 },
            { x: sp.pos.x - rx * 0.1, y: sp.pos.y - ry * 0.1, z: 0.78 },
          ], shade(sp.tint, -0.35));
          break;
        }
      }
    }
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
      this.collectBuilding(b, cam, sim, near);
    }
  }

  /** Each building's windows, door, sign and roof, worked out once. */
  private dressing = new Map<string, Dressing>();

  private dressFor(b: Building, sim: Sim): Dressing {
    let d = this.dressing.get(b.id);
    if (!d) { d = dress(b, sim); this.dressing.set(b.id, d); }
    return d;
  }

  /*
   * A building is a wall with things on it.
   *
   * Every building used to be an extruded footprint in two flat colours: a
   * beige box with a lid. That reads as a map of a town rather than a town,
   * and it throws away the cheapest storytelling there is — a shop you can
   * read the name of, a door somebody lives behind, a roof that tells you a
   * house from a warehouse at a hundred metres. None of it touches the
   * footprint, the height the cameras see over, or anything else the
   * simulation reads.
   */
  private collectBuilding(b: Building, cam: Cam, sim: Sim, near: number): void {
    const poly = b.poly;
    const dr = this.dressFor(b, sim);
    const detail = near < 110;
    const eave = b.height;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], c = poly[i];
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      const nx = -(c.y - a.y), ny = c.x - a.x;
      const facing = nx * (mx - cam.pos.x) + ny * (my - cam.pos.y);
      // Walls in the sun are lit, walls away from it are not; the difference
      // is the whole of the form.
      const lit = dr.sunlit[j] ?? 0;
      const before = this.faces.length;
      this.push(cam, [
        { x: a.x, y: a.y, z: 0 }, { x: c.x, y: c.y, z: 0 },
        { x: c.x, y: c.y, z: eave }, { x: a.x, y: a.y, z: eave },
      ], shade(b.wall, (facing < 0 ? 0.02 : -0.12) + lit * 0.06 - 0.04), alpha('#2E3944', 0.16));
      const face = this.faces[before];
      const decals = detail ? dr.walls[j] : undefined;
      if (face && decals && decals.length) {
        face.decals = [];
        for (const d of decals) {
          const cp = clipNear(d.pts.map((p) => toCamera(cam, p.x, p.y, p.z)));
          if (cp.length >= 3) face.decals.push({ pts: cp, fill: d.fill, text: d.text });
        }
      }
    }
    if (dr.ridge) {
      const r = dr.ridge;
      // Two slopes and two gable ends. The gables are wall-coloured, the
      // slopes are the roof, and the slope facing the sun is the lighter one.
      this.push(cam, [r.a0, r.a1, r.top1, r.top0], shade(b.roof, 0.04), alpha('#2E3944', 0.14));
      this.push(cam, [r.b1, r.b0, r.top0, r.top1], shade(b.roof, -0.12), alpha('#2E3944', 0.14));
      this.push(cam, [r.a0, r.b0, r.top0], shade(b.wall, -0.06), alpha('#2E3944', 0.12));
      this.push(cam, [r.b1, r.a1, r.top1], shade(b.wall, -0.06), alpha('#2E3944', 0.12));
    } else {
      this.push(cam, poly.map((p) => ({ x: p.x, y: p.y, z: eave })), b.roof, alpha('#2E3944', 0.14));
    }
  }

  /**
   * Shadows on the ground, from one sun at four in the afternoon.
   *
   * The cheapest depth cue there is, and the one the third-person view never
   * had: every building sat on the grass like a sticker. A shadow is the
   * footprint swept along the light, painted into the ground plane before
   * anything stands on it.
   */
  private collectShadows(sim: Sim, cam: Cam): void {
    const sun = sim.sun;
    const fill = alpha('#34465C', 0.17);
    for (const b of sim.world.data.buildings) {
      if (b.height < 1.2) continue;
      const c = b.poly[0];
      if (Math.hypot(c.x - cam.pos.x, c.y - cam.pos.y) > 120) continue;
      const k = b.height * 0.55;
      const off = { x: sun.x * k, y: sun.y * k };
      const poly = b.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], d = poly[i];
        this.push(cam, [
          { x: a.x, y: a.y, z: 0 }, { x: d.x, y: d.y, z: 0 },
          { x: d.x + off.x, y: d.y + off.y, z: 0 }, { x: a.x + off.x, y: a.y + off.y, z: 0 },
        ], fill, undefined, undefined, Layer.Ground, 50);
      }
    }
    for (const p of sim.world.propsNear({ x: cam.pos.x, y: cam.pos.y }, 90)) {
      if (p.kind !== 'tree') continue;
      const r = 2.1 * p.scale;
      const cx = p.pos.x + sun.x * 3.2, cy = p.pos.y + sun.y * 3.2;
      const pts: P3[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * r * 1.2, y: cy + Math.sin(a) * r * 0.8, z: 0 });
      }
      this.push(cam, pts, fill, undefined, undefined, Layer.Ground, 50);
    }
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
    for (const p of sim.world.propsNear({ x: cam.pos.x, y: cam.pos.y }, FAR)) this.prop(cam, p, sim);
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
    for (const p of sim.people) {
      if (!p.visible) continue;
      if (p.uniform) {
        this.person(cam, p.pos, VENEER.uniform, { cap: VENEER.uniformDark });
      } else {
        this.person(cam, p.pos, p.tint, { hood: p.hood ? shade(p.tint, -0.18) : undefined });
      }
    }
    /*
     * Devon rides when he is riding. Stopped — by the officer, or at his own
     * front door — he is a boy standing up with his board beside him, which is
     * a different picture and the right one: during the stop he used to vanish
     * from the town entirely.
     */
    if (sim.devonVisible) {
      if (sim.devonFollowing && !sim.devonStopped) this.skater(cam, sim.devonPos, sim.devon.vel, VENEER.friend);
      else {
        this.person(cam, sim.devonPos, VENEER.friend);
        this.card(cam, { x: sim.devonPos.x + 0.45, y: sim.devonPos.y + 0.2 }, 0.45, 0.1, 0.42, shade(VENEER.friend, -0.45));
      }
    }
    for (const d of sim.drones) {
      if (d.state === 'DESTABILISED') continue;
      this.card(cam, d.pos, d.z, 1.3, 0.45, '#F6F4EE');
      this.card(cam, d.pos, 0.02, 1.1, 0.01, alpha('#3A4C6B', 0.18));   // drone shadow
    }
    for (const pr of sim.projectiles) {
      // Tumbling, and a little larger than life in flight so the eye can
      // follow it — a seven-centimetre stone at forty metres is one pixel.
      const spun = { ...pr.shape, spin: pr.shape.spin + sim.tick * 0.45 + pr.id };
      this.rock(cam, pr.pos, Math.max(0.06, pr.z), 0.11, spun);
      // Its shadow on the ground, which is what actually tells you how high it is.
      if (pr.z > 0.15) this.card(cam, pr.pos, 0.012, 0.12, 0.012, alpha('#26313B', Math.max(0.12, 0.4 - pr.z * 0.03)));
    }
    for (const b of sim.droppedRocks) this.rock(cam, b.pos, 0.05, 0.055, b.shape);
  }

  /** A round, lumpy billboard: a tree's crown. */
  private blob(cam: Cam, p: Vec2, z: number, r: number, squash: number, fill: string, seed: number): void {
    const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
    if (d > FAR || d < 0.25) return;
    const ux = -(p.y - cam.pos.y) / d, uy = (p.x - cam.pos.x) / d;
    const pts: P3[] = [];
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 1 + 0.09 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 - seed * 1.3);
      pts.push({ x: p.x + ux * Math.cos(a) * r * w, y: p.y + uy * Math.cos(a) * r * w, z: z + Math.sin(a) * r * squash * w });
    }
    this.push(cam, pts, fill);
  }

  /**
   * Street furniture, as the things it is.
   *
   * Every prop used to be one square card — a car, a bin and a hydrant were
   * the same grey tile at three sizes. Each is now the smallest honest shape
   * of itself: a car is a body and a cabin, a tree is a trunk and a crown, a
   * sign is a post with words on it.
   */
  private prop(cam: Cam, p: Prop, sim: Sim): void {
    const tint = p.tint && p.tint.startsWith('#') ? p.tint : undefined;
    const dist = Math.hypot(p.pos.x - cam.pos.x, p.pos.y - cam.pos.y);
    // Seconds since a stone knocked it, and a wobble that dies away over a
    // second and a half: hit things move, and then they settle.
    const age = p.knockedAt !== undefined ? (sim.tick - p.knockedAt) / 60 : Infinity;
    const wob = age < 1.6 ? Math.sin(age * 26) * Math.exp(-age * 3.2) : 0;
    const kx = Math.cos(p.knockDir ?? 0), ky = Math.sin(p.knockDir ?? 0);
    switch (p.kind) {
      case 'tree': {
        const s = p.scale;
        const seed = (hashString(p.id) % 100) / 10;
        // A tree a stone went through shivers.
        const sh = this.treeShake.get(p.id) ?? 0;
        const sway = sh > 0 ? Math.sin(sim.tick * 0.9) * 0.22 * sh : 0;
        const crown = { x: p.pos.x + sway, y: p.pos.y - sway * 0.6 };
        this.card(cam, p.pos, 1.2 * s, 0.14 * s, 1.2 * s, '#6B5646');
        this.blob(cam, crown, 3.5 * s, 2.25 * s, 0.95, VENEER.tree, seed);
        this.blob(cam, { x: crown.x - 0.3, y: crown.y - 0.3 }, 3.9 * s, 1.35 * s, 0.9, VENEER.treeLight, seed + 2);
        return;
      }
      case 'bush':
        this.blob(cam, p.pos, 0.55 * p.scale, 0.8 * p.scale, 0.7, VENEER.tree, 1);
        return;
      case 'car': {
        if (dist > 120) { this.card(cam, p.pos, 0.7, 1.4, 0.7, tint ?? '#8C96A0'); return; }
        const col = tint ?? '#8C96A0';
        this.box(cam, p.pos, p.rot, 4.2, 1.8, 0.85, col);
        const fx = Math.cos(p.rot), fy = Math.sin(p.rot);
        const cab = { x: p.pos.x - fx * 0.35, y: p.pos.y - fy * 0.35 };
        this.boxAt(cam, cab, p.rot, 2.2, 1.6, 0.85, 1.4, '#3E4B57');
        // A car whose alarm is going flashes its lights.
        if (p.alarmUntil && p.alarmUntil > sim.tick && Math.floor(sim.tick / 20) % 2 === 0) {
          this.card(cam, { x: p.pos.x + fx * 2.15, y: p.pos.y + fy * 2.15 }, 0.65, 0.5, 0.12, '#FFD166');
        }
        return;
      }
      case 'bin':
        if (p.knocked) {
          // Over on its side, pointing the way it was hit, lid off.
          const tip = clamp01(age / 0.35);
          const at = { x: p.pos.x + kx * 0.45 * tip, y: p.pos.y + ky * 0.45 * tip };
          this.box(cam, at, (p.knockDir ?? 0), lerp(0.62, 1.05, tip), 0.62, lerp(1.05, 0.62, tip), '#4E6B58');
          if (tip >= 1) this.box(cam, { x: at.x + kx * 1.1 - ky * 0.4, y: at.y + ky * 1.1 + kx * 0.4 }, 0.6, 0.66, 0.66, 0.06, '#3E5747');
        } else {
          this.box(cam, p.pos, p.rot, 0.62, 0.62, 1.05, '#4E6B58');
        }
        return;
      case 'hydrant':
        this.card(cam, p.pos, 0.38, 0.14, 0.38, '#C8513E');
        return;
      case 'bench':
        this.boxAt(cam, p.pos, p.rot, 1.8, 0.5, 0.38, 0.48, '#8A6A4E');
        return;
      case 'mailbox':
        this.card(cam, p.pos, 0.5, 0.05, 0.5, '#5B5F63');
        this.boxAt(cam, p.pos, p.rot, 0.5, 0.3, 1.0, 1.3, '#2F4F6F');
        return;
      case 'planter':
        this.box(cam, p.pos, 0, 1.1 * p.scale, 1.1 * p.scale, 0.55, tint ?? '#B8B2A6');
        this.blob(cam, p.pos, 0.85, 0.55 * p.scale, 0.6, VENEER.treeLight, 3);
        return;
      case 'hoop':
        this.card(cam, p.pos, 1.6, 0.07, 1.6, '#50575E');
        this.card(cam, p.pos, 3.2, 0.6, 0.4, '#F2F0EA');
        return;
      case 'cone':
        if (p.knocked) {
          const t = clamp01(age / 0.4);
          const at = { x: p.pos.x + kx * 1.2 * t, y: p.pos.y + ky * 1.2 * t };
          this.card(cam, at, lerp(0.3, 0.12, t), lerp(0.14, 0.3, t), lerp(0.3, 0.12, t), '#E8773A');
        } else {
          this.card(cam, p.pos, 0.3, 0.14, 0.3, '#E8773A');
        }
        return;
      case 'sign': {
        // A sign rings like a sign: the panel swings on its post.
        const sp = { x: p.pos.x + kx * wob * 0.18, y: p.pos.y + ky * wob * 0.18 };
        this.card(cam, p.pos, 1.3, 0.05, 1.3, '#50575E');
        const label = p.tint && !p.tint.startsWith('#') ? p.tint : '';
        for (const side of [1, -1]) {
          this.panel(cam, sp, p.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + wob * 0.2, 1.8, 0.7, 2.7, '#F4F2EC',
            label ? { str: label, colour: '#2C8C8C', aspect: 2.57 } : undefined, 0.02);
        }
        return;
      }
      case 'ammoCache':
        this.box(cam, p.pos, 0, 0.9, 0.6, 0.6, '#8D7B5E');
        return;
      default: {
        const tall = p.kind === 'pole';
        const at = { x: p.pos.x + kx * wob * (tall ? 0.12 : 0.06), y: p.pos.y + ky * wob * (tall ? 0.12 : 0.06) };
        this.card(cam, at, tall ? 1.8 : 0.5, tall ? 0.2 : 0.55, tall ? 1.8 : 0.5, tint ?? VENEER.gravel);
      }
    }
  }

  private person(
    cam: Cam, p: Vec2, tint: string,
    kit?: { cap?: string; light?: string; hood?: string },
  ): void {
    this.card(cam, p, 0.45, 0.22, 0.45, shade(tint, -0.22));   // legs
    this.card(cam, p, 1.28, 0.28, 0.38, tint);                 // torso
    this.card(cam, p, 1.75, 0.17, 0.17, VENEER.skin);          // head
    // A cap breaks the silhouette, which is what actually carries at distance:
    // the eye reads the outline long before it reads the colour.
    if (kit?.cap) this.card(cam, p, 1.95, 0.21, 0.06, kit.cap);
    if (kit?.light) this.card(cam, p, 1.46, 0.11, 0.09, kit.light);
    // Hood up: the head is a shape in the same cloth as the coat.
    if (kit?.hood) this.card(cam, p, 1.78, 0.21, 0.21, kit.hood);
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
     *
     * A grab has no rotation to make room for, but it still isn't a straight-
     * legged hang — the knees come up a little to bring the board within
     * reach of the hand going down to meet it, and stay there for as long as
     * the grab is held rather than tracing a phase.
     */
    const tuck = (tr && !tr.landed ? Math.sin(ph * Math.PI) * 0.28 : 0) + (p.grab ? 0.14 : 0);

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
      /*
       * A grab sends one hand to the deck instead of out for balance —
       * `onBoard` is the same function the trick above turns the deck through,
       * so the hand is placed in the board's own frame and travels with it.
       * The other arm doesn't know anything happened.
       */
      const grabbing = p.grab && p.grab.spec.side === side ? p.grab.spec : null;
      const grabPoint = grabbing ? onBoard(grabbing.f, grabbing.r, 0.10) : null;
      const swingF = running ? -swing(side) * 0.34 : reach * 0.16;
      const hand = grabPoint ?? at(bodyF + swingF - side * lean * 0.10, side * spread + lean * 0.24);
      const handZ = grabPoint
        ? grabPoint.z
        : shoulderZ - 0.34 - side * lean * 0.12 + (p.stance === 'AIR' ? 0.14 : 0);
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

// ------------------------------------------------------------------- dressing

interface Decal { pts: P3[]; fill: string; text?: Face['text'] }
interface Dressing {
  /** Per wall edge (indexed like the edge's first vertex), what hangs on it. */
  walls: Decal[][];
  /** Per wall edge, how squarely it faces the sun, 0..1. */
  sunlit: number[];
  ridge: { a0: P3; a1: P3; b0: P3; b1: P3; top0: P3; top1: P3 } | null;
}

const GLASS = '#51687A';
const GLASS_LIT = '#6F8BA0';
const DOOR = '#6E5443';

/** Which words go on a building's sign, if any. */
function signFor(b: Building): string | null {
  if (!b.label) return null;
  if (b.kind === 'shop' || b.kind === 'civic' || b.kind === 'school') {
    return b.label.replace(/^NORTHGATE PARADE — /, '').replace(/^RIDGELINE — /, '');
  }
  if (b.kind === 'structure' && /DEPOT|PARKING/.test(b.label)) return b.label.replace(/ — DECK 2$/, '');
  return null;
}

/**
 * Work out a building's dressing from its footprint and the streets around it.
 *
 * The front is whichever wall looks at the nearest road. Houses get a door
 * there and a pitched roof along their long side; shops get a glass front
 * and their name above it; everything tall enough gets windows by the floor.
 */
function dress(b: Building, sim: Sim): Dressing {
  const poly = b.poly;
  const n = poly.length;
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  const edges = poly.map((_, i) => {
    const a = poly[(i - 1 + n) % n], c = poly[i];
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    let nx = (c.y - a.y) / len, ny = -(c.x - a.x) / len;
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    return { a, c, len, nx, ny, mx, my };
  });
  // Indexed by the edge's first vertex, to match collectBuilding's (j, i) walk.
  const byStart = (k: number) => edges[(k + 1) % n];

  const roads = sim.world.data.roadEdges;
  const nodes = new Map(sim.world.data.roadNodes.map((r) => [r.id, r.pos]));
  const roadDist = (x: number, y: number) => {
    let best = Infinity;
    for (const e of roads) {
      const p = nodes.get(e.a), q = nodes.get(e.b);
      if (!p || !q) continue;
      best = Math.min(best, segDist(x, y, p, q));
    }
    return best;
  };
  let front = 0, frontD = Infinity;
  for (let k = 0; k < n; k++) {
    const e = byStart(k);
    const d = roadDist(e.mx + e.nx * 4, e.my + e.ny * 4);
    if (d < frontD) { frontD = d; front = k; }
  }

  const sun = sim.sun;
  const walls: Decal[][] = [];
  const sunlit: number[] = [];
  const houseLike = b.kind === 'house';
  const sign = signFor(b);
  const floors = b.height >= 5 ? Math.max(1, Math.floor((b.height - 0.6) / 2.9)) : 0;

  for (let k = 0; k < n; k++) {
    const e = byStart(k);
    sunlit.push(Math.max(0, -(e.nx * sun.x + e.ny * sun.y)));
    const out: Decal[] = [];
    const along = { x: (e.c.x - e.a.x) / e.len, y: (e.c.y - e.a.y) / e.len };
    const at = (t: number, z: number, o = 0.035): P3 => ({
      x: e.a.x + along.x * t + e.nx * o, y: e.a.y + along.y * t + e.ny * o, z,
    });
    // Seen from outside, does the edge run left to right? If not, quads are
    // wound the other way, or every sign in town reads backwards.
    const flip = along.x * e.ny - along.y * e.nx < 0;
    const rect = (t0: number, t1: number, z0: number, z1: number, fill: string, text?: Face['text'], o = 0.035): Decal => {
      const l = flip ? t1 : t0, r = flip ? t0 : t1;
      return { pts: [at(l, z0, o), at(r, z0, o), at(r, z1, o), at(l, z1, o)], fill, text };
    };
    const isFront = k === front && frontD < 26;

    if (b.kind === 'shop' && isFront) {
      // A glass front, a door in it, and the name over the top.
      out.push(rect(e.len * 0.08, e.len * 0.92, 0.35, 2.7, GLASS_LIT));
      out.push(rect(e.len * 0.46, e.len * 0.54, 0.02, 2.4, '#3D4C58', undefined, 0.05));
      if (sign) out.push(rect(e.len * 0.12, e.len * 0.88, 3.05, 4.05, '#F4F1EA',
        { str: sign, colour: '#2B3640', aspect: (e.len * 0.76) / 1.0, weight: 700 }, 0.05));
    } else if (floors > 0 && e.len > 3.2 && (b.kind !== 'structure' || isFront)) {
      const count = Math.max(1, Math.floor((e.len - 1.6) / 3.3));
      const step = e.len / count;
      for (let f = 0; f < floors; f++) {
        const z0 = 1.05 + f * 2.9;
        if (z0 + 1.3 > b.height - 0.3) break;
        for (let w = 0; w < count; w++) {
          const t = step * (w + 0.5);
          // Leave the doorway clear on a house front.
          if (houseLike && isFront && f === 0 && Math.abs(t - e.len * 0.62) < 1.3) continue;
          out.push(rect(t - 0.6, t + 0.6, z0, z0 + 1.25, (w + f + k) % 3 === 0 ? GLASS_LIT : GLASS));
        }
      }
      if (houseLike && isFront) {
        out.push(rect(e.len * 0.62 - 0.5, e.len * 0.62 + 0.5, 0.02, 2.15, DOOR));
        // A number by the door, where the street has numbers.
        const num = b.label?.match(/^(\d+) /)?.[1];
        if (num) out.push(rect(e.len * 0.62 + 0.75, e.len * 0.62 + 1.35, 1.55, 2.0, '#F4F1EA',
          { str: num, colour: '#2B3640', aspect: 1.33, weight: 800 }, 0.05));
      }
      if ((b.kind === 'civic' || b.kind === 'school') && isFront) {
        out.push(rect(e.len * 0.44, e.len * 0.56, 0.02, 2.5, '#3D4C58', undefined, 0.05));
        if (sign) out.push(rect(e.len * 0.18, e.len * 0.82, b.height - 1.45, b.height - 0.45, '#F4F1EA',
          { str: sign, colour: '#2B3640', aspect: (e.len * 0.64) / 1.0 }, 0.05));
      }
    } else if (b.kind === 'garage' && isFront && e.len > 2.6) {
      out.push(rect(e.len * 0.15, e.len * 0.85, 0.02, 2.3, shade(b.wall, -0.18)));
    } else if (b.kind === 'structure' && isFront && sign) {
      out.push(rect(e.len * 0.15, e.len * 0.85, b.height - 1.6, b.height - 0.5, '#F4F1EA',
        { str: sign, colour: '#2B3640', aspect: (e.len * 0.7) / 1.1 }, 0.05));
    }
    walls.push(out);
  }

  // A pitched roof, along the long side, on anything that is a home.
  let ridge: Dressing['ridge'] = null;
  if (houseLike && n === 4) {
    const e0 = edges[0], e1 = edges[1];
    // Pick the pair of opposite corners that make the long side the ridge.
    const long0 = e0.len >= e1.len;
    const [p0, p1, p2, p3] = long0 ? [poly[3], poly[0], poly[1], poly[2]] : [poly[0], poly[1], poly[2], poly[3]];
    const rise = Math.min(2.2, Math.min(e0.len, e1.len) * 0.3);
    const h = b.height;
    const mid = (u: Vec2, v: Vec2): P3 => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2, z: h + rise });
    ridge = {
      a0: { x: p0.x, y: p0.y, z: h }, a1: { x: p1.x, y: p1.y, z: h },
      b1: { x: p2.x, y: p2.y, z: h }, b0: { x: p3.x, y: p3.y, z: h },
      top0: mid(p0, p3), top1: mid(p1, p2),
    };
  }
  return { walls, sunlit, ridge };
}

function segDist(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}
