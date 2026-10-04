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
import { clamp, clamp01, damp, lerp, smoothstep, solveTwoBone, wrapAngle } from '../core/math';
import { hashString } from '../core/rng';
import type { Sim } from '../sim/sim';
import type { RockShape } from '../sim/slingshot';
import type { Building, Prop, WorldData } from '../sim/worldTypes';
import { markersFor, sightlinesFor } from './evidence';
import { DEVON, DOG_COATS, RIDER, castLook, dogCollar, officerLook, paintDog, paintFigure, pose, residentLook, type Gait, type Gesture, type Joints, type Look } from './characters';
import { TUNE as SKATE, type PlayerState } from '../sim/player';
import { INK, Ink, brushOutline, hash01, inkAt, seedOf } from './ink';
import { CITY_INK, PRINT, SIGNAL, TECH, VENEER, alpha, mix, shade, weather } from './palette';
import { Tone, tone } from './tone';
import { POLE_H, poleLineFor } from '../sim/traversal/poleLine';


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
  /** Whose line this is, if it is inked at all (ink.ts). */
  ink?: Ink;
  /** A screentone laid over the fill (tone.ts). */
  tone?: Tone;
  /** From where it is in the world, so its line is the same line every frame. */
  seed: number;
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
  decals?: Array<{ pts: CP[]; fill: string; text?: Face['text']; ink?: boolean }>;
  /**
   * Something that draws itself — a person — in this face's place in the
   * sort. The face's own polygon is only where it stands, for the sort.
   */
  paint?: (ctx: CanvasRenderingContext2D) => void;
}

/** What each ground surface is printed in, in the street view. */
const STREET_SURFACE: Record<string, string> = {
  asphalt: PRINT.road,
  smoothConcrete: PRINT.footway,
  roughConcrete: PRINT.forecourt,
  tile: PRINT.tile,
  grass: PRINT.verge,
  gravel: PRINT.gravel,
  dirt: PRINT.dirt,
  water: PRINT.water,
};

/** The ink, at each class's own strength: five strings, made once. */
const INK_FILL: Record<Ink, string> = {
  [Ink.Person]: alpha(PRINT.ink, INK[Ink.Person].alpha),
  [Ink.Interactable]: alpha(PRINT.ink, INK[Ink.Interactable].alpha),
  [Ink.Building]: alpha(PRINT.ink, INK[Ink.Building].alpha),
  [Ink.Furniture]: alpha(PRINT.ink, INK[Ink.Furniture].alpha),
  [Ink.Detail]: alpha(PRINT.ink, INK[Ink.Detail].alpha),
};


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
/** Devon on his board: the board is under him, not in his hand. */
const DEVON_RIDING: Look = { ...DEVON, carry: 'none' };

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
  /** How drawn the sling is, eased: the rig closes in a little with it. */
  private drawPull = 0;
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
    /*
     * A sling being drawn holds the camera still. The aim is a point on the
     * glass, so a camera that kept turning with the board would slide the
     * world out from under a thumb that had not moved. It eases in a touch as
     * the pull tightens — attention, the way the first-person lens used to —
     * and lets go a moment after the throw.
     */
    const drawing = p.aiming && !sim.aimMode;
    if (drawing) this.freeLook = Math.max(this.freeLook, 0.45);
    this.drawPull = damp(this.drawPull, drawing ? p.draw : 0, 0.12, dt);
    /*
     * Except when the wheels have let go. In a powerslide the deck swings
     * eighty degrees across the road while the rider carries straight on, and
     * a camera glued to the nose spun the whole town round every time the
     * brake went down. The rig follows the line of travel to the extent the
     * board is sliding, and is back on the nose by the time it grips again.
     */
    const travel = speed > 0.6 ? Math.atan2(p.vel.y, p.vel.x) : p.heading;
    const follow = p.heading + wrapAngle(travel - p.heading) * p.slip;
    let want = speed > 0.6 && this.freeLook <= 0 ? follow : this.yaw;
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
    const far = lerp(lerp(36.0, 44.0, t), 20.0, f) * k * (1 - this.drawPull * 0.16);
    this.dist = damp(this.dist, far, 0.3, dt);
    this.height = damp(this.height, lerp(lerp(17.0, 20.0, t), 9.0, f) * k + this.crane * 5 * k, 0.3, dt);
    // Slightly flatter at speed, so a little more of the road ahead is in shot.
    // An upright phone has sky to spare and street to want: tip it down a touch.
    const tall = clamp01(1 - this.viewport.w / Math.max(1, this.viewport.h));
    // Less sky than it had: a quarter of an upright screen was horizon, and
    // the rider sat in the bottom half under it.
    const upright = tall * 0.24;
    // In a conversation on an upright phone the card has to sit above the
    // thumbs, which is the middle of the glass — exactly where framing puts
    // the two people talking. Tipping down lifts them into the top half, so
    // you can see who you are talking to over the words they are saying.
    const overCard = f * tall * 0.46;
    this.pitch = damp(this.pitch, lerp(lerp(-0.41, -0.36, t), -0.36, f) - this.crane * 0.08 - upright - overCard, 0.3, dt);

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
    /*
     * Sampled finely near the rider, because that is where the things that
     * actually hide them are. The line from the eye down to the board passes
     * a garage roof four metres behind the rider at head height, and eight
     * evenly spaced probes never landed on it — so a row of lock-ups, or a
     * hall the rider had stopped against, sat solidly in front of them.
     */
    const ks = [0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.43, 0.53, 0.64, 0.76, 0.88, 1];
    for (const k of ks) {
      const probe = { x: p.pos.x + back.x * this.dist * k, y: p.pos.y + back.y * this.dist * k };
      const b = sim.world.buildingAt(probe);
      // The sight line rises from the board toward the eye; a wall lower than
      // the line at that point does not block anything.
      if (b && b.height > 0.6 + this.height * k) { clear = Math.max(0.28, k - 0.1); break; }
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
    // Close in more than it used to when rising is not enough: a rider you
    // cannot see is worse than a street you cannot see all of.
    const wantReach = 1 - blocked * 0.62;
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
  /**
   * The sling, as the host knows it: in the rider's hand or not, whether the
   * band is being pulled, and how far. Set each frame before `draw`.
   */
  slingPose = { held: false, drawing: false, draw: 0 };
  /**
   * Where the two hands on the sling landed on the glass this frame, with how
   * many pixels a metre is there. The sling itself is drawn over the world at
   * these points, so it is in the hand that is holding it, at its real size.
   */
  slingHands: { fork: { x: number; y: number; s: number }; pull: { x: number; y: number; s: number } } | null = null;

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

  /** The ray through a point on the glass: where the eye is, and which way. */
  rayAt(state: CamState, sx: number, sy: number, w: number, h: number): { o: P3; d: P3 } {
    const cam = this.cam(state, w, h);
    const rx = (sx - w / 2) / cam.f, ry = -(sy - h / 2) / cam.f;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fwd = cp - ry * sp;
    const dz = ry * cp + sp;
    const cy = Math.cos(cam.yaw), sy2 = Math.sin(cam.yaw);
    const d = { x: fwd * cy - rx * sy2, y: fwd * sy2 + rx * cy, z: dz };
    const n = Math.hypot(d.x, d.y, d.z);
    return { o: { ...cam.pos }, d: { x: d.x / n, y: d.y / n, z: d.z / n } };
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

  /**
   * The mood of the town (mood.ts), -1 lit .. +1 owned, eased by the host.
   * Read once per frame into `page`: the paper, the rules, the wash.
   */
  mood = 0;
  private page = pageFor(0);

  /** Places the player has looked at, in the order they found them. Set by the host. */
  seen: Iterable<string> = [];
  /** Places that would read differently now. Set by the host. */
  fresh: ReadonlySet<string> = new Set();

  /** Projected outline of the face being drawn, reused frame to frame. */
  private xs: number[] = [];
  private ys: number[] = [];

  draw(ctx: CanvasRenderingContext2D, sim: Sim, state: CamState, w: number, h: number, firstPerson: boolean): void {
    const cam = this.cam(state, w, h);
    this.page = pageFor(this.mood);
    this.drawSkyAndGround(ctx, cam);
    this.faces.length = 0;
    this.collectSurfaces(sim, cam);
    this.collectShadows(sim, cam);
    this.collectEvidence(sim, cam);
    this.inkAs = Ink.Building;
    this.collectBuildings(sim, cam);
    this.inkAs = Ink.Interactable;
    this.collectSensors(sim, cam);
    this.collectTerminals(sim, cam);
    this.inkAs = Ink.Furniture;
    this.collectSceneProps(sim, cam);
    this.collectActors(sim, cam);
    this.slingHands = null;
    this.inkAs = Ink.Person;
    if (!firstPerson) this.collectSkater(sim, cam, sim.player, 'rider', RIDER, VENEER.player, true);
    this.inkAs = null;

    this.faces.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.layer === Layer.Ground) return a.order - b.order || b.depth - a.depth;
      return b.depth - a.depth;
    });
    const xs = this.xs, ys = this.ys;
    // One path and one fill per face. Batching the ground marks into a single
    // path was tried and measured: Skia fills one path of hundreds of
    // sub-paths about twice as slowly as the same shapes one at a time.
    let groundInk = false;
    for (const f of this.faces) {
      const n = f.pts.length;
      if (n < 3) continue;
      if (!groundInk && f.layer !== Layer.Ground) { this.drawGroundInk(ctx, sim, cam); groundInk = true; }
      if (f.paint) { f.paint(ctx); continue; }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const q = project(cam, f.pts[i]);
        xs[i] = q.x; ys[i] = q.y;
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      if (f.tone !== undefined) {
        const pat = tone(ctx, f.tone, this.page.owned > 0.45);
        if (pat) { ctx.fillStyle = pat; ctx.fill(); }
      }
      if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = f.wide ?? 1; ctx.stroke(); }
      if (f.text && n === 4) this.drawFaceText(ctx, cam, f.pts, f.text);
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
          if (d.ink && f.depth < INK[Ink.Detail].breakAt * 1.6) {
            const { width, keep } = inkAt(Ink.Detail, f.depth);
            if (keep > 0) {
              const dx: number[] = [], dy: number[] = [];
              for (const pt of d.pts) { const q = project(cam, pt); dx.push(q.x); dy.push(q.y); }
              ctx.beginPath();
              brushOutline(ctx, dx, dy, dx.length, Ink.Detail, width, keep, f.seed ^ (dx.length * 977 + Math.round(dx[0])));
              ctx.fillStyle = INK_FILL[Ink.Detail];
              ctx.fill();
            }
          }
          if (d.text && d.pts.length === 4) this.drawFaceText(ctx, cam, d.pts, d.text);
        }
      }
      // The line last, over everything the face carries. Not on a face too
      // small to hold one: ink would blot it out.
      if (f.ink !== undefined && (x1 - x0 > 2.5 || y1 - y0 > 2.5)) {
        const { width, keep } = inkAt(f.ink, f.depth);
        if (keep > 0) {
          const pts = f.pts;
          ctx.beginPath();
          // The edge the near plane cut is not an edge of anything.
          brushOutline(ctx, xs, ys, n, f.ink, width, keep, f.seed,
            (i) => pts[i].z === NEAR && pts[(i + 1) % n].z === NEAR);
          ctx.fillStyle = INK_FILL[f.ink];
          ctx.fill();
        }
      }
    }
    if (!groundInk) this.drawGroundInk(ctx, sim, cam);
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
    /*
     * In the print, distance is less ink: the far town fades back into the
     * paper it is drawn on, the way an illustrator vignettes the edge of a
     * scene rather than finishing it. It is the miniature's depth-of-field
     * fall-off and the noir pass's haze in one wash, and it is paper, not fog.
     */
    const horizon = cam.h / 2 + Math.tan(cam.pitch) * cam.f;
    // Light-handed: the far roofline against the paper is the strongest
    // image the street has, and a heavy wash turns it into fog.
    const band = cam.h * 0.06;
    const top = Math.max(0, horizon - 2);
    const pg = this.page;
    const g = ctx.createLinearGradient(0, top, 0, horizon + band);
    g.addColorStop(0, alpha(pg.paper, 0.4));
    g.addColorStop(0.4, alpha(pg.paper, 0.12));
    g.addColorStop(1, alpha(pg.paper, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, cam.w, horizon + band - top);
    /*
     * The town's mood, as a wash over the whole page (mood.ts).
     *
     * Owned: the page is dirtier. A multiply wash in a cool grey takes the
     * paper and every wash on it down together, blacks stay black, and a
     * second wash of ink closes in from the top and bottom edges. The rider
     * is in the dark with everything else — that is what being owned looks
     * like — but stays the warmest thing on the page.
     *
     * Lit: the page is cleaner. A thin warm screen lifts the washes a touch
     * and the edges open up. Neither wash is ever more than a tint: the
     * structural changes (the sky, the shadows, the windows, what stands in
     * the street) carry the mood, and the wash only agrees with them.
     */
    if (pg.owned > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = pg.wash;
      ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.globalCompositeOperation = 'source-over';
      const t = ctx.createLinearGradient(0, 0, 0, cam.h * 0.3);
      t.addColorStop(0, alpha(PRINT.ink, 0.42 * pg.owned));
      t.addColorStop(1, alpha(PRINT.ink, 0));
      ctx.fillStyle = t;
      ctx.fillRect(0, 0, cam.w, cam.h * 0.3);
    } else if (pg.lit > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = alpha('#FFF0CC', 0.24 * pg.lit);
      ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    /*
     * And the near ground goes down into shadow. The chase camera keeps a
     * lot of road behind the rider on an upright phone; a noir panel would
     * let that fall off into ink and keep the light where the action is.
     * It also sits under the thumbs, where a darker ground reads better
     * against the controls drawn on it.
     */
    const v0 = cam.h * 0.68;
    const v = ctx.createLinearGradient(0, v0, 0, cam.h);
    v.addColorStop(0, alpha(PRINT.ink, 0));
    v.addColorStop(1, alpha(PRINT.ink, 0.38 + pg.owned * 0.3 - pg.lit * 0.16));
    ctx.fillStyle = v;
    ctx.fillRect(0, v0, cam.w, cam.h - v0);
  }

  private drawSkyAndGround(ctx: CanvasRenderingContext2D, cam: Cam): void {
    const horizon = cam.h / 2 + Math.tan(cam.pitch) * cam.f;
    /*
     * The sky is the page. A graphic novel leaves it as paper and says
     * "overcast" with a few ruled strokes, and so does this: broken
     * horizontal rules, closer together toward the horizon, that slide as
     * the rider turns so the sky still has a direction.
     */
    const pg = this.page;
    ctx.fillStyle = pg.paper;
    ctx.fillRect(0, 0, cam.w, Math.max(0, horizon));
    if (horizon > 8) {
      // An owned town has a lower, heavier sky: more rules, closer, darker.
      ctx.fillStyle = alpha(PRINT.ink, pg.ruleAlpha);
      const pan = (cam.yaw * cam.f) % 997;
      for (let k = 1; k <= pg.rules; k++) {
        const y = horizon - 8 - k * k * (3.2 - pg.owned * 1.2);
        if (y < 2) break;
        const th = Math.max(0.5, 1.3 - k * 0.1) + pg.owned * 1.4;
        ctx.globalAlpha = Math.max(0.15, 0.9 - k * 0.09 + pg.owned * 0.25);
        // Strokes of a seeded length along the rule, with gaps between them.
        let x = -((pan * (0.6 + k * 0.05)) % 140) - 140;
        let i = 0;
        while (x < cam.w) {
          const len = 18 + hash01(k * 131 + i) * 80;
          const gap = 30 + hash01(k * 71 + i * 3) * (70 + k * 30);
          if (hash01(k * 17 + i * 5) > 0.35 - pg.owned * 0.25) ctx.fillRect(x, y, len, th);
          x += len + gap; i++;
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = pg.paperShade;
    ctx.fillRect(0, Math.max(0, horizon), cam.w, cam.h - Math.max(0, horizon));
    this.drawSkyline(ctx, cam, horizon);
  }

  /**
   * The rest of the town, past where it is modelled: a silhouette round the
   * horizon — roofs, trees, a pole line, the odd relay mast — inked flat
   * against the paper sky. It is a backdrop on a cylinder, fixed to compass
   * bearings, so it turns with the rider and never moves as they skate.
   *
   * This is what an upright phone's sky is for. The chase camera keeps a
   * third of the glass above the horizon and nothing in Bellhaven is tall
   * enough to fill it; a printed town under a printed sky does.
   */
  private drawSkyline(ctx: CanvasRenderingContext2D, cam: Cam, horizon: number): void {
    if (horizon < 4 || horizon > cam.h) return;
    const SLOTS = 1440;                       // a quarter of a degree each
    const deg = cam.f * Math.tan(Math.PI / 180);
    const slotAt = (x: number) => {
      const b = cam.yaw + Math.atan((x - cam.w / 2) / cam.f);
      return Math.floor(((b / (Math.PI * 2)) % 1 + 1) % 1 * SLOTS);
    };
    // A building is a run of slots sharing a seed: its run starts where the
    // hash says a new one does.
    const heightAt = (slot: number): number => {
      let s0 = slot;
      for (let k = 0; k < 14; k++) { if (hash01(s0 * 7 + 3) < 0.16) break; s0 = (s0 - 1 + SLOTS) % SLOTS; }
      const kind = hash01(s0 * 11 + 1);
      const tall = hash01(s0 * 13 + 5);
      const off = (slot - s0 + SLOTS) % SLOTS;
      if (kind < 0.18) {                       // a tree: a lumpy crown
        return (1.1 + tall * 1.2) * Math.max(0.55, 1 - Math.pow((off - 3) / 5, 2) * 0.5);
      }
      if (kind < 0.55) {                       // a pitched roof
        const w = 6 + Math.floor(tall * 6);
        return 0.8 + tall * 0.9 + Math.max(0, 0.7 - Math.abs(off - w / 2) / (w / 2) * 0.7);
      }
      return 0.6 + tall * (kind > 0.93 ? 3.2 : 1.4); // flat roofs, and the odd block
    };
    const base = horizon + 1;
    ctx.beginPath();
    ctx.moveTo(0, base);
    const STEP = 3;
    let last = -1, h = 0;
    for (let x = 0; x <= cam.w + STEP; x += STEP) {
      const sl = slotAt(x);
      if (sl !== last) { h = heightAt(sl); last = sl; }
      ctx.lineTo(x, base - h * deg);
    }
    ctx.lineTo(cam.w, base);
    ctx.closePath();
    ctx.fillStyle = PRINT.skyline;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(PRINT.ink, 0.45);
    ctx.stroke();
    // Masts and poles: thin verticals on fixed bearings.
    for (let i = 0; i < 40; i++) {
      const b = (i / 40) * Math.PI * 2 + hash01(i * 5) * 0.12;
      const rel = wrapAngle(b - cam.yaw);
      if (Math.abs(rel) > 1.2) continue;
      const x = cam.w / 2 + Math.tan(rel) * cam.f;
      if (x < -10 || x > cam.w + 10) continue;
      const mast = hash01(i * 19) > 0.72;
      const ht = (mast ? 5.5 + hash01(i * 23) * 3 : 2.6 + hash01(i * 29)) * deg;
      ctx.fillStyle = alpha(PRINT.ink, mast ? 0.55 : 0.4);
      ctx.fillRect(x - (mast ? 1 : 0.6), base - ht, mast ? 2 : 1.2, ht);
      if (!mast) ctx.fillRect(x - 0.9 * deg, base - ht + 0.3 * deg, 1.8 * deg, 1);
      // A relay mast carries UNDERWATCH's light: one cyan point, the only
      // colour in the whole backdrop, and the system's own.
      if (mast) { ctx.fillStyle = TECH.cyan; ctx.fillRect(x - 1.5, base - ht - 1, 3, 3); }
    }
  }

  /**
   * Whose ink new faces are drawn in, set by whichever collector is running.
   * Ground faces are never outlined: a mark on the road is already ink.
   */
  private inkAs: Ink | null = null;
  /**
   * Something that moves is seeded by who it is, not where: a person's line
   * is theirs, and must not boil as they walk. Faces pushed while this is set
   * are numbered off it in order, which is the same order every frame.
   */
  private seedAs: number | null = null;
  private seedN = 0;
  private seedBy(id: number | null): void { this.seedAs = id; this.seedN = 0; }

  private push(
    cam: Cam, world: P3[], fill: string, stroke?: string, wide?: number,
    layer: Layer = Layer.Standing, order = 0,
  ): Face | null {
    let minZ = Infinity;
    let sum = 0;
    const pts: CP[] = [];
    for (const p of world) {
      const cp = toCamera(cam, p.x, p.y, p.z);
      pts.push(cp);
      minZ = Math.min(minZ, cp.z);
      sum += cp.z;
    }
    if (minZ > FAR) return null;
    const clipped = clipNear(pts);
    if (clipped.length < 3) return null;
    const depth = sum / world.length;
    const w0 = world[0];
    const face: Face = {
      pts: clipped, depth, layer, order, fill, stroke, wide,
      ink: layer === Layer.Ground || stroke ? undefined : this.inkAs ?? undefined,
      seed: this.seedAs !== null
        ? this.seedAs + (this.seedN++) * 7919
        : seedOf(w0.x, w0.y, w0.z) ^ (world.length * 2654435761),
    };
    this.faces.push(face);
    return face;
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
      // Sides facing away are hidden by the rest of the box: skip them.
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if ((mx - c.x) * (mx - cam.pos.x) + (my - c.y) * (my - cam.pos.y) > 0) continue;
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
            sp.text ? { str: sp.text, colour: TECH.cyanInk, aspect: 1.43 } : undefined);
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
        STREET_SURFACE[s.kind] ?? PRINT.verge, undefined, undefined,
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
      /*
       * Light is drawn, not shaded: a wall the sun reaches is a flat wash of
       * its own colour, and a wall it does not is the same colour taken down
       * hard with hatching over it. Two values and a texture, which is how
       * an inker says "form" — not a gradient of six.
       */
      /*
       * A wall facing away from the eye is always behind its own roof and
       * front walls. The painter's algorithm used to fill it, ink it and
       * hatch it anyway, and then paint over all three.
       */
      const nrm = dr.normals[j];
      if (nrm && nrm.x * ((a.x + c.x) / 2 - cam.pos.x) + nrm.y * ((a.y + c.y) / 2 - cam.pos.y) > 0) continue;
      const lit = dr.sunlit[j] ?? 0;
      const before = this.faces.length;
      this.push(cam, [
        { x: a.x, y: a.y, z: 0 }, { x: c.x, y: c.y, z: 0 },
        { x: c.x, y: c.y, z: eave }, { x: a.x, y: a.y, z: eave },
      ], lit > 0.22 ? shade(dr.wall, lit * 0.04) : shade(dr.wall, -0.3));
      const face = this.faces[before];
      if (face && lit <= 0.22) face.tone = Tone.Hatch;
      const decals = detail ? dr.walls[j] : undefined;
      if (face && decals && decals.length) {
        face.decals = [];
        for (const d of decals) {
          const cp = clipNear(d.pts.map((p) => toCamera(cam, p.x, p.y, p.z)));
          if (cp.length < 3) continue;
          let fill = d.fill, text = d.text;
          /*
           * Windows answer the mood. In a lit town more rooms have somebody
           * home. In an owned one the town has gone dark around the rooms
           * that are occupied and the shops that are open, and those few
           * hold their light and spill it onto the ground in front of them —
           * a pool of paper-white, never lamp-yellow (that hue is the
           * player's). Few, low and soft: the town should feel watched, not
           * decorated.
           */
          if (d.lit) {
            const pg = this.page;
            if (d.lit === 1 && pg.lit > 0.15) fill = mix(GLASS_LIT, GLASS_WARM, Math.min(1, (pg.lit - 0.15) * 1.3));
            if (d.lit === 3 && pg.owned > 0) fill = mix(GLASS_LIT, GLASS_WARM, Math.min(1, pg.owned * 1.3));
            if (d.pool && pg.owned > 0.08 && near < 75) {
              this.lightPool(cam, d.pool, Math.min(1, (pg.owned - 0.08) / 0.4) * (d.lit === 3 ? 1 : 0.8));
            }
          }
          // A tag is louder in a lit town and painted out in an owned one.
          if (d.tag && text) text = { ...text, colour: alpha(d.tag.col, d.tag.a * clamp(1 + 0.45 * this.page.lit - 0.7 * this.page.owned, 0.15, 1)) };
          face.decals.push({ pts: cp, fill, text, ink: d.ink });
        }
      }
    }
    if (dr.ridge) {
      const r = dr.ridge;
      // Two slopes, overhanging the walls, and two gable ends. The slope
      // away from the sun is screened, which is what makes a roof read as a
      // roof from forty metres rather than as two grey triangles.
      this.push(cam, [r.ea0, r.ea1, r.et1, r.et0], shade(dr.roof, 0.08));
      const away = this.push(cam, [r.eb1, r.eb0, r.et0, r.et1], shade(dr.roof, -0.25));
      if (away) away.tone = Tone.Hatch;
      this.push(cam, [r.a0, r.b0, r.top0], shade(dr.wall, -0.12));
      this.push(cam, [r.b1, r.a1, r.top1], shade(dr.wall, -0.12));
      if (dr.chimney) {
        const ch = dr.chimney;
        this.boxAt(cam, ch.at, ch.rot, 0.55, 0.7, ch.z0, ch.z1, shade(dr.wall, -0.18));
        if (dr.aerial && near < 70) {
          // A TV aerial lashed to the chimney: a post and a crossbar.
          const was = this.inkAs;
          this.inkAs = null;
          this.boxAt(cam, { x: ch.at.x + 0.3, y: ch.at.y }, ch.rot, 0.04, 0.04, ch.z1, ch.z1 + 1.3, PRINT.ink);
          this.boxAt(cam, { x: ch.at.x + 0.3, y: ch.at.y }, ch.rot, 0.03, 0.9, ch.z1 + 1.2, ch.z1 + 1.24, PRINT.ink);
          this.inkAs = was;
        }
      }
    } else {
      this.push(cam, poly.map((p) => ({ x: p.x, y: p.y, z: eave })), dr.roof);
      // A flat roof is where the plant goes: a parapet line and a unit or two.
      for (const u of dr.plant) this.boxAt(cam, u.at, u.rot, u.w, u.d, eave, eave + u.h, PRINT.steel);
    }
    if (dr.porch && near < 90) {
      // A step up to the door, and a canopy over it on two posts.
      const po = dr.porch;
      const nx = Math.cos(po.rot), ny = Math.sin(po.rot);
      const step = { x: po.at.x + nx * 0.35, y: po.at.y + ny * 0.35 };
      this.boxAt(cam, step, po.rot, 0.7, 1.4, 0, 0.17, shade(PRINT.footway, -0.08));
      const roof = { x: po.at.x + nx * 0.5, y: po.at.y + ny * 0.5 };
      this.boxAt(cam, roof, po.rot, 1.0, 1.7, 2.3, 2.42, shade(dr.wall, -0.4));
      for (const side of [-0.7, 0.7]) {
        const post = { x: po.at.x + nx * 0.92 - ny * side, y: po.at.y + ny * 0.92 + nx * side };
        this.boxAt(cam, post, po.rot, 0.08, 0.08, 0, 2.3, shade(dr.wall, -0.35));
      }
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
    // A wash of ink, and hatched: a shadow is drawn the way a pen draws one.
    const fill = PRINT.shadow;
    const hatch = (f: Face | null) => { if (f) f.tone = Tone.Shadow; };
    for (const b of sim.world.data.buildings) {
      if (b.height < 1.2) continue;
      const c = b.poly[0];
      if (Math.hypot(c.x - cam.pos.x, c.y - cam.pos.y) > 120) continue;
      // Longer when the town is owned: late in the afternoon, and later.
      const k = b.height * (0.55 + this.page.owned * 0.4);
      const off = { x: sun.x * k, y: sun.y * k };
      // One shape — the footprint swept along the light — so overlapping
      // pieces never stack into a darker blotch under the hatching.
      const swept = hull([...b.poly, ...b.poly.map((q) => ({ x: q.x + off.x, y: q.y + off.y }))]);
      hatch(this.push(cam, swept.map((q) => ({ x: q.x, y: q.y, z: 0 })), fill, undefined, undefined, Layer.Ground, 50));
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
      hatch(this.push(cam, pts, fill, undefined, undefined, Layer.Ground, 50));
    }
  }

  /**
   * The player's investigation, on the street (evidence.ts).
   *
   * Pencil on the ground and a folding marker beside what they have looked
   * at, in their own amber; a ruled ink sightline in front of each camera
   * they have noticed. Nothing here appears until the player has earned it.
   */
  private collectEvidence(sim: Sim, cam: Cam): void {
    const near = (p: Vec2, r: number) => Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y) < r;
    const flat = (pts: Vec2[], fill: string, order: number) =>
      this.push(cam, pts.map((q) => ({ x: q.x, y: q.y, z: 0.01 })), fill, undefined, undefined, Layer.Ground, order);
    /** A stroke on the ground from a to b, w metres wide, tapering at the far end. */
    const stroke = (a: Vec2, b: Vec2, w: number, fill: string, order: number) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / l * w / 2, ny = (b.x - a.x) / l * w / 2;
      flat([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx * 0.5, y: b.y + ny * 0.5 }, { x: b.x - nx * 0.5, y: b.y - ny * 0.5 }, { x: a.x - nx, y: a.y - ny }], fill, order);
    };

    // Sightlines: dashed, ruled, ending in a tick across the line.
    const sensors = sim.sensors
      .filter((x) => near(x.data.pos, 100))
      .map((x) => ({ id: x.data.id, pos: x.data.pos, facing: x.facing, range: x.data.range }));
    /*
     * Where the lenses look, the ground is a little colder.
     *
     * In an owned town every working camera throws a faint pool of cold,
     * paper-white light onto the ground in the direction it is facing — the
     * way an infrared lamp under a housing lights a patch of pavement — and
     * the one that has you is faintly warm. No edges, no outline, nothing
     * that reads as a marker: a player who looks will learn to see which
     * patches of street are watched; one who does not will only feel that
     * the town is. It fades with the mood and is gone once the town is cut
     * loose.
     */
    const owned = this.page.owned;
    if (owned > 0.12) {
      const k = Math.min(1, (owned - 0.12) / 0.5);
      const seeing = new Set(sim.sensorsSeeingPlayer().map((x) => x.data.id));
      for (const sx of sim.sensors) {
        const d = sx.data;
        if (!(sx.state === 'ONLINE' || sx.state === 'DEGRADED') || !near(d.pos, 85)) continue;
        const reach = Math.min(12, d.range * 0.38);
        const hot = seeing.has(d.id);
        const fx = Math.cos(sx.facing), fy = Math.sin(sx.facing);
        const c = { x: d.pos.x + fx * reach * 0.6, y: d.pos.y + fy * reach * 0.6 };
        const col = mix(POOL_LIGHT, hot ? SIGNAL.warning : TECH.cyan, hot ? 0.32 : 0.28);
        // Five soft rings, elongated along the look, for a falloff without a gradient.
        for (const [ra, rb, a] of [[1, 1, 0.045], [0.82, 0.8, 0.05], [0.64, 0.6, 0.055], [0.46, 0.42, 0.06], [0.28, 0.25, 0.065]] as const) {
          const pts: Vec2[] = [];
          for (let i = 0; i < 14; i++) {
            const t = (i / 14) * Math.PI * 2;
            const u = Math.cos(t) * reach * 0.55 * ra, v = Math.sin(t) * reach * 0.36 * rb;
            pts.push({ x: c.x + fx * u - fy * v, y: c.y + fy * u + fx * v });
          }
          flat(pts, alpha(col, a * k * (hot ? 1.6 : 1)), 56);
        }
      }
    }
    const rule = alpha(PRINT.ink, 0.6);
    for (const sl of sightlinesFor(sensors, sim.knownSensors)) {
      const dx = sl.to.x - sl.from.x, dy = sl.to.y - sl.from.y;
      const DASHES = 6;
      for (let i = 0; i < DASHES; i++) {
        const t0 = (i + 0.15) / DASHES, t1 = (i + 0.7) / DASHES;
        stroke({ x: sl.from.x + dx * t0, y: sl.from.y + dy * t0 }, { x: sl.from.x + dx * t1, y: sl.from.y + dy * t1 }, 0.09, rule, 61);
      }
      const l = Math.hypot(dx, dy) || 1;
      const px = -dy / l * 0.45, py = dx / l * 0.45;
      stroke({ x: sl.to.x - px, y: sl.to.y - py }, { x: sl.to.x + px, y: sl.to.y + py }, 0.1, rule, 61);
    }

    // Markers: a pencil ring on the ground, and a numbered tent in it.
    const pencil = alpha(SIGNAL.player, 0.92);
    for (const m of markersFor(sim.places, this.seen, this.fresh)) {
      if (!near(m.pos, 110)) continue;
      const rings = m.again ? 2 : 1;
      for (let k = 0; k < rings; k++) {
        // A hand-drawn circle: it does not quite close, and runs on past
        // where it started, and its radius wanders.
        const r0 = 1.45 + k * 0.32;
        const start = hash01(m.n * 13 + k) * Math.PI * 2;
        const SEG = 22, sweep = Math.PI * 2.12;
        let prev: Vec2 | null = null;
        for (let i = 0; i <= SEG; i++) {
          const a = start + (i / SEG) * sweep;
          const r = r0 * (1 + 0.06 * Math.sin(a * 2 + m.n) + 0.03 * (i / SEG));
          const q = { x: m.pos.x + Math.cos(a) * r, y: m.pos.y + Math.sin(a) * r * 0.92 };
          if (prev) stroke(prev, q, 0.15 * (0.6 + 0.4 * Math.sin((i / SEG) * Math.PI)), pencil, 62);
          prev = q;
        }
      }
      // The tent: an A-frame turned to the eye, numbered on the face you see.
      const dx = cam.pos.x - m.pos.x, dy = cam.pos.y - m.pos.y;
      const dl = Math.hypot(dx, dy) || 1;
      const fx = dx / dl, fy = dy / dl, rx = -fy, ry = fx;
      const HW = 0.42, H = 0.62, D = 0.2;
      const P = (f: number, r: number, z: number): P3 => ({ x: m.pos.x + fx * f + rx * r, y: m.pos.y + fy * f + ry * r, z });
      const was = this.inkAs;
      this.inkAs = Ink.Interactable;
      this.push(cam, [P(-D, HW, 0), P(-D, -HW, 0), P(0, -HW, H), P(0, HW, H)], shade(SIGNAL.player, -0.3));
      // Wound left to right as the eye sees it (+r is the viewer's left), or
      // the number is taken for the back of the card and not printed.
      const front = this.push(cam, [P(D, HW, 0), P(D, -HW, 0), P(0, -HW, H), P(0, HW, H)], SIGNAL.player);
      if (front) {
        front.depth -= 0.05;
        front.text = { str: String(m.n), colour: PRINT.ink, aspect: 1.35, weight: 800 };
      }
      this.inkAs = was;
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
    // Which lenses actually have the player — each camera answers for itself.
    const seeing = new Set(sim.sensorsSeeingPlayer().map((x) => x.data.id));
    for (const s of sim.sensors) {
      const d = s.data;
      const dist = Math.hypot(d.pos.x - cam.pos.x, d.pos.y - cam.pos.y);
      // Measured from the eye, which now sits forty metres behind the rider:
      // the old 58 m drew nothing further than a house or two up the street.
      if (dist > 120) continue;
      const face = s.facing;
      const fx = Math.cos(face), fy = Math.sin(face);
      const rx = -fy, ry = fx;
      const live = s.state === 'ONLINE' || s.state === 'DEGRADED';
      const body = live ? TECH.white : '#8E979C';
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
      const watching = live && seeing.has(d.id);
      /*
       * A camera turned toward a sound shows it: its status light goes amber
       * for as long as it is looking at the noise instead of at the street.
       * That is the whole of the slingshot's use as a tool, and it has to be
       * visible from where the player is standing, not only on the plan.
       */
      const listening = live && !watching && s.attend !== null && s.attendBlend > 0.3;
      this.push(cam, [
        { x: lx - rx * 0.15, y: ly - ry * 0.15, z: z + 0.15 },
        { x: lx + rx * 0.15, y: ly + ry * 0.15, z: z + 0.15 },
        { x: lx + rx * 0.15, y: ly + ry * 0.15, z: z - 0.15 },
        { x: lx - rx * 0.15, y: ly - ry * 0.15, z: z - 0.15 },
      ], watching ? SIGNAL.warning : listening ? SIGNAL.player : '#20272E');
      // At a distance a lens is a pixel; a lit one gets a small halo so the
      // state reads from down the street.
      if (watching || listening) {
        // Bigger than the lens itself: a status light is meant to be seen.
        const r = Math.min(0.9, 0.3 + dist * 0.006);
        const was = this.inkAs;
        this.inkAs = null;
        this.card(cam, { x: lx, y: ly }, z, r, r, alpha(watching ? SIGNAL.warning : SIGNAL.player, 0.45));
        this.inkAs = was;
      } else if (live) {
        // In an owned town every lens glows: the system is awake everywhere,
        // and in the dark the cyan points are the first thing you see.
        if (this.page.owned > 0.25) {
          const wasInk = this.inkAs;
          this.inkAs = null;
          const k = Math.min(1, (this.page.owned - 0.25) / 0.5);
          const r = (0.22 + dist * 0.004) * k;
          this.card(cam, { x: lx, y: ly }, z, r * 1.6, r * 1.6, alpha(TECH.cyan, 0.18 * k));
          this.card(cam, { x: lx, y: ly }, z, r, r, alpha(TECH.cyan, 0.45 * k));
          this.inkAs = wasInk;
        }
        // At rest, an UNDERWATCH lens shows one thin line of cyan under the
        // housing: the product working, calmly, the way it is meant to look.
        for (const side of [1, -1]) {
          const f = this.push(cam, [
            { x: hx - fx * 0.3 + rx * 0.205 * side, y: hy - fy * 0.3 + ry * 0.205 * side, z: z - 0.17 },
            { x: hx + fx * 0.3 + rx * 0.205 * side, y: hy + fy * 0.3 + ry * 0.205 * side, z: z - 0.17 },
            { x: hx + fx * 0.3 + rx * 0.205 * side, y: hy + fy * 0.3 + ry * 0.205 * side, z: z - 0.12 },
            { x: hx - fx * 0.3 + rx * 0.205 * side, y: hy - fy * 0.3 + ry * 0.205 * side, z: z - 0.12 },
          ], TECH.cyan);
          // A light, not a thing: no line round it.
          if (f) f.ink = undefined;
        }
      }
    }
  }

  /**
   * UNDERWATCH's street cabinets: the junctions and service points a player
   * walks up to and reads. They are the nicest-made objects in the town on
   * purpose — hardware white, square-edged, a dark glass face, one band of
   * cyan that says it is working. The band goes orange when it has been
   * interfered with and dark when it is down, and that is all it ever says.
   */
  private collectTerminals(sim: Sim, cam: Cam): void {
    for (const n of sim.network.nodes.values()) {
      // Street junctions only. Services and uplinks are records and relays,
      // not things on a pavement: a record has no place to stand next to.
      if (n.kind !== 'JUNCTION') continue;
      if (Math.hypot(n.pos.x - cam.pos.x, n.pos.y - cam.pos.y) > 100) continue;
      const t = terminalFor(sim.world.data, n.id, n.pos);
      if (!t) continue;
      const band = n.state === 'OFFLINE' ? '#3A4046'
        : n.state === 'LOOPED' || n.state === 'TAMPERED' || n.state === 'DEGRADED' ? TECH.orange
        : TECH.cyan;
      this.boxAt(cam, t.at, t.rot, 0.5, 0.86, 0, 1.28, TECH.white);
      this.boxAt(cam, t.at, t.rot, 0.52, 0.88, 1.28, 1.34, band);
      this.boxAt(cam, t.at, t.rot, 0.44, 0.8, 1.34, 1.42, shade(TECH.white, -0.08));
      this.panel(cam, t.at, t.rot, 0.62, 0.5, 0.86, '#11181E', undefined, 0.26);
      this.panel(cam, t.at, t.rot, 0.66, 0.12, 1.16, TECH.white,
        { str: 'UNDERWATCH', colour: TECH.cyanInk, aspect: 5.5, weight: 600 }, 0.262);
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
    this.inkAs = Ink.Furniture;
    this.collectStreetDressing(sim, cam);
    for (const p of sim.world.propsNear({ x: cam.pos.x, y: cam.pos.y }, FAR)) this.prop(cam, p, sim);
    this.inkAs = Ink.Person;
    this.collectPeople(sim, cam);
    this.inkAs = null;
  }

  /**
   * The city's infrastructure, which the simulation never needed and the
   * picture always did: utility poles on the verge with wire sagging between
   * them, street-name blades at the corners, patched asphalt and a centre line
   * that has not been repainted in years. All of it stands where nobody skates
   * — on the verge outside the footway, or seven metres up — and none of it
   * is in the world data, so not one collision, sightline or forecast moves.
   */
  /**
   * The skateable town: kickers as real wedges you can see the lip of, and
   * rails as a bar on posts. These were in the world data all along and were
   * never drawn, so the ramps in Bellhaven were invisible.
   */
  private collectSkateFeatures(sim: Sim, cam: Cam, near: (p: Vec2, r: number) => boolean): void {
    for (const f of sim.world.data.features) {
      const c = f.poly[0];
      if (!near(c, 110)) continue;
      if (f.kind === 'kicker') {
        const fx = Math.cos(f.facing), fy = Math.sin(f.facing);
        let lo = Infinity, hi = -Infinity;
        for (const q of f.poly) { const d = q.x * fx + q.y * fy; lo = Math.min(lo, d); hi = Math.max(hi, d); }
        const zOf = (q: Vec2) => f.rise * Math.max(0, Math.min(1, ((q.x * fx + q.y * fy) - lo) / Math.max(0.5, hi - lo)));
        const top = f.poly.map((q) => ({ x: q.x, y: q.y, z: zOf(q) + 0.01 }));
        this.push(cam, top, RAMP_TOP);
        const n = f.poly.length;
        for (let i = 0; i < n; i++) {
          const a = f.poly[i], b = f.poly[(i + 1) % n];
          const za = zOf(a), zb = zOf(b);
          if (za < 0.02 && zb < 0.02) continue;
          this.push(cam, [{ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 }, { x: b.x, y: b.y, z: zb }, { x: a.x, y: a.y, z: za }], RAMP_SIDE);
        }
        // The lip, picked out: a steel coping along the top edge.
        const lip = f.poly.filter((q) => zOf(q) > f.rise - 0.02);
        if (lip.length === 2) {
          this.push(cam, [
            { x: lip[0].x, y: lip[0].y, z: f.rise }, { x: lip[1].x, y: lip[1].y, z: f.rise },
            { x: lip[1].x, y: lip[1].y, z: f.rise + 0.07 }, { x: lip[0].x, y: lip[0].y, z: f.rise + 0.07 },
          ], PRINT.steel);
        }
      } else if (f.kind === 'rail' && f.line) {
        const { a, b } = f.line;
        const z = f.rise;
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const rot = Math.atan2(b.y - a.y, b.x - a.x);
        // The bar, a little proud, and posts every couple of metres.
        this.boxAt(cam, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rot, l, 0.07, z - 0.06, z, RAIL_STEEL);
        const posts = Math.max(2, Math.round(l / 2.2) + 1);
        for (let i = 0; i < posts; i++) {
          const t = i / (posts - 1);
          this.boxAt(cam, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, rot, 0.06, 0.06, 0, z - 0.04, RAIL_STEEL);
        }
      }
    }
  }

  private collectStreetDressing(sim: Sim, cam: Cam): void {
    const sd = streetDressingFor(sim.world.data);
    const near = (p: Vec2, r: number) => Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y) < r;
    for (const m of sd.marks) {
      if (!near(m.c, 90)) continue;
      this.push(cam, m.poly.map((q) => ({ x: q.x, y: q.y, z: 0 })), m.fill, undefined, undefined, Layer.Ground, 20);
    }
    if (this.page.lit > 0.05) {
      const chalk = alpha('#F4EEE0', 0.9 * Math.min(1, this.page.lit * 1.4));
      for (const c of sd.chalk) {
        if (!near(c.c, 95)) continue;
        this.push(cam, c.poly.map((q) => ({ x: q.x, y: q.y, z: 0 })), chalk, undefined, undefined, Layer.Ground, 22);
      }
    }
    const joint = alpha(CITY_INK, 0.32);
    for (const j of sd.joints) {
      if (!near(j.c, 45)) continue;
      this.push(cam, j.poly.map((q) => ({ x: q.x, y: q.y, z: 0 })), joint, undefined, undefined, Layer.Ground, 21);
    }
    /*
     * Grass, drawn the way a pen draws it: a few strokes in a tuft, standing
     * up, where the verge meets something — never a texture over the whole
     * lawn. Close to the eye only; past that a verge is a flat wash.
     */
    this.inkAs = Ink.Furniture;
    let poleN = 0;
    for (const p of sd.poles) {
      poleN++;
      if (!near(p.at, 130)) continue;
      /*
       * UNDERWATCH's plates go up on the poles as the system takes hold: a
       * white plate with the wordmark and one cyan band, at eye height,
       * first on one pole in ten and then on most of them. They come down
       * again as the town is cut loose. Nothing in the world data moves.
       */
      if (hash01(poleN * 7919) < this.page.owned * 1.15 && near(p.at, 60)) {
        const nx = Math.cos(p.rot + Math.PI / 2), ny = Math.sin(p.rot + Math.PI / 2);
        const at = { x: p.at.x + nx * 0.16, y: p.at.y + ny * 0.16 };
        const inkBefore: Ink | null = this.inkAs;
        this.inkAs = Ink.Interactable;
        this.panel(cam, at, p.rot + Math.PI / 2, 0.5, 0.7, 3.1, TECH.white, { str: 'UNDERWATCH', colour: TECH.cyanInk, aspect: 0.71, weight: 600 }, 0.03);
        this.inkAs = null;
        this.panel(cam, at, p.rot + Math.PI / 2, 0.5, 0.07, 2.73, TECH.cyan, undefined, 0.035);
        this.inkAs = inkBefore;
      }
      /*
       * Creosote-dark timber, a crossarm, insulators, and on some a
       * transformer can. A little taller and heavier in the arm than life:
       * on a phone the pole line is the rhythm of the street, and it has to
       * read as one from the far end of it.
       */
      const across = { x: Math.cos(p.rot + Math.PI / 2), y: Math.sin(p.rot + Math.PI / 2) };
      this.boxAt(cam, p.at, p.rot, 0.26, 0.26, 0, POLE_H, PRINT.timber);
      this.boxAt(cam, { x: p.at.x, y: p.at.y }, p.rot, 0.14, 2.2, POLE_H - 0.6, POLE_H - 0.42, shade(PRINT.timber, -0.2));
      if (near(p.at, 45)) {
        for (const k of [-0.9, 0.9]) {
          this.boxAt(cam, { x: p.at.x + across.x * k, y: p.at.y + across.y * k }, p.rot, 0.08, 0.08, POLE_H - 0.42, POLE_H - 0.22, PRINT.steel);
        }
      }
      if (p.can) this.boxAt(cam, { x: p.at.x + across.x * 0.34, y: p.at.y + across.y * 0.34 }, p.rot, 0.46, 0.46, POLE_H - 2.5, POLE_H - 1.3, PRINT.steel);
    }
    this.collectSkateFeatures(sim, cam, near);
    const wasInking = this.inkAs;
    this.inkAs = null;
    for (const w of sd.wires) {
      if (!near(w.a, 120) && !near(w.b, 120)) continue;
      const STEPS = 5;
      for (let i = 0; i < STEPS; i++) {
        const t0 = i / STEPS, t1 = (i + 1) / STEPS;
        const z0 = w.z - Math.sin(t0 * Math.PI) * w.sag, z1 = w.z - Math.sin(t1 * Math.PI) * w.sag;
        const a = { x: lerp(w.a.x, w.b.x, t0), y: lerp(w.a.y, w.b.y, t0) };
        const b = { x: lerp(w.a.x, w.b.x, t1), y: lerp(w.a.y, w.b.y, t1) };
        /*
         * A wire is never more than a hairline. Sized in metres it became a
         * black bar across the glass once the rig swung under one, so near
         * the eye each piece is capped at a pixel and a half; far off it is
         * its real three centimetres, which is less than a pixel — so the
         * distance gets less ink, not a bold line along the horizon.
         */
        const ht = (q: Vec2, z: number) => Math.min(0.03, (0.75 * Math.hypot(q.x - cam.pos.x, q.y - cam.pos.y, z - cam.pos.z)) / cam.f);
        const ha = ht(a, z0), hb = ht(b, z1);
        this.push(cam, [
          { x: a.x, y: a.y, z: z0 - ha }, { x: b.x, y: b.y, z: z1 - hb },
          { x: b.x, y: b.y, z: z1 + hb }, { x: a.x, y: a.y, z: z0 + ha },
        ], PRINT.ink);
      }
    }
    /*
     * Birds on the wires. A lit town has them; an owned one is a quiet,
     * empty place, and the first thing to leave is the thing that would
     * have sat on the wire anyway. Each wire has a few seeded perches, and
     * the mood decides how many are taken.
     */
    const roost = 0.4 - this.page.owned * 0.6 + this.page.lit * 0.7;
    if (roost > 0) {
      let wn = 0;
      for (const w of sd.wires) {
        wn++;
        // Measured from the wire's middle: its ends are poles thirty metres
        // apart, and the eye is forty metres behind the rider.
        if (!near({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, 95)) continue;
        for (let i = 0; i < 4; i++) {
          const h = hash01(wn * 131 + i * 17);
          if (h > roost) continue;
          const t = 0.2 + hash01(wn * 37 + i * 101) * 0.6;
          const z = w.z - Math.sin(t * Math.PI) * w.sag;
          this.bird(cam, { x: lerp(w.a.x, w.b.x, t), y: lerp(w.a.y, w.b.y, t) }, z, (wn + i) % 2 === 0);
        }
      }
    }
    this.inkAs = wasInking;
    for (const sg of sd.signs) {
      if (!near(sg.at, 70)) continue;
      this.boxAt(cam, sg.at, 0, 0.08, 0.08, 0, 3.1, PRINT.steel);
      sg.blades.forEach((bl, i) => {
        const z = 2.85 - i * 0.24;
        for (const side of [1, -1]) {
          this.panel(cam, sg.at, bl.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 1.5, 0.2, z, PRINT.bladeGreen,
            { str: bl.name.toUpperCase(), colour: '#E9EDE6', aspect: 7.5, weight: 700 }, 0.02);
        }
      });
    }
  }

  /**
   * How each person has been moving, measured from where they are drawn:
   * distance covered drives the stride, and it is the renderer's alone.
   */
  private motion = new Map<string, { x: number; y: number; odo: number; tick: number; speed: number; facing: number }>();

  private move(id: string, at: Vec2, heading: number | undefined, tick: number): { phase: number; speed: number; facing: number } {
    let m = this.motion.get(id);
    if (!m) { m = { x: at.x, y: at.y, odo: hashString(id) % 7, tick, speed: 0, facing: heading ?? 0 }; this.motion.set(id, m); }
    const d = Math.hypot(at.x - m.x, at.y - m.y);
    const dt = Math.max(1, tick - m.tick) / 60;
    if (tick !== m.tick) {
      // A teleport is not a stride.
      if (d < 3) { m.odo += d; m.speed = m.speed * 0.6 + (d / dt) * 0.4; }
      if (d > 0.01 && heading === undefined) m.facing = Math.atan2(at.y - m.y, at.x - m.x);
      m.x = at.x; m.y = at.y; m.tick = tick;
    }
    if (heading !== undefined) m.facing = heading;
    return { phase: m.odo, speed: m.speed, facing: m.facing };
  }

  /**
   * A person, as one face in the sort: placed where they stand, painting
   * the whole figure in one go so no part of them can sort behind another.
   */
  private personAt(
    cam: Cam, id: string, at: Vec2, look: Look,
    o: { heading?: number; tick: number; gait?: Gait; gesture?: Gesture; joints?: Joints; light?: string; dog?: string; sun: Vec2; bias?: number },
  ): void {
    const dist = Math.hypot(at.x - cam.pos.x, at.y - cam.pos.y);
    if (dist > FAR || dist < 0.5) return;
    const mv = this.move(id, at, o.heading, o.tick);
    const gait: Gait = o.gait ?? (mv.speed < 0.3 ? 'stand' : mv.speed > 2.3 ? 'run' : 'walk');
    const stride = gait === 'run' ? 2.6 : 1.45 * look.body.scale;
    const phase = (mv.phase / stride) * Math.PI * 2;
    const j = o.joints ?? pose({ at, facing: mv.facing, gait, phase, body: look.body, seed: hashString(id), gesture: o.gesture });
    const dogAt = o.dog ? { x: at.x + Math.cos(mv.facing) * 1.5 + Math.cos(mv.facing + Math.PI / 2) * 0.5, y: at.y + Math.sin(mv.facing) * 1.5 + Math.sin(mv.facing + Math.PI / 2) * 0.5 } : null;
    const was = this.inkAs;
    this.inkAs = null;
    const n = this.faces.length;
    this.card(cam, at, 0.9 * look.body.scale, 0.05, 0.9 * look.body.scale, 'transparent');
    const f = this.faces[n];
    this.inkAs = was;
    if (!f) return;
    // Stood on a board: drawn after the deck it stands on.
    if (o.bias) f.depth -= o.bias;
    const proj = (x: number, y: number, z: number) => {
      const cp = toCamera(cam, x, y, z);
      if (cp.z <= NEAR) return null;
      const pt = project(cam, cp);
      return { x: pt.x, y: pt.y, s: cam.f / cp.z };
    };
    const ink = inkAt(Ink.Person, f.depth).width * 0.75;
    const eye = { ...cam.pos };
    const light = o.light;
    f.paint = (ctx) => {
      paintFigure(ctx, proj, j, look, { ink, sun: o.sun, eye, leash: dogAt && o.dog ? dogCollar(dogAt, mv.facing) : undefined });
      if (light) {
        const sh = proj(j.shL.x, j.shL.y, j.shL.z + 0.04);
        if (sh) {
          const r = Math.max(2, 0.08 * sh.s);
          ctx.fillStyle = PRINT.ink; ctx.beginPath(); ctx.arc(sh.x, sh.y, r + 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = light; ctx.beginPath(); ctx.arc(sh.x, sh.y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    if (dogAt && o.dog) {
      const coat = o.dog;
      const m = this.faces.length;
      this.inkAs = null;
      this.card(cam, dogAt, 0.3, 0.05, 0.3, 'transparent');
      this.inkAs = was;
      const df = this.faces[m];
      if (df) df.paint = (ctx) => { paintDog(ctx, proj, dogAt, mv.facing, phase * 1.6, coat, { ink, sun: o.sun, eye }); };
    }
  }

  private collectPeople(sim: Sim, cam: Cam): void {
    /*
     * Who is who, at the size a person actually is on the glass — by outline
     * first, then colour. Residents are dressed by what kind of person they
     * are (a child is a child; a jogger runs; a dog walker has a dog); the
     * named cast are themselves; the officer is a uniform and a peaked cap
     * whose shoulder light is dark unless he is doing something, and whose
     * hands say what — one at the radio when responding, one held out flat
     * when he is stopping you.
     */
    const tick = sim.tick;
    const sun = sim.sun;
    for (const n of sim.npcs) {
      const wear = VENEER.civilian[hashString(n.id) % VENEER.civilian.length];
      // In an owned town more hoods go up and heads go down.
      const hood = n.kind !== 'jogger' && n.kind !== 'child' && hash01(hashString(n.id) & 0xffff) < this.page.owned * 0.7;
      const look = residentLook(n.id, n.kind, wear, hood);
      this.personAt(cam, n.id, n.pos, look, {
        heading: n.heading, tick, sun,
        gait: n.kind === 'jogger' && n.waitTicks <= 0 ? 'run' : undefined,
        dog: n.kind === 'dogWalker' ? DOG_COATS[hashString(n.id + ':dog') % DOG_COATS.length] : undefined,
      });
    }
    for (const p of sim.patrols) {
      const light = p.state === 'INTERVENING' ? VENEER.intervening
        : p.state === 'RESPONDING' ? VENEER.responding
        : undefined;
      const gesture: Gesture = p.state === 'INTERVENING' ? 'stop' : p.state === 'RESPONDING' ? 'radio' : null;
      this.personAt(cam, p.id, p.pos, officerLook(p.id), { heading: p.heading, tick, sun, gesture, light });
    }
    for (const p of sim.people) {
      if (!p.visible) continue;
      const look = p.uniform ? officerLook(p.id) : castLook(p.id, p.tint) ?? residentLook(p.id, 'adult', p.tint, !!p.hood);
      this.personAt(cam, p.id, p.pos, look, { heading: p.heading, tick, sun });
    }
    /*
     * Devon rides when he is riding. Stopped — by the officer, or at his own
     * front door — he is a boy standing up with his board in his hand, which
     * is a different picture and the right one.
     */
    if (sim.devonVisible) {
      if (sim.devonFollowing && !sim.devonStopped) {
        // The same board, the same rig, the same pushes: he is simulated by
        // the player's own skating model, so he is drawn by its painter.
        this.collectSkater(sim, cam, sim.devonRider, 'devon', DEVON_RIDING, VENEER.friend, false);
      } else {
        this.personAt(cam, 'devon', sim.devonPos, DEVON, { tick, sun, gait: 'stand' });
      }
    }
    // A drone is UNDERWATCH's, and inked as something you can act on; its
    // shadow is a flat card at ground height and gets no line at all.
    this.inkAs = Ink.Interactable;
    for (const d of sim.drones) {
      if (d.state === 'DESTABILISED') continue;
      this.card(cam, d.pos, d.z, 1.3, 0.45, TECH.white);
      this.inkAs = null;
      this.card(cam, d.pos, d.z - 0.36, 0.9, 0.04, TECH.cyan);
      this.card(cam, d.pos, 0.02, 1.1, 0.01, alpha(PRINT.ink, 0.18));   // drone shadow
      this.inkAs = Ink.Interactable;
    }
    this.inkAs = null;
    for (const pr of sim.projectiles) {
      // Not while it is still in your hands' reach of the eye: the first frame
      // after release it is thirty centimetres from the lens and would fill
      // the sight. The pouch snapping forward is what that moment looks like.
      if (Math.hypot(pr.pos.x - cam.pos.x, pr.pos.y - cam.pos.y, pr.z - cam.pos.z) < 2.2) continue;
      // Tumbling, and a little larger than life in flight so the eye can
      // follow it — a seven-centimetre stone at forty metres is one pixel.
      const spun = { ...pr.shape, spin: pr.shape.spin + sim.tick * 0.45 + pr.id };
      this.rock(cam, pr.pos, Math.max(0.06, pr.z), 0.11, spun);
      // Its shadow on the ground, which is what actually tells you how high it is.
      if (pr.z > 0.15) this.card(cam, pr.pos, 0.012, 0.12, 0.012, alpha('#26313B', Math.max(0.12, 0.4 - pr.z * 0.03)));
    }
    for (const b of sim.droppedRocks) this.rock(cam, b.pos, 0.05, 0.055, b.shape);
  }

  /**
   * Grass, drawn as pen strokes straight onto the page.
   *
   * Hundreds of strokes a frame, and none of them needs sorting against
   * anything standing up: they are drawn once the ground is down and before
   * the first wall, as plain stroked lines. Through the face pipeline the
   * same strokes cost more than every building in the street.
   */
  private drawGroundInk(ctx: CanvasRenderingContext2D, sim: Sim, cam: Cam): void {
    const sd = streetDressingFor(sim.world.data);
    const cx = cam.pos.x, cy = cam.pos.y;
    const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const half = { x: cam.w / 2, y: cam.h / 2 };
    // Ground points only (z = 0), inlined: this runs for every stroke.
    let px = 0, py = 0;
    const at = (x: number, y: number, z: number): boolean => {
      const dx = x - cx, dy = y - cy, dz = z - cam.pos.z;
      const fwd = dx * cyaw + dy * syaw;
      const right = -dx * syaw + dy * cyaw;
      const zc = fwd * cp + dz * sp;
      if (zc < 1) return false;
      px = half.x + (right / zc) * cam.f;
      py = half.y - ((dz * cp - fwd * sp) / zc) * cam.f;
      return true;
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = PRINT.vergeHatch;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let k = 0;
    const R2 = 52 * 52;
    for (const g of sd.hatch) {
      const ddx = g.a.x - cx, ddy = g.a.y - cy;
      if (ddx * ddx + ddy * ddy > R2) continue;
      if (!at(g.a.x, g.a.y, 0)) continue;
      const ax = px, ay = py;
      if (!at(g.b.x, g.b.y, 0)) continue;
      if ((ax < -20 && px < -20) || (ax > cam.w + 20 && px > cam.w + 20) || (ay < -20 && py < -20) || (ay > cam.h + 20 && py > cam.h + 20)) continue;
      ctx.moveTo(ax, ay); ctx.lineTo(px, py);
      if (++k % 64 === 0) { ctx.stroke(); ctx.beginPath(); }
    }
    ctx.stroke();
    // Tufts: a few blades standing up, as one stroked zigzag each.
    ctx.strokeStyle = PRINT.vergeTick;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const T2 = 62 * 62;
    for (const t of sd.tufts) {
      const ddx = t.at.x - cx, ddy = t.at.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > T2) continue;
      const d = Math.sqrt(d2) || 1;
      const k2 = (t.seed & 1 ? 1 : -1) * t.s;
      const ux = (-ddy / d) * k2, uy = (ddx / d) * k2;
      let first = true;
      for (const [u, z] of TUFT) {
        if (!at(t.at.x + ux * u, t.at.y + uy * u, z * t.s)) { first = true; continue; }
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
      if (++k % 64 === 0) { ctx.stroke(); ctx.beginPath(); }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A pool of light on the ground in front of a lit window or shopfront:
   * half an ellipse, out from the wall, in five soft rings.
   */
  private lightPool(cam: Cam, pool: { at: Vec2; nx: number; ny: number; w: number }, k: number): void {
    const { at, nx, ny, w } = pool;
    const depth = 1.4 + w * 0.15;
    const half = w * 0.5 + 0.6;
    // Five fine rings rather than three coarse ones: on a dark road three
    // read as banding, which is a decoration; five read as falloff.
    for (const [s, a] of [[1, 0.07], [0.82, 0.07], [0.64, 0.08], [0.46, 0.09], [0.28, 0.1]] as const) {
      const pts: P3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = -Math.PI / 2 + (i / 10) * Math.PI;
        const out = Math.cos(t) * depth * s + 0.05, across = Math.sin(t) * half * s;
        pts.push({ x: at.x + nx * out - ny * across, y: at.y + ny * out + nx * across, z: 0.01 });
      }
      this.push(cam, pts, alpha(POOL_LIGHT, a * k), undefined, undefined, Layer.Ground, 55);
    }
  }

  /** A small bird, sat on a wire, as an ink silhouette facing the eye. */
  private bird(cam: Cam, p: Vec2, z: number, flip: boolean): void {
    const d = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y);
    if (d > FAR || d < 0.25) return;
    const k = flip ? -1 : 1;
    const ux = (-(p.y - cam.pos.y) / d) * k, uy = ((p.x - cam.pos.x) / d) * k;
    const pts: P3[] = BIRD.map(([u, dz]) => ({ x: p.x + ux * u, y: p.y + uy * u, z: z + dz }));
    this.push(cam, pts, PRINT.ink);
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
        this.card(cam, p.pos, 1.2 * s, 0.14 * s, 1.2 * s, PRINT.timber);
        // A dark crown under a dot screen, and one lit mass on it with no
        // line of its own: a tree as an inker blocks one in.
        const crownAt = this.faces.length;
        this.blob(cam, crown, 3.5 * s, 2.25 * s, 0.95, PRINT.treeDark, seed);
        if (this.faces[crownAt]) this.faces[crownAt].tone = Tone.Dots;
        const was = this.inkAs;
        this.inkAs = null;
        this.blob(cam, { x: crown.x - 0.3, y: crown.y - 0.3 }, 4.0 * s, 1.25 * s, 0.85, PRINT.treeLight, seed + 2);
        this.inkAs = was;
        return;
      }
      case 'bush':
      {
        const at = this.faces.length;
        this.blob(cam, p.pos, 0.55 * p.scale, 0.8 * p.scale, 0.7, PRINT.treeDark, 1);
        if (this.faces[at]) this.faces[at].tone = Tone.Dots;
      }
        return;
      case 'car': {
        const col = weather(tint ?? '#8C96A0', 0.6);
        if (dist > 120) { this.card(cam, p.pos, 0.7, 1.4, 0.7, col); return; }
        this.box(cam, p.pos, p.rot, 4.2, 1.8, 0.85, col);
        const fx = Math.cos(p.rot), fy = Math.sin(p.rot);
        const cab = { x: p.pos.x - fx * 0.35, y: p.pos.y - fy * 0.35 };
        this.boxAt(cam, cab, p.rot, 2.2, 1.6, 0.85, 1.4, PRINT.glass);
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
          this.box(cam, at, (p.knockDir ?? 0), lerp(0.62, 1.05, tip), 0.62, lerp(1.05, 0.62, tip), PRINT.bin);
          if (tip >= 1) this.box(cam, { x: at.x + kx * 1.1 - ky * 0.4, y: at.y + ky * 1.1 + kx * 0.4 }, 0.6, 0.66, 0.66, 0.06, shade(PRINT.bin, -0.15));
        } else {
          this.box(cam, p.pos, p.rot, 0.62, 0.62, 1.05, PRINT.bin);
        }
        return;
      case 'hydrant':
        this.card(cam, p.pos, 0.38, 0.14, 0.38, PRINT.hydrant);
        return;
      case 'bench':
        this.boxAt(cam, p.pos, p.rot, 1.8, 0.5, 0.38, 0.48, PRINT.timber);
        return;
      case 'mailbox':
        this.card(cam, p.pos, 0.5, 0.05, 0.5, PRINT.steel);
        this.boxAt(cam, p.pos, p.rot, 0.5, 0.3, 1.0, 1.3, PRINT.mailbox);
        return;
      case 'planter':
        this.box(cam, p.pos, 0, 1.1 * p.scale, 1.1 * p.scale, 0.55, weather(tint ?? '#B8B2A6', 0.7));
        this.blob(cam, p.pos, 0.85, 0.55 * p.scale, 0.6, VENEER.treeLight, 3);
        return;
      case 'hoop':
        this.card(cam, p.pos, 1.6, 0.07, 1.6, PRINT.steel);
        this.card(cam, p.pos, 3.2, 0.6, 0.4, PRINT.signBoard);
        return;
      case 'cone':
        if (p.knocked) {
          const t = clamp01(age / 0.4);
          const at = { x: p.pos.x + kx * 1.2 * t, y: p.pos.y + ky * 1.2 * t };
          this.card(cam, at, lerp(0.3, 0.12, t), lerp(0.14, 0.3, t), lerp(0.3, 0.12, t), CONE);
        } else {
          this.card(cam, p.pos, 0.3, 0.14, 0.3, CONE);
        }
        return;
      case 'sign': {
        // A sign rings like a sign: the panel swings on its post.
        const sp = { x: p.pos.x + kx * wob * 0.18, y: p.pos.y + ky * wob * 0.18 };
        this.card(cam, p.pos, 1.3, 0.05, 1.3, PRINT.steel);
        const label = p.tint && !p.tint.startsWith('#') ? p.tint : '';
        for (const side of [1, -1]) {
          this.panel(cam, sp, p.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + wob * 0.2, 1.8, 0.7, 2.7, TECH.white,
            label ? { str: label, colour: TECH.cyanInk, aspect: 2.57 } : undefined, 0.02);
        }
        return;
      }
      case 'fenceGate': {
        /*
         * Fences are real: they block the rider and the cameras. They were
         * drawn as a half-metre grey tile at their midpoint. A tall one is
         * chain-link now — posts, a top rail, and a mesh you can see through —
         * and a low one is a block wall, because that is what they are.
         */
        const len = p.scale;
        const h = fenceHeight(sim, p);
        const dx = Math.cos(p.rot), dy = Math.sin(p.rot);
        const a = { x: p.pos.x - dx * len / 2, y: p.pos.y - dy * len / 2 };
        const b = { x: p.pos.x + dx * len / 2, y: p.pos.y + dy * len / 2 };
        const quad = (z0: number, z1: number, fill: string, u0 = 0, u1 = 1) => this.push(cam, [
          { x: lerp(a.x, b.x, u0), y: lerp(a.y, b.y, u0), z: z0 }, { x: lerp(a.x, b.x, u1), y: lerp(a.y, b.y, u1), z: z0 },
          { x: lerp(a.x, b.x, u1), y: lerp(a.y, b.y, u1), z: z1 }, { x: lerp(a.x, b.x, u0), y: lerp(a.y, b.y, u0), z: z1 },
        ], fill);
        if (h < 1.5) {
          this.boxAt(cam, p.pos, p.rot, len, 0.22, 0, h, '#8C887F');
          return;
        }
        quad(0, h, alpha('#7E868C', 0.26));
        quad(h - 0.05, h, '#7E868C');
        quad(0.04, 0.08, alpha('#7E868C', 0.8));
        const posts = Math.max(1, Math.round(len / 2.6));
        for (let i = 0; i <= posts; i++) {
          const t = i / posts;
          this.boxAt(cam, { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }, p.rot, 0.07, 0.07, 0, h + 0.05, '#6A7176');
        }
        return;
      }
      case 'ammoCache': {
        // A crate, and a band of the player's amber round it: it is theirs.
        const was = this.inkAs;
        this.inkAs = Ink.Interactable;
        this.box(cam, p.pos, 0, 0.9, 0.6, 0.6, PRINT.crate);
        this.boxAt(cam, p.pos, 0, 0.92, 0.62, 0.38, 0.48, SIGNAL.player);
        this.inkAs = was;
        return;
      }
      default: {
        const tall = p.kind === 'pole';
        const at = { x: p.pos.x + kx * wob * (tall ? 0.12 : 0.06), y: p.pos.y + ky * wob * (tall ? 0.12 : 0.06) };
        this.card(cam, at, tall ? 1.8 : 0.5, tall ? 0.2 : 0.55, tall ? 1.8 : 0.5, tint ?? VENEER.gravel);
      }
    }
  }

  /**
   * A skater, from behind, on a board.
   *
   * The board is real geometry laid on the ground and turned with the heading —
   * not a billboard — because the whole point is that the board is the thing
   * being steered and you can see it turn under you. The legs, torso and head
   * are cards, which is enough: this is a flat-colour world and a kid on a
   * board is a silhouette.
   *
   * Written for the player and now shared with Devon, who runs on the same
   * simulation: `p` is whichever rider, `look` how they dress, `deck` the
   * colour of their board, and `sling` whether this is the one holding one.
   */
  private collectSkater(sim: Sim, cam: Cam, p: PlayerState, id: string, look: Look, deck: string, sling: boolean): void {
    const h = p.heading;
    const fx = Math.cos(h), fy = Math.sin(h);
    const rx = -fy, ry = fx;              // the rider's right hand
    const z = p.z;
    const lean = p.lean;
    const at = (f: number, r: number): Vec2 => ({ x: p.pos.x + fx * f + rx * r, y: p.pos.y + fy * f + ry * r });

    // Contact shadow, painted onto the ground plane rather than sorted against
    // the world: it is a mark on the road, not an object standing on it.
    // On a roof, the mark is on the roof: sorted with it rather than painted
    // under the whole town.
    const sh = at(0, 0);
    const gz = p.ground + 0.01;
    this.push(cam, [
      { x: sh.x + fx * 0.95, y: sh.y + fy * 0.95, z: gz },
      { x: sh.x + rx * 0.34, y: sh.y + ry * 0.34, z: gz },
      { x: sh.x - fx * 0.95, y: sh.y - fy * 0.95, z: gz },
      { x: sh.x - rx * 0.34, y: sh.y - ry * 0.34, z: gz },
    ], alpha(PRINT.ink, 0.3 - clamp01((z - p.ground) / 1.2) * 0.12), undefined, undefined,
    p.ground > 0 ? Layer.Standing : Layer.Ground, 99);
    // The rider's line is the rider's: seeded by who, not where, so it holds
    // still while the board moves under it.
    this.seedBy(hashString(id + ':line'));

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
    /*
     * The nose comes up off the pop, the front foot levels the board at the
     * top of the arc, and it comes down flat or a touch nose-first. Driven
     * from the vertical speed, so it is one continuous pitch rather than two
     * fixed angles with a step between them at the apex.
     */
    const tail = p.stance === 'AIR'
      ? lerp(-0.04, 0.30, clamp01((p.vz + 1.5) / (SKATE.ollieImpulse + 1.5)))
      : Math.max(0, -p.crouch) * 0.12;

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
      ], deck);
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
    // Dark trousers under an amber hoodie: the amber is the top half, which
    // is the half the chase camera sees most of.
    const legCol = VENEER.trousers[0];
    const sleeve = shade(VENEER.player, -0.1);
    const pushing = reach > 0.02 && p.onBoard;
    /*
     * Where the pushing foot is, through the stride.
     *
     * It used to go from the tail straight to the ground the frame the push
     * started and straight back up the frame it ended, and while it was down
     * it swept backwards and then *forwards* along the road — a foot sliding
     * the wrong way on asphalt. Now it lifts off the tail, swings out and
     * forward, comes down ahead of the hip, stays put on the road while the
     * board rolls on past it (so in the board's frame it only ever moves
     * backwards, by as much road as actually went by, within what a leg can
     * reach), then lifts and swings back to the tail. The simulation delivers
     * the speed in the same window the foot is down here, because both read
     * the same stride constants.
     */
    const c0 = SKATE.pushContactStart, c1 = SKATE.pushContactEnd;
    const pushT = p.pushPhase;
    const sweep = Math.min(0.45, p.speed * (c1 - c0) * SKATE.pushDuration);
    const touch = { f: 0.05, r: 0.26 };
    const tailFoot = { f: -0.46, r: 0.13 };
    let pushFoot = tailFoot, pushZ = 0;
    if (pushing) {
      if (pushT < c0) {
        const u = smoothstep(pushT / c0);
        pushFoot = { f: lerp(tailFoot.f, touch.f, u), r: lerp(tailFoot.r, touch.r, u) };
        pushZ = lerp(1, 0, u) + Math.sin(u * Math.PI) * 0.10;
      } else if (pushT < c1) {
        const u = (pushT - c0) / (c1 - c0);
        pushFoot = { f: touch.f - sweep * u, r: touch.r };
        pushZ = 0;
      } else {
        const u = smoothstep((pushT - c1) / (1 - c1));
        pushFoot = { f: lerp(touch.f - sweep, tailFoot.f, u), r: lerp(touch.r, tailFoot.r, u) };
        pushZ = lerp(0, 1, u) + Math.sin(u * Math.PI) * 0.12;
      }
    }

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
    /*
     * Sideways. In a slide the board is across the line of travel and the
     * rider is braced against it: low, weight back over the trailing edge
     * while the deck is pushed out ahead, arms wide, eyes on where they are
     * actually going rather than where the deck points. How far the wheels
     * have let go is the simulation's own `slip`; which way the road is
     * going past is read from the board.
     */
    const travel = p.speed > 0.5 ? Math.atan2(p.vel.y, p.vel.x) : h;
    const across = p.onBoard && p.stance !== 'AIR' ? Math.sin(travel - h) : 0;   // +1: travelling toward the toe edge
    const sliding = p.onBoard ? p.slip : 0;
    const load = clamp01(Math.abs(lean) * 0.55 + Math.max(0, -p.crouch) * 0.8 + tuck * 1.6 + sliding * 0.5);
    // The standing knee bends as the other foot goes down to the road.
    const hipZ = z + 0.80 - crouch - load * 0.17 - reach * 0.07;

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
      rightFoot = at(pushFoot.f, pushFoot.r);
      rightZ = pushing ? lerp(0.03, z + 0.12 + roll + tail, pushZ) : z + 0.12 + roll + tail + tuck;
    }

    const hipL = at(running ? 0 : 0.13, -0.09);
    const hipR = at(running ? 0 : -0.11, 0.09);
    /*
     * The pose above is the rider's own — push, carve, pop, flip, grab, the
     * sling — and none of it changes. What changed is the drawing: the
     * joints are handed to the same character painter as everybody else
     * (characters.ts), so the rider is drawn as a person, not as sticks.
     */
    const P3at = (q: Vec2, qz: number) => ({ x: q.x, y: q.y, z: qz });
    const hipL3 = P3at(hipL, hipZ), hipR3 = P3at(hipR, hipZ);
    const footL3 = P3at(leftFoot, leftZ), footR3 = P3at(rightFoot, rightZ);
    const kneeL3 = solveTwoBone(hipL3, footL3, LEG_UPPER, LEG_LOWER, toe);
    const kneeR3 = solveTwoBone(hipR3, footR3, LEG_UPPER, LEG_LOWER, toe);
    void legCol;

    /*
     * The rider is where the carve actually reads. Weight goes over the edge
     * being turned on, the shoulders lead the turn, and the whole body folds
     * down into it — a bigger signal than the deck angle, and it costs the
     * board nothing.
     */
    const dip = load * 0.09;
    const bodyF = reach * 0.20 + load * 0.05 + (running ? 0.06 : 0);
    // Into the carve; and in a slide, braced against the drag: weight back,
    // over the trailing edge, the deck pushed out ahead toward the travel.
    const bodyR = lean * 0.30 - across * sliding * 0.14;
    const bodyAt = at(bodyF, bodyR);
    // Torso: taller than it is wide, sitting straight on top of the hips, so
    // the body reads as a body and not as a bar floating over a pair of legs.
    const torsoH = 0.28 - dip * 0.5;

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
    const spread = 0.30 + load * 0.16 + (p.stance === 'AIR' ? 0.12 : 0) + sliding * 0.10;
    // Elbows fall back and down, the way an arm held out for balance hangs.
    const elbowTo = { x: back.x * 0.7 - fx * 0.3, y: back.y * 0.7 - fy * 0.3 };
    /*
     * The sling is in the left hand, and the right one draws it.
     *
     * Out and not pulled, it is carried in front of the chest, one-handed, and
     * the right arm keeps riding. Pulled, the left arm goes out straight at
     * whatever is being aimed at and the right hand comes back along that line
     * toward the cheek, as far as the band is drawn — so the pouch is in a
     * hand and the fork is in a hand, rather than floating near the rider.
     */
    const sp = sling ? this.slingPose : { held: false, drawing: false, draw: 0 };
    const slingOn = sp.held && p.stance !== 'BAIL';
    let ax = fx, ay = fy;
    if (sp.drawing && sim.aimWorld) {
      const dx = sim.aimWorld.x - p.pos.x, dy = sim.aimWorld.y - p.pos.y;
      const l = Math.hypot(dx, dy);
      if (l > 0.5) { ax = dx / l; ay = dy / l; }
    }
    const chest = at(bodyF, bodyR);
    const forkHand = sp.drawing
      ? { x: chest.x + ax * 0.44 - rx * 0.04, y: chest.y + ay * 0.44 - ry * 0.04 }
      : at(bodyF + 0.10, -0.26 + lean * 0.24);
    const forkZ = sp.drawing ? shoulderZ + 0.02 : shoulderZ - 0.24;
    const back2 = 0.10 + clamp01(sp.draw) * 0.38;
    const pullHand = { x: forkHand.x - ax * back2 + rx * 0.05, y: forkHand.y - ay * back2 + ry * 0.05 };
    const pullZ = forkZ + 0.02;
    const arms: Record<number, { sh: { x: number; y: number; z: number }; el: { x: number; y: number; z: number }; hand: { x: number; y: number; z: number } }> = {};
    for (const side of [1, -1]) {
      // The shoulder is on the torso, not floating beside it.
      const shoulder = at(bodyF, side * 0.17 + bodyR);
      /*
       * A grab sends one hand to the deck instead of out for balance —
       * `onBoard` is the same function the trick above turns the deck through,
       * so the hand is placed in the board's own frame and travels with it.
       * The other arm doesn't know anything happened.
       */
      const grabbing = p.grab && p.grab.spec.side === side ? p.grab.spec : null;
      const grabPoint = grabbing ? onBoard(grabbing.f, grabbing.r, 0.10) : null;
      const swingF = running ? -swing(side) * 0.34 : reach * 0.16;
      const onSling = slingOn && !grabPoint && (side < 0 || sp.drawing);
      const hand = onSling ? (side < 0 ? forkHand : pullHand)
        : grabPoint ?? at(bodyF + swingF - side * lean * 0.10, side * spread + lean * 0.24);
      const handZ = onSling ? (side < 0 ? forkZ : pullZ)
        : grabPoint
          ? grabPoint.z
          : shoulderZ - 0.34 - side * lean * 0.12 + (p.stance === 'AIR' ? 0.14 : 0);
      const sh3 = P3at(shoulder, shoulderZ), hand3 = P3at(hand, handZ);
      arms[side] = { sh: sh3, el: solveTwoBone(sh3, hand3, ARM_UPPER, ARM_LOWER, elbowTo), hand: hand3 };
    }
    void sleeve;
    if (slingOn) {
      const onGlass = (q: Vec2, qz: number) => {
        const cp = toCamera(cam, q.x, q.y, qz);
        if (cp.z <= NEAR) return null;
        const pt = project(cam, cp);
        return { x: pt.x, y: pt.y, s: cam.f / cp.z };
      };
      const fork = onGlass(forkHand, forkZ);
      const pull = onGlass(pullHand, pullZ);
      if (fork && pull) this.slingHands = { fork, pull };
    }
    // Facing the toe edge: a skater stands across the board, not along it.
    const facing = Math.atan2(toe.y, toe.x);
    const joints: Joints = {
      pelvis: { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2, z: hipZ },
      chest: { ...bodyAt, z: shoulderZ - 0.02 },
      head: { ...bodyAt, z: shoulderZ + 0.17 },
      // Left is the rider's front foot; in the body's own frame that is its
      // left hand side only when facing the toe edge, which it is.
      hipL: hipL3, hipR: hipR3, kneeL: kneeL3, kneeR: kneeR3, footL: footL3, footR: footR3,
      shL: arms[-1].sh, elL: arms[-1].el, handL: arms[-1].hand,
      shR: arms[1].sh, elR: arms[1].el, handR: arms[1].hand,
      facing, toes: running ? h : facing,
      // Looking where they are going — which in a carve is round the turn,
      // ahead of the nose, and in a slide is along the road, not the deck.
      look: running ? h : lerp(h + lean * 0.45, travel, sliding),
    };
    this.seedBy(null);
    this.personAt(cam, id, p.pos, look, { tick: sim.tick, sun: sim.sun, joints, bias: 0.25 });
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

interface Decal {
  pts: P3[]; fill: string; text?: Face['text']; ink?: boolean;
  /** A window: 1 = might be lit, 2 = somebody is home, 3 = a shopfront. The mood decides. */
  lit?: 1 | 2 | 3;
  /** Where its light falls: the foot of the wall under it, the wall's outward normal, its width. */
  pool?: { at: Vec2; nx: number; ny: number; w: number };
  /** A sprayed tag: its colour and how fresh it is. The mood decides how loud. */
  tag?: { col: string; a: number };
}
interface Dressing {
  /** Per wall edge (indexed like the edge's first vertex), what hangs on it. */
  walls: Decal[][];
  /** Per wall edge, how squarely it faces the sun, 0..1. */
  sunlit: number[];
  /** Per wall edge, its outward normal: which way is out of the building. */
  normals: Vec2[];
  /**
   * A pitched roof: the wall-plate corners and ridge ends (for the gables),
   * and the same six points pushed out past the walls (for the slopes) — an
   * eave that overhangs is most of what makes a house read as a house.
   */
  ridge: {
    a0: P3; a1: P3; b0: P3; b1: P3; top0: P3; top1: P3;
    ea0: P3; ea1: P3; eb0: P3; eb1: P3; et0: P3; et1: P3;
  } | null;
  /** A chimney astride the ridge, on some houses. */
  chimney: { at: Vec2; rot: number; z0: number; z1: number } | null;
  /** A TV aerial on the chimney, on some of those. */
  aerial: boolean;
  /** A step and a canopy at a house's front door. */
  porch: { at: Vec2; rot: number } | null;
  /** The building's own paint and roof, weathered down into the town. */
  wall: string;
  roof: string;
  /** Rooftop plant on a flat roof: condensers, a vent housing. */
  plant: Array<{ at: Vec2; rot: number; w: number; d: number; h: number }>;
}

/*
 * What gets written on walls. Kids' tags, a crew, a joke — never a slogan
 * about the system: nobody in Bellhaven is protesting anything, which is the
 * point. The colours are cheap spray, mostly faded, and one in a while fresh.
 */
/*
 * What the town is built of. A building's authored paint is kept as a tint
 * over one of these, so neighbours still differ — but every wall is brick,
 * block, render or siding first, and colour second.
 */
export const MATERIAL: Partial<Record<Building['kind'], string[]>> & { house: string[] } = {
  // Render, block, brick, siding, cool render, stained timber: mid values, so
  // a wall in the sun is a wash the ink line reads against, and a wall out of
  // it can drop a long way before it is black.
  house: ['#A39783', '#8F8F86', '#8C766A', '#A8A08E', '#858B8F', '#8F7F6C'],
  shop: ['#80705F', '#9C978C', '#7E8488', '#8A7B6A'],
  school: ['#8E756A', '#A19B8F'],
  civic: ['#A9A497', '#8D9294'],
  utility: ['#858884', '#767A77'],
  garage: ['#9A968C', '#878B8C'],
  shed: ['#8C7B66', '#9A9280'],
  structure: ['#9C9B95', '#8A8B87'],
};

const TAGS = ['KEZ', 'RONK', 'DV8', 'LOTUS', 'MOTH', 'SK8', 'OKAY?', 'NOVA', 'BRIX', 'ZEPH', 'TUFF', 'GHOST'];
const SPRAY = ['#C9C2B0', '#A8473D', '#5E86A8', '#E0C34C', '#9E5A8C', '#2B2B2B', '#7FA35A'];

const GLASS = PRINT.glass;
const GLASS_LIT = '#3A4247';
/** A room with the light on: the inker leaves a lit window as paper. */
const GLASS_WARM = PRINT.glassLit;
const DOOR = PRINT.door;
const SIGN = PRINT.signBoard;

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
  const seed = hashString(b.id) >>> 0;
  // What it is built of, and then the paint it was given, worn down.
  const stock = MATERIAL[b.kind] ?? MATERIAL.house;
  const wall = mix(weather(b.wall), stock[seed % stock.length], 0.7);
  // Roofs sit darker than walls: the graphic weight of a street is its roofline.
  const roof = mix(weather(b.roof, 0.8), PRINT.ink, 0.5);
  const walls: Decal[][] = [];
  const sunlit: number[] = [];
  const normals: Vec2[] = [];
  let porch: Dressing['porch'] = null;
  const houseLike = b.kind === 'house';
  const sign = signFor(b);
  const floors = b.height >= 5 ? Math.max(1, Math.floor((b.height - 0.6) / 2.9)) : 0;

  for (let k = 0; k < n; k++) {
    const e = byStart(k);
    sunlit.push(Math.max(0, -(e.nx * sun.x + e.ny * sun.y)));
    normals.push({ x: e.nx, y: e.ny });
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

    /*
     * Wear. A darker band where the street splashes up the wall, and a few
     * streaks down from the eave where the rain runs. Nothing here is new and
     * nobody has repainted since the cameras went up.
     */
    if (e.len > 1.5) {
      out.push(rect(0, e.len, 0.0, 0.45, shade(wall, -0.2), undefined, 0.02));
      // A drainpipe down one end of most walls: the cheapest vertical a
      // facade can have, and the one every terrace actually has.
      if (e.len > 4 && (seed + k) % 3 !== 2) {
        const t = (seed + k) % 2 ? 0.22 : e.len - 0.32;
        const pipe = rect(t, t + 0.1, 0.1, b.height - 0.12, shade(wall, -0.42), undefined, 0.045);
        pipe.ink = true;
        out.push(pipe);
      }
      // A flat roof's coping: a dark band along the top of every wall, which
      // is what gives a block its roofline from the far end of the street.
      if (b.kind !== 'house') out.push(rect(0, e.len, b.height - 0.32, b.height, shade(wall, -0.55), undefined, 0.03));
      const streaks = Math.floor(e.len / 6);
      for (let q = 0; q < streaks; q++) {
        const t = (((seed >>> (q * 3 % 24)) % 97) / 97) * (e.len - 0.9) + 0.3;
        const top = b.height - 0.05;
        out.push(rect(t, t + 0.12 + (q % 3) * 0.06, Math.max(0.5, top - 1.6 - (q % 4) * 0.7), top, alpha('#2A2622', 0.14), undefined, 0.025));
      }
    }
    /*
     * Tags, on the walls a kid would reach: the sides and backs of shops,
     * garages, the depot, the substation — and only the odd house. Low, at
     * arm's height, and never over a window or a sign.
     */
    const taggable = b.kind === 'shop' || b.kind === 'garage' || b.kind === 'utility' || b.kind === 'structure'
      || b.kind === 'shed' || (houseLike && (seed + k) % 5 === 0);
    if (taggable && !isFront && e.len > 3.4 && (seed + k * 7) % 3 !== 1) {
      const tag = TAGS[(seed + k * 13) % TAGS.length];
      const col = SPRAY[(seed + k * 5) % SPRAY.length];
      const w = Math.min(e.len * 0.6, 1.2 + tag.length * 0.45);
      const t0 = ((seed + k * 31) % 100) / 100 * (e.len - w);
      const z0 = 0.55 + ((seed + k) % 3) * 0.15;
      const fresh = (seed + k) % 4 === 0;
      const sprayed = rect(t0, t0 + w, z0, z0 + 0.95, alpha(col, 0.001),
        { str: tag, colour: alpha(col, fresh ? 0.92 : 0.6), aspect: w / 0.95, weight: 900 }, 0.03);
      sprayed.tag = { col, a: fresh ? 0.92 : 0.6 };
      out.push(sprayed);
    }

    if (b.kind === 'shop' && isFront) {
      // A glass front, a door in it, and the name over the top.
      const front = rect(e.len * 0.08, e.len * 0.92, 0.35, 2.7, GLASS_LIT);
      front.ink = true;
      front.lit = 3;
      front.pool = { at: { x: e.a.x + along.x * e.len * 0.5, y: e.a.y + along.y * e.len * 0.5 }, nx: e.nx, ny: e.ny, w: e.len * 0.84 };
      out.push(front);
      out.push(rect(e.len * 0.46, e.len * 0.54, 0.02, 2.4, '#3D4C58', undefined, 0.05));
      if (sign) out.push(rect(e.len * 0.12, e.len * 0.88, 3.05, 4.05, SIGN,
        { str: sign, colour: PRINT.signInk, aspect: (e.len * 0.76) / 1.0, weight: 700 }, 0.05));
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
          const pane = (w + f + k + seed) % 7 === 0 ? GLASS_WARM : (w + f + k) % 3 === 0 ? GLASS_LIT : GLASS;
          const win = rect(t - 0.6, t + 0.6, z0, z0 + 1.25, pane);
          win.ink = true;
          if (pane === GLASS_WARM) win.lit = 2; else if (pane === GLASS_LIT) win.lit = 1;
          if (win.lit === 2) win.pool = { at: { x: e.a.x + along.x * t, y: e.a.y + along.y * t }, nx: e.nx, ny: e.ny, w: 1.2 };
          out.push(win);
        }
      }
      if (houseLike && isFront) {
        const door = rect(e.len * 0.62 - 0.5, e.len * 0.62 + 0.5, 0.02, 2.15, DOOR);
        door.ink = true;
        out.push(door);
        porch = { at: { x: e.a.x + along.x * e.len * 0.62 + e.nx * 0.02, y: e.a.y + along.y * e.len * 0.62 + e.ny * 0.02 }, rot: Math.atan2(e.ny, e.nx) };
        // A number by the door, where the street has numbers.
        const num = b.label?.match(/^(\d+) /)?.[1];
        if (num) out.push(rect(e.len * 0.62 + 0.75, e.len * 0.62 + 1.35, 1.55, 2.0, SIGN,
          { str: num, colour: PRINT.signInk, aspect: 1.33, weight: 800 }, 0.05));
      }
      if ((b.kind === 'civic' || b.kind === 'school') && isFront) {
        out.push(rect(e.len * 0.44, e.len * 0.56, 0.02, 2.5, '#3D4C58', undefined, 0.05));
        if (sign) out.push(rect(e.len * 0.18, e.len * 0.82, b.height - 1.45, b.height - 0.45, SIGN,
          { str: sign, colour: PRINT.signInk, aspect: (e.len * 0.64) / 1.0 }, 0.05));
      }
    } else if (b.kind === 'garage' && isFront && e.len > 2.6) {
      const door = rect(e.len * 0.15, e.len * 0.85, 0.02, 2.3, shade(wall, -0.22));
      door.ink = true;
      out.push(door);
    } else if (b.kind === 'structure' && isFront && sign) {
      out.push(rect(e.len * 0.15, e.len * 0.85, b.height - 1.6, b.height - 0.5, SIGN,
        { str: sign, colour: PRINT.signInk, aspect: (e.len * 0.7) / 1.1 }, 0.05));
    }
    walls.push(out);
  }

  // A pitched roof, along the long side, on anything that is a home.
  let ridge: Dressing['ridge'] = null;
  let chimney: Dressing['chimney'] = null;
  if (houseLike && n === 4) {
    const e0 = edges[0], e1 = edges[1];
    // Pick the pair of opposite corners that make the long side the ridge.
    const long0 = e0.len >= e1.len;
    const [p0, p1, p2, p3] = long0 ? [poly[3], poly[0], poly[1], poly[2]] : [poly[0], poly[1], poly[2], poly[3]];
    // Steeper on some houses than others: a street of identical pitches is
    // a street of identical boxes.
    const pitch = 0.26 + (seed % 5) * 0.035;
    const rise = Math.min(2.6, Math.min(e0.len, e1.len) * pitch);
    const h = b.height;
    const mid = (u: Vec2, v: Vec2): P3 => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2, z: h + rise });
    const top0 = mid(p0, p3), top1 = mid(p1, p2);
    // The overhang: out along the ridge past the gables, and down the slope
    // past the wall plate.
    const rl = Math.hypot(top1.x - top0.x, top1.y - top0.y) || 1;
    const ux = (top1.x - top0.x) / rl, uy = (top1.y - top0.y) / rl;
    const GABLE = 0.35, EAVE = 0.4;
    const over = (q: Vec2, top: P3, end: number): P3 => {
      const dx = q.x - top.x, dy = q.y - top.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: q.x + (dx / l) * EAVE + ux * GABLE * end, y: q.y + (dy / l) * EAVE + uy * GABLE * end, z: h - EAVE * (rise / l) };
    };
    ridge = {
      a0: { x: p0.x, y: p0.y, z: h }, a1: { x: p1.x, y: p1.y, z: h },
      b1: { x: p2.x, y: p2.y, z: h }, b0: { x: p3.x, y: p3.y, z: h },
      top0, top1,
      ea0: over(p0, top0, -1), ea1: over(p1, top1, 1), eb1: over(p2, top1, 1), eb0: over(p3, top0, -1),
      et0: { x: top0.x - ux * GABLE, y: top0.y - uy * GABLE, z: top0.z },
      et1: { x: top1.x + ux * GABLE, y: top1.y + uy * GABLE, z: top1.z },
    };
    // A chimney on most houses, astride the ridge near one end, so its foot
    // is hidden in the roof whichever slope is in front of it.
    if (seed % 4 !== 0) {
      const t = (seed >> 3) % 2 === 0 ? 0.22 : 0.78;
      chimney = {
        at: { x: top0.x + (top1.x - top0.x) * t, y: top0.y + (top1.y - top0.y) * t },
        rot: Math.atan2(uy, ux),
        z0: h + rise * 0.55, z1: h + rise + 0.85,
      };
    }
  }
  // Flat roofs carry plant: a condenser or two, set in from the parapet.
  const plant: Dressing['plant'] = [];
  if (!ridge && b.height >= 3.5 && b.kind !== 'structure') {
    const units = 1 + (seed % 2);
    for (let u = 0; u < units; u++) {
      const f = 0.35 + 0.3 * u;
      plant.push({
        at: { x: cx + (poly[0].x - cx) * f * 0.6, y: cy + (poly[0].y - cy) * f * 0.6 },
        rot: Math.atan2(poly[1].y - poly[0].y, poly[1].x - poly[0].x),
        w: 1.4, d: 1.0, h: 0.9,
      });
    }
  }
  return { walls, sunlit, normals, ridge, chimney, aerial: !!chimney && seed % 3 === 0, porch, wall, roof, plant };
}


/**
 * Light on the ground in an owned town: a clean paper-white, brighter than
 * the page, so it still reads under the mood's wash. Not lamp-yellow — that
 * hue is the player's.
 */
const POOL_LIGHT = '#F4F0E6';

/** Ramps: smooth poured concrete, a shade warmer than the paving, so a lip reads. */
const RAMP_TOP = '#C9C1AE';
const RAMP_SIDE = '#8E887A';
/** A rail is steel with a little paint left on it. */
const RAIL_STEEL = '#3E4A52';

/** A bird's outline, across and up from its perch: tail, back, head, beak, breast. */
const BIRD: ReadonlyArray<readonly [number, number]> = [
  [-0.26, 0.06], [-0.16, 0.16], [0.03, 0.21], [0.14, 0.25], [0.24, 0.18], [0.16, 0.14], [0.13, 0.05], [-0.03, 0.0], [-0.19, 0.0],
];

/** A tuft's outline, across and up: three blades from one root. */
const TUFT: ReadonlyArray<readonly [number, number]> = [
  [-0.17, 0.3], [-0.04, 0], [-0.04, 0.44], [0.01, 0], [0.06, 0.4], [0.05, 0], [0.17, 0.26],
];

/*
 * A traffic cone is the town's, not UNDERWATCH's, so it is a faded, dirty
 * orange: still a cone at a glance, never mistaken for warning orange.
 */
const CONE = PRINT.cone;

export interface StreetDressing {
  poles: Array<{ at: Vec2; rot: number; can: boolean }>;
  wires: Array<{ a: Vec2; b: Vec2; z: number; sag: number }>;
  signs: Array<{ at: Vec2; blades: Array<{ name: string; rot: number }> }>;
  marks: Array<{ c: Vec2; poly: Vec2[]; fill: string }>;
  /** Footway slab joints: fine, and only drawn close to the eye. */
  joints: Array<{ c: Vec2; poly: Vec2[] }>;
  /** Kids' chalk on the footway, shown as the town is lit. */
  chalk: Array<{ c: Vec2; poly: Vec2[] }>;
  /** Grass, as a few pen strokes standing up where a verge meets something. */
  tufts: Array<{ at: Vec2; s: number; seed: number }>;
  /** Grass, as short strokes laid flat in drifts across a lawn: a, b. */
  hatch: Array<{ a: Vec2; b: Vec2 }>;
}

const streetCache = new WeakMap<object, StreetDressing>();

/**
 * Work out the town's poles, wires, street signs and road wear, once.
 *
 * Deterministic from the world data alone, so the same town gets the same
 * poles every session and every screenshot.
 */
export function streetDressingFor(data: WorldData): StreetDressing {
  const hit = streetCache.get(data);
  if (hit) return hit;
  const out: StreetDressing = { poles: [], wires: [], signs: [], marks: [], joints: [], tufts: [], hatch: [], chalk: [] };
  const nodes = new Map(data.roadNodes.map((r) => [r.id, r.pos]));
  const edges = data.roadEdges
    .map((e) => ({ e, a: nodes.get(e.a), b: nodes.get(e.b) }))
    .filter((x): x is { e: typeof data.roadEdges[number]; a: Vec2; b: Vec2 } => !!x.a && !!x.b);
  const inBuilding = (q: Vec2, pad: number) => data.buildings.some((b) => pointInPoly(q, b.poly) || polyDist(q, b.poly) < pad);
  const onRoad = (q: Vec2, pad: number) => edges.some(({ e, a, b }) => segDist(q.x, q.y, a, b) < e.width / 2 + pad);
  const nearThing = (q: Vec2, r: number) => data.props.some((p) => Math.hypot(p.pos.x - q.x, p.pos.y - q.y) < r + (p.kind === 'fenceGate' ? p.scale / 2 : 0))
    || data.features.some((f) => pointInPoly(q, f.poly) || polyDist(q, f.poly) < r);
  // Footways, plazas, forecourts: anywhere a planner expects people to move.
  const onModelled = (q: Vec2, pad: number) => data.surfaces.some((sf) => sf.modelled && (pointInPoly(q, sf.poly) || polyDist(q, sf.poly) < pad));
  const topSurface = (q: Vec2) => {
    let best: typeof data.surfaces[number] | null = null;
    for (const sf of data.surfaces) if (pointInPoly(q, sf.poly) && (!best || sf.priority >= best.priority)) best = sf;
    return best;
  };

  // The pole line is the simulation's: a pole you can see is a pole you can
  // hook, so both read the one list.
  const line = poleLineFor(data);
  out.poles.push(...line.poles);
  out.wires.push(...line.wires);
  for (const { e, a, b } of edges) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 8) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const nx = -uy, ny = ux;
    const rot = Math.atan2(uy, ux);

    // Wear in the carriageway, only where the carriageway is what you see.
    let h = hashString(`${e.a}-${e.b}`);
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
    if (e.surface === 'asphalt') {
      for (let d = 4 + rnd() * 10; d < len - 4; d += 14 + rnd() * 22) {
        const lat = (rnd() - 0.5) * e.width * 0.55;
        const c = { x: a.x + ux * d + nx * lat, y: a.y + uy * d + ny * lat };
        const top = topSurface(c);
        if (!top || top.kind !== 'asphalt') continue;
        /*
         * Scratchboard. The road is the darkest shape in the street, so its
         * wear is drawn the way a scratchboard artist draws on black: a patch
         * of newer tar a shade lighter, and the crack it was laid over
         * scratched out in paper — a jagged line, never a texture.
         */
        const hl = 0.6 + rnd() * 1.3, hw = 0.4 + rnd() * 0.7;
        const poly: Vec2[] = [];
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const r = 0.75 + rnd() * 0.35;
          const cu = Math.cos(ang) * hl * r, cv = Math.sin(ang) * hw * r;
          poly.push({ x: c.x + ux * cu + nx * cv, y: c.y + uy * cu + ny * cv });
        }
        out.marks.push({ c, fill: alpha(PRINT.roadPatch, 0.6 + rnd() * 0.4), poly });
        if (rnd() < 0.7) {
          let px = c.x, py = c.y;
          let ang = rot + (rnd() - 0.5) * 2.4;
          const segs = 3 + Math.floor(rnd() * 4);
          for (let q = 0; q < segs; q++) {
            ang += (rnd() - 0.5) * 1.3;
            const l = 0.5 + rnd() * 1.1, wd = 0.035 + rnd() * 0.03;
            const qx = px + Math.cos(ang) * l, qy = py + Math.sin(ang) * l;
            const top = topSurface({ x: qx, y: qy });
            if (!top || top.kind !== 'asphalt') break;
            const sx = -Math.sin(ang) * wd, sy = Math.cos(ang) * wd;
            out.marks.push({
              c: { x: px, y: py }, fill: PRINT.roadScratch,
              poly: [{ x: px + sx, y: py + sy }, { x: qx + sx * 0.3, y: qy + sy * 0.3 }, { x: qx - sx * 0.3, y: qy - sy * 0.3 }, { x: px - sx, y: py - sy }],
            });
            px = qx; py = qy;
          }
        }
      }
      /*
       * The kerb, inked: a hard dark line where carriageway meets footway,
       * in continuous runs, broken only where something else crosses it.
       * And the footway's slab joints, every three metres across it.
       */
      const hwk = e.width / 2;
      const isFootway = (sf: ReturnType<typeof topSurface>) => !!sf && (sf.kind === 'smoothConcrete' || sf.kind === 'roughConcrete' || sf.kind === 'tile');
      for (const side of [1, -1]) {
        let runStart = -1;
        const flush = (d0: number, d1: number) => {
          const o0 = side * (hwk - 0.06), o1 = side * (hwk + 0.1);
          out.marks.push({
            c: { x: a.x + ux * (d0 + d1) / 2 + nx * side * hwk, y: a.y + uy * (d0 + d1) / 2 + ny * side * hwk },
            fill: alpha(CITY_INK, 0.9),
            poly: [
              { x: a.x + ux * d0 + nx * o0, y: a.y + uy * d0 + ny * o0 },
              { x: a.x + ux * d1 + nx * o0, y: a.y + uy * d1 + ny * o0 },
              { x: a.x + ux * d1 + nx * o1, y: a.y + uy * d1 + ny * o1 },
              { x: a.x + ux * d0 + nx * o1, y: a.y + uy * d0 + ny * o1 },
            ],
          });
        };
        const STEP = 1.5;
        for (let d = 0; d <= len; d += STEP) {
          const at = (o: number) => ({ x: a.x + ux * d + nx * side * o, y: a.y + uy * d + ny * side * o });
          const inner = topSurface(at(hwk - 0.4)), outer = topSurface(at(hwk + 0.7));
          const kerb = !!inner && inner.kind === 'asphalt' && isFootway(outer);
          if (kerb && runStart < 0) runStart = d;
          if ((!kerb || d + STEP > len) && runStart >= 0) { flush(runStart, kerb ? Math.min(len, d + STEP) : d); runStart = -1; }
          if (kerb && Math.round(d / STEP) % 2 === 0) {
            const mid = topSurface(at(hwk + 1.1));
            if (isFootway(mid)) {
              const j0 = side * (hwk + 0.15), j1 = side * (hwk + 2.15);
              out.joints.push({
                c: at(hwk + 1.1),
                poly: [
                  { x: a.x + ux * (d - 0.025) + nx * j0, y: a.y + uy * (d - 0.025) + ny * j0 },
                  { x: a.x + ux * (d + 0.025) + nx * j0, y: a.y + uy * (d + 0.025) + ny * j0 },
                  { x: a.x + ux * (d + 0.025) + nx * j1, y: a.y + uy * (d + 0.025) + ny * j1 },
                  { x: a.x + ux * (d - 0.025) + nx * j1, y: a.y + uy * (d - 0.025) + ny * j1 },
                ],
              });
            }
          }
        }
      }
      // A centre line, dashed and half worn away, on anything wide enough to have one.
      if (e.width >= 7) {
        for (let d = 3; d < len - 3; d += 9) {
          const c = { x: a.x + ux * (d + 1.5), y: a.y + uy * (d + 1.5) };
          const top = topSurface(c);
          if (!top || top.kind !== 'asphalt') continue;
          // Hand-painted: each dash a little off line, wider at one end,
          // and some of them half gone.
          const fade = 0.35 + rnd() * 0.65;
          const w0 = 0.06 + rnd() * 0.04, w1 = 0.05 + rnd() * 0.05, drift = (rnd() - 0.5) * 0.08;
          const l = 2.4 + rnd() * 0.8;
          out.marks.push({
            c, fill: alpha(PRINT.laneMark, fade),
            poly: [
              { x: a.x + ux * d - nx * w0, y: a.y + uy * d - ny * w0 },
              { x: a.x + ux * (d + l) + nx * (drift - w1), y: a.y + uy * (d + l) + ny * (drift - w1) },
              { x: a.x + ux * (d + l) + nx * (drift + w1), y: a.y + uy * (d + l) + ny * (drift + w1) },
              { x: a.x + ux * d + nx * w0, y: a.y + uy * d + ny * w0 },
            ],
          });
        }
      }
    }
  }

  /*
   * Worn ground. Verges and lawns are trodden, scuffed and patched with bare
   * earth, and open forecourts carry old stains: irregular low-contrast
   * blotches on a jittered grid, only where that surface is the one on top.
   */
  {
    let gh = 0x9e3779b9;
    const g = () => { gh = (gh * 1103515245 + 12345) >>> 0; return (gh >>> 8) / 16777216; };
    for (const sf of data.surfaces) {
      const hard = sf.kind === 'smoothConcrete' || sf.kind === 'roughConcrete';
      if (sf.kind !== 'grass' && !hard) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of sf.poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      // Concrete gets grime too, but only on open forecourts, not footways.
      if (hard && (x1 - x0) * (y1 - y0) < 400) continue;
      for (let x = x0 + 4; x < x1 - 2; x += 11) {
        for (let y = y0 + 4; y < y1 - 2; y += 11) {
          const c = { x: x + (g() - 0.5) * 8, y: y + (g() - 0.5) * 8 };
          const top = topSurface(c);
          if (top !== sf || g() < (hard ? 0.6 : 0.45)) continue;
          const r0 = 0.9 + g() * 1.5, squash = 0.5 + g() * 0.5, turn = g() * Math.PI;
          const poly: Vec2[] = [];
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2, rr = r0 * (0.7 + g() * 0.45);
            const lx = Math.cos(ang) * rr, ly = Math.sin(ang) * rr * squash;
            poly.push({ x: c.x + lx * Math.cos(turn) - ly * Math.sin(turn), y: c.y + lx * Math.sin(turn) + ly * Math.cos(turn) });
          }
          // Worn ground is paler, not darker: trodden bare earth is a big
          // flat shape in a lighter wash, the way it would be inked.
          if (!hard && g() < 0.6) continue;
          out.marks.push({ c, poly, fill: hard ? alpha('#24241F', 0.1 + g() * 0.1) : alpha(PRINT.bareEarth, 0.7) });
        }
      }
    }
  }

  /*
   * Grass, hatched. A lawn is not a flat wash with noise on it: a pen says
   * "grass" with short strokes laid in one direction, in drifts, and leaves
   * the rest of the field alone. The strokes are anchored in the world, so
   * they foreshorten with distance like the ground does — which is most of
   * what makes a flat plane read as a plane — and a low-frequency field
   * decides where the drifts are, so it is never a texture over everything.
   */
  {
    let hh = 0x2545f491;
    const r = () => { hh = (hh * 1103515245 + 12345) >>> 0; return (hh >>> 8) / 16777216; };
    const CELL = 14;
    const field = (x: number, y: number) => {
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      const fx = x / CELL - gx, fy = y / CELL - gy;
      const v = (i: number, j: number) => ((hashString(`${gx + i},${gy + j}`) >>> 0) % 1000) / 1000;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy;
    };
    for (const sf of data.surfaces) {
      if (sf.kind !== 'grass') continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of sf.poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      const dir = (hashString(sf.id) % 40 - 20) * (Math.PI / 180) + 0.35;
      const STEP = 1.5;
      for (let x = x0 + 1; x < x1; x += STEP) {
        for (let y = y0 + 1; y < y1; y += STEP * 0.8) {
          const c = { x: x + (r() - 0.5) * 1.6, y: y + (r() - 0.5) * 1.6 };
          if (field(c.x, c.y) < 0.45 || r() < 0.2) continue;
          if (topSurface(c) !== sf) continue;
          const l = 0.35 + r() * 0.4;
          const a2 = dir + (r() - 0.5) * 0.3;
          const ex = Math.cos(a2) * l / 2, ey = Math.sin(a2) * l / 2;
          out.hatch.push({ a: { x: c.x - ex, y: c.y - ey }, b: { x: c.x + ex, y: c.y + ey } });
        }
      }
    }
  }

  /*
   * Grass tufts. Along the edges of every verge and lawn — where grass is
   * left long against a kerb, a wall, a path — and a sparse few out in the
   * open. Only where grass is the surface on top, and never in a building.
   */
  {
    let th = 0x51ed27;
    const t = () => { th = (th * 1103515245 + 12345) >>> 0; return (th >>> 8) / 16777216; };
    for (const sf of data.surfaces) {
      if (sf.kind !== 'grass') continue;
      const poly = sf.poly;
      let cx = 0, cy = 0;
      for (const q of poly) { cx += q.x; cy += q.y; }
      cx /= poly.length; cy /= poly.length;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = t() * 3; d < l; d += 2.2 + t() * 5.5) {
          const u = d / l;
          const e = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
          // A little way in from the edge, toward the middle of the lawn.
          const k = 0.35 + t() * 0.5;
          const il = Math.hypot(cx - e.x, cy - e.y) || 1;
          const q = { x: e.x + ((cx - e.x) / il) * k, y: e.y + ((cy - e.y) / il) * k };
          if (topSurface(q) !== sf || inBuilding(q, 0.3)) continue;
          out.tufts.push({ at: q, s: 1.3 + t() * 0.9, seed: Math.floor(t() * 1e6) });
        }
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      for (let x = x0 + 3; x < x1; x += 7) {
        for (let y = y0 + 3; y < y1; y += 7) {
          if (t() < 0.6) continue;
          const q = { x: x + (t() - 0.5) * 6, y: y + (t() - 0.5) * 6 };
          if (topSurface(q) !== sf || inBuilding(q, 0.3)) continue;
          out.tufts.push({ at: q, s: 1.0 + t() * 0.7, seed: Math.floor(t() * 1e6) });
        }
      }
    }
  }

  /*
   * Forecourts and plazas are laid in slabs: a joint grid every four metres,
   * cut into short pieces and kept only where that concrete is the surface
   * on top, so it never runs across a road, a planter bed or a lawn.
   */
  for (const sf of data.surfaces) {
    if (sf.kind !== 'smoothConcrete' && sf.kind !== 'roughConcrete') continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of sf.poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    if ((x1 - x0) * (y1 - y0) < 400) continue;
    const S = 4, H = 0.03;
    for (let x = x0 + S; x < x1; x += S) {
      for (let y = y0; y < y1; y += S) {
        const c = { x, y: y + S / 2 };
        if (topSurface(c) !== sf) continue;
        out.joints.push({ c, poly: [{ x: x - H, y }, { x: x + H, y }, { x: x + H, y: y + S }, { x: x - H, y: y + S }] });
      }
    }
    for (let y = y0 + S; y < y1; y += S) {
      for (let x = x0; x < x1; x += S) {
        const c = { x: x + S / 2, y };
        if (topSurface(c) !== sf) continue;
        out.joints.push({ c, poly: [{ x, y: y - H }, { x: x + S, y: y - H }, { x: x + S, y: y + H }, { x, y: y + H }] });
      }
    }
  }

  /*
   * Chalk. A hopscotch grid, or a sun with rays, on a footway every so often:
   * the thing a lit town has on its pavements and an owned one does not.
   * Drawn only when the mood is on the kid's side.
   */
  {
    let ch = 0x7f4a7c15;
    const r = () => { ch = (ch * 1103515245 + 12345) >>> 0; return (ch >>> 8) / 16777216; };
    const bar = (a: Vec2, b: Vec2, w: number): Vec2[] => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / l * w / 2, ny = (b.x - a.x) / l * w / 2;
      return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    };
    for (const { e, a, b } of edges) {
      if (e.surface !== 'asphalt') continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 30) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, nx = -uy, ny = ux;
      for (let d = 8 + r() * 14; d < len - 8; d += 20 + r() * 22) {
        const side = r() < 0.5 ? 1 : -1;
        const c = { x: a.x + ux * d + nx * side * (e.width / 2 + 1.1), y: a.y + uy * d + ny * side * (e.width / 2 + 1.1) };
        const top = topSurface(c);
        // A footway, of either concrete, and not an open forecourt.
        if (!top || (top.kind !== 'smoothConcrete' && top.kind !== 'roughConcrete')) continue;
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const q of top.poly) { bx0 = Math.min(bx0, q.x); by0 = Math.min(by0, q.y); bx1 = Math.max(bx1, q.x); by1 = Math.max(by1, q.y); }
        if ((bx1 - bx0) * (by1 - by0) >= 400 && Math.min(bx1 - bx0, by1 - by0) > 6) continue;
        if (r() < 0.5) {
          // Hopscotch: a column of squares up the footway, two side by side now and then.
          for (let i = 0; i < 6; i++) {
            const o = { x: c.x + ux * (i * 0.95 - 2.4), y: c.y + uy * (i * 0.95 - 2.4) };
            const squares = i === 2 || i === 5 ? [-0.5, 0.5] : [0];
            for (const q of squares) {
              const s0 = { x: o.x + nx * q * 0.95, y: o.y + ny * q * 0.95 };
              const cs = [
                { x: s0.x - ux * 0.42 - nx * 0.42, y: s0.y - uy * 0.42 - ny * 0.42 }, { x: s0.x + ux * 0.42 - nx * 0.42, y: s0.y + uy * 0.42 - ny * 0.42 },
                { x: s0.x + ux * 0.42 + nx * 0.42, y: s0.y + uy * 0.42 + ny * 0.42 }, { x: s0.x - ux * 0.42 + nx * 0.42, y: s0.y - uy * 0.42 + ny * 0.42 },
              ];
              for (let j = 0; j < 4; j++) out.chalk.push({ c, poly: bar(cs[j], cs[(j + 1) % 4], 0.07) });
            }
          }
        } else {
          // A sun: a ring of short rays.
          for (let i = 0; i < 9; i++) {
            const ang = (i / 9) * Math.PI * 2 + r() * 0.2;
            out.chalk.push({ c, poly: bar({ x: c.x + Math.cos(ang) * 0.35, y: c.y + Math.sin(ang) * 0.35 }, { x: c.x + Math.cos(ang) * (0.7 + r() * 0.3), y: c.y + Math.sin(ang) * (0.7 + r() * 0.3) }, 0.09) });
          }
        }
      }
    }
  }

  // Street-name blades where one named street runs into another.
  const streets = data.streets ?? [];
  const dirAt = (pts: Vec2[], q: Vec2) => {
    let best = Infinity, rot = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = segDist(q.x, q.y, pts[i - 1], pts[i]);
      if (d < best) { best = d; rot = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x); }
    }
    return { best, rot };
  };
  /*
   * Streets are authored as named runs that stop short of the street they
   * join, with the corner itself laid separately. So a junction is a street
   * ending near, and square to, another one — and its sign goes where that
   * street would meet it.
   */
  const junctions: Array<{ at: Vec2; a: typeof streets[number]; b: typeof streets[number] }> = [];
  for (const A of streets) {
    const n = A.pts.length;
    if (n < 2) continue;
    for (const [end, prev] of [[A.pts[0], A.pts[1]], [A.pts[n - 1], A.pts[n - 2]]] as const) {
      const dl = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
      const ux = (end.x - prev.x) / dl, uy = (end.y - prev.y) / dl;
      let best: { at: Vec2; B: typeof streets[number]; d: number } | null = null;
      for (const B of streets) {
        if (B === A || B.name === A.name) continue;
        for (let m = 1; m < B.pts.length; m++) {
          const p0 = B.pts[m - 1], p1 = B.pts[m];
          const bl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          const bx = (p1.x - p0.x) / bl, by = (p1.y - p0.y) / bl;
          if (Math.abs(ux * bx + uy * by) > 0.5) continue;      // not square to it
          const t = clamp((end.x - p0.x) * bx + (end.y - p0.y) * by, 0, bl);
          const q = { x: p0.x + bx * t, y: p0.y + by * t };
          const d = Math.hypot(q.x - end.x, q.y - end.y);
          // Ahead of the street's end, not behind it.
          if (d > 48 || (q.x - end.x) * ux + (q.y - end.y) * uy < d * 0.8 - 2) continue;
          if (!best || d < best.d) best = { at: q, B, d };
        }
      }
      if (best && !junctions.some((x) => Math.hypot(x.at.x - best!.at.x, x.at.y - best!.at.y) < 14)) {
        junctions.push({ at: best.at, a: A, b: best.B });
      }
    }
  }
  for (const jn of junctions) {
    const ra = dirAt(jn.a.pts, jn.at).rot, rb = dirAt(jn.b.pts, jn.at).rot;
    const w = Math.max(...edges.filter(({ a, b }) => segDist(jn.at.x, jn.at.y, a, b) < 6).map(({ e }) => e.width), 7) / 2;
    // Stand it on whichever corner is clear: out past both kerbs and both
    // footways, on the verge. No clear corner, no sign.
    let at: Vec2 | null = null;
    const reach = w + 2.2 + 0.7;
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      if (at) break;
      const c = {
        x: jn.at.x + Math.cos(ra + Math.PI / 2) * sa * reach + Math.cos(rb + Math.PI / 2) * sb * reach,
        y: jn.at.y + Math.sin(ra + Math.PI / 2) * sa * reach + Math.sin(rb + Math.PI / 2) * sb * reach,
      };
      if (!inBuilding(c, 0.6) && !onRoad(c, 2.4) && !onModelled(c, 0.3) && !nearThing(c, 1.0)) at = c;
    }
    if (at) out.signs.push({ at, blades: [{ name: jn.a.name, rot: ra }, { name: jn.b.name, rot: rb }] });
  }
  streetCache.set(data, out);
  return out;
}

const terminals = new WeakMap<object, Map<string, { at: Vec2; rot: number } | null>>();
/** Where a node's cabinet stands, facing the nearest street; null inside a building. */
export function terminalFor(data: WorldData, id: string, pos: Vec2): { at: Vec2; rot: number } | null {
  let m = terminals.get(data);
  if (!m) { m = new Map(); terminals.set(data, m); }
  if (m.has(id)) return m.get(id)!;
  /*
   * A node is authored where it sits on the network, which is often the
   * middle of the street. The cabinet stands on the nearest verge instead,
   * just past the footway and well inside the reach for reading it, and faces
   * the road it serves.
   */
  let t: { at: Vec2; rot: number } | null = null;
  const nodes = new Map(data.roadNodes.map((r) => [r.id, r.pos]));
  let best = Infinity;
  let near: { q: Vec2; nx: number; ny: number; hw: number } | null = null;
  for (const e of data.roadEdges) {
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const u = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / (l * l)));
    const q = { x: a.x + dx * u, y: a.y + dy * u };
    const d = Math.hypot(pos.x - q.x, pos.y - q.y);
    if (d < best) { best = d; near = { q, nx: -dy / l, ny: dx / l, hw: e.width / 2 }; }
  }
  const blocked = (c: Vec2) => data.buildings.some((b) => pointInPoly(c, b.poly) || polyDist(c, b.poly) < 0.7)
    || data.props.some((p) => Math.hypot(p.pos.x - c.x, p.pos.y - c.y) < 1.2)
    || data.features.some((f) => pointInPoly(c, f.poly) || polyDist(c, f.poly) < 0.8)
    || data.surfaces.some((sf) => sf.modelled && (pointInPoly(c, sf.poly) || polyDist(c, sf.poly) < 0.5));
  if (near && best < 12) {
    const pref = (pos.x - near.q.x) * near.nx + (pos.y - near.q.y) * near.ny >= 0 ? 1 : -1;
    for (const side of [pref, -pref]) {
      const off = near.hw + 2.2 + 0.7;
      const c = { x: near.q.x + near.nx * side * off, y: near.q.y + near.ny * side * off };
      if (!blocked(c)) { t = { at: c, rot: Math.atan2(-near.ny * side, -near.nx * side) }; break; }
    }
  }
  m.set(id, t);
  return t;
}

const fenceHeights = new WeakMap<Prop, number>();
function fenceHeight(sim: Sim, p: Prop): number {
  let h = fenceHeights.get(p);
  if (h === undefined) {
    h = 1.9;
    for (const o of sim.world.data.occluders) {
      if (Math.hypot((o.a.x + o.b.x) / 2 - p.pos.x, (o.a.y + o.b.y) / 2 - p.pos.y) < 0.05) { h = o.height; break; }
    }
    fenceHeights.set(p, h);
  }
  return h;
}

/** Convex hull, monotone chain, anticlockwise. */
function hull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Vec2[] = [], hi: Vec2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

function pointInPoly(q: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polyDist(q: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, segDist(q.x, q.y, poly[j], poly[i]));
  return best;
}


function segDist(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

/**
 * The page for a mood (mood.ts): the paper, the sky's rules, the wash.
 *
 * Owned (control > 0): the paper goes down toward a cold slate, the rules
 * come closer and darker, and the multiply wash takes everything with it.
 * Lit (control < 0): the paper warms and brightens a touch, and the rules
 * thin out. In between is the ordinary afternoon the rest of this file was
 * drawn for.
 */
interface Page {
  owned: number; lit: number;
  paper: string; paperShade: string;
  rules: number; ruleAlpha: number;
  /** The multiply wash over the whole page while owned: white at 0. */
  wash: string;
}
function pageFor(control: number): Page {
  const owned = clamp01(control), lit = clamp01(-control);
  return {
    owned, lit,
    paper: owned > 0 ? mix(PRINT.paper, '#6A6C72', owned * 0.55) : mix(PRINT.paper, '#F5ECD4', lit * 0.85),
    paperShade: owned > 0 ? mix(PRINT.paperShade, '#4A4B50', owned * 0.5) : mix(PRINT.paperShade, '#9C9A84', lit * 0.5),
    rules: Math.round(6 + owned * 5 - lit * 3),
    ruleAlpha: 0.5 + owned * 0.3 - lit * 0.2,
    wash: mix('#FFFFFF', '#A9AEB8', owned * 0.85),
  };
}
