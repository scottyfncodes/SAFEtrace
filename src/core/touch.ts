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

/**
 * The control geometry, in one place, with the reasoning attached.
 *
 * Everything below is in CSS pixels and is derived from how a thumb actually
 * works rather than from what looks tidy on a desktop viewport:
 *
 *  - A thumb tip is 9–11 mm, roughly 44 px on a phone at typical density, and
 *    that is Apple's floor for a touch target. Every hit radius here clears it.
 *  - The visible circle and the touch target are deliberately different sizes.
 *    A control can look quiet and still be easy to hit, and the secondary
 *    control depends on exactly that.
 *  - Both right-hand primaries and the secondary sit on the arc a right thumb
 *    sweeps from its pivot at the bottom-right corner, so none of them is a
 *    reach *across* the glass and none is reached *through* another control.
 *  - Separation is measured between hit circles, not between the drawn ones.
 *    `separation` is the gap an imperfect press has to fall into before it can
 *    reach the wrong control, and the layout test asserts it on every viewport.
 */
export const TOUCH_TUNING = {
  /** Fraction of the viewport width given to the movement thumb. */
  padWidth: 0.52,
  /** Fraction of the viewport height, from the bottom, that accepts a thumb. */
  padHeight: 0.55,
  /** The pad never gets narrower than this, however cramped the screen. */
  padMinWidth: 108,
  /** Clear air between the movement pad and the nearest button's hit circle. */
  padClearance: 20,

  /**
   * Drawn radius, and the radius that actually accepts a thumb.
   *
   * SLING is drawn barely larger than TRICK — it is a tool, not an arcade
   * fire button, and at rest it should sit on the street as quietly as the
   * rest — but it takes the widest thumb of anything on the glass, because it
   * is the one control that is pressed mid-run *and then held and dragged*.
   */
  primaryRadius: 29,
  primaryHit: 42,
  slingRadius: 31,
  slingHit: 48,
  secondaryRadius: 21,
  secondaryHit: 34,

  /** Visible circles sit this far inside the safe area, on both axes. */
  edgeInset: 28,
  /** Minimum gap between any two hit circles. */
  separation: 16,
  /**
   * Where SLING and PLAN sit relative to the anchor, which is TRICK, in the
   * corner under the resting right thumb.
   *
   * SLING is up and in along the arc the thumb sweeps from its pivot, and the
   * reason is the pull: pressing it and drawing back toward the palm — down
   * and toward the corner, the way a real pouch comes back toward the chest —
   * needs glass behind it. From the corner there was none; from here there is
   * a full draw's worth in every direction a stone is usually thrown.
   *
   * PLAN sits left of TRICK on the bottom row, smaller and quieter: a
   * deliberate reach, not a place a thumb lands on its way anywhere else.
   */
  slingOffset: { x: -64, y: -122 },
  planOffset: { x: -100, y: 6 },
  /**
   * Holding TRICK this long is a grab instead of a flip.
   *
   * There was a fourth button for it, and it was the one button in the
   * cluster whose job was already a variant of another's: pop, and do
   * something with the board. A tap flips it; a hold grabs it and keeps
   * hold for as long as the thumb does — which is exactly the shape of the
   * thing, and one less circle on the glass.
   */
  grabHoldMs: 200,
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
  pullFull: 112,
  /**
   * Holding SLING without pulling still draws it, straight ahead, to about a
   * half pull — so press, hold, let go is a throw up the street, and a pull
   * is only needed to point it somewhere else or to throw further.
   */
  slingAutoDraw: 0.45,
  slingAutoMs: 550,
  /** Below this, a drag from the press is a wobble, not an aim. */
  slingAimDead: 9,
  /** Let go this quickly without pulling, and it was a brush, not a throw. */
  slingTapGuardMs: 130,
  /** Pulled out and brought back inside this of the press: put it down. */
  slingCancelRadius: 16,
  /**
   * Throwing: how far back a thumb has to pull for a full draw, and how long
   * before the lift the direction is read from. A thumb coming off glass rolls
   * and slides a few pixels in its last frames — that is where "it went left
   * when I let go" comes from — so the shot uses where the pull was a moment
   * before the lift, not the smear of the lift itself.
   */
  throwFull: 120,
  throwMin: 12,
  releaseRewindMs: 80,
  /** Below this the band has only been touched, not pulled. Small, so a short pull still counts. */
  pullMin: 10,
};

export type TouchRole = 'stick' | 'sling' | 'trick' | 'plan' | 'aim' | 'pull' | 'putAway' | 'look' | 'idle';

/** How much weight a control carries, which decides how it is drawn. */
export type ControlWeight = 'primary' | 'secondary';

interface Track {
  id: number;
  role: TouchRole;
  start: { x: number; y: number; t: number };
  /** Where the stick was planted. Floats if the thumb runs out of room. */
  anchor: { x: number; y: number };
  cur: { x: number; y: number; t: number };
  moved: number;
  /** A TRICK held long enough has already become a grab. */
  grabbed?: boolean;
  /** A SLING pulled far enough to have been pointed somewhere. */
  pulled?: boolean;
  /**
   * How far a held SLING had drawn itself when the thumb started aiming it.
   * Frozen from then on, so the aim never drifts under a thumb holding still.
   */
  autoLen?: number;
  /** Recent positions, for reading a pull from just before the lift. */
  history?: Array<{ x: number; y: number; t: number }>;
  /**
   * Frames this finger has been down. A thumb held perfectly still sends no
   * events at all, so time spent holding has to be counted here too.
   */
  frames?: number;
}

export interface ControlButton {
  id: 'sling' | 'trick' | 'plan';
  pos: { x: number; y: number };
  /** What is drawn. */
  radius: number;
  /** What accepts a thumb. Never smaller than `radius`, usually larger. */
  hit: number;
  weight: ControlWeight;
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
  /** The classic first-person aiming view is up. */
  aiming: boolean;
  /** The slingshot, as the thumb on it is holding it. */
  sling: SlingVisual;
}

/**
 * SLING, held: everything the control and the in-hand sling need to draw the
 * pull, and a counter that ticks on every release so the renderer can play
 * the snap without the engine knowing what a frame is.
 */
export interface SlingVisual {
  held: boolean;
  /** Where the thumb went down, and where it is now. */
  start: { x: number; y: number };
  cur: { x: number; y: number };
  /** Where the pouch is: drawn back by the hand, then moved by the thumb. */
  pouch: { x: number; y: number };
  /** Screen-space unit direction the stone will go. */
  dir: { x: number; y: number };
  /** 0..1, how far it is drawn. */
  draw: number;
  /** Brought back to where it was grabbed: letting go now puts it down. */
  cancel: boolean;
  /** Releases that threw something, ever. A change means one just went. */
  shots: number;
  /** Releases that did not: a brush, or a pull put back down. */
  fumbles: number;
}

export class TouchEngine {
  private tracks = new Map<number, Track>();
  private viewport: Viewport = { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private pendingTap: { x: number; y: number } | null = null;
  private pendingSkip = false;
  private pendingTrick = false;
  private pendingGrab = false;
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
  /** Pixels dragged on empty glass since last read: camera orbit, or map pan. */
  private lookDrag = { x: 0, y: 0 };
  /** The draw at the moment of release, so the shot frame still has it. */
  private firedDraw = 0;
  private aiming = false;
  private canSling = true;
  /**
   * The hold scheme. With it on, SLING is pressed, held, pulled and let go —
   * the whole shot in one touch, without leaving the street. With it off,
   * SLING opens the old first-person aiming mode — kept as the classic option.
   */
  private throwMode = false;
  private firedVector: { x: number; y: number } | null = null;
  private shots = 0;
  private fumbles = 0;
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
    this.lookDrag.x = 0;
    this.lookDrag.y = 0;
  }

  /**
   * Whether there is anything to throw with. Taking it away mid-pull lets the
   * pull go without a shot: the hand was doing something else.
   */
  setSlingAvailable(on: boolean): void {
    this.canSling = on;
    if (!on) for (const [id, t] of this.tracks) if (t.role === 'sling') this.tracks.delete(id);
  }

  /** Choose the hold scheme (true) or the classic aiming mode (false). */
  setThrowMode(on: boolean): void { this.throwMode = on; }

  /** True while a thumb is holding the sling drawn. */
  get slingHeld(): boolean { return !!this.slingTrack; }

  reset(): void {
    this.tracks.clear();
    this.pendingTap = null;
    this.pendingTrick = false;
    this.pendingGrab = false;
    this.pendingAimMode = false;
    this.pendingFire = false;
    this.aimDrag.x = 0;
    this.aimDrag.y = 0;
  }

  /**
   * Three controls, on the arc a right thumb sweeps.
   *
   * There were four once, then three, then two, then four again. POP went
   * because TRICK pops on its own; GRAB went because it is what holding TRICK
   * does; the eye went — and stays gone — because VISION is a story unlock and
   * must never grow a control. PLAN is here from the very first frame, because
   * the plan is a *view* and every device needs a way into it.
   *
   * The arrangement:
   *
   *   TRICK sits in the corner, under the resting thumb. It is the thing a
   *   skater presses most, mid-run, without looking.
   *
   *   SLING sits up and in along the sweep. It is the tool: pressed, held,
   *   pulled back toward the palm and let go, and that pull needs glass behind
   *   it — which the corner never had. Everything about using it happens in
   *   one touch, so it never needs a second control beside it.
   *
   *   PLAN sits left of TRICK on the bottom row, smaller and quieter: a
   *   deliberate reach, never on the way to anything else.
   */
  buttonLayout(): ControlButton[] {
    const t = this.tuning;
    const { w, h, safe } = this.viewport;
    const R = t.primaryRadius;
    const anchor = {
      x: w - safe.right - t.edgeInset - R,
      y: h - safe.bottom - t.edgeInset - R,
    };
    // A very short viewport (landscape, or a browser with a lot of chrome)
    // must not push SLING off the top of the screen.
    const ceiling = safe.top + t.slingHit + 12;
    const slingY = Math.max(ceiling, anchor.y + t.slingOffset.y);

    return [
      {
        id: 'sling', pos: { x: anchor.x + t.slingOffset.x, y: slingY },
        radius: t.slingRadius, hit: t.slingHit, weight: 'primary',
        pressed: false, enabled: this.canSling,
      },
      {
        id: 'trick', pos: { ...anchor },
        radius: R, hit: t.primaryHit, weight: 'primary',
        pressed: false, enabled: true,
      },
      {
        id: 'plan', pos: { x: anchor.x + t.planOffset.x, y: anchor.y + t.planOffset.y },
        radius: t.secondaryRadius, hit: t.secondaryHit, weight: 'secondary',
        pressed: this.planOn, enabled: true,
      },
    ];
  }

  /**
   * The right-hand edge of the movement pad.
   *
   * Derived from the layout rather than fixed, because a fraction of the width
   * is the wrong tool: at 430 px a 52% pad is nowhere near the buttons, and at
   * 320 px it runs straight into TRICK's hit circle. The pad is whichever is
   * smaller — its share of the width, or the clear air left to the leftmost
   * button — with a floor so it stays usable on any phone that exists.
   */
  padRight(): number {
    const t = this.tuning;
    let limit = Infinity;
    for (const b of this.buttonLayout()) limit = Math.min(limit, b.pos.x - b.hit - t.padClearance);
    return Math.max(t.padMinWidth, Math.min(this.viewport.w * t.padWidth, limit));
  }

  /** The top of the band that accepts a movement thumb. */
  padTop(): number {
    const { h, safe } = this.viewport;
    return h - safe.bottom - (h - safe.top - safe.bottom) * this.tuning.padHeight;
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
      /*
       * The one exception is the SLING button itself, which stays where it
       * was and puts the sling away when tapped — the same control in, the
       * same control out, instead of a gesture nobody could find. A thumb
       * that lands on it and pulls is pulling, because that corner is where a
       * right thumb rests.
       */
      const sling = this.buttonLayout()[0];
      if (Math.hypot(x - sling.pos.x, y - sling.pos.y) <= sling.hit * 0.8) return 'putAway';
      return x < this.viewport.w * this.tuning.aimPadWidth ? 'aim' : 'pull';
    }
    /*
     * A plain circle, at the hit radius.
     *
     * It used to be an ellipse stretched by different factors in each
     * direction, which was a way of buying a bigger target out of a small
     * drawn button — and it made "can these two be pressed at once" a question
     * nobody could answer by looking. The drawn circle and the touch target
     * are separate numbers now, so the target can simply *be* the right size,
     * and the separation between two of them is one subtraction that a test
     * can check on every viewport.
     */
    for (const b of this.buttonLayout()) {
      if (Math.hypot(x - b.pos.x, y - b.pos.y) <= b.hit) return b.id;
    }
    if (y < this.padTop()) return 'idle';
    return x < this.padRight() ? 'stick' : 'idle';
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
    if ((role === 'stick' || role === 'aim' || role === 'pull' || role === 'sling')
      && [...this.tracks.values()].some((t) => t.role === role)) role = 'idle';
    if (role === 'sling' && !this.canSling) role = 'idle';
    /*
     * Reaching for a tool from the plan is leaving the plan, in the same
     * touch. Closing the map first and then pressing again is exactly the
     * kind of mode-switching the controls are supposed to disappear into.
     */
    if (this.planOn && !this.aiming && (role === 'trick' || (role === 'sling' && this.throwMode))) {
      this.planOn = false;
    }

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
    if (track.role === 'sling') {
      (track.history ??= []).push({ x: s.x, y: s.y, t: s.t });
      if (track.history.length > 24) track.history.shift();
    }
    track.moved = Math.max(track.moved, Math.hypot(s.x - track.start.x, s.y - track.start.y));
    if (track.role === 'sling' && track.moved > this.tuning.slingCancelRadius + 8) track.pulled = true;
    if (track.role === 'sling') return;

    if (track.role === 'putAway' && track.moved > this.tuning.tapSlop
      && ![...this.tracks.values()].some((t) => t.role === 'pull')) {
      track.role = 'pull';
    }
    if (track.role === 'pull') return;   // read from its position on sample()

    // A finger on empty glass that moves is looking, not tapping: it turns
    // the camera round the rider, or drags the map in the plan.
    if (track.role === 'idle' && track.moved > this.tuning.tapSlop
      && ![...this.tracks.values()].some((t) => t.role === 'look')) {
      track.role = 'look';
      this.lookDrag.x += s.x - track.start.x;
      this.lookDrag.y += s.y - track.start.y;
      return;
    }
    if (track.role === 'look') {
      this.lookDrag.x += s.x - prev.x;
      this.lookDrag.y += s.y - prev.y;
      return;
    }

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
    const held = Math.max(s.t - track.start.t, (track.frames ?? 0) * (1000 / 60));
    const isTap = !cancelled && held <= this.tuning.tapMs && track.moved <= this.tuning.tapSlop;

    switch (track.role) {
      case 'aim':
        /*
         * Lifted without having dragged it anywhere is the way back out of
         * the mode, and it is the only thing the left thumb can do besides
         * aim. It can never fire.
         *
         * This used to also require the lift to come quickly — the same
         * `tapMs` window a button press does — which is the wrong model for
         * a thumb that is genuinely just aiming. Holding a line steady while
         * deciding whether to let go is the ordinary shape of aiming, not a
         * slow tap, and a quarter of a second is nothing next to how long
         * that decision can take. Whether the exit registers should depend on
         * whether the thumb moved, never on how long it sat still first.
         */
        if (!cancelled && track.moved <= this.tuning.tapSlop) this.pendingAimMode = true;
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
      case 'sling': {
        if (!this.throwMode) {
          if (isTap) this.pendingAimMode = true;
          break;
        }
        if (cancelled) break;
        /*
         * Letting go is the shot. Nothing else is: there is no second tap, no
         * FIRE, and nothing to put away afterwards — the thumb comes off and
         * the stone goes, from wherever the pull was a moment before the lift.
         * The two exceptions are both the hand saying "not that": a brush too
         * quick to have meant anything, and a pull brought back to where it
         * was grabbed.
         */
        const shot = this.slingAim(track, s.t, true);
        const brushed = held < this.tuning.slingTapGuardMs && shot.moved < this.tuning.throwMin;
        if (shot.cancel || brushed) { this.fumbles++; break; }
        this.firedVector = shot.vector;
        this.firedDraw = Math.max(0.02, shot.draw);
        this.pendingFire = true;
        this.shots++;
        break;
      }
      case 'putAway':
        if (isTap || (!cancelled && track.moved <= this.tuning.tapSlop)) this.pendingAimMode = true;
        break;
      case 'trick':
        if (isTap && !track.grabbed) this.pendingTrick = true;
        break;
      case 'plan':
        // PLAN is a toggle on a phone: holding one thumb down to keep a map
        // open left one thumb to do everything else with.
        if (isTap) this.planOn = !this.planOn;
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

  private get slingTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'sling') return t;
    return undefined;
  }

  /**
   * What a held SLING is doing: which way, how hard, and whether it has gone
   * slack.
   *
   * Held still, the hand draws the pouch straight back on its own, to about
   * half, over half a second — so press-and-let-go is a useful throw up the
   * street, and the control visibly goes from resting to drawn. The thumb
   * then moves the *pouch*, from wherever the hand has drawn it to: back for
   * further, across to point it, forward toward the target for a shorter
   * lob. The direction is the pouch reversed, as on any slingshot, and the
   * draw is how far the pouch is from the fork.
   *
   * The moment the thumb starts to aim, the hand stops drawing on its own, so
   * the bearing never drifts under a thumb that is holding a line. Pushed all
   * the way forward into the fork, the band is slack: let go there and
   * nothing is thrown.
   *
   * On release the pull is read from a moment before the lift, because a
   * thumb coming off glass rolls and smears the last few pixels sideways.
   */
  private slingAim(track: Track, now: number, releasing: boolean): {
    vector: { x: number; y: number }; dir: { x: number; y: number }; pouch: { x: number; y: number };
    draw: number; moved: number; cancel: boolean;
  } {
    const t = this.tuning;
    let at = { x: track.cur.x, y: track.cur.y };
    if (releasing) {
      const cutoff = now - t.releaseRewindMs;
      for (const h of track.history ?? []) if (h.t <= cutoff) at = { x: h.x, y: h.y };
    }
    const mx = at.x - track.start.x, my = at.y - track.start.y;
    const moved = Math.hypot(mx, my);
    let auto = track.autoLen;
    if (auto === undefined) {
      const heldMs = Math.max(now - track.start.t, (track.frames ?? 0) * (1000 / 60));
      const k = clamp01(heldMs / t.slingAutoMs);
      auto = t.throwMin + t.slingAutoDraw * (t.throwFull - t.throwMin) * k * k * (3 - 2 * k);
      if (track.moved > t.slingAimDead) track.autoLen = auto;
    }
    // Where the pouch is, relative to the fork: drawn back, then moved.
    const ox = mx, oy = auto + my;
    const len = Math.hypot(ox, oy);
    const dir = len > 1e-3 ? { x: -ox / len, y: -oy / len } : { x: 0, y: -1 };
    const draw = clamp01((len - t.throwMin) / (t.throwFull - t.throwMin));
    const cancel = !!track.pulled && len < t.slingCancelRadius;
    const L = t.throwMin + draw * (t.throwFull - t.throwMin);
    return {
      vector: { x: dir.x * L, y: dir.y * L }, dir,
      pouch: { x: track.start.x + ox, y: track.start.y + oy },
      draw, moved, cancel,
    };
  }

  private get pullTrack(): Track | undefined {
    for (const t of this.tracks.values()) if (t.role === 'pull') return t;
    return undefined;
  }

  /**
   * The plan view is a hold, exactly as Q is a hold.
   *
   * Not a toggle, because the two devices must not learn different habits, and
   * not a gesture, because a control nobody can see is worse than no control.
   */
  private get planHeld(): boolean { return this.planOn; }
  /** Whether PLAN has been tapped open. */
  private planOn = false;
  /** The host closes the plan when something else takes over (a menu, a scene). */
  setPlanOpen(on: boolean): void { this.planOn = on; }

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
      } else if (this.tracks.size > 0) {
        // Not holding the sling: the band is slack and nothing is loaded.
        // This is only ever true of a real touch — some finger is down, on
        // the aim side, and simply hasn't pulled anything yet.
        i.aim = true;
        i.drawAmount = 0;
      }
      /*
       * If neither branch above ran, no finger is on the glass at all right
       * now — `i.drawAmount` stays at `emptyIntent()`'s `null`. That distinction
       * used to be lost: this block ran off `this.aiming`, which mirrors
       * `sim.aimMode` on every device whether or not that device has a touch
       * screen, so a mouse player charging a shot the ordinary way — holding a
       * button, `player.draw` climbing on its own clock — had that same
       * `drawAmount: 0` written over their intent on every single frame by a
       * touch layer with nothing actually touching it. `player.draw` could
       * never leave zero, releasing never fired anything, and no version of
       * "hold to draw, release to throw" on a mouse ever had a chance to work
       * until this stopped being asserted with nobody's thumb behind it.
       */
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

    // Time held is counted in frames as well as event time: a thumb held
    // perfectly still sends no events at all.
    for (const tr of this.tracks.values()) tr.frames = (tr.frames ?? 0) + 1;

    /*
     * SLING, held: the sling is drawn, for as long as the thumb is on it.
     *
     * This is the whole of the slingshot on a phone. There is no mode and no
     * view change, so the stick under the other thumb is untouched and the
     * board keeps rolling; the pull is read every frame so the aim follows the
     * thumb continuously, and the release frame (below) still describes a
     * drawn sling because the simulation only fires while one is being held.
     */
    const sl = this.slingTrack;
    if (sl && this.throwMode) {
      const a = this.slingAim(sl, sl.cur.t, false);
      i.aim = true;
      if (a.cancel) {
        i.drawAmount = 0;
      } else {
        i.throwVector = a.vector;
        i.drawAmount = a.draw;
      }
    }
    if (this.pendingFire && this.firedVector) {
      // The release frame still describes a drawn sling, pointed where it was.
      i.aim = true;
      i.throwVector = this.firedVector;
      i.drawAmount = this.firedDraw;
      i.fire = true;
      i.firePressed = true;
      this.pendingFire = false;
      this.firedVector = null;
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

    // A TRICK held past the threshold is a grab, asked for once.
    for (const tr of this.tracks.values()) {
      const heldMs = Math.max(tr.cur.t - tr.start.t, (tr.frames ?? 0) * (1000 / 60));
      if (tr.role === 'trick' && !tr.grabbed && heldMs >= t.grabHoldMs && tr.moved <= t.tapSlop * 2) {
        tr.grabbed = true;
        this.pendingGrab = true;
      }
    }
    if (this.planOn) i.planView = true;
    if (this.pendingTrick) { i.trickPressed = true; this.pendingTrick = false; }
    if (this.pendingGrab) { i.grabPressed = true; this.pendingGrab = false; }
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

  /** Screen pixels dragged on empty glass since last asked. Consumed. */
  takeLookDrag(): { x: number; y: number } {
    const out = { x: this.lookDrag.x, y: this.lookDrag.y };
    this.lookDrag.x = 0; this.lookDrag.y = 0;
    return out;
  }

  /** True while a finger is dragging on empty glass. */
  get looking(): boolean {
    for (const t of this.tracks.values()) if (t.role === 'look') return true;
    return false;
  }

  /** A world-space tap the caller should resolve against the network. */
  takeTap(): { x: number; y: number } | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  /**
   * Where a left thumb is invited to land on the very first touch.
   *
   * Low and well inside the pad: a thumb pivots from the bottom-left corner,
   * so its resting arc passes through here, and planting the stick here leaves
   * room to push in every direction without running out of glass.
   */
  homePoint(): { x: number; y: number } {
    const { h, safe } = this.viewport;
    const left = safe.left + this.tuning.edgeInset;
    return {
      x: left + Math.max(48, (this.padRight() - left) * 0.34),
      y: h - safe.bottom - Math.min(132, (h - safe.top - safe.bottom) * 0.19),
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
      buttons: this.buttonLayout().map((b) => ({
        ...b, pressed: held.has(b.id) || (b.id === 'plan' && this.planOn),
      })),
      aiming: this.aiming,
      sling: (() => {
        const sl = this.slingTrack;
        if (!sl || !this.throwMode) {
          return {
            held: false, start: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, pouch: { x: 0, y: 0 }, dir: { x: 0, y: -1 },
            draw: 0, cancel: false, shots: this.shots, fumbles: this.fumbles,
          };
        }
        const a = this.slingAim(sl, sl.cur.t, false);
        return {
          held: true, start: { x: sl.start.x, y: sl.start.y }, cur: { x: sl.cur.x, y: sl.cur.y }, pouch: a.pouch,
          dir: a.dir, draw: a.cancel ? 0 : a.draw, cancel: a.cancel, shots: this.shots, fumbles: this.fumbles,
        };
      })(),
    };
  }

  /** True while the plan view is being held open by a thumb. */
  get planViewHeld(): boolean { return this.planHeld; }

  /**
   * Where the slingshot sits when no thumb is on it.
   *
   * Low in the half of the glass that holds it, not on the movement pad's
   * home ring — the two are different jobs and, in aiming, the left thumb owns
   * the whole left half rather than a pad in the corner. Resting the fork in
   * the middle of that half is what makes the object read as an invitation:
   * one hand here, one hand over there on the band.
   */
  slingRestPoint(): { x: number; y: number } {
    const { w, h, safe } = this.viewport;
    return {
      x: safe.left + (w * this.tuning.aimPadWidth - safe.left) * 0.52,
      y: h - safe.bottom - (h - safe.top - safe.bottom) * 0.28,
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
