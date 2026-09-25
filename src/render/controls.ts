/**
 * Touch controls, drawn into the world canvas.
 *
 * These used to be almost invisible on purpose — no permanent joystick sitting
 * on Bellhaven, just a board that responded. Two human playtests said the same
 * thing: you cannot respond to a control you cannot find. So the stick is drawn
 * where the thumb plants it, the three things a thumb can press are drawn where
 * they are, and nothing in the game is a gesture you have to be told about.
 *
 * It is still restrained. Thin rings, no labels shouting, and it all fades back
 * when a hand is off the glass.
 */
import { clamp01, smoothstep } from '../core/math';
import type { ControlButton, ControlVisual, SlingVisual } from '../core/touch';
import type { Settings } from '../core/settings';
import { MACHINE, VENEER, alpha } from './palette';
import { taperedStroke } from './veneer';
import { SLING_HINT } from '../content/copy';

type P = { x: number; y: number };

/** A tapering, slightly bent limb in the current stroke colour. */
const taper = taperedStroke;

export class ControlsRenderer {
  private stickFade = 0;
  /**
   * How open the plan view is, driven by the simulation's own blend.
   *
   * Not by a button: the frame this draws marks the *state*, and the state can
   * also be entered by the keyboard or by the story cracking the veneer. There
   * is no eye anywhere in here — the control that opens the plan view is PLAN,
   * it is a permanent part of the HUD from the first frame, and unlocking
   * SAFEtrace VISION does not add anything to the glass.
   */
  private planFade = 0;
  private homeFade = 0;
  private buttonFade = 0;
  private pulse = 0;
  /** How far the rest of the cluster has stepped back for a held sling. */
  private slingFocus = 0;
  /** Set by the host: no stone has been thrown yet this afternoon. */
  throwHint = false;
  /** Set by the host: 0..1, how recovered the band is since the last shot. */
  slingReady = 1;
  /** The last held pull, kept so the snap can play after the thumb is gone. */
  private lastPull: { start: P; pouch: P; dir: P; draw: number } | null = null;
  /** Seconds since the band was let go (the snap), and since a fumble. */
  private snapT = 9;
  private snapDraw = 0;
  private fumbleT = 9;
  private seenShots = -1;
  private seenFumbles = -1;

  constructor(private settings: Settings) {}

  /**
   * `showHome` is true only until the player has actually travelled. A first
   * touch is the hardest moment in the game and there was nothing on screen to
   * aim it at.
   */
  update(v: ControlVisual, dt: number, showHome = false, planView = false): void {
    const to = (cur: number, on: boolean, rate: number) =>
      clamp01(cur + (on ? rate : -rate * 0.7) * dt);
    this.stickFade = to(this.stickFade, v.stick.active, 9);
    this.planFade = to(this.planFade, planView, 6);
    this.homeFade = to(this.homeFade, showHome && !v.stick.active, 3.2);
    // Buttons live at a low resting alpha rather than vanishing: they are the
    // only permanent statement of what this game lets you do.
    this.buttonFade = to(this.buttonFade, !v.aiming, 4);
    this.slingFocus = to(this.slingFocus, v.sling.held, 10);
    this.pulse = (this.pulse + dt * (this.settings.reduceMotion ? 0 : 0.85)) % 1;

    // The engine counts releases; a change is the moment one happened.
    const sl = v.sling;
    if (sl.held) this.lastPull = { start: { ...sl.start }, pouch: { ...sl.pouch }, dir: { ...sl.dir }, draw: sl.draw };
    if (this.seenShots >= 0 && sl.shots !== this.seenShots) { this.snapT = 0; this.snapDraw = this.lastPull?.draw ?? 0.5; }
    if (this.seenFumbles >= 0 && sl.fumbles !== this.seenFumbles) this.fumbleT = 0;
    this.seenShots = sl.shots;
    this.seenFumbles = sl.fumbles;
    this.snapT += dt;
    this.fumbleT += dt;
  }

  draw(
    ctx: CanvasRenderingContext2D, v: ControlVisual, w: number, h: number,
    safe = { top: 0, right: 0, bottom: 0, left: 0 },
  ): void {
    if (v.aiming) { this.drawPutAway(ctx, v); return; }
    if (this.buttonFade > 0.01) this.drawButtons(ctx, v, w);
    if (this.homeFade > 0.01) this.drawHome(ctx, v);
    if (this.stickFade > 0.01) this.drawStick(ctx, v);
    if (this.planFade > 0.01) this.drawPlanFrame(ctx, w, h, safe);
  }

  /**
   * The cold start: a ring where a thumb goes, and a slow breath outward so the
   * eye finds it. No words, no arrows. Touching it moves you.
   */
  private drawHome(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.homeFade);
    const { x, y } = v.home;
    const breathe = this.settings.reduceMotion ? 0.5 : (Math.sin(this.pulse * Math.PI * 2) * 0.5 + 0.5);

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = alpha('#FFFFFF', (0.18 + breathe * 0.12) * a);
    ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = alpha('#FFFFFF', (0.24 - breathe * 0.22) * a);
    ctx.beginPath(); ctx.arc(x, y, 22 + breathe * 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = alpha('#FFFFFF', 0.12 * a);
    ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /**
   * The stick. A ring where the thumb planted, a knuckle where it is now, and
   * a wedge pointing the way the character is being sent — because the whole
   * point of the rebuild is that the thumb names a direction, not a rudder.
   */
  private drawStick(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.stickFade);
    const { anchor, thumb, vector } = v.stick;
    const mag = Math.hypot(vector.x, vector.y);

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = alpha('#FFFFFF', 0.22 * a);
    ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 40, 0, Math.PI * 2); ctx.stroke();

    if (mag > 0.02) {
      const ux = vector.x / mag, uy = vector.y / mag;
      ctx.strokeStyle = alpha(VENEER.accent, (0.30 + mag * 0.45) * a);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(anchor.x + ux * 14, anchor.y + uy * 14);
      ctx.lineTo(anchor.x + ux * (18 + mag * 30), anchor.y + uy * (18 + mag * 30));
      ctx.stroke();
    }

    ctx.fillStyle = alpha('#FFFFFF', 0.18 * a);
    ctx.beginPath(); ctx.arc(thumb.x, thumb.y, 23, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha('#FFFFFF', 0.46 * a);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The right thumb's whole vocabulary, drawn with a hierarchy.
   *
   * Two weights, and the difference is real rather than decorative. A primary
   * is something you press mid-run — it is full size, has a brighter rim and
   * sits at a higher resting alpha, so the eye finds it without hunting. The
   * secondary is a view control: smaller, thinner, quieter, and it recedes
   * into the HUD instead of competing with the things that move the board.
   *
   * What does *not* differ is how easy either is to hit. The touch target is a
   * separate number from the drawn circle, so PLAN can read as furniture and
   * still take a 68 px-wide thumb.
   */
  private drawButtons(ctx: CanvasRenderingContext2D, v: ControlVisual, w: number): void {
    const a = smoothstep(this.buttonFade);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of v.buttons) {
      if (b.id === 'sling') { this.drawSling(ctx, b, v.sling, a, w); continue; }
      const on = b.pressed;
      // A held sling is the one thing happening; the rest steps back.
      const dim = (b.enabled ? 1 : 0.4) * (1 - 0.72 * smoothstep(this.slingFocus));
      const secondary = b.weight === 'secondary';
      // Bellhaven is a bright green suburb and a translucent dark disc on it
      // reads as a patch of grass, which is what happened on a real phone.
      // These sit on a solid, dark ground with a light rim so they are legible
      // over lawn, asphalt and concrete alike.
      const rest = secondary ? 0.58 : 0.72;
      ctx.fillStyle = alpha('#121A22', (on ? 0.9 : rest) * a * dim);
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();

      /*
       * Held reads as held, on the control itself.
       *
       * The plan view is the one thing here that stays on while the thumb is
       * down, so it is the one thing that needs a state and not just a press
       * flash — otherwise the only tell is a border at the edge of the screen,
       * a long way from the finger holding it open.
       */
      const rim = on && secondary ? MACHINE.data : '#FFFFFF';
      const rimAlpha = (on ? 0.92 : secondary ? 0.40 : 0.55) * a * dim;
      ctx.strokeStyle = alpha(rim, rimAlpha);
      ctx.lineWidth = on ? 2.4 : secondary ? 1.3 : 1.8;
      ctx.stroke();

      ctx.fillStyle = alpha(on && secondary ? MACHINE.data : '#F6F4EE',
        (on ? 1 : secondary ? 0.72 : 0.9) * a * dim);
      this.glyph(ctx, b.id, b.pos.x, b.pos.y, b.radius);
    }
    ctx.restore();
  }

  /**
   * A forked stick with string across it and a stone in the pouch.
   *
   * Two earlier attempts failed at the size a button actually is. A machined
   * fork with one wide band folded through a point collapsed into a letter Y.
   * Drawing the pouch back *below* the crotch put the cords, the pouch and the
   * handle all in the same forty pixels and fused them into a blob.
   *
   * What reads is the object at rest: the string spans the two tips and dips
   * into the mouth of the fork, with the pouch and its stone at the bottom of
   * that dip. Held, the string is not drawn here at all — the cords leave the
   * tips for the thumb — so this returns the tips for the caller to tie them
   * to. Drawn a little above centre so the word fits beneath it.
   */
  private slingGlyph(ctx: CanvasRenderingContext2D, x: number, y0: number, r: number, withString: boolean): [P, P] {
    const s = r * 0.5;
    const y = y0 - r * 0.12;
    const px = s * 0.70;              // prong half-width
    const py = s * 0.86;              // prong tip height above the crotch
    const crotch = y + s * 0.10;
    const w = Math.max(1.7, r * 0.075);
    const tipL = { x: x - px, y: crotch - py };
    // Shorter, and a shade lower. A branch that forks evenly is a drawing.
    const tipR = { x: x + px * 0.95, y: crotch - py * 0.92 };

    ctx.strokeStyle = ctx.fillStyle as string;
    taper(ctx, { x, y: crotch + s * 0.62 }, { x, y: crotch }, w * 1.15, w, -1.1);
    taper(ctx, { x, y: crotch }, tipL, w, w * 0.5, -py * 0.2);
    taper(ctx, { x, y: crotch }, tipR, w * 0.95, w * 0.48, py * 0.18);
    if (!withString) return [tipL, tipR];

    const dip = crotch - py * 0.40;
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(tipL.x, tipL.y);
    ctx.quadraticCurveTo(x, dip + s * 0.16, tipR.x, tipR.y);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.8, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.26, dip + s * 0.06); ctx.lineTo(x + s * 0.26, dip + s * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, dip - s * 0.1, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    return [tipL, tipR];
  }

  private glyph(ctx: CanvasRenderingContext2D, id: ControlButton['id'], x: number, y: number, r: number): void {
    /*
     * One typographic system for all three controls.
     *
     * Each button is a mark over its own name, in the same face at the same
     * size relative to the button, on the same baseline. Words because an
     * eleven-pixel icon is a puzzle to a first-time player and a five-letter
     * word is not; marks because a word alone gives the eye nothing to find
     * the button by at a glance, mid-run, without looking straight at it.
     *
     * TRICK is the exception that proves it: a ramp or a board glyph told
     * nobody anything a reader could not get faster from the word, and *which*
     * trick is the board's business, so it carries the word alone — set on the
     * same baseline as the other two so the row still reads as one system.
     */
    const s = r * 0.5;
    const label = (text: string) => {
      ctx.font = `700 ${Math.round(r * 0.235)}px ui-monospace, Menlo, monospace`;
      ctx.fillText(text, x, y + r * 0.56);
    };

    ctx.lineWidth = Math.max(1.4, r * 0.06);
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.beginPath();

    if (id === 'trick') {
      ctx.font = `700 ${Math.round(r * 0.33)}px ui-monospace, Menlo, monospace`;
      ctx.fillText('TRICK', x, y - r * 0.08);
      // What holding it does, quietly: the grab used to be a whole button.
      const was = ctx.globalAlpha;
      ctx.globalAlpha = was * 0.6;
      ctx.font = `600 ${Math.round(r * 0.2)}px ui-monospace, Menlo, monospace`;
      ctx.fillText('hold: grab', x, y + r * 0.38);
      ctx.globalAlpha = was;
      return;
    }

    /*
     * PLAN: a plan of a town, and the word for it.
     *
     * Deliberately nothing like an eye. An eye would say "you are being shown
     * something", which is the story's job; a square with streets through it
     * says "this is the map", which is what the control does.
     */
    const q = s * 0.72;
    const top = y - q - s * 0.34;
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.strokeRect(x - q, top, q * 2, q * 1.7);
    ctx.beginPath();
    ctx.moveTo(x - q, top + q * 0.95); ctx.lineTo(x + q, top + q * 0.95);
    ctx.moveTo(x + q * 0.16, top); ctx.lineTo(x + q * 0.16, top + q * 1.7);
    ctx.stroke();
    label('PLAN');
  }

  /**
   * SLING: the tool, at rest, drawn, and let go.
   *
   * At rest it is the same quiet disc as the others, a forked stick with its
   * cord across it — findable at a glance, nothing that shouts. Pressed, it
   * becomes the sling in your hand: the disc lifts and warms, the cords leave
   * the fork and stretch to where the thumb has pulled the pouch, a ring round
   * the fork fills with the draw, and a mark on the far side says which way
   * the stone will go. Let go and the pouch snaps back through the fork and
   * past it, the ring flashes once outward, and the control is quiet again in
   * the time it takes the stone to leave.
   *
   * None of this is where the aim is read — the arc in the street is — so it
   * can be as physical as it likes without having to be precise.
   */
  private drawSling(ctx: CanvasRenderingContext2D, b: ControlButton, sl: SlingVisual, a: number, w: number): void {
    const held = sl.held;
    const focus = smoothstep(this.slingFocus);
    const dim = b.enabled ? 1 : 0.4;
    const r = b.radius * (1 + 0.06 * focus);
    const { x, y } = b.pos;
    const draw = held ? sl.draw : 0;
    const full = draw > 0.96;
    const warm = sl.cancel ? '#9AA3AB' : full ? VENEER.player : '#F2C46B';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // The disc. Held, it is a shade lighter and solid, so it reads as lifted.
    ctx.fillStyle = alpha(held ? '#1D2833' : '#121A22', (held ? 0.94 : 0.72) * a * dim);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(held ? warm : '#FFFFFF', (held ? 0.95 : 0.55) * a * dim);
    ctx.lineWidth = held ? 2.6 : 1.8;
    ctx.stroke();

    // Recovering after a shot: a thin ring that closes as the band comes back.
    if (!held && this.slingReady < 0.999) {
      ctx.strokeStyle = alpha('#F6F4EE', 0.55 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(this.slingReady));
      ctx.stroke();
    }

    // The draw: a ring round the fork filling clockwise from the top.
    if (held) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = alpha('#0B1117', 0.55 * a);
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
      if (draw > 0.01) {
        ctx.strokeStyle = alpha(warm, 0.95 * a);
        ctx.lineWidth = 4 + (full ? 1.5 : 0);
        ctx.beginPath();
        ctx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * draw);
        ctx.stroke();
      }
      // Which way it goes: a chevron just outside the ring.
      if (!sl.cancel) {
        const d = sl.dir;
        const px = -d.y, py = d.x;
        const c = { x: x + d.x * (r + 17), y: y + d.y * (r + 17) };
        ctx.strokeStyle = alpha(warm, 0.95 * a);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.x - d.x * 6 + px * 7, c.y - d.y * 6 + py * 7);
        ctx.lineTo(c.x + d.x * 3, c.y + d.y * 3);
        ctx.lineTo(c.x - d.x * 6 - px * 7, c.y - d.y * 6 - py * 7);
        ctx.stroke();
      }
    }

    // The fork. Held, the cords are drawn to the thumb instead of across it.
    ctx.fillStyle = alpha('#F6F4EE', (held ? 1 : 0.9) * a * dim);
    const tips = this.slingGlyph(ctx, x, y, r, !held && this.snapT > 0.28);
    if (!held) {
      ctx.font = `700 ${Math.round(r * 0.26)}px ui-monospace, Menlo, monospace`;
      ctx.fillText('SLING', x, y + r * 0.6);
    }

    // The cords and the pouch: to the thumb while held, snapping home after.
    let pouch: P | null = null;
    let slap = 0;
    if (held) {
      pouch = { x: sl.pouch.x, y: sl.pouch.y };
    } else if (this.snapT < 0.28 && this.lastPull) {
      // Through the fork and past it, then ringing back to rest.
      const k = this.snapT / 0.28;
      const lp = this.lastPull;
      const back = { x: lp.pouch.x - x, y: lp.pouch.y - y };
      const over = Math.sin(k * Math.PI * 2.5) * Math.exp(-k * 4) * (14 + this.snapDraw * 16);
      const ease = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
      pouch = {
        x: x + back.x * (1 - ease) + lp.dir.x * over,
        y: y - r * 0.1 + back.y * (1 - ease) + lp.dir.y * over,
      };
      slap = 1 - k;
    }
    if (pouch) {
      ctx.lineCap = 'round';
      const taut = held ? draw : 0;
      for (const tip of tips) {
        ctx.strokeStyle = alpha('#12181F', 0.5 * a);
        ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(pouch.x, pouch.y); ctx.stroke();
        ctx.strokeStyle = alpha(sl.cancel ? '#9AA3AB' : '#E8DCC0', 0.95 * a);
        ctx.lineWidth = 1.6 + taut * 1.4 + slap;
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(pouch.x, pouch.y); ctx.stroke();
      }
      // The leather, across the pull, and the stone in it — until it has gone.
      const ux = pouch.x - x, uy = pouch.y - y;
      const ul = Math.hypot(ux, uy) || 1;
      const qx = -uy / ul, qy = ux / ul;
      ctx.strokeStyle = alpha('#8A6A48', a);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pouch.x + qx * 8, pouch.y + qy * 8); ctx.lineTo(pouch.x - qx * 8, pouch.y - qy * 8);
      ctx.stroke();
      if (held && !sl.cancel) {
        ctx.fillStyle = alpha('#B9C0C6', a);
        ctx.beginPath(); ctx.arc(pouch.x, pouch.y, 5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // The release: one ring, outward, gone.
    if (this.snapT < 0.4 && !this.settings.reduceMotion) {
      const k = this.snapT / 0.4;
      ctx.strokeStyle = alpha(VENEER.player, (1 - k) * 0.85 * a);
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, r + 6 + k * (22 + this.snapDraw * 20), 0, Math.PI * 2); ctx.stroke();
    }

    // Words, only when they help: how to use it until it has been used, what
    // letting go now would do, and a nudge after a press that threw nothing.
    let say: string | null = null;
    if (held && sl.cancel) say = SLING_HINT.cancel;
    else if (!held && this.fumbleT < 1.8) say = SLING_HINT.brushed;
    else if (!held && this.throwHint && this.snapT > 1 && this.planFade < 0.5) say = SLING_HINT.hold;
    // Above a held sling (the thumb is below it); below one at rest, so the
    // words never sit over the rider on a short phone.
    if (say) this.pill(ctx, say, x, held ? y - r - 38 : y + r + 18, w, a);
    ctx.restore();
  }

  /** A small dark pill of words, kept on the glass. */
  private pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, a: number): void {
    ctx.font = '700 10px ui-monospace, Menlo, monospace';
    const tw = ctx.measureText(text).width + 14;
    const cx = Math.max(tw / 2 + 8, Math.min(w - tw / 2 - 8, x));
    ctx.fillStyle = alpha('#0B1117', 0.72 * a);
    ctx.beginPath(); ctx.roundRect(cx - tw / 2, y - 9, tw, 18, 9); ctx.fill();
    ctx.fillStyle = alpha('#F6F4EE', 0.95 * a);
    ctx.fillText(text, cx, y + 0.5);
  }

  /**
   * While aiming, the SLING button stays where it was, lit, and tapping it
   * puts the sling away. The rest of the cluster goes: aiming is one job.
   */
  private drawPutAway(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const b = v.buttons.find((x) => x.id === 'sling');
    if (!b) return;
    const r = b.radius * 0.82;
    ctx.save();
    ctx.fillStyle = alpha('#121A22', 0.55);
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(VENEER.player, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = alpha('#F6F4EE', 0.85);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const k = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(b.pos.x - k, b.pos.y - k - 4); ctx.lineTo(b.pos.x + k, b.pos.y + k - 4);
    ctx.moveTo(b.pos.x + k, b.pos.y - k - 4); ctx.lineTo(b.pos.x - k, b.pos.y + k - 4);
    ctx.stroke();
    ctx.fillStyle = alpha('#F6F4EE', 0.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 0.26)}px ui-monospace, Menlo, monospace`;
    ctx.fillText('PUT AWAY', b.pos.x, b.pos.y + r * 0.55);
    ctx.restore();
  }

  /**
   * A thin frame while the plan view is open. It is the only permanent tell
   * that looking is costing you something, and it is deliberately slightly
   * wrong: the world is fine, the border is not.
   */
  private drawPlanFrame(
    ctx: CanvasRenderingContext2D, w: number, h: number,
    safe: { top: number; right: number; bottom: number; left: number },
  ): void {
    const a = smoothstep(this.planFade) * (this.settings.reduceMotion ? 0.5 : 1);
    // Inside the safe area, so the frame is a frame rather than something
    // half-swallowed by a notch and a home indicator.
    const x = safe.left + 6, y = safe.top + 6;
    ctx.save();
    ctx.strokeStyle = alpha(MACHINE.data, 0.34 * a);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w - x - safe.right - 6, h - y - safe.bottom - 6);
    ctx.restore();
  }
}
