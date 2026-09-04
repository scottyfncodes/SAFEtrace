/** View transform: follow, lookahead, zoom by speed, and shake. */
import { type Vec2, clamp, damp, lerp } from '../core/math';

export class ViewCamera {
  pos: Vec2 = { x: 0, y: 0 };
  zoom = 13.0;
  /**
   * Pixels-per-metre scales with the screen, so a phone shows a comparable
   * slice of Bellhaven to a desktop instead of a keyhole. Clamped at the bottom
   * so the player never becomes too small to read.
   */
  private uiScale = 1;
  private shake = 0;
  private shakeSeed = 0;
  offset: Vec2 = { x: 0, y: 0 };
  /** Set by cinematics to take manual control. */
  scripted: { pos: Vec2; zoom: number } | null = null;

  setViewport(w: number, h: number): void {
    // The floor used to be 0.7, which on a 390 px phone cancelled most of the
    // zoom and left the character about twenty pixels long — a human could not
    // read the rider or the board. A phone still sees a street's width and the
    // houses either side of it.
    this.uiScale = clamp(Math.min(w, h) / 810, 0.92, 1.15);
  }

  follow(target: Vec2, vel: Vec2, speed: number, maxSpeed: number, dt: number, shakeScale: number): void {
    if (this.scripted) {
      this.pos = { x: damp(this.pos.x, this.scripted.pos.x, 0.28, dt), y: damp(this.pos.y, this.scripted.pos.y, 0.28, dt) };
      this.zoom = damp(this.zoom, this.scripted.zoom * this.uiScale, 0.32, dt);
      return;
    }
    // Look ahead along travel: speed reads as speed.
    const lead = clamp(speed * 0.75, 0, 16);
    const want = {
      x: target.x + (speed > 0.5 ? (vel.x / Math.max(speed, 0.001)) * lead : 0),
      y: target.y + (speed > 0.5 ? (vel.y / Math.max(speed, 0.001)) * lead : 0),
    };
    this.pos = { x: damp(this.pos.x, want.x, 0.16, dt), y: damp(this.pos.y, want.y, 0.16, dt) };

    const t = clamp(speed / Math.max(maxSpeed, 0.001), 0, 1);
    // Closer than it was: a human could not read the character or the board at
    // the old framing. Still wide enough to see a junction coming.
    const wantZoom = lerp(16.4, 12.0, t) * this.uiScale;
    this.zoom = damp(this.zoom, wantZoom, 0.4, dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      this.shakeSeed += dt * 60;
      const m = this.shake * this.shake * 7 * shakeScale;
      this.offset = {
        x: Math.sin(this.shakeSeed * 1.7) * m,
        y: Math.cos(this.shakeSeed * 2.3) * m,
      };
    } else {
      this.offset = { x: 0, y: 0 };
    }
  }

  kick(amount: number): void { this.shake = Math.min(1, this.shake + amount); }

  toScreen(p: Vec2, w: number, h: number): Vec2 {
    return {
      x: (p.x - this.pos.x - this.offset.x) * this.zoom + w / 2,
      y: (p.y - this.pos.y - this.offset.y) * this.zoom + h / 2,
    };
  }

  toWorld(p: Vec2, w: number, h: number): Vec2 {
    return {
      x: (p.x - w / 2) / this.zoom + this.pos.x + this.offset.x,
      y: (p.y - h / 2) / this.zoom + this.pos.y + this.offset.y,
    };
  }

  visibleBounds(w: number, h: number, margin = 40) {
    const hw = w / (2 * this.zoom) + margin;
    const hh = h / (2 * this.zoom) + margin;
    return { x: this.pos.x - hw, y: this.pos.y - hh, w: hw * 2, h: hh * 2 };
  }
}
