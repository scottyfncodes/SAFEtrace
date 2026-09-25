/**
 * Input -> intent. The simulation only ever sees `Intent`, so remapping,
 * hold-vs-toggle, and gamepad support cost the sim nothing.
 */
import { clamp, clamp01 } from './math';

export interface Intent {
  /** -1 left .. +1 right */
  steer: number;
  push: boolean;
  pushPressed: boolean;
  brake: boolean;
  ollieHeld: boolean;
  olliePressed: boolean;
  ollieReleased: boolean;
  /** One press, one trick. Which trick is not the input layer's business. */
  trickPressed: boolean;
  /** One press, one grab. Which grab — same as a trick — is not this layer's business. */
  grabPressed: boolean;
  toggleStance: boolean;
  aim: boolean;
  fire: boolean;
  firePressed: boolean;
  /**
   * Hold the plan view open.
   *
   * Named for what it is: a *view*, available from the first frame on every
   * device. SAFEtrace VISION is the story unlock that changes what is drawn
   * inside it, and it is deliberately not this flag — conflating the two is
   * what grew a button on the HUD halfway through a session.
   */
  planView: boolean;
  interact: boolean;
  interactPressed: boolean;
  /** Aim target in screen pixels; the renderer converts to world space. */
  pointer: { x: number; y: number };
  pointerActive: boolean;
  /**
   * Screen-space unit direction to aim along, from the player. Touch supplies
   * this because a drawn slingshot has a direction rather than a cursor;
   * pointer devices leave it null and supply `pointer` instead.
   */
  aimVector: { x: number; y: number } | null;
  /**
   * How far the slingshot is drawn, 0..1. `null` means the device has no
   * continuous draw axis, so the character loads it at their own rate.
   */
  drawAmount: number | null;
  /**
   * A direction to travel in, in screen space, with magnitude 0..1.
   *
   * This is the difference between steering a vehicle and moving a person. A
   * stick that says "turn left" needs the player to model the character's
   * heading before they can go anywhere; a stick that says "that way" does not.
   * Devices with an absolute stick supply this; a keyboard supplies `steer`.
   */
  moveVector: { x: number; y: number } | null;
  /**
   * A drawn sling, as a drag: screen pixels from where the pull started back
   * to where the hand is now, *reversed* — so it points the way the stone
   * will go. Its length is the pull. Null when nothing is being dragged back.
   */
  throwVector: { x: number; y: number } | null;
  /**
   * The height of the thing being aimed at, in world metres, when the host
   * has cast the aim into the world and found something to aim at — a lens
   * on a pole, a drone, a bin, the road. Null means aim at the ground.
   */
  aimHeight: number | null;
  /** Requests to enter or leave the stationary aiming mode. */
  aimModePressed: boolean;
  skip: boolean;
}

export const emptyIntent = (): Intent => ({
  steer: 0, push: false, pushPressed: false, brake: false,
  ollieHeld: false, olliePressed: false, ollieReleased: false, trickPressed: false,
  grabPressed: false,
  toggleStance: false, aim: false, fire: false, firePressed: false,
  planView: false, interact: false, interactPressed: false,
  pointer: { x: 0, y: 0 }, pointerActive: false,
  aimVector: null, drawAmount: null, moveVector: null,
  throwVector: null, aimHeight: null,
  aimModePressed: false, skip: false,
});

/**
 * Fold one intent into another. Adapters are additive: a player may hold a key
 * while touching the screen, and neither should cancel the other.
 */
export function mergeIntent(base: Intent, add: Intent): Intent {
  base.steer = Math.abs(add.steer) > Math.abs(base.steer) ? add.steer : base.steer;
  base.push ||= add.push;
  base.pushPressed ||= add.pushPressed;
  base.brake ||= add.brake;
  base.ollieHeld ||= add.ollieHeld;
  base.olliePressed ||= add.olliePressed;
  base.ollieReleased ||= add.ollieReleased;
  base.trickPressed ||= add.trickPressed;
  base.grabPressed ||= add.grabPressed;
  base.toggleStance ||= add.toggleStance;
  base.aim ||= add.aim;
  base.fire ||= add.fire;
  base.firePressed ||= add.firePressed;
  base.planView ||= add.planView;
  base.interact ||= add.interact;
  base.interactPressed ||= add.interactPressed;
  base.skip ||= add.skip;
  if (add.pointerActive) { base.pointer = add.pointer; base.pointerActive = true; }
  if (add.aimVector) base.aimVector = add.aimVector;
  if (add.drawAmount !== null) base.drawAmount = add.drawAmount;
  if (add.moveVector) base.moveVector = add.moveVector;
  if (add.throwVector) base.throwVector = add.throwVector;
  if (add.aimHeight !== null) base.aimHeight = add.aimHeight;
  base.aimModePressed ||= add.aimModePressed;
  return base;
}

export interface InputOptions {
  holdToAim: boolean;
  holdForPlanView: boolean;
  /**
   * Whether a left-button drag is read as pulling a sling back. Off while the
   * first-person view is up, where the mouse is looking rather than pulling.
   */
  dragThrow: boolean;
}

/** A mouse drag shorter than this is a point-and-hold, not a pull. */
export const MOUSE_PULL_MIN = 14;
/** A mouse pull this long is a full draw. */
export const MOUSE_PULL_FULL = 150;

const CODE = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  push: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  ollie: ['Space'],
  trick: ['KeyR'],
  grab: ['KeyG'],
  stance: ['ShiftLeft', 'ShiftRight'],
  planView: ['KeyQ'],
  interact: ['KeyE'],
  /**
   * Stand still and line up a shot: the same state a thumb reaches with the
   * sling button, so both devices exercise the same thing.
   */
  aimMode: ['KeyF'],
  skip: ['Escape', 'Enter'],
};

export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouse = { x: 0, y: 0, left: false, right: false, active: false };
  /** Mouse travel since the last read, for looking while the sling is up. */
  private look = { x: 0, y: 0 };
  private planViewToggle = false;
  private planWasDown = false;
  private planHeldFrames = 0;

  /** The plan was closed from somewhere else (a menu, a scene, a thumb). */
  setPlanOpen(on: boolean): void { this.planViewToggle = on; }
  private aimToggle = false;
  /** Whether the draw control was held last frame, so a release can be seen. */
  private wasDrawing = false;
  readonly options: InputOptions = { holdToAim: true, holdForPlanView: true, dragThrow: true };
  /** Where the left button went down, for reading a drag back as a pull. */
  private press: { x: number; y: number } | null = null;
  /** Where the gamepad's right stick is pointing a throw, while it is. */
  private padAim: { x: number; y: number } | null = null;
  /** The last pull, so the release frame still knows which way it was. */
  private lastThrow: { x: number; y: number } | null = null;
  private detach: Array<() => void> = [];

  attach(target: HTMLElement | Window = window): void {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
    };
    const ku = (e: KeyboardEvent) => { this.down.delete(e.code); this.released.add(e.code); };
    const mm = (e: MouseEvent) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true;
      // A pointer-lock warp arrives as one enormous jump (and often its exact
      // opposite straight after). No hand moves a mouse 150 px in one event.
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) < 150 && Math.abs(my) < 150) { this.look.x += mx; this.look.y += my; }
    };
    const md = (e: MouseEvent) => {
      if (e.button === 0) { this.mouse.left = true; this.press = { x: e.clientX, y: e.clientY }; }
      if (e.button === 2) this.mouse.right = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    const blur = () => { this.down.clear(); this.mouse.left = false; this.mouse.right = false; };

    const t = target as Window;
    t.addEventListener('keydown', kd as EventListener);
    t.addEventListener('keyup', ku as EventListener);
    t.addEventListener('mousemove', mm as EventListener);
    t.addEventListener('mousedown', md as EventListener);
    t.addEventListener('mouseup', mu as EventListener);
    t.addEventListener('contextmenu', ctx);
    t.addEventListener('blur', blur);

    this.detach.push(() => {
      t.removeEventListener('keydown', kd as EventListener);
      t.removeEventListener('keyup', ku as EventListener);
      t.removeEventListener('mousemove', mm as EventListener);
      t.removeEventListener('mousedown', md as EventListener);
      t.removeEventListener('mouseup', mu as EventListener);
      t.removeEventListener('contextmenu', ctx);
      t.removeEventListener('blur', blur);
    });
  }

  dispose(): void { for (const d of this.detach) d(); this.detach = []; }

  /**
   * How far the mouse has travelled since this was last asked, in pixels.
   * Consumed, like the touch aim drag, so nothing is counted twice.
   */
  takeLook(): { x: number; y: number } {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return out;
  }

  /** A mouse pull in progress, for drawing the band: where it began and where the cursor is. */
  get pullLine(): { start: { x: number; y: number }; cur: { x: number; y: number } } | null {
    if (!this.mouse.left || !this.press || !this.lastThrow) return null;
    return { start: { ...this.press }, cur: { x: this.mouse.x, y: this.mouse.y } };
  }

  /** The right button: held, it turns the camera round the rider. */
  get rightHeld(): boolean { return this.mouse.right; }

  private any(codes: string[], set: Set<string>): boolean {
    for (const c of codes) if (set.has(c)) return true;
    return false;
  }

  private gamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) if (g && g.connected) return g;
    return null;
  }

  /** Produce this frame's intent and clear edge state. */
  sample(): Intent {
    const i = emptyIntent();
    const gp = this.gamepad();

    let steer = 0;
    if (this.any(CODE.left, this.down)) steer -= 1;
    if (this.any(CODE.right, this.down)) steer += 1;
    if (gp) {
      const ax = gp.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer += ax;
    }
    i.steer = clamp(steer, -1, 1);

    const gpBtn = (n: number) => !!gp?.buttons[n]?.pressed;

    i.push = this.any(CODE.push, this.down) || gpBtn(0);
    /*
     * Held, W keeps pushing — at the board's own rhythm, since a push cannot
     * land before the last one's cooldown. It used to take one stride and
     * then coast to a stop with the key still down, which read as the
     * control being broken; a thumb on the stick has always pushed while it
     * was held, so the two devices now agree. Tapping in time still works.
     */
    i.pushPressed = this.any(CODE.push, this.pressed) || i.push;
    i.brake = this.any(CODE.brake, this.down) || gpBtn(1);
    i.ollieHeld = this.any(CODE.ollie, this.down) || gpBtn(2);
    i.olliePressed = this.any(CODE.ollie, this.pressed);
    i.ollieReleased = this.any(CODE.ollie, this.released);
    i.trickPressed = this.any(CODE.trick, this.pressed);
    i.grabPressed = this.any(CODE.grab, this.pressed);
    i.toggleStance = this.any(CODE.stance, this.pressed) || gpBtn(3);
    i.interact = this.any(CODE.interact, this.down);
    i.interactPressed = this.any(CODE.interact, this.pressed);
    i.aimModePressed = this.any(CODE.aimMode, this.pressed);
    i.skip = this.any(CODE.skip, this.pressed);

    /*
     * A slingshot has one control: draw it back, let it go. This used to be
     * two — hold right mouse to draw, then click left to fire while right
     * was still held — a chord nobody would find without reading the source,
     * that the README never described, and that touch never asked for at
     * all: a thumb drags back and lifts, and lifting is the shot. Left mouse
     * (or the trigger) now does the whole job by itself, the same way.
     */
    const drawRaw = this.mouse.left || (gp ? (gp.buttons[7]?.value ?? 0) > 0.4 : false);
    const wasDrawing = this.wasDrawing;
    const drawPressed = drawRaw && !wasDrawing;
    this.wasDrawing = drawRaw;

    if (this.options.holdToAim) {
      // Hold to draw; the release is the shot. The release frame itself still
      // describes a drawn sling — the simulation only fires while the
      // character is holding one, and a frame that said "not aiming" at the
      // moment of letting go meant a mouse never threw anything on the move.
      i.firePressed = wasDrawing && !drawRaw;
      i.aim = drawRaw || i.firePressed;
    } else {
      // Click to draw, click again to let go — the toggle form of the same
      // one-control gesture: the second click both fires and ends the aim.
      i.firePressed = drawPressed && this.aimToggle;
      if (drawPressed) this.aimToggle = !this.aimToggle;
      i.aim = this.aimToggle;
    }
    i.fire = i.aim;

    /*
     * Point-and-hold, or pull back: the mouse does whichever the hand does.
     *
     * Held still, the stone goes where the cursor is and the draw loads on
     * its own clock. Dragged back more than a few pixels, it is the same
     * gesture a thumb makes on a phone: the drag reversed is the direction,
     * and its length is the draw.
     */
    if (this.options.dragThrow && this.press && (drawRaw || i.firePressed)) {
      const dx = this.press.x - this.mouse.x, dy = this.press.y - this.mouse.y;
      const len = Math.hypot(dx, dy);
      if (drawRaw && len > MOUSE_PULL_MIN) this.lastThrow = { x: dx, y: dy };
      else if (drawRaw) this.lastThrow = null;
      if (this.lastThrow) {
        i.throwVector = { ...this.lastThrow };
        const l = Math.hypot(this.lastThrow.x, this.lastThrow.y);
        i.drawAmount = clamp01((l - MOUSE_PULL_MIN) / (MOUSE_PULL_FULL - MOUSE_PULL_MIN));
      }
    }
    if (!drawRaw) { if (!i.firePressed) this.lastThrow = null; if (!this.mouse.left) this.press = null; }

    /*
     * A gamepad: the right stick points the throw, the way a pull does — its
     * direction is the direction, how far it is pushed is how far — and the
     * right trigger draws and lets go.
     */
    if (gp && this.options.dragThrow) {
      const rx = gp.axes[2] ?? 0, ry = gp.axes[3] ?? 0;
      const mag = Math.hypot(rx, ry);
      if (mag > 0.25) this.padAim = { x: (rx / mag) * Math.min(1, mag) * 150, y: (ry / mag) * Math.min(1, mag) * 150 };
      else if (!drawRaw && !i.firePressed) this.padAim = null;
      if (this.padAim && (drawRaw || i.firePressed) && !this.mouse.left && !i.throwVector) {
        i.throwVector = { ...this.padAim };
      }
    }

    /*
     * The plan: tap to open it, tap again to close it — or hold to peek, and
     * it closes when you let go. Both habits work, so nobody has to find out
     * which one this game wanted. (`holdForPlanView` off makes it tap-only.)
     */
    const planRaw = this.any(CODE.planView, this.down) || gpBtn(4);
    if (this.any(CODE.planView, this.pressed) || (planRaw && !this.planWasDown && gpBtn(4))) {
      this.planViewToggle = !this.planViewToggle;
      this.planHeldFrames = 0;
    }
    if (planRaw) this.planHeldFrames++;
    if (!planRaw && this.planWasDown && this.options.holdForPlanView && this.planHeldFrames > 20 && this.planViewToggle) {
      this.planViewToggle = false;
    }
    this.planWasDown = planRaw;
    i.planView = this.planViewToggle;

    i.pointer.x = this.mouse.x;
    i.pointer.y = this.mouse.y;
    i.pointerActive = this.mouse.active;

    this.pressed.clear();
    this.released.clear();
    return i;
  }
}

/**
 * Whether an intent is asking the character to go somewhere.
 *
 * A stick supplies a direction with a magnitude, and a thumb merely resting
 * on it reports "push" at zero magnitude; that is a thumb waiting, not a
 * player setting off. A keyboard has no magnitude, so a held key is the ask.
 */
export function movementAsked(i: Intent): boolean {
  if (i.moveVector && Math.hypot(i.moveVector.x, i.moveVector.y) > 0.3) return true;
  if (!i.moveVector && i.push) return true;
  return Math.abs(i.steer) > 0.1;
}

/**
 * When the plan puts itself away.
 *
 * The plan is where you stop and look: the board settles under you and the
 * map is yours to read. Leaving it used to be a second job — find PLAN again,
 * press it, then start doing the thing you had just decided to do. Now doing
 * the thing *is* leaving: set off, pop a trick, reach for the sling, and you
 * are back in the street in that same frame with the move already under way.
 *
 * One subtlety. A player who opens the plan while still holding the stick (or
 * W) has not asked to leave it — they were already moving. So movement only
 * counts once it has been let go at least once since the plan opened. The
 * tools need no such grace: nobody presses TRICK by accident of having been
 * holding it.
 */
export class PlanExit {
  private armed = false;

  /** True when the plan should close this frame. */
  update(open: boolean, i: Intent): boolean {
    if (!open) { this.armed = false; return false; }
    if (i.trickPressed || i.grabPressed || i.aimModePressed || i.olliePressed) return true;
    const moving = movementAsked(i);
    if (!moving) { this.armed = true; return false; }
    return this.armed;
  }
}
