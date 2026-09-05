/**
 * Touch input.
 *
 * The gesture engine below is pure: it takes normalised pointer samples and a
 * viewport, and produces an `Intent` plus the state the renderer needs to draw
 * the controls. No DOM, no timers, no globals — so every gesture in the game
 * can be unit-tested by feeding it a synthetic trace.
 *
 * The vocabulary was rebuilt after a human played it twice.
 *
 * It used to be a relative stick: horizontal offset steered a heading, vertical
 * offset was a throttle, and an upward flick was an ollie. Every part of that
 * asked the player to model something invisible — where the anchor was, which
 * way the board was pointing, how fast a flick had to be — and the verdict
 * after tuning it was "a tiny bit better but still not fun or intuitive."
 *
 * So: the left thumb is a direction, not a rudder. Push it where you want to
 * go and the character goes there; how far you push is how fast. Everything
 * else that used to be a hidden gesture is now a button you can see. There is
 * nothing left to discover by accident.
 */
import { type Intent, emptyIntent } from './input';
import { clamp01 } from './math';

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface PointerSample {
  id: number;
  /** CSS pixels, relative to the viewport. */
  x: number;
  y: number;
  /** Milliseconds. Monotonic; supplied by the caller so the engine stays pure. */
  t: number;
}

export interface Viewport {
  w: number;
  h: number;
  /** Safe-area insets in CSS pixels. */
  safe: { top: number; right: number; bottom: number; left: number };
}

export const TOUCH_TUNING = {
  /** Fraction of the viewport width given to the movement thumb. */
  padWidth: 0.55,
  /** Fraction of the viewport height, from the bottom, that accepts a thumb. */
  padHeight: 0.55,
  /**
   * The stick reaches full deflection this far from where it was planted.
   *
   * Longer than it was. The response curve in the simulation is what stops the
   * board being twitchy; the throw is what gives a thumb somewhere to be
   * gentle. Shortening the travel to calm the steering would have done the
   * opposite of what it looks like — less room for nuance, not more.
   */
  stickFull: 84,
  /** Inside this, the thumb is resting rather than steering. */
  stickDead: 6,
  /** Below this magnitude the character coasts instead of pushing. */
  moveThreshold: 0.16,
  /** Buttons: radius, and the gaps between their centres in the cluster. */
  buttonRadius: 32,
  buttonGap: 78,
  /** A tap: short, and barely moved. */
  tapMs: 240,
  tapSlop: 14,
  /*
   * Aiming: the left thumb drags the slingshot. That is the whole of it.
   *
   * It was a rate stick before — an invisible anchor, a dead zone, a squared
   * response curve and a radians-per-second ceiling — and every one of those
   * is a thing the player has to model before they can point at anything. A
   * human called the result "too complicated", which is the correct word for
   * an aim you have to learn the transfer function of.
   *
   * A drag has no transfer function to learn. The sling goes where the thumb
   * goes, linearly, at the same rate everywhere on the glass, with no anchor
   * to remember and no threshold to cross. Lifting the thumb and putting it
   * down somewhere else moves nothing, because only the *change* is read —
   * which is also why nothing the other thumb does can ever shift the aim.
   */
  aimYawPerPixel: 0.0045,
  aimPitchPerPixel: 0.0035,
  /** Fraction of the width given to the thumb that holds the sling. */
  aimPadWidth: 0.5,
  /** Pull this far back from the grab for a full draw. */
  pullFull: 118,
  pullMin: 14,
};

export type TouchRole = 'stick' | 'sling' | 'trick' | 'aim' | 'pull' | 'idle';

interface Track {
  id: number;
  role: TouchRole;
  start: { x: number; y: number; t: number };
  /** Where the stick was planted. Floats if the thumb runs out of room. */
  anchor: { x: number; y: number };
  cur: { x: number; y: number; t: number };
  moved: number;
}

export interface ControlButton {
  id: 'sling' | 'trick';
  pos: { x: number; y: number };
  radius: number;
  pressed: boolean;
  /** Dimmed when the action is unavailable. */
  enabled: boolean;
}

/** What the renderer needs in order to draw the controls. */
export interface ControlVisual {
  /** Where a left thumb is expected to land, for the cold-start affordance. */
  home: { x: number; y: number };
  stick: {
    active: boolean;
    anchor: { x: number; y: number };
    thumb: { x: number; y: number };
    /** Screen-space direction, magnitude 0..1. */
    vector: { x: number; y: number };
  };
  buttons: ControlButton[];
  aiming: boolean;
}

export class TouchEngine {
  private tracks = new Map<number, Track>();
  private viewport: Viewport = { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private pendingTap: { x: number; y: number } | null = null;
  private pendingSkip = false;
  private pendingTrick = false;
  private pendingAimMode = false;
  private pendingFire = false;
  /**
   * Screen pixels the aiming thumb has dragged since the last frame read it.
   *
   * Accumulated as the events arrive — coalesced samples included — rather
   * than sampled from a position once a frame, so a burst of pointer moves
   * turns into one smooth sweep instead of a jump.
   */
  private aimDrag = { x: 0, y: 0 };
  /** The draw at the moment of release, so the shot frame still has it. */
  private firedDraw = 0;
  private aiming = false;
  private canSling = true;
  readonly tuning = { ...TOUCH_TUNING };

  /** True while any finger is on the screen; used to keep audio awake. */
  get engaged(): boolean { return this.tracks.size > 0; }

  setViewport(v: Viewport): void { this.viewport = v; }

  /** The engine speaks a different vocabulary while a shot is being lined up. */
  setAiming(on: boolean): void {
    if (this.aiming === on) return;
    this.aiming = on;
    this.tracks.clear();
    // A drag half-made under the old vocabulary must not arrive as a swing of
    // the aim under the new one.
    this.aimDrag.x = 0;
    this.aimDrag.y = 0;
  }

  setSlingAvailable(on: boolean): void { this.canSling = on; }

  reset(): void {
    this.tracks.clear();
    this.pendingTap = null;
    this.pendingTrick = false;
    this.pendingAimMode = false;
    this.pendingFire = false;
    this.aimDrag.x = 0;
    this.aimDrag.y = 0;
  }

  /**
   * Two buttons, in the bottom-right corner.
   *
   * There were four once, then three. POP went because the TRICK button pops
   * on its own. The eye went because VISION is not a thing the HUD is allowed
   * to grow a control for on its own: it appeared mid-session the moment the
   * story unlocked it, which is a control materialising in front of somebody
   * who was skating, and it is exactly the kind of thing this pass exists to
   * stop. Two buttons is the whole of the right thumb's vocabulary.
   */
  buttonLayout(): ControlButton[] {
    const { w, h, safe } = this.viewport;
    const r = this.tuning.buttonRadius;
    const right = w - safe.right - r - 26;
    const left = right - this.tuning.buttonGap;
    const low = h - safe.bottom - r - 24;

    return [
      { id: 'sling', pos: { x: right, y: low }, radius: r, pressed: false, enabled: this.canSling },
      { id: 'trick', pos: { x: left, y: low }, radius: r, pressed: false, enabled: true },
    ];
  }

  /**
   * The half of the glass the band is pulled in: the right one.
   *
   * Aiming and shooting used to be the same thumb's problem — drag anywhere to
   * look, and grab a small rectangle in the bottom-left to draw. Two jobs, one
   * hand, and a sling that had to be found. They are two hands now: the left
   * one holds and points the sling, the right one draws and lets go, and each
   * gets a whole half of the screen so there is nothing to find.
   */
  slingZone(): { x: number; y: number; w: number; h: number } {
    const { w, h, safe } = this.viewport;
    const x = w * this.tuning.aimPadWidth;
    return { x, y: safe.top, w: w - safe.right - x, h: h - safe.top - safe.bottom };
  }

  /** Which zone does a screen point belong to? */
  zoneAt(x: number, y: number): TouchRole {
    if (this.aiming) {
      /*
       * A hard line down the middle of the glass, and it never moves.
       *
       * This is the whole of the input requirement: the side a finger lands on
       * decides what that finger is, once, and nothing afterwards reassigns
       * it. The left thumb holds the sling and points it until the left thumb
       * is lifted. The right one draws and fires. Letting go of either cannot
       * promote or re-target the other, because roles are per-pointer and
       * neither reads anything but its own movement.
       */
      return x < this.viewport.w * this.tuning.aimPadWidth ? 'aim' : 'pull';
    }
    for (const b of this.buttonLayout()) {
      /*
       * A generous target, but not in every direction: a thumb is eleven
       * millimetres wide, so the buttons grow outward toward the corner they
       * live in and stay tight on the side facing the movement pad. Otherwise
       * the left column's forgiveness reaches across into the stick's half of
       * the screen and eats thumbs that were trying to skate.
       */
      const dx = x - b.pos.x;
      const dy = y - b.pos.y;
      const kx = dx < 0 ? 1.08 : 1.35;
      const ky = dy < 0 ? 1.15 : 1.35;
      if (Math.hypot(dx / kx, dy / ky) <= b.radius) return b.id;
    }
    const { w, h, safe } = this.viewport;
    const bottom = h - safe.bottom;
    const padTop = bottom - h * this.tuning.padHeight;
    if (y < padTop) return 'idle';
    return x < w * this.tuning.padWidth ? 'stick' : 'idle';
  }

  handle(phase: PointerPhase, s: PointerSample): void {
    if (phase === 'down') return this.onDown(s);
    const track = this.tracks.get(s.id);
    if (!track) return;
    if (phase === 'move') return this.onMove(track, s);
    return this.onRelease(track, s, phase === 'cancel');
  }

  private onDown(s: PointerSample): void {
    let role = this.zoneAt(s.x, s.y);
    // One of each at a time; a second thumb on the same side does nothing.
    // A stray palm must never be able to take over a job a thumb is doing.
    if ((role === 'stick' || role === 'aim' || role === 'pull')
      && [...this.tracks.values()].some((t) => t.role === role)) role = 'idle';
    if (role === 'sling' && !this.canSling) role = 'idle';

    this.tracks.set(s.id, {
      id: s.id, role,
      start: { x: s.x, y: s.y, t: s.t },
      anchor: { x: s.x, y: s.y },
      cur: { x: s.x, y: s.y, t: s.t },
      moved: 0,
    });
  }

  private onMove(track: Track, s: PointerSample): void {
    const prev = track.cur;
    track.cur = { x: s.x, y: s.y, t: s.t };
    track.moved = Math.max(track.moved, Math.hypot(s.x - track.start.x, s.y - track.start.y));

    if (track.role === 'pull') return;   // read from its position on sample()

    if (track.role === 'aim') {
      // Only the change. Where the thumb happens to be on the glass means
      // nothing, which is what makes lifting and re-placing it free.
      this.aimDrag.x += s.x - prev.x;
      this.aimDrag.y += s.y - prev.y;
      return;
    }

    if (track.role === 'stick') {
      // The anchor follows a thumb that has run out of room, so the stick can
      // never be pinned to an unreachable corner of the screen.
      const dx = s.x - track.anchor.x;
      const dy = s.y - track.anchor.y;
      const limit = this.tuning.stickFull * 1.3;
      const d = Math.hypot(dx, dy);
      if (d > limit) {
        track.anchor.x = s.x - (dx / d) * limit;
        track.anchor.y = s.y - (dy / d) * limit;
      }
    }
  }

  private onRelease(track: Track, s: PointerSample, cancelled: boolean): void {
    this.tracks.delete(track.id);
    const held = s.t - track.start.t;
    const isTap = !cancelled && held <= this.tuning.tapMs && track.moved <= this.tuning.tapSlop;

    switch (track.role) {
      case 'aim':
        // Pointing the sling is pointing the sling. A tap — no drag at all —
        // is the way back out of the mode, and it is the only thing the left
        // thumb can do besides aim. It can never fire.
        if (!cancelled && isTap) this.pendingAimMode = true;
        break;
      case 'pull': {
        if (cancelled) break;
        // Letting go of a loaded sling is the shot. Letting go of one that was
        // never drawn is putting it down again.
        const pull = Math.hypot(s.x - track.start.x, s.y - track.start.y);
        if (pull > this.tuning.pullMin) {
          this.firedDraw = clamp01((pull - this.tuning.pullMin) / (this.tuning.pullFull - this.tuning.pullMin));
          this.pendingFire = true;
        }
        break;
      }
      case 'sling':
        if (isTap) this.pendingAimMode = true;
        break;
      case 'trick':
        if (isTap) this.pendingTrick = true;
        break;
      case 'idle':
        if (isTap) { this.pendingTap = { x: s.x, y: s.y }; this.pendingSkip = true; }
        break;
      case 'stick':
        if (isTap) this.pendingSkip = true;
        break;
      default:
        break;
    }
  }

  private get stickTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'stick') return t;
    return undefined;
  }

  private get aimTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'aim') return t;
    return undefined;
  }

  private get pullTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'pull') return t;
    return undefined;
  }

  /** Consume this frame's gestures as an Intent. Clears all edge state. */
  sample(): Intent {
    const i = emptyIntent();
    const t = this.tuning;

    if (this.aiming) {
      const pull = this.pullTrack;
      if (pull) {
        // Tension is how far back the thumb has come from where it grabbed.
        const dx = pull.cur.x - pull.start.x;
        const dy = pull.cur.y - pull.start.y;
        const d = Math.hypot(dx, dy);
        i.aim = true;
        i.drawAmount = clamp01((d - t.pullMin) / (t.pullFull - t.pullMin));
        /*
         * And that is all the right thumb does.
         *
         * It used to swing the shot by a few degrees as well — a sling pulled
         * left throws right — which was true to a slingshot and wrong for two
         * thumbs: the hand that charges the shot was quietly moving the aim
         * the other hand had set, and letting go of it moved the aim back.
         * Aiming belongs to the left thumb, entirely, at all times.
         */
      } else {
        // Not holding the sling: the band is slack and nothing is loaded.
        i.aim = true;
        i.drawAmount = 0;
      }
      if (this.pendingFire) {
        // The release frame still has to describe a loaded sling, because the
        // simulation only fires while the character is actually drawing.
        i.drawAmount = Math.max(i.drawAmount ?? 0, this.firedDraw);
        i.fire = true;
        i.firePressed = true;
        this.pendingFire = false;
      }
      if (this.pendingAimMode) { i.aimModePressed = true; this.pendingAimMode = false; }
      if (this.pendingSkip) { i.skip = true; this.pendingSkip = false; }
      return i;
    }

    const stick = this.stickTrack;
    if (stick) {
      const dx = stick.cur.x - stick.anchor.x;
      const dy = stick.cur.y - stick.anchor.y;
      const d = Math.hypot(dx, dy);
      if (d > t.stickDead) {
        const mag = clamp01((d - t.stickDead) / (t.stickFull - t.stickDead));
        i.moveVector = { x: (dx / d) * mag, y: (dy / d) * mag };
        if (mag > t.moveThreshold) { i.push = true; i.pushPressed = true; }
      } else {
        // A thumb resting on the stick still rolls: the first thing anybody
        // does is put a finger down and wait to see what happens.
        i.moveVector = { x: 0, y: 0 };
        i.push = true;
        i.pushPressed = true;
      }
    }

    if (this.pendingTrick) { i.trickPressed = true; this.pendingTrick = false; }
    if (this.pendingAimMode) { i.aimModePressed = true; this.pendingAimMode = false; }
    if (this.pendingSkip) { i.skip = true; this.pendingSkip = false; }
    return i;
  }

  /**
   * How far the sling has been dragged since this was last asked, in radians.
   *
   * Consumed, not sampled: the caller gets every pixel the thumb travelled
   * between frames exactly once, so a burst of pointer events becomes a smooth
   * sweep and a dropped frame loses nothing. There is no rate, no dead zone
   * and no anchor — drag it and it moves, stop and it stops.
   */
  takeAimDrag(): { yaw: number; pitch: number } {
    const t = this.tuning;
    const out = {
      yaw: this.aimDrag.x * t.aimYawPerPixel,
      // Screen up is -y, and pushing the sling up points it up. Subtracted
      // rather than negated so a still thumb reports +0 and not -0.
      pitch: 0 - this.aimDrag.y * t.aimPitchPerPixel,
    };
    this.aimDrag.x = 0;
    this.aimDrag.y = 0;
    return out;
  }

  /** Where the hand holding the sling is, for drawing it. Null when let go. */
  get slingHand(): { x: number; y: number } | null {
    const a = this.aimTrack;
    return a ? { x: a.cur.x, y: a.cur.y } : null;
  }

  /** Where the sling is being held and pulled to, for drawing it. */
  get slingGrip(): { grab: { x: number; y: number }; thumb: { x: number; y: number }; draw: number } | null {
    const p = this.pullTrack;
    if (!p) return null;
    const d = Math.hypot(p.cur.x - p.start.x, p.cur.y - p.start.y);
    return {
      grab: { x: p.start.x, y: p.start.y },
      thumb: { x: p.cur.x, y: p.cur.y },
      draw: clamp01((d - this.tuning.pullMin) / (this.tuning.pullFull - this.tuning.pullMin)),
    };
  }

  /** A world-space tap the caller should resolve against the network. */
  takeTap(): { x: number; y: number } | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  homePoint(): { x: number; y: number } {
    const { w, h, safe } = this.viewport;
    return {
      x: safe.left + (w - safe.left - safe.right) * 0.20,
      y: h - safe.bottom - Math.min(150, h * 0.20),
    };
  }

  get visual(): ControlVisual {
    const stick = this.stickTrack;
    const t = this.tuning;
    let vector = { x: 0, y: 0 };
    if (stick) {
      const dx = stick.cur.x - stick.anchor.x;
      const dy = stick.cur.y - stick.anchor.y;
      const d = Math.hypot(dx, dy);
      if (d > t.stickDead) {
        const mag = clamp01((d - t.stickDead) / (t.stickFull - t.stickDead));
        vector = { x: (dx / d) * mag, y: (dy / d) * mag };
      }
    }
    const held = new Set([...this.tracks.values()].map((x) => x.role));
    return {
      home: this.homePoint(),
      stick: {
        active: !!stick,
        anchor: stick ? { x: stick.anchor.x, y: stick.anchor.y } : { x: 0, y: 0 },
        thumb: stick ? { x: stick.cur.x, y: stick.cur.y } : { x: 0, y: 0 },
        vector,
      },
      buttons: this.buttonLayout().map((b) => ({ ...b, pressed: held.has(b.id) })),
      aiming: this.aiming,
    };
  }
}

/**
 * The DOM half. Deliberately thin: it normalises Pointer Events and hands them
 * to the engine, so everything worth testing lives above this line.
 */
export class TouchAdapter {
  private detach: Array<() => void> = [];

  constructor(readonly engine: TouchEngine) {}

  /**
   * Bound at the window, not the canvas: the advertisement and the phone HUD
   * are layered above the world, and a thumb landing on them is still a thumb.
   * Genuine controls opt out below.
   */
  attach(el: HTMLElement | Window = window): void {
    const target = el as HTMLElement;
    const relevant = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
    const interactive = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.('button, input, label, a, .go, .verb');

    const down = (e: PointerEvent) => {
      if (!relevant(e) || interactive(e)) return;
      e.preventDefault();
      this.engine.handle('down', { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
    };
    const move = (e: PointerEvent) => {
      if (!relevant(e) || interactive(e)) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const c of events.length ? events : [e]) {
        this.engine.handle('move', { id: e.pointerId, x: c.clientX, y: c.clientY, t: c.timeStamp });
      }
    };
    const up = (e: PointerEvent) => {
      if (!relevant(e) || interactive(e)) return;
      e.preventDefault();
      this.engine.handle('up', { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
    };
    const cancel = (e: PointerEvent) => {
      if (!relevant(e)) return;
      this.engine.handle('cancel', { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
    };
    const lost = () => this.engine.reset();

    const opts: AddEventListenerOptions = { passive: false };
    target.addEventListener('pointerdown', down as EventListener, opts);
    target.addEventListener('pointermove', move as EventListener, opts);
    target.addEventListener('pointerup', up as EventListener, opts);
    target.addEventListener('pointercancel', cancel as EventListener, opts);
    window.addEventListener('blur', lost);

    this.detach.push(() => {
      target.removeEventListener('pointerdown', down as EventListener);
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerup', up as EventListener);
      target.removeEventListener('pointercancel', cancel as EventListener);
      window.removeEventListener('blur', lost);
    });
  }

  dispose(): void { for (const d of this.detach) d(); this.detach = []; }
}

/** Are we on a device where touch is the primary way in? */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? ('ontouchstart' in window);
}
