/**
 * Presentation orchestration, and the peel.
 *
 * The transition between the two readings of Bellhaven is subtractive and
 * structural: the veneer is *removed* to expose geometry the simulation was
 * already using, radiating outward from the player so the town becomes data
 * around them rather than being covered by it.
 */
import { type Rect, type Vec2, clamp01, easeInOutCubic, smoothstep } from '../core/math';
import type { ControlVisual } from '../core/touch';
import type { Settings } from '../core/settings';
import type { Sim } from '../sim/sim';
import { predictArc } from '../sim/slingshot';
import { ViewCamera } from './camera';
import { ControlsRenderer } from './controls';
import { MachineRenderer } from './machine';
import { VeneerRenderer, ROOF_K, roundRect } from './veneer';
import { MACHINE, VENEER, alpha, mix, riskColour, shade } from './palette';

export class Renderer {
  readonly cam = new ViewCamera();
  private veneer: VeneerRenderer;
  private machine: MachineRenderer;
  readonly controls: ControlsRenderer;
  /** Set each frame by the host so the controls can be drawn last. */
  controlVisual: ControlVisual | null = null;
  /** Draw the cold-start pad hint. True until the player has actually moved. */
  showControlHome = false;
  private ctx: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;
  /** 0..1 wavefront progress, separate from sim.visionBlend so it can overshoot. */
  private peel = 0;
  private residual = 0;
  private ripples: Array<{ pos: Vec2; t: number; life: number }> = [];
  /**
   * The reprise overlay, 0..1.
   *
   * The advertisement must return unchanged: the same pictures, the same words,
   * the same music. So this does not peel anything. It lays the surveillance
   * reading over the beautiful world without removing it, because the payoff is
   * that nothing about the advertisement changed — only the player did.
   */
  annotationOverlay = 0;
  private mask: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  constructor(private canvas: HTMLCanvasElement, private sim: Sim, private settings: Settings) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.veneer = new VeneerRenderer(sim.world);
    this.machine = new MachineRenderer(sim);
    this.controls = new ControlsRenderer(settings);
    this.veneer.prepare();
    this.resize();
    this.cam.pos = { ...sim.player.pos };
  }

  resize(): void {
    // CSS pixels are not canvas pixels. The backing store follows the device
    // ratio; everything the game measures stays in CSS pixels.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === this.w && h === this.h && this.canvas.width === Math.round(w * this.dpr)) return;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cam.setViewport(w, h);
    // The reveal mask is viewport-sized and must follow.
    this.mask = null;
    this.maskCtx = null;
  }

  private ensureMask(): HTMLCanvasElement | null {
    const w = Math.max(1, Math.round(this.w));
    const h = Math.max(1, Math.round(this.h));
    if (!this.mask) {
      this.mask = document.createElement('canvas');
      this.maskCtx = this.mask.getContext('2d');
    }
    if (this.mask.width !== w || this.mask.height !== h) {
      this.mask.width = w;
      this.mask.height = h;
    }
    return this.mask;
  }

  ripple(pos: Vec2, life = 0.9): void { this.ripples.push({ pos, t: 0, life }); }
  kick(a: number): void { this.cam.kick(a * this.settings.cameraShake); }

  screenToWorld(p: Vec2): Vec2 { return this.cam.toWorld(p, this.w, this.h); }

  render(dt: number): void {
    const sim = this.sim;
    const ctx = this.ctx;

    this.cam.follow(
      sim.player.pos, sim.player.vel, sim.player.speed, sim.playerMaxSpeed, dt,
      this.settings.cameraShake,
    );

    // The peel leads the blend slightly on the way in and trails on the way out,
    // which is what makes it feel like a wave rather than a fade.
    const target = sim.visionBlend;
    const rate = target > this.peel ? 5.2 : 6.0;
    this.peel += Math.sign(target - this.peel) * Math.min(Math.abs(target - this.peel), rate * dt);
    this.peel = clamp01(this.peel);
    if (this.peel > 0.02) this.residual = 1;
    else this.residual = Math.max(0, this.residual - dt * 0.5);

    const view = this.cam.visibleBounds(this.w, this.h);

    ctx.fillStyle = VENEER.void;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawVeneerLayer(ctx, view);

    if (this.peel > 0.001) this.drawMachineLayer(ctx, view);
    else if (this.annotationOverlay > 0.001) this.drawAnnotationOverlay(ctx, view);

    this.drawActors(ctx, view);
    this.drawProjectiles(ctx);
    this.drawAimAid(ctx);
    this.drawRipples(ctx, dt);
    this.drawVignette(ctx);

    if (this.controlVisual) {
      this.controls.update(this.controlVisual, dt, this.showControlHome);
      this.controls.draw(ctx, this.controlVisual, this.w, this.h);
    }
  }

  // ------------------------------------------------------------------ layers

  private drawVeneerLayer(ctx: CanvasRenderingContext2D, view: Rect): void {
    const sim = this.sim;
    this.veneer.drawGround(ctx, this.cam, this.w, this.h);
    this.veneer.drawGroundDetail(ctx, this.cam, this.w, this.h, view);
    this.veneer.drawShadows(ctx, this.cam, this.w, this.h, view, sim);

    // The residual: a few cones still faintly visible on the beautiful world
    // after leaving VISION. That afterimage is the whole game in one picture.
    if (this.residual > 0.01 && this.peel < 0.6) {
      ctx.save();
      ctx.globalAlpha = this.residual * 0.22 * (1 - this.peel);
      for (const s of sim.sensors) {
        if (s.state === 'OFFLINE') continue;
        const o = this.cam.toScreen(s.data.pos, this.w, this.h);
        const half = s.data.fov / 2;
        const r = s.data.range * this.cam.zoom;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.arc(o.x, o.y, r, s.facing - half, s.facing + half);
        ctx.closePath();
        ctx.fillStyle = alpha(VENEER.accent, 0.35);
        ctx.fill();
      }
      ctx.restore();
    }

    this.veneer.drawBuildings(ctx, this.cam, this.w, this.h, view);
    this.veneer.drawProps(ctx, this.cam, this.w, this.h, view);
    this.veneer.drawSensors(ctx, sim, this.cam, this.w, this.h, view);
  }

  private drawMachineLayer(ctx: CanvasRenderingContext2D, view: Rect): void {
    const opts = { colourSafe: this.settings.colourSafeMachine };
    const reduce = this.settings.reduceMotion || this.settings.transitionIntensity < 0.35;

    // Accessible variant: the same four steps, as a soft cross-fade with no
    // wavefront and no flashing.
    if (reduce) {
      ctx.save();
      ctx.globalAlpha = easeInOutCubic(this.peel);
      this.paintMachine(ctx, view, opts);
      ctx.restore();
      return;
    }

    // Fully held: no wavefront to mask, so paint straight onto the frame. This
    // is the common case and it skips an entire full-screen composite.
    if (this.peel >= 0.995) {
      this.paintMachine(ctx, view, opts);
      return;
    }

    const mask = this.ensureMask();
    const mctx = this.maskCtx;
    if (!mask || !mctx) {
      ctx.save();
      ctx.globalAlpha = easeInOutCubic(this.peel);
      this.paintMachine(ctx, view, opts);
      ctx.restore();
      return;
    }

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalCompositeOperation = 'source-over';
    mctx.globalAlpha = 1;
    mctx.clearRect(0, 0, this.w, this.h);
    this.paintMachine(mctx, view, opts);

    /*
     * The wavefront. The player sees the world become data outward from
     * themselves, which is the correct emotional reading: this is happening in
     * their head, not to the town. A constant-speed radius makes it read as a
     * wave travelling outward rather than as a fade that happens to be round.
     */
    const centre = this.cam.toScreen(this.sim.player.pos, this.w, this.h);
    const maxR = Math.hypot(this.w, this.h) * 0.58;
    const r = this.peel * maxR;
    const feather = Math.max(28, maxR * 0.17);
    const grad = mctx.createRadialGradient(
      centre.x, centre.y, Math.max(0, r - feather),
      centre.x, centre.y, Math.max(1, r),
    );
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.globalCompositeOperation = 'destination-in';
    mctx.fillStyle = grad;
    mctx.fillRect(0, 0, this.w, this.h);
    mctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(mask, 0, 0, this.w, this.h);

    // The leading edge of the reveal.
    if (this.peel > 0.02) {
      const edge = Math.sin(this.peel * Math.PI) ** 0.5;
      const k = this.settings.transitionIntensity;
      ctx.strokeStyle = alpha(MACHINE.data, 0.75 * edge * k);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = alpha(MACHINE.structureBright, 0.28 * edge * k);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(0, r - 8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The surveillance reading, laid over the veneer rather than replacing it. */
  private drawAnnotationOverlay(ctx: CanvasRenderingContext2D, view: Rect): void {
    const opts = { colourSafe: this.settings.colourSafeMachine };
    ctx.save();
    ctx.globalAlpha = easeInOutCubic(clamp01(this.annotationOverlay));
    this.machine.drawSurveillance(ctx, this.cam, this.w, this.h, view, opts);
    this.machine.drawAerial(ctx, this.cam, this.w, this.h, opts);
    this.machine.drawSubjects(ctx, this.cam, this.w, this.h, view, opts);
    ctx.restore();
  }

  /**
   * Paints the complete machine reading of Bellhaven onto whatever context it
   * is given, opaquely. Masking is the caller's job.
   */
  private paintMachine(
    ctx: CanvasRenderingContext2D, view: Rect, opts: { colourSafe: boolean },
  ): void {
    ctx.fillStyle = this.machine.voidColour(opts);
    ctx.fillRect(0, 0, this.w, this.h);
    this.machine.drawGround(ctx, this.cam, this.w, this.h, view, opts);
    this.machine.drawStructure(ctx, this.cam, this.w, this.h, view, opts);

    // Structure resolves first; the population and its scores arrive after.
    const detail = smoothstep((this.peel - 0.24) / 0.48);
    const before = ctx.globalAlpha;
    ctx.globalAlpha = before * detail;
    this.machine.drawSurveillance(ctx, this.cam, this.w, this.h, view, opts);
    this.machine.drawAerial(ctx, this.cam, this.w, this.h, opts);
    this.machine.drawEvidence(ctx, this.cam, this.w, this.h, opts);
    this.machine.drawPrediction(ctx, this.cam, this.w, this.h, opts);
    this.machine.drawSubjects(ctx, this.cam, this.w, this.h, view, opts);
    ctx.globalAlpha = before;
  }

  // ------------------------------------------------------------------ actors

  private drawActors(ctx: CanvasRenderingContext2D, view: Rect): void {
    const sim = this.sim;
    const z = this.cam.zoom;
    const machine = this.peel;

    for (let i = 0; i < sim.npcs.length; i++) {
      const n = sim.npcs[i];
      if (n.pos.x < view.x - 6 || n.pos.x > view.x + view.w + 6) continue;
      if (n.pos.y < view.y - 6 || n.pos.y > view.y + view.h + 6) continue;
      this.drawPerson(ctx, n.pos, n.heading, n.tint, 0, machine);
    }

    if (!sim.devonStopped || true) {
      this.drawPerson(ctx, sim.devonPos, 0, VENEER.friend, 0, machine, true);
    }

    // Drones, drawn last of the ambient actors so they read as above everything.
    for (const d of sim.drones) {
      const c = this.cam.toScreen({ x: d.pos.x, y: d.pos.y - d.z * ROOF_K }, this.w, this.h);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(d.heading);
      ctx.fillStyle = mix('#F6F4EE', MACHINE.data, machine * 0.7);
      roundRect(ctx, -0.7 * z, -0.5 * z, 1.4 * z, 1.0 * z, 0.3 * z);
      ctx.fill();
      ctx.strokeStyle = alpha('#5A6470', 0.7);
      ctx.lineWidth = Math.max(1, 0.08 * z);
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
        ctx.beginPath();
        ctx.arc(ax * 0.85 * z, ay * 0.7 * z, 0.42 * z, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (d.spotlight) {
        const g = this.cam.toScreen(d.pos, this.w, this.h);
        const r = 6 * z;
        const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
        grad.addColorStop(0, alpha('#FFF6D8', 0.35));
        grad.addColorStop(1, alpha('#FFF6D8', 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const p of sim.patrols) {
      this.drawPerson(ctx, p.pos, p.heading, p.state === 'INTERVENING' ? '#E8A33D' : '#5A6470', 0, machine);
    }

    this.drawPlayer(ctx);
  }

  private drawPerson(
    ctx: CanvasRenderingContext2D, pos: Vec2, heading: number, tint: string,
    z0: number, machine: number, board = false,
  ): void {
    const z = this.cam.zoom;
    const c = this.cam.toScreen({ x: pos.x, y: pos.y - z0 * ROOF_K }, this.w, this.h);
    const col = mix(tint, MACHINE.identity, machine * 0.55);

    if (board) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(heading);
      ctx.fillStyle = alpha('#3A3F45', 0.9);
      roundRect(ctx, -0.45 * z, -0.9 * z, 0.9 * z, 1.8 * z, 0.3 * z);
      ctx.fill();
      ctx.restore();
    }

    // Strong, simple silhouette: shoulders and head, readable at any zoom.
    ctx.fillStyle = shade(col, -0.28);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 0.35 * z, 0.52 * z, 0.42 * z, heading, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(c.x, c.y - 0.85 * z, 0.36 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const sim = this.sim;
    const p = sim.player;
    const z = this.cam.zoom;
    const c = this.cam.toScreen({ x: p.pos.x, y: p.pos.y - p.z * ROOF_K }, this.w, this.h);
    const ground = this.cam.toScreen(p.pos, this.w, this.h);

    // Airborne shadow tells you how high you are.
    if (p.z > 0.05) {
      ctx.fillStyle = VENEER.shadowSoft;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, 0.6 * z, 0.4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(p.heading);

    if (p.onBoard) {
      ctx.fillStyle = p.stance === 'BAIL' ? '#8A8F93' : '#2F343A';
      roundRect(ctx, -1.05 * z, -0.42 * z, 2.1 * z, 0.84 * z, 0.3 * z);
      ctx.fill();
      // The board deck is the player's single identifying accent colour.
      ctx.fillStyle = VENEER.player;
      roundRect(ctx, -0.85 * z, -0.3 * z, 1.7 * z, 0.6 * z, 0.22 * z);
      ctx.fill();
    }

    const lean = p.stance === 'SLIDE' ? 0.35 : 0;
    ctx.rotate(lean);
    ctx.fillStyle = shade(VENEER.player, -0.42);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.5 * z, 0.62 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F2D3B8';
    ctx.beginPath();
    ctx.arc(0.12 * z, 0, 0.34 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Flow reads as a warm ring, never as a number.
    if (p.flow > 0.15) {
      ctx.strokeStyle = alpha(VENEER.warning, p.flow * 0.5);
      ctx.lineWidth = Math.max(1, z * 0.12);
      ctx.beginPath();
      ctx.arc(ground.x, ground.y, (1.5 + p.flow * 0.9) * z, 0, Math.PI * 2 * p.flow);
      ctx.stroke();
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    const z = this.cam.zoom;
    for (const proj of this.sim.projectiles) {
      ctx.strokeStyle = alpha('#2F343A', 0.35);
      ctx.lineWidth = Math.max(1, z * 0.08);
      ctx.beginPath();
      proj.trail.forEach((t, i) => {
        const s = this.cam.toScreen({ x: t.x, y: t.y - t.z * ROOF_K }, this.w, this.h);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      const s = this.cam.toScreen({ x: proj.pos.x, y: proj.pos.y - proj.z * ROOF_K }, this.w, this.h);
      ctx.fillStyle = '#3F464D';
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1.5, z * 0.16), 0, Math.PI * 2); ctx.fill();
    }
    for (const d of this.sim.droppedBearings) {
      const s = this.cam.toScreen(d.pos, this.w, this.h);
      ctx.fillStyle = alpha('#6C7075', 0.8);
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, z * 0.12), 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * The aim aid. Time does not slow: aiming while rolling at nine metres a
   * second is the skill. Sway is proportional to speed and inversely to flow.
   */
  private drawAimAid(ctx: CanvasRenderingContext2D): void {
    const p = this.sim.player;
    if (!p.aiming) return;
    const { angle, pitch, sway } = this.sim.aim;
    const speed = 18 + p.draw * 16;
    const arc = predictArc(p.pos, angle, pitch, speed);
    // Draw fills the reticle in; sway opens it back up. What the player sees is
    // the spread the projectile will actually be fired into.
    const conf = clamp01(p.draw) * (1 - clamp01(sway / 0.09) * 0.55);

    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha('#2F343A', 0.2 + conf * 0.4);
    ctx.lineWidth = Math.max(1, this.cam.zoom * 0.09);
    ctx.beginPath();
    arc.forEach((a, i) => {
      const s = this.cam.toScreen({ x: a.x, y: a.y - a.z * ROOF_K }, this.w, this.h);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const end = arc[arc.length - 1];
    if (end) {
      const s = this.cam.toScreen({ x: end.x, y: end.y - Math.max(0, end.z) * ROOF_K }, this.w, this.h);
      const r = 5 + (1 - conf) * 12;
      ctx.strokeStyle = alpha(VENEER.player, 0.55 + conf * 0.4);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - r - 4, s.y); ctx.lineTo(s.x - r + 2, s.y);
      ctx.moveTo(s.x + r - 2, s.y); ctx.lineTo(s.x + r + 4, s.y);
      ctx.stroke();
    }
    ctx.restore();

    this.drawAimLock(ctx);
  }

  /**
   * What the shot is actually going to hit.
   *
   * The character has always solved the arc for whatever is on the line — a
   * drone at eleven metres up, a camera on a facade — the way somebody who has
   * done this a thousand times would. It was solving it silently. A player
   * dragging a thumb had a band under their finger, a dotted arc, and no way at
   * all to know what the game had already decided they were pointing at, which
   * is most of why the first human to try it could not hit a drone.
   *
   * Four corners, not a circle: a bracket reads as acquisition rather than as
   * one more piece of world.
   */
  private drawAimLock(ctx: CanvasRenderingContext2D): void {
    const t = this.sim.aimTarget;
    if (!t) return;
    const c = this.cam.toScreen({ x: t.pos.x, y: t.pos.y - t.z * ROOF_K }, this.w, this.h);
    const r = Math.max(13, t.radius * this.cam.zoom * 1.5);
    const arm = r * 0.42;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A dark backing stroke, because the veneer is a bright sunny suburb and a
    // thin light line disappears into a pavement on a phone held outdoors.
    for (const [col, wid, off] of [['#1B2129', 3.4, 0.35], [VENEER.player, 1.8, 0.95]] as const) {
      ctx.strokeStyle = alpha(col, off);
      ctx.lineWidth = wid;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
        ctx.moveTo(c.x + sx * r, c.y + sy * r - sy * arm);
        ctx.lineTo(c.x + sx * r, c.y + sy * r);
        ctx.lineTo(c.x + sx * r - sx * arm, c.y + sy * r);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRipples(ctx: CanvasRenderingContext2D, dt: number): void {
    this.ripples = this.ripples.filter((r) => {
      r.t += dt;
      if (r.t > r.life) return false;
      const k = r.t / r.life;
      const s = this.cam.toScreen(r.pos, this.w, this.h);
      ctx.strokeStyle = alpha(VENEER.warning, (1 - k) * 0.6);
      ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, smoothstep(k) * 60 * this.cam.zoom * 0.1 + 4, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const risk = this.sim.playerRisk;
    if (risk < 45 && this.peel < 0.02) return;
    const g = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.32,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72,
    );
    const strength = Math.max(clamp01((risk - 45) / 55) * 0.35, this.peel * 0.35);
    const col = this.peel > 0.4 ? MACHINE.void : riskColour(risk, this.settings.colourSafeMachine);
    g.addColorStop(0, alpha(col, 0));
    g.addColorStop(1, alpha(col, strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
