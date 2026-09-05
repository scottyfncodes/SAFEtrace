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
import type { ControlVisual } from '../core/touch';
import type { Settings } from '../core/settings';
import { MACHINE, VENEER, alpha } from './palette';

export class ControlsRenderer {
  private stickFade = 0;
  private visionFade = 0;
  private homeFade = 0;
  private buttonFade = 0;
  private pulse = 0;

  constructor(private settings: Settings) {}

  /**
   * `showHome` is true only until the player has actually travelled. A first
   * touch is the hardest moment in the game and there was nothing on screen to
   * aim it at.
   */
  update(v: ControlVisual, dt: number, showHome = false): void {
    const to = (cur: number, on: boolean, rate: number) =>
      clamp01(cur + (on ? rate : -rate * 0.7) * dt);
    this.stickFade = to(this.stickFade, v.stick.active, 9);
    this.visionFade = to(this.visionFade, v.vision, 6);
    this.homeFade = to(this.homeFade, showHome && !v.stick.active, 3.2);
    // Buttons live at a low resting alpha rather than vanishing: they are the
    // only permanent statement of what this game lets you do.
    this.buttonFade = to(this.buttonFade, !v.aiming, 4);
    this.pulse = (this.pulse + dt * (this.settings.reduceMotion ? 0 : 0.85)) % 1;
  }

  draw(ctx: CanvasRenderingContext2D, v: ControlVisual, w: number, h: number): void {
    if (v.aiming) return;
    if (this.buttonFade > 0.01) this.drawButtons(ctx, v);
    if (this.homeFade > 0.01) this.drawHome(ctx, v);
    if (this.stickFade > 0.01) this.drawStick(ctx, v);
    if (this.visionFade > 0.01) this.drawVisionHint(ctx, w, h);
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

  /** The three things a right thumb can do, drawn where they are. */
  private drawButtons(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.buttonFade);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of v.buttons) {
      const on = b.pressed;
      const dim = b.enabled ? 1 : 0.4;
      // Bellhaven is a bright green suburb and a translucent dark disc on it
      // reads as a patch of grass, which is what happened on a real phone.
      // These sit on a solid, dark ground with a light rim so they are legible
      // over lawn, asphalt and concrete alike.
      ctx.fillStyle = alpha('#121A22', (on ? 0.88 : 0.72) * a * dim);
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha('#FFFFFF', (on ? 0.9 : 0.55) * a * dim);
      ctx.lineWidth = on ? 2.6 : 1.8;
      ctx.stroke();
      ctx.fillStyle = alpha('#F6F4EE', (on ? 1 : 0.9) * a * dim);
      this.glyph(ctx, b.id, b.pos.x, b.pos.y, b.radius);
    }
    ctx.restore();
  }

  /**
   * Words where a word is faster, shapes where a shape is: TRICK says exactly
   * what it does, the sling is a drawn slingshot, VISION is an eye.
   */
  private glyph(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number): void {
    const s = r * 0.5;
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.beginPath();
    if (id === 'trick') {
      // The word, and nothing else. A ramp or a board glyph told the player
      // nothing they could not read faster from five letters. Which trick is
      // the board's business, and it is never named.
      ctx.font = `700 ${Math.round(r * 0.38)}px ui-monospace, Menlo, monospace`;
      ctx.fillText('TRICK', x, y + 1);
      return;
    } else if (id === 'sling') {
      // An actual slingshot, drawn upright: a forked handle, two prongs, the
      // band slack between them, and the pouch drawn back with a ball in it.
      // The previous glyph was a generic fork and read as anything but this.
      const px = s * 0.62;      // prong half-width
      const py = s * 0.95;      // prong tip height above the crotch
      const crotch = y - s * 0.05;
      // Handle.
      ctx.moveTo(x, y + s * 1.05); ctx.lineTo(x, crotch);
      // Prongs.
      ctx.moveTo(x, crotch); ctx.lineTo(x - px, crotch - py);
      ctx.moveTo(x, crotch); ctx.lineTo(x + px, crotch - py);
      ctx.stroke();
      // Band, drawn back to the pouch behind the fork.
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - px, crotch - py);
      ctx.lineTo(x, crotch - py * 0.18);
      ctx.lineTo(x + px, crotch - py);
      ctx.stroke();
      // The ball in the pouch.
      ctx.beginPath();
      ctx.arc(x, crotch - py * 0.18, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      return;
    } else {
      // An eye.
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x, y - s * 0.9, x + s, y);
      ctx.quadraticCurveTo(x, y + s * 0.9, x - s, y);
    }
    ctx.stroke();
    if (id === 'vision') {
      ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * A thin frame while the machine is open. It is the only permanent tell that
   * VISION is costing you something, and it is deliberately slightly wrong:
   * the world is fine, the border is not.
   */
  private drawVisionHint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = smoothstep(this.visionFade) * (this.settings.reduceMotion ? 0.5 : 1);
    ctx.save();
    ctx.strokeStyle = alpha(MACHINE.data, 0.34 * a);
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.restore();
  }
}
