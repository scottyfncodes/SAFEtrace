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
  /** The stick reaches full deflection this far from where it was planted. */
  stickFull: 52,
  /** Inside this, the thumb is resting rather than steering. */
  stickDead: 5,
  /** Below this magnitude the character coasts instead of pushing. */
  moveThreshold: 0.16,
  /** Buttons: radius, and the gap between their centres. */
  buttonRadius: 34,
  buttonGap: 82,
  /** A tap: short, and barely moved. */
  tapMs: 240,
  tapSlop: 14,
  /** Aiming: pixels of drag per radian of look. */
  lookScale: 260,
  /** A drag this small on release is a cancel, not a shot. */
  aimTapSlop: 10,
};

export type TouchRole = 'stick' | 'sling' | 'ollie' | 'vision' | 'aim' | 'idle';

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
  id: 'sling' | 'ollie' | 'vision';
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
  vision: boolean;
  aiming: boolean;
}

export class TouchEngine {
  private tracks = new Map<number, Track>();
  private viewport: Viewport = { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private pendingTap: { x: number; y: number } | null = null;
  private pendingSkip = false;
  private pendingOllie = false;
  private pendingAimMode = false;
  private pendingFire = false;
  /** Accumulated look delta while aiming, consumed once per frame. */
  private lookDelta = { yaw: 0, pitch: 0 };
  private aiming = false;
  private canSling = true;
  /**
   * VISION does nothing until the story unlocks it, and a control that does
   * nothing is worse than no control: a human pressed the eye repeatedly and
   * concluded the game was broken. It is not drawn until it works.
   */
  private canVision = false;
  readonly tuning = { ...TOUCH_TUNING };

  /** True while any finger is on the screen; used to keep audio awake. */
  get engaged(): boolean { return this.tracks.size > 0; }

  setViewport(v: Viewport): void { this.viewport = v; }

  /** The engine speaks a different vocabulary while a shot is being lined up. */
  setAiming(on: boolean): void {
    if (this.aiming === on) return;
    this.aiming = on;
    this.tracks.clear();
    this.lookDelta = { yaw: 0, pitch: 0 };
  }

  setSlingAvailable(on: boolean): void { this.canSling = on; }
  setVisionAvailable(on: boolean): void { this.canVision = on; }

  reset(): void {
    this.tracks.clear();
    this.pendingTap = null;
    this.pendingOllie = false;
    this.pendingAimMode = false;
    this.pendingFire = false;
    this.lookDelta = { yaw: 0, pitch: 0 };
  }

  /** Button centres, laid out from the bottom-right corner. */
  buttonLayout(): ControlButton[] {
    const { w, h, safe } = this.viewport;
    const r = this.tuning.buttonRadius;
    const gap = this.tuning.buttonGap;
    const x = w - safe.right - r - 22;
    const y = h - safe.bottom - r - 26;
    const out: ControlButton[] = [
      { id: 'ollie', pos: { x, y }, radius: r, pressed: false, enabled: true },
      { id: 'sling', pos: { x, y: y - gap }, radius: r, pressed: false, enabled: this.canSling },
    ];
    if (this.canVision) {
      out.push({ id: 'vision', pos: { x: x - gap * 0.86, y: y - gap * 0.34 }, radius: r * 0.86, pressed: false, enabled: true });
    }
    return out;
  }

  /** Which zone does a screen point belong to? */
  zoneAt(x: number, y: number): TouchRole {
    if (this.aiming) return 'aim';
    for (const b of this.buttonLayout()) {
      // A generous target: a thumb is eleven millimetres wide.
      if (Math.hypot(x - b.pos.x, y - b.pos.y) <= b.radius * 1.35) return b.id;
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
    // One stick at a time; a second thumb on that side does nothing.
    if (role === 'stick' && [...this.tracks.values()].some((t) => t.role === 'stick')) role = 'idle';
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
    const dxs = s.x - track.cur.x;
    const dys = s.y - track.cur.y;
    track.cur = { x: s.x, y: s.y, t: s.t };
    track.moved = Math.max(track.moved, Math.hypot(s.x - track.start.x, s.y - track.start.y));

    if (track.role === 'aim') {
      // Dragging moves the view under a fixed reticle, the way a hand does.
      this.lookDelta.yaw += dxs / this.tuning.lookScale;
      this.lookDelta.pitch -= dys / this.tuning.lookScale;
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
        if (cancelled) break;
        // Letting go is the shot. A release that never moved is a change of
        // mind, and puts the player back on the board.
        if (track.moved > this.tuning.aimTapSlop || held > 320) this.pendingFire = true;
        else this.pendingAimMode = true;
        break;
      case 'sling':
        if (isTap) this.pendingAimMode = true;
        break;
      case 'ollie':
        if (isTap) this.pendingOllie = true;
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

  private get visionHeld(): boolean {
    for (const t of this.tracks.values()) if (t.role === 'vision') return true;
    return false;
  }

  /** Consume this frame's gestures as an Intent. Clears all edge state. */
  sample(): Intent {
    const i = emptyIntent();
    const t = this.tuning;

    if (this.aiming) {
      i.aim = true;
      if (this.pendingFire) { i.fire = true; i.firePressed = true; this.pendingFire = false; }
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

    if (this.visionHeld) { i.vision = true; i.aim = false; }
    if (this.pendingOllie) { i.olliePressed = true; i.ollieReleased = true; this.pendingOllie = false; }
    if (this.pendingAimMode) { i.aimModePressed = true; this.pendingAimMode = false; }
    if (this.pendingSkip) { i.skip = true; this.pendingSkip = false; }
    return i;
  }

  /** Look delta accumulated since the last call, in radians. */
  takeLook(): { yaw: number; pitch: number } {
    const l = this.lookDelta;
    this.lookDelta = { yaw: 0, pitch: 0 };
    return l;
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
      vision: this.visionHeld,
      aiming: this.aiming,
    };
  }

  get visionActive(): boolean { return this.visionHeld; }
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
