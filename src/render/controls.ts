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
import type { ControlButton, ControlVisual } from '../core/touch';
import type { Settings } from '../core/settings';
import { MACHINE, VENEER, alpha } from './palette';
import { taperedStroke } from './veneer';

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
    this.pulse = (this.pulse + dt * (this.settings.reduceMotion ? 0 : 0.85)) % 1;
  }

  draw(
    ctx: CanvasRenderingContext2D, v: ControlVisual, w: number, h: number,
    safe = { top: 0, right: 0, bottom: 0, left: 0 },
  ): void {
    if (v.aiming) return;
    if (this.buttonFade > 0.01) this.drawButtons(ctx, v);
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
  private drawButtons(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.buttonFade);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of v.buttons) {
      const on = b.pressed;
      const dim = b.enabled ? 1 : 0.4;
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
      ctx.fillText('TRICK', x, y);
      return;
    }

    if (id === 'sling') {
      /*
       * A forked stick with string across it and a stone in the pouch.
       *
       * Two earlier attempts failed at the size a button actually is. A
       * machined fork with one wide band folded through a point collapsed into
       * a letter Y. Drawing the pouch back *below* the crotch — which is what
       * the in-hand view does, correctly, with a whole screen to do it in —
       * put the cords, the pouch and the handle all in the same forty pixels
       * and fused them into a blob.
       *
       * What reads is the object at rest: the string spans the two tips and
       * dips into the mouth of the fork, where there is nothing else, with the
       * pouch and its stone at the bottom of that dip. Every element has clear
       * air around it, the silhouette is unmistakable at a glance, and it is
       * still honestly a stick with string tied across it — the limbs taper
       * and bend, because a branch cut out of a hedge is not a rule.
       */
      const px = s * 0.70;              // prong half-width
      const py = s * 0.86;              // prong tip height above the crotch
      const crotch = y + s * 0.10;
      const w = Math.max(1.7, r * 0.075);
      const tipL = { x: x - px, y: crotch - py };
      // Shorter, and a shade lower. A branch that forks evenly is a drawing.
      const tipR = { x: x + px * 0.95, y: crotch - py * 0.92 };

      taper(ctx, { x, y: crotch + s * 0.62 }, { x, y: crotch }, w * 1.15, w, -1.1);
      taper(ctx, { x, y: crotch }, tipL, w, w * 0.5, -py * 0.2);
      taper(ctx, { x, y: crotch }, tipR, w * 0.95, w * 0.48, py * 0.18);

      // The string, tied tip to tip and sagging into the mouth of the fork,
      // which is the one piece of clear space the mark has.
      const dip = crotch - py * 0.40;
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.beginPath();
      ctx.moveTo(tipL.x, tipL.y);
      ctx.quadraticCurveTo(x, dip + s * 0.16, tipR.x, tipR.y);
      ctx.stroke();

      // The pouch, and the stone sitting in it. The leather is drawn wider
      // than the stone and the stone rides a little above it, so at button
      // size the two still read as two things rather than one lump.
      ctx.lineWidth = Math.max(1.8, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.26, dip + s * 0.06); ctx.lineTo(x + s * 0.26, dip + s * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, dip - s * 0.1, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
      label('SLING');
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
