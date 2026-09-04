/**
 * Touch controls, drawn into the world canvas.
 *
 * Deliberately almost invisible. There is no permanent joystick sitting on
 * Bellhaven: the pad only exists where a thumb is, and it fades the moment the
 * thumb leaves. What the player sees instead is the board responding, and a
 * slingshot band that stretches under their finger.
 */
import { clamp01, smoothstep } from '../core/math';
import type { ControlVisual } from '../core/touch';
import type { Settings } from '../core/settings';
import { MACHINE, VENEER, alpha } from './palette';

export class ControlsRenderer {
  /** Per-control fade, so releasing a thumb does not snap the ring away. */
  private padFade = 0;
  private slingFade = 0;
  private visionFade = 0;
  private homeFade = 0;
  private pulse = 0;

  constructor(private settings: Settings) {}

  /**
   * `showHome` is true only until the player has actually travelled. A first
   * touch is the hardest moment in the game and there was nothing on screen to
   * aim it at; after that the pad goes back to existing only under a thumb.
   */
  update(v: ControlVisual, dt: number, showHome = false): void {
    const to = (cur: number, on: boolean, rate: number) =>
      clamp01(cur + (on ? rate : -rate * 0.7) * dt);
    this.padFade = to(this.padFade, v.pad.active, 7);
    this.slingFade = to(this.slingFade, v.sling.active, 9);
    this.visionFade = to(this.visionFade, v.vision, 6);
    this.homeFade = to(this.homeFade, showHome && !v.pad.active, 3.2);
    this.pulse = (this.pulse + dt * (this.settings.reduceMotion ? 0 : 0.85)) % 1;
  }

  draw(ctx: CanvasRenderingContext2D, v: ControlVisual, w: number, h: number): void {
    if (this.homeFade > 0.01) this.drawHome(ctx, v);
    if (this.padFade > 0.01) this.drawPad(ctx, v);
    if (this.slingFade > 0.01) this.drawSling(ctx, v);
    if (this.visionFade > 0.01) this.drawVisionHint(ctx, w, h);
  }

  /**
   * The cold start, and nothing more than this: a ring where a thumb goes, and
   * a slow breath outward so the eye finds it. No words, no arrows, no legend.
   * Touching it moves you, which is the only thing that needs teaching.
   */
  private drawHome(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.homeFade);
    const { x, y } = v.home;
    const breathe = this.settings.reduceMotion ? 0.5 : (Math.sin(this.pulse * Math.PI * 2) * 0.5 + 0.5);

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = alpha('#FFFFFF', (0.16 + breathe * 0.10) * a);
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.stroke();

    // The ring the thumb would make, expanding: an invitation to press.
    ctx.strokeStyle = alpha('#FFFFFF', (0.22 - breathe * 0.20) * a);
    ctx.beginPath();
    ctx.arc(x, y, 21 + breathe * 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = alpha('#FFFFFF', 0.10 * a);
    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPad(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.padFade);
    const { anchor, thumb, throttle } = v.pad;
    ctx.save();
    ctx.lineWidth = 1.5;

    // The anchor ring: where the board thinks your thumb is.
    ctx.strokeStyle = alpha('#FFFFFF', 0.20 * a);
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 34, 0, Math.PI * 2);
    ctx.stroke();

    // Forward is warm, back is cool. The colour says go or stop before the
    // player has consciously read the position.
    const t = clamp01(Math.abs(throttle));
    if (t > 0.08) {
      ctx.strokeStyle = alpha(throttle > 0 ? VENEER.warning : '#8FB6D8', 0.42 * a * t);
      ctx.lineWidth = 3;
      const from = -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 34, from - t * 1.5 * Math.sign(throttle) * -1, from + t * 1.5, throttle < 0);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha('#FFFFFF', 0.28 * a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(thumb.x, thumb.y);
    ctx.stroke();

    ctx.fillStyle = alpha('#FFFFFF', 0.16 * a);
    ctx.beginPath();
    ctx.arc(thumb.x, thumb.y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha('#FFFFFF', 0.42 * a);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The band. It stretches from the pouch back toward the thumb, and a short
   * arrow leaves the pouch the other way, because that is where the bearing
   * is going.
   */
  private drawSling(ctx: CanvasRenderingContext2D, v: ControlVisual): void {
    const a = smoothstep(this.slingFade);
    const { origin, thumb, draw, cancelling } = v.sling;
    const col = cancelling ? '#9AA3A9' : VENEER.player;

    ctx.save();
    ctx.lineCap = 'round';

    ctx.strokeStyle = alpha('#FFFFFF', 0.16 * a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = alpha(col, (0.35 + draw * 0.5) * a);
    ctx.lineWidth = 2 + draw * 2.5;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(thumb.x, thumb.y);
    ctx.stroke();

    ctx.fillStyle = alpha(col, 0.22 * a);
    ctx.beginPath();
    ctx.arc(thumb.x, thumb.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(col, 0.55 * a);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (!cancelling) {
      const dx = origin.x - thumb.x, dy = origin.y - thumb.y;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l, uy = dy / l;
      const reach = 22 + draw * 30;
      ctx.strokeStyle = alpha(col, 0.5 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origin.x + ux * 26, origin.y + uy * 26);
      ctx.lineTo(origin.x + ux * (26 + reach), origin.y + uy * (26 + reach));
      ctx.stroke();
    }

    if (cancelling) {
      ctx.strokeStyle = alpha('#9AA3A9', 0.5 * a);
      ctx.lineWidth = 1.6;
      const r = 8;
      ctx.beginPath();
      ctx.moveTo(thumb.x - r, thumb.y - r); ctx.lineTo(thumb.x + r, thumb.y + r);
      ctx.moveTo(thumb.x + r, thumb.y - r); ctx.lineTo(thumb.x - r, thumb.y + r);
      ctx.stroke();
    }
    ctx.restore();
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
