/**
 * Touch input.
 *
 * The gesture engine below is pure: it takes normalised pointer samples and a
 * viewport, and produces an `Intent` plus the state the renderer needs to draw
 * the controls. No DOM, no timers, no globals — so every gesture in the game
 * can be unit-tested by feeding it a synthetic trace.
 *
 * The vocabulary, in one paragraph: the left thumb is the board. Carve with it,
 * push by holding it forward, brake by pulling it back, ollie with a flick up.
 * The right thumb is the slingshot: press, pull back away from the target, and
 * release. Put a second finger down on that side and the world comes apart —
 * which is why you cannot aim while you are looking at it.
 */
import { type Intent, emptyIntent } from './input';
import { clamp, clamp01 } from './math';

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
  /** Fraction of the viewport given to each thumb, measured from the bottom. */
  padWidth: 0.55,
  padHeight: 0.42,
  actionWidth: 0.45,
  /** Carve reaches full deflection this far from the anchor. */
  steerFull: 58,
  steerDead: 7,
  /** Forward of the anchor by this much is a push; behind it is a brake. */
  throttleDead: 12,
  throttleFull: 46,
  /** An ollie flick: this fast, this far, mostly upward, this recently. */
  ollieSpeed: 0.85,      // px per ms
  ollieDistance: 22,     // px of net upward travel
  ollieWindow: 150,      // ms the travel must happen within
  ollieVerticality: 0.72, // |dy| / length
  ollieCooldown: 260,    // ms between ollies from one touch
  /** A touch may not ollie until it has settled, so placing a thumb is safe. */
  ollieSettle: 110,
  /** Slingshot: draw reaches full at this pull distance. */
  drawFull: 96,
  drawMin: 16,
  /** Releasing inside this radius cancels instead of firing. */
  cancelRadius: 15,
  /** A tap: short, and barely moved. */
  tapMs: 220,
  tapSlop: 12,
  /** Two touches this close together in time count as a deliberate pair. */
  visionPairMs: 260,
};

export type TouchRole = 'steer' | 'action' | 'vision' | 'idle';

interface Track {
  id: number;
  role: TouchRole;
  start: { x: number; y: number; t: number };
  /** The steering anchor. Floats: it re-centres if the thumb drifts far. */
  anchor: { x: number; y: number };
  cur: { x: number; y: number; t: number };
  prev: { x: number; y: number; t: number };
  moved: number;
  lastOllieT: number;
  /** Recent samples, for flick detection. */
  history: Array<{ x: number; y: number; t: number }>;
}

/** What the renderer needs in order to draw the controls. */
export interface ControlVisual {
  pad: { active: boolean; anchor: { x: number; y: number }; thumb: { x: number; y: number }; steer: number; throttle: number };
  sling: { active: boolean; origin: { x: number; y: number }; thumb: { x: number; y: number }; draw: number; cancelling: boolean };
  vision: boolean;
}

export class TouchEngine {
  private tracks = new Map<number, Track>();
  private viewport: Viewport = { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private pendingOllie = false;
  private pendingTap: { x: number; y: number } | null = null;
  private pendingSkip = false;
  /**
   * The release frame must still describe a drawn slingshot: the simulation
   * only fires while the character is actually aiming, and by the time a thumb
   * has lifted the gesture is over.
   */
  private pendingFire: { aimVector: { x: number; y: number }; draw: number } | null = null;
  private lastVision = false;
  readonly tuning = { ...TOUCH_TUNING };

  /** True while any finger is on the screen; used to keep audio awake. */
  get engaged(): boolean { return this.tracks.size > 0; }

  setViewport(v: Viewport): void { this.viewport = v; }

  reset(): void {
    this.tracks.clear();
    this.pendingOllie = false;
    this.pendingTap = null;
    this.pendingFire = null;
  }

  /** Which zone does a screen point belong to? */
  zoneAt(x: number, y: number): TouchRole {
    const { w, h, safe } = this.viewport;
    const bottom = h - safe.bottom;
    const padTop = bottom - h * this.tuning.padHeight;
    if (y < padTop) return 'idle';
    return x < w * this.tuning.padWidth ? 'steer' : 'action';
  }

  handle(phase: PointerPhase, s: PointerSample): void {
    if (phase === 'down') return this.onDown(s);
    const track = this.tracks.get(s.id);
    if (!track) return;
    if (phase === 'move') return this.onMove(track, s);
    return this.onRelease(track, s, phase === 'cancel');
  }

  private onDown(s: PointerSample): void {
    const zone = this.zoneAt(s.x, s.y);
    // Anything that is not the steering thumb can become part of a VISION pair.
    const others = [...this.tracks.values()].filter((t) => t.role !== 'steer');
    let role: TouchRole = zone === 'steer' ? 'steer' : 'action';

    // A steering thumb is unique: a second touch in that zone is an action.
    if (role === 'steer' && [...this.tracks.values()].some((t) => t.role === 'steer')) role = 'action';

    if (role === 'action' && others.length >= 1) {
      // The second finger outside the pad opens the machine. Any aim in
      // progress is abandoned rather than fired: looking costs you the shot.
      role = 'vision';
      for (const o of others) o.role = 'vision';
    }

    this.tracks.set(s.id, {
      id: s.id,
      role,
      start: { x: s.x, y: s.y, t: s.t },
      anchor: { x: s.x, y: s.y },
      cur: { x: s.x, y: s.y, t: s.t },
      prev: { x: s.x, y: s.y, t: s.t },
      moved: 0,
      lastOllieT: -Infinity,
      history: [{ x: s.x, y: s.y, t: s.t }],
    });
  }

  private onMove(track: Track, s: PointerSample): void {
    track.prev = track.cur;
    track.cur = { x: s.x, y: s.y, t: s.t };
    track.moved = Math.max(track.moved, Math.hypot(s.x - track.start.x, s.y - track.start.y));

    track.history.push({ x: s.x, y: s.y, t: s.t });
    while (track.history.length > 1 && s.t - track.history[0].t > this.tuning.ollieWindow * 1.6) {
      track.history.shift();
    }

    if (track.role === 'steer') {
      this.detectOllie(track, s);
      // The anchor follows a thumb that has run out of room, so steering never
      // pins the player to an exact coordinate.
      const dx = s.x - track.anchor.x;
      const limit = this.tuning.steerFull * 1.35;
      if (dx > limit) track.anchor.x = s.x - limit;
      if (dx < -limit) track.anchor.x = s.x + limit;
      const dy = s.y - track.anchor.y;
      if (dy > limit) track.anchor.y = s.y - limit;
      if (dy < -limit) track.anchor.y = s.y + limit;
    }
  }

  /**
   * An ollie is a flick, not a position. A thumb being placed and then held
   * forward to push travels the same distance, so speed and transience are what
   * separate them — plus a settle window, so putting the thumb down is safe.
   */
  private detectOllie(track: Track, s: PointerSample): void {
    if (s.t - track.start.t < this.tuning.ollieSettle) return;
    if (s.t - track.lastOllieT < this.tuning.ollieCooldown) return;

    const cutoff = s.t - this.tuning.ollieWindow;
    let from: { x: number; y: number; t: number } | null = null;
    for (const h of track.history) if (h.t >= cutoff) { from = h; break; }
    if (!from || from.t === s.t) return;

    const dx = s.x - from.x;
    const dy = s.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const up = -dy;
    if (up < this.tuning.ollieDistance) return;
    if (up / dist < this.tuning.ollieVerticality) return;

    const speed = dist / Math.max(1, s.t - from.t);
    if (speed < this.tuning.ollieSpeed) return;

    this.pendingOllie = true;
    track.lastOllieT = s.t;
    // Re-anchor so the flick does not read as a sustained push afterwards.
    track.anchor.y = s.y;
  }

  private onRelease(track: Track, s: PointerSample, cancelled: boolean): void {
    this.tracks.delete(track.id);

    const held = s.t - track.start.t;
    const isTap = !cancelled && held <= this.tuning.tapMs && track.moved <= this.tuning.tapSlop;

    if (track.role === 'action') {
      const pull = Math.hypot(s.x - track.start.x, s.y - track.start.y);
      if (isTap) {
        // A tap in the action zone is a request to touch something in the
        // world, not a shot. The caller resolves what is under it.
        this.pendingTap = { x: s.x, y: s.y };
        this.pendingSkip = true;
      } else if (!cancelled && pull > this.tuning.cancelRadius && this.drawOf(pull) > 0.12) {
        const dx = s.x - track.start.x;
        const dy = s.y - track.start.y;
        this.pendingFire = {
          aimVector: { x: -dx / pull, y: -dy / pull },
          draw: this.drawOf(pull),
        };
      }
    } else if (isTap && track.role !== 'steer') {
      this.pendingTap = { x: s.x, y: s.y };
      this.pendingSkip = true;
    } else if (track.role === 'steer' && isTap) {
      this.pendingSkip = true;
    }

    // Dropping from two fingers to one must not resume aiming with the
    // survivor: the remaining finger is demoted until it is lifted.
    const rest = [...this.tracks.values()].filter((t) => t.role !== 'steer');
    if (rest.length === 1 && rest[0].role === 'vision') rest[0].role = 'idle';
  }

  private drawOf(pull: number): number {
    const t = this.tuning;
    return clamp01((pull - t.drawMin) / (t.drawFull - t.drawMin));
  }

  private get steerTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'steer') return t;
    return undefined;
  }

  private get actionTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'action') return t;
    return undefined;
  }

  private get visionHeld(): boolean {
    let n = 0;
    for (const t of this.tracks.values()) if (t.role === 'vision') n++;
    return n >= 2;
  }

  /** Consume this frame's gestures as an Intent. Clears all edge state. */
  sample(): Intent {
    const i = emptyIntent();
    const t = this.tuning;
    const vision = this.visionHeld;

    const steer = this.steerTrack;
    if (steer) {
      const dx = steer.cur.x - steer.anchor.x;
      const mag = Math.max(0, Math.abs(dx) - t.steerDead) / (t.steerFull - t.steerDead);
      i.steer = clamp(Math.sign(dx) * mag, -1, 1);

      // Forward of the anchor pushes; behind it brakes. Forward and back is how
      // a skater already thinks about going and stopping.
      const dy = steer.anchor.y - steer.cur.y;
      if (dy > t.throttleDead) {
        // Held forward is a push at the board's own cadence: the simulation's
        // cooldown still decides the rhythm, so mashing gains nothing.
        i.push = true;
        i.pushPressed = true;
      } else if (dy < -t.throttleDead) {
        i.brake = true;
      }
    }

    if (this.pendingOllie) {
      i.olliePressed = true;
      i.ollieReleased = true;
      this.pendingOllie = false;
    }

    // Seeing the machine costs you the ability to act on it.
    if (vision) {
      i.vision = true;
      i.push = false;
      i.pushPressed = false;
      i.aim = false;
      i.olliePressed = false;
      i.ollieReleased = false;
    } else {
      const action = this.actionTrack;
      if (action) {
        const dx = action.cur.x - action.start.x;
        const dy = action.cur.y - action.start.y;
        const pull = Math.hypot(dx, dy);
        if (pull > t.cancelRadius) {
          i.aim = true;
          i.drawAmount = this.drawOf(pull);
          // You pull the pouch back; the shot goes the other way.
          i.aimVector = { x: -dx / pull, y: -dy / pull };
        }
      }
      if (this.pendingFire) {
        // Hold the draw open for exactly the frame the release lands on.
        i.aim = true;
        i.drawAmount = this.pendingFire.draw;
        i.aimVector = this.pendingFire.aimVector;
        i.fire = true;
        i.firePressed = true;
      }
    }
    this.pendingFire = null;

    if (this.pendingSkip) { i.skip = true; this.pendingSkip = false; }
    this.lastVision = vision;
    return i;
  }

  /** A world-space tap the caller should resolve against the network. */
  takeTap(): { x: number; y: number } | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  get visual(): ControlVisual {
    const steer = this.steerTrack;
    const action = this.actionTrack;
    const vision = this.visionHeld;
    const t = this.tuning;

    let draw = 0;
    let cancelling = false;
    if (action) {
      const pull = Math.hypot(action.cur.x - action.start.x, action.cur.y - action.start.y);
      draw = this.drawOf(pull);
      cancelling = pull <= t.cancelRadius;
    }

    return {
      pad: {
        active: !!steer,
        anchor: steer ? { x: steer.anchor.x, y: steer.anchor.y } : { x: 0, y: 0 },
        thumb: steer ? { x: steer.cur.x, y: steer.cur.y } : { x: 0, y: 0 },
        steer: steer ? clamp((steer.cur.x - steer.anchor.x) / t.steerFull, -1, 1) : 0,
        throttle: steer ? clamp((steer.anchor.y - steer.cur.y) / t.throttleFull, -1, 1) : 0,
      },
      sling: {
        active: !!action && !vision,
        origin: action ? { x: action.start.x, y: action.start.y } : { x: 0, y: 0 },
        thumb: action ? { x: action.cur.x, y: action.cur.y } : { x: 0, y: 0 },
        draw,
        cancelling,
      },
      vision,
    };
  }

  get visionActive(): boolean { return this.lastVision; }
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
    // Real interactive elements keep their default behaviour, so the
    // preferences card and the verb chips still work with a finger.
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
      // Coalesced events give a truthful flick velocity on high-rate screens.
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
