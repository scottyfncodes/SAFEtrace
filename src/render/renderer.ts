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
import { NOISE_REACH, type Sim } from '../sim/sim';
import { predictArc, MUZZLE_MAX, MUZZLE_MIN, LAUNCH_Z, PROJ_GRAVITY, type BallisticTarget } from '../sim/slingshot';
import { ViewCamera } from './camera';
import { PLAN, SLING_HINT } from '../content/copy';
import { ControlsRenderer } from './controls';
import { ChaseCamera, EYE_Z, PerspectiveRenderer, type CamState } from './perspective';
import { MachineRenderer } from './machine';
import { readPlan, readThrow, type PlanReading } from './plan';
import { VeneerRenderer, ROOF_K, roundRect, taperedStroke } from './veneer';
import { MACHINE, VENEER, alpha, mix, riskColour, shade } from './palette';

/** The plan's own inks: the player's sketch, not the machine's colours. */
const PLAN_INK = {
  camera: '#F0B45A',
  ghost: '#FFFFFF',
  reading: '#F2C86B',
  hot: '#FF6A4D',
  dead: '#9AA3AA',
};

interface Particle {
  kind: 'dust' | 'chip' | 'leaf' | 'spark' | 'bird';
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; phase: number;
}

/** Where a node's label hangs: roughly the height its housing sits at. */
const NODE_LABEL_Z = 3.0;

export class Renderer {
  readonly cam = new ViewCamera();
  private veneer: VeneerRenderer;
  private machine: MachineRenderer;
  readonly controls: ControlsRenderer;
  /** Set each frame by the host so the controls can be drawn last. */
  controlVisual: ControlVisual | null = null;
  private readonly perspective = new PerspectiveRenderer();
  readonly chase = new ChaseCamera();
  private aimFade = 0;
  /** Draw the cold-start pad hint. True until the player has actually moved. */
  showControlHome = false;
  /**
   * What the contextual prompt tells the player to do. Set once by the host,
   * because which gesture opens a node is a fact about the device.
   */
  interactVerb = 'INTERACT';
  /**
   * The device's safe-area insets, in CSS pixels, set by the host.
   *
   * Anything the renderer draws hard against an edge — the plan-view frame
   * most of all — has to know where the notch and the home indicator are, or
   * it draws a border the phone crops.
   */
  safe = { top: 0, right: 0, bottom: 0, left: 0 };
  private ctx: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;
  /** 0..1 wavefront progress, separate from sim.planViewBlend so it can overshoot. */
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

  /**
   * A line of the town's own conversation, hung over whoever said it. Small,
   * in a person's typeface, and gone in a few seconds. A public-address
   * speaker gets the brand's teal instead, because it is the brand talking.
   */
  speak(anchor: () => Vec2, text: string, seconds: number, broadcast = false): void {
    this.speech.push({ anchor, text, t: 0, life: seconds, broadcast });
    if (this.speech.length > 3) this.speech.shift();
  }

  private speech: Array<{ anchor: () => Vec2; text: string; t: number; life: number; broadcast: boolean }> = [];

  private drawSpeech(ctx: CanvasRenderingContext2D, eye: CamState, dt: number): void {
    if (this.speech.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    const keep: typeof this.speech = [];
    for (const s of this.speech) {
      s.t += dt;
      if (s.t >= s.life) continue;
      keep.push(s);
      const pos = s.anchor();
      const at = this.perspective.screenOf(eye, pos, s.broadcast ? 4.4 : 2.35, this.w, this.h);
      if (!at || at.x < -80 || at.x > this.w + 80 || at.y < 0 || at.y > this.h) continue;
      const a = Math.min(1, s.t / 0.25, (s.life - s.t) / 0.4);
      const words = wrapWords(ctx, s.text, Math.min(260, this.w * 0.6));
      const lh = 16;
      const wid = Math.max(...words.map((w) => ctx.measureText(w).width)) + 20;
      const hgt = words.length * lh + 12;
      const x = Math.max(wid / 2 + 8, Math.min(this.w - wid / 2 - 8, at.x));
      const y = at.y - hgt / 2 - 12;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.broadcast ? 'rgba(18, 52, 56, 0.9)' : 'rgba(247, 245, 240, 0.94)';
      roundRect(ctx, x - wid / 2, y - hgt / 2, wid, hgt, 8);
      ctx.fill();
      // The tail, down to the speaker.
      ctx.beginPath();
      ctx.moveTo(Math.max(x - wid / 2 + 10, Math.min(x + wid / 2 - 10, at.x)) - 6, y + hgt / 2);
      ctx.lineTo(at.x, y + hgt / 2 + 9);
      ctx.lineTo(Math.max(x - wid / 2 + 10, Math.min(x + wid / 2 - 10, at.x)) + 6, y + hgt / 2);
      ctx.fill();
      ctx.fillStyle = s.broadcast ? '#BFF5EA' : '#26313B';
      words.forEach((w, i) => ctx.fillText(w, x, y - hgt / 2 + 6 + lh / 2 + i * lh));
    }
    ctx.restore();
    this.speech = keep;
  }

  ripple(pos: Vec2, life = 0.9): void { this.ripples.push({ pos, t: 0, life }); }
  kick(a: number): void { this.cam.kick(a * this.settings.cameraShake); }



  /**
   * Where on the ground a point on the glass is.
   *
   * This used to be the flat plan camera's answer whatever was on screen, and
   * the world has been drawn in third person since pass 24 — so a mouse
   * pointing at a bin while skating was aiming at wherever that pixel would
   * have been on a map nobody was looking at. In the plan it is the map's
   * answer; everywhere else it is the ground under the pointer.
   */
  screenToWorld(p: Vec2): Vec2 {
    if (this.sim.planViewBlend < 0.5 && this.lastEye) {
      const g = this.perspective.groundAt(this.lastEye, p.x, p.y, this.w, this.h);
      if (g) return g;
    }
    return this.cam.toWorld(p, this.w, this.h);
  }
  private lastEye: CamState | null = null;
  private planWasOpen = false;

  /**
   * What is under a point on the glass, in the world: the first target the
   * sight-line passes through, the first wall it meets, or the ground. The
   * answer a thumb gets when it points a pulled sling at something — a lens
   * on a pole is the lens, not the pavement under it.
   */
  pick(screen: Vec2): { x: number; y: number; z: number; target: string | null } | null {
    const eye = this.lastEye;
    if (!eye || this.sim.planViewBlend > 0.5) return null;
    const { o, d } = this.perspective.rayAt(eye, screen.x, screen.y, this.w, this.h);
    const targets = this.sim.ballisticTargets();
    // Near things first: the ray starts at the eye, which is well back.
    let best: { t: number; id: string; z: number; x: number; y: number } | null = null;
    // How far along the ray the rider is. A tree between the lens and the
    // rider is in the way of the camera, not of the throw.
    const r = this.sim.player.pos;
    const riderT = (r.x - o.x) * d.x + (r.y - o.y) * d.y + (1.2 - o.z) * d.z;
    for (const tg of targets) {
      const px = tg.pos.x - o.x, py = tg.pos.y - o.y, pz = tg.z - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t <= 0) continue;
      if (tg.kind === 'foliage' && t < riderT) continue;
      const cx = o.x + d.x * t - tg.pos.x, cy = o.y + d.y * t - tg.pos.y, cz = o.z + d.z * t - tg.z;
      // A little generous: a thumb is not a pixel.
      if (Math.hypot(cx, cy, cz) > tg.radius * 1.35 + 0.15) continue;
      if (!best || t < best.t) best = { t, id: tg.id, z: tg.z, x: tg.pos.x, y: tg.pos.y };
    }
    // Walls and ground, by marching the ray.
    let hit: { x: number; y: number; z: number } | null = null;
    for (let t = 1; t < 260; t += 0.6) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (best && t > best.t) break;
      if (z <= 0) { hit = { x, y, z: 0 }; break; }
      // Likewise a roof the camera looks over on its way to the rider.
      const b = t > riderT - 25 ? this.sim.world.buildingAt({ x, y }) : null;
      if (b && z < b.height) { hit = { x, y, z }; break; }
    }
    if (best && (!hit || Math.hypot(hit.x - o.x, hit.y - o.y, hit.z - o.z) > best.t)) {
      return { x: best.x, y: best.y, z: best.z, target: best.id };
    }
    return hit ? { ...hit, target: null } : null;
  }

  /** The last pull's line, kept for the band's ring-down after the throw. */
  private lastThrow: { from: Vec2; to: Vec2 } | null = null;

  /**
   * The sling, in the rider's hands, in the street.
   *
   * It points where the pull points and stretches back as far as it is
   * pulled; let go and the pouch snaps through the fork and rings. Drawn in
   * screen space at the rider's hands, at the rider's own scale, so it reads
   * as the thing they are holding rather than a cursor.
   */
  private drawHeldSling(ctx: CanvasRenderingContext2D): void {
    const sim = this.sim;
    const drawing = sim.player.aiming && !sim.aimMode && this.throwAim;
    if (drawing) this.lastThrow = this.throwAim;
    const rt = this.release.t;
    const ringing = rt < 0.7 && !!this.lastThrow;
    if (!drawing && !ringing) return;
    const eye = this.lastEye;
    if (!eye) return;
    const p = sim.player.pos;
    const at = this.perspective.project3(eye, p.x, p.y, 1.2 + sim.player.z, this.w, this.h);
    if (!at) return;
    const aim = this.lastThrow!;
    // Larger than life, like the stone in flight: it is the thing being used.
    const size = Math.max(19, Math.min(38, at.s * 0.95));
    const from = { x: at.x, y: at.y };
    let ux = aim.to.x - aim.from.x, uy = aim.to.y - aim.from.y;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    const px = -uy, py = ux;
    const draw = drawing ? clamp01(sim.player.draw) : 0;
    const spring = rt < 0.7 ? -this.release.draw * 0.5 * Math.exp(-rt * 7.5) * Math.cos(rt * 34) : 0;
    const pull = size * (0.35 + (draw + spring) * 1.7);
    // The fork held out toward the target, the pouch drawn back from it.
    const fork = { x: from.x + ux * size * 0.55, y: from.y + uy * size * 0.55 };
    const grip = { x: fork.x - ux * size * 0.45, y: fork.y - uy * size * 0.45 + size * 0.1 };
    const flex = draw * size * 0.08;
    const tipL = { x: fork.x + ux * size * 0.5 + px * (size * 0.42 - flex), y: fork.y + uy * size * 0.5 + py * (size * 0.42 - flex) };
    const tipR = { x: fork.x + ux * size * 0.46 - px * (size * 0.38 - flex), y: fork.y + uy * size * 0.46 - py * (size * 0.38 - flex) };
    const pouch = { x: fork.x - ux * pull, y: fork.y - uy * pull };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A dark underline so it reads on lawn and on asphalt alike.
    ctx.strokeStyle = alpha('#12181F', 0.35);
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.beginPath(); ctx.moveTo(grip.x, grip.y); ctx.lineTo(fork.x, fork.y); ctx.stroke();
    ctx.strokeStyle = '#6E5236';
    taperedStroke(ctx, grip, fork, size * 0.16, size * 0.13, 0);
    taperedStroke(ctx, fork, tipL, size * 0.13, size * 0.07, -size * 0.06);
    taperedStroke(ctx, fork, tipR, size * 0.12, size * 0.06, size * 0.06);
    // The cords: slack when idle, taut when pulled, slapping after the throw.
    const sag = (1 - clamp01(draw)) * size * 0.12 + (rt < 0.5 ? Math.sin(rt * 60) * size * 0.2 * Math.exp(-rt * 8) : 0);
    ctx.strokeStyle = alpha('#E8DCC0', 0.95);
    ctx.lineWidth = Math.max(1.2, size * 0.05);
    for (const tip of [tipL, tipR]) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + pouch.x) / 2 + px * sag * 0.2, (tip.y + pouch.y) / 2 + sag, pouch.x, pouch.y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#5A452E';
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.beginPath();
    ctx.moveTo(pouch.x + px * size * 0.14, pouch.y + py * size * 0.14);
    ctx.lineTo(pouch.x - px * size * 0.14, pouch.y - py * size * 0.14);
    ctx.stroke();
    if (rt > 0.45 || drawing) {
      ctx.fillStyle = '#6A7178';
      ctx.beginPath(); ctx.arc(pouch.x, pouch.y, Math.max(2, size * 0.11), 0, Math.PI * 2); ctx.fill();
    }
    /*
     * The first tenth of a second after the release: a whip of air leaving
     * the fork along the throw. The stone itself is seven centimetres across
     * and gone in a frame; this is what says it came out of *this*, here.
     */
    if (!drawing && rt < 0.14 && !this.settings.reduceMotion) {
      const k = rt / 0.14;
      const reach = size * (1.2 + this.release.draw * 2.2);
      const tip = { x: fork.x + ux * size * 0.6, y: fork.y + uy * size * 0.6 };
      ctx.strokeStyle = alpha('#FFFFFF', 0.85 * (1 - k));
      ctx.lineWidth = Math.max(2, size * 0.14) * (1 - k * 0.6);
      ctx.beginPath();
      ctx.moveTo(tip.x + ux * reach * k * 0.5, tip.y + uy * reach * k * 0.5);
      ctx.lineTo(tip.x + ux * reach * (0.4 + k), tip.y + uy * reach * (0.4 + k));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A thin bright streak behind every stone in flight. A stone is seven
   * centimetres across and forty metres away; without this, a throw from
   * behind the rider is a thing you hear rather than see.
   */
  private drawStreaks(ctx: CanvasRenderingContext2D, eye: CamState): void {
    if (this.sim.projectiles.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const pr of this.sim.projectiles) {
      const pts = pr.trail.slice(-9);
      for (let i = 1; i < pts.length; i++) {
        const a = this.perspective.project3(eye, pts[i - 1].x, pts[i - 1].y, Math.max(0.05, pts[i - 1].z), this.w, this.h);
        const b = this.perspective.project3(eye, pts[i].x, pts[i].y, Math.max(0.05, pts[i].z), this.w, this.h);
        if (!a || !b) continue;
        const k = i / pts.length;
        ctx.strokeStyle = alpha('#FFFFFF', 0.75 * k);
        ctx.lineWidth = Math.max(1.2, Math.min(4, 0.09 * b.s)) * (0.4 + k * 0.6);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A mouse pull in progress, set by the host, drawn as the same band a thumb gets. */
  mousePull: { start: Vec2; cur: Vec2 } | null = null;

  private drawMousePull(ctx: CanvasRenderingContext2D): void {
    const m = this.mousePull;
    if (!m || this.sim.aimMode) return;
    const draw = clamp01(this.sim.player.draw);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha('#12181F', 0.3);
    ctx.lineWidth = 5 + draw * 2;
    ctx.beginPath(); ctx.moveTo(m.start.x, m.start.y); ctx.lineTo(m.cur.x, m.cur.y); ctx.stroke();
    ctx.strokeStyle = alpha(draw > 0.95 ? VENEER.player : '#F6F4EE', 0.55 + draw * 0.4);
    ctx.lineWidth = 2 + draw * 2;
    ctx.beginPath(); ctx.moveTo(m.start.x, m.start.y); ctx.lineTo(m.cur.x, m.cur.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(m.start.x, m.start.y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** A point in the street on the glass, or null behind the eye. */
  screenOf(p: Vec2, z: number): Vec2 | null {
    const eye = this.lastEye;
    if (!eye) return null;
    const at = this.perspective.project3(eye, p.x, p.y, z, this.w, this.h);
    return at ? { x: at.x, y: at.y } : null;
  }

  /** The ground under a point on the glass, in the street view only. */
  screenToGround(p: Vec2): Vec2 | null {
    return this.lastEye ? this.perspective.groundAt(this.lastEye, p.x, p.y, this.w, this.h) : null;
  }

  /** Where the rider's hands are on the glass: the place a pull is drawn from. */
  riderScreen(): Vec2 | null {
    const eye = this.lastEye;
    if (!eye) return null;
    const p = this.sim.player.pos;
    const at = this.perspective.project3(eye, p.x, p.y, 1.2 + this.sim.player.z, this.w, this.h);
    return at ? { x: at.x, y: at.y } : null;
  }

  /**
   * The pull, as the host has resolved it: where on the glass it is drawn
   * from and where it points. Set each frame while a sling is drawn; the
   * third-person sling is drawn along it.
   */
  throwAim: { from: Vec2; to: Vec2 } | null = null;

  // ------------------------------------------------------------ the plan

  /** Where the player has marked on the plan, if anywhere. Set by the host. */
  waypoint: Vec2 | null = null;
  /** People the player has actually spoken to, by id. Set by the host. */
  metPeople: ReadonlySet<string> = new Set();
  /** Places the player has stopped and looked at, by id. Set by the host. */
  seenPlaces: ReadonlySet<string> = new Set();
  /** Set by the host once SAFEtrace's number for the player has been found. */
  scoreLine: string | null = null;

  /**
   * What the plan is for, drawn on the plan.
   *
   * A map with a dot on it answers "where am I" and nothing else, and a
   * human could not say why they would open it. It now answers the
   * investigator's question — where is the thing I am looking for, and how do
   * I get there — with the places a person would name: the districts, the
   * buildings with names, the people you have met and the things you have
   * looked at, and a pin you put down yourself and then follow.
   */
  private drawPlanOverlay(ctx: CanvasRenderingContext2D, blend: number): void {
    const a = smoothstep(clamp01((blend - 0.35) / 0.65));
    if (a < 0.01) return;
    const sim = this.sim;
    const cam = this.cam;
    const at = (p: Vec2) => cam.toScreen(p, this.w, this.h);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Under the words: what the player knows about who is watching.
    const reading = readPlan(sim, this.waypoint);
    this.drawPlanSurveillance(ctx, reading, a);

    // Districts, large and quiet: the words people give directions in.
    ctx.font = '700 13px ui-monospace, Menlo, monospace';
    for (const d of sim.world.data.districts) {
      const c = at(d.centre);
      if (c.x < -100 || c.x > this.w + 100 || c.y < -40 || c.y > this.h + 40) continue;
      ctx.fillStyle = alpha(MACHINE.structureBright, 0.42 * a);
      ctx.fillText(d.name.toUpperCase().split('').join(' '), c.x, c.y);
    }

    // Street names, lettered along the longest straight run of each street,
    // upright whichever way the street goes. This is what the town says when
    // it tells you where something is: "CM-207 — Northgate Lane".
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    for (const st of sim.world.data.streets ?? []) {
      let best = -1, bi = 0;
      for (let i = 1; i < st.pts.length; i++) {
        const l = Math.hypot(st.pts[i].x - st.pts[i - 1].x, st.pts[i].y - st.pts[i - 1].y);
        if (l > best) { best = l; bi = i; }
      }
      if (bi === 0) continue;
      const pa = at(st.pts[bi - 1]), pb = at(st.pts[bi]);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const text = st.name.toUpperCase();
      const tw = ctx.measureText(text).width;
      if (len < tw + 24) continue;
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      if (mx < -80 || mx > this.w + 80 || my < -40 || my > this.h + 40) continue;
      let ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = alpha('#0B1117', 0.55 * a);
      ctx.fillRect(-tw / 2 - 4, -7, tw + 8, 14);
      ctx.fillStyle = alpha('#E9EFEC', 0.8 * a);
      ctx.fillText(text, 0, 0.5);
      ctx.restore();
    }

    // Buildings with names.
    ctx.font = '600 10px ui-monospace, Menlo, monospace';
    for (const b of sim.world.data.buildings) {
      // Places with names people use: shops, the school, the civic buildings.
      if (!b.label || (b.kind !== 'shop' && b.kind !== 'civic' && b.kind !== 'school')) continue;
      let cx = 0, cy = 0;
      for (const p of b.poly) { cx += p.x; cy += p.y; }
      const c = at({ x: cx / b.poly.length, y: cy / b.poly.length });
      if (c.x < -60 || c.x > this.w + 60 || c.y < -20 || c.y > this.h + 20) continue;
      const text = b.label.replace(/^NORTHGATE PARADE — /, '').replace(/^RIDGELINE — /, '');
      ctx.fillStyle = alpha('#0B1117', 0.6 * a);
      const wd = ctx.measureText(text).width + 8;
      ctx.fillRect(c.x - wd / 2, c.y - 7, wd, 14);
      ctx.fillStyle = alpha('#DDE6E4', 0.85 * a);
      ctx.fillText(text, c.x, c.y);
    }

    // People you know, where they are now; things you have looked at.
    const pin = (p: Vec2, label: string, col: string) => {
      const c = at(p);
      if (c.x < -40 || c.x > this.w + 40 || c.y < -40 || c.y > this.h + 40) return;
      ctx.fillStyle = alpha(col, 0.95 * a);
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha('#0B1117', 0.8 * a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = alpha('#0B1117', 0.7 * a);
      const wd = ctx.measureText(label).width + 8;
      ctx.fillRect(c.x + 7, c.y - 8, wd, 16);
      ctx.fillStyle = alpha(col, a);
      ctx.fillText(label, c.x + 11, c.y);
      ctx.textAlign = 'center';
    };
    for (const p of sim.people) if (p.visible && this.metPeople.has(p.id)) pin(p.pos, p.name, '#F2C86B');
    if (sim.devonVisible && sim.devonFollowing !== undefined && this.metPeople.has('devon')) pin(sim.devonPos, 'Devon', VENEER.friend);
    for (const pl of sim.places) if (pl.visible && this.seenPlaces.has(pl.id)) pin(pl.pos, pl.label, '#BFD7D2');

    // The pin you put down.
    if (this.waypoint) {
      const c = at(this.waypoint);
      const d = Math.round(Math.hypot(this.waypoint.x - sim.player.pos.x, this.waypoint.y - sim.player.pos.y));
      const me = at(sim.player.pos);
      ctx.strokeStyle = alpha(VENEER.player, 0.5 * a);
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.setLineDash([]);
      this.drawPinGlyph(ctx, c.x, c.y, a);
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = alpha('#F6F4EE', a);
      ctx.fillText(`${d} m`, c.x, c.y + 14);
    }

    // What this view is for, and how to use it — until it has been used.
    const lines: string[] = [];
    if (!this.waypoint) lines.push(this.touchHints ? PLAN.markTouch : PLAN.markMouse);
    lines.push(this.touchHints ? PLAN.moveTouch : PLAN.moveMouse);
    // What the plan reads off the town, above how to use it.
    const readings = reading.lines.slice(0, 3);
    lines.unshift(...readings);
    if (this.scoreLine) lines.unshift(this.scoreLine);
    const readFrom = this.scoreLine ? 1 : 0;
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    // Below the notes and toasts row, so nothing the town says covers it.
    const top = this.safe.top + (this.touchHints ? 132 : 78);
    lines.forEach((l, i) => {
      const wd = ctx.measureText(l).width + 20;
      ctx.fillStyle = alpha('#0B1117', 0.72 * a);
      roundRect(ctx, this.w / 2 - wd / 2, top + i * 22 - 9, wd, 19, 9);
      ctx.fill();
      const isReading = i >= readFrom && i < readFrom + readings.length;
      ctx.fillStyle = alpha(i === 0 && this.scoreLine ? '#F2C86B' : isReading ? PLAN_INK.reading : MACHINE.structureBright, 0.95 * a);
      ctx.fillText(l, this.w / 2, top + i * 22 + 0.5);
    });
    ctx.restore();
  }

  /**
   * The surveillance, as the player understands it.
   *
   * Before VISION, the cameras the player has noticed, drawn in warm ink
   * rather than the machine's cyan — this is their sketch, not the system's
   * map — each with the arc it has been seen to swing through, and the ones
   * that have the player right now drawn hot. With a pin down, the cameras a
   * stone there would turn are drawn a second time, ghosted, facing where
   * they would look: the route that opens is the gap they leave. Where
   * trouble has been caused there is a small mark, fading as the place
   * forgets. With VISION the machine layer below already draws every cone,
   * so only the pin's ghosts, the marks and SAFEtrace's own flagged areas are
   * added here.
   */
  private drawPlanSurveillance(ctx: CanvasRenderingContext2D, r: PlanReading, a: number): void {
    const cam = this.cam;
    const at = (p: Vec2) => cam.toScreen(p, this.w, this.h);
    const vision = this.sim.visionUnlocked;
    const wedge = (c: Vec2, facing: number, half: number, range: number) => {
      const o = at(c);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.arc(o.x, o.y, range * cam.zoom, facing - half, facing + half);
      ctx.closePath();
    };
    ctx.save();

    // SAFEtrace's own view of where things keep happening.
    for (const ar of r.areas) {
      const c = at(ar.pos);
      const col = ar.level === 'REVIEW' ? PLAN_INK.hot : PLAN_INK.reading;
      ctx.strokeStyle = alpha(col, 0.7 * a);
      ctx.fillStyle = alpha(col, 0.07 * a);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c.x, c.y, 34 * cam.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 10px ui-monospace, Menlo, monospace';
      ctx.fillStyle = alpha(col, 0.95 * a);
      ctx.fillText(`${ar.district.toUpperCase()} — ${ar.level}`, c.x, c.y - 34 * cam.zoom - 8);
    }

    if (!vision) {
      for (const c of r.cameras) {
        const half = c.fov / 2;
        const ink = c.seeing ? VENEER.player : PLAN_INK.camera;
        if (!c.live) {
          const o = at(c.pos);
          ctx.strokeStyle = alpha(PLAN_INK.dead, 0.8 * a);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(o.x - 4, o.y - 4); ctx.lineTo(o.x + 4, o.y + 4);
          ctx.moveTo(o.x + 4, o.y - 4); ctx.lineTo(o.x - 4, o.y + 4); ctx.stroke();
          continue;
        }
        // Where it swings to: a thin arc at the edge of its reach.
        if (c.sweep > 0.02) {
          const o = at(c.pos);
          ctx.strokeStyle = alpha(ink, 0.35 * a);
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 5]);
          ctx.beginPath();
          ctx.arc(o.x, o.y, c.range * cam.zoom, c.home - c.sweep - half, c.home + c.sweep + half);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        wedge(c.pos, c.facing, half, c.range);
        ctx.fillStyle = alpha(ink, (c.seeing ? 0.26 : 0.13) * a);
        ctx.fill();
        ctx.strokeStyle = alpha(ink, (c.seeing ? 0.95 : 0.6) * a);
        ctx.lineWidth = c.vigilant ? 2.2 : 1.2;
        ctx.stroke();
        const o = at(c.pos);
        ctx.fillStyle = alpha(ink, a);
        ctx.beginPath(); ctx.arc(o.x, o.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // The machine draws every cone; make the ones that have you unmissable.
      for (const c of r.cameras) {
        if (!c.seeing) continue;
        wedge(c.pos, c.facing, c.fov / 2, c.range);
        ctx.strokeStyle = alpha(VENEER.player, 0.9 * a);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Where trouble was made. Heavier things leave a bigger mark.
    for (const m of r.marks) {
      const c = at(m.pos);
      const k = (m.heavy ? 6 : 3.5);
      ctx.strokeStyle = alpha(m.heavy ? PLAN_INK.hot : PLAN_INK.reading, Math.min(1, 0.25 + m.strength) * a);
      ctx.lineWidth = m.heavy ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k);
      ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k);
      ctx.stroke();
    }

    // What a noise at the pin would do.
    const e = r.earshot;
    if (e) {
      const ghost = (ids: string[], toward: Vec2, faint: boolean) => {
        for (const id of ids) {
          const c = r.cameras.find((x) => x.id === id);
          if (!c) continue;
          // A place that has heard too much looks back at whoever threw it.
          const target = e.wary ? this.sim.player.pos : toward;
          const facing = Math.atan2(target.y - c.pos.y, target.x - c.pos.x);
          const col = e.wary ? PLAN_INK.hot : PLAN_INK.ghost;
          wedge(c.pos, facing, c.fov / 2, c.range);
          ctx.fillStyle = alpha(col, (faint ? 0.05 : 0.09) * a);
          ctx.fill();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = alpha(col, (faint ? 0.45 : 0.8) * a);
          ctx.lineWidth = 1.4;
          ctx.stroke();
          const o = at(c.pos), t = at(toward);
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(t.x, t.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      };
      ghost(e.stone, e.at, false);
      if (e.loud) {
        ghost(e.loud.sensors.filter((id) => !e.stone.includes(id)), e.loud.pos, true);
        const c = at(e.loud.pos);
        ctx.strokeStyle = alpha(PLAN_INK.ghost, 0.9 * a);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      // The stone's own earshot, so "near the pin" means something.
      const p = at(e.at);
      ctx.strokeStyle = alpha(PLAN_INK.ghost, 0.35 * a);
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, NOISE_REACH.ground * 2.2 * cam.zoom, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** A map pin: the one mark on the plan that is the player's own. */
  private drawPinGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    ctx.fillStyle = alpha(VENEER.player, a);
    ctx.strokeStyle = alpha('#0B1117', 0.8 * a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 9, y - 12, x - 8, y - 24, x, y - 24);
    ctx.bezierCurveTo(x + 8, y - 24, x + 9, y - 12, x, y);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = alpha('#F6F4EE', a);
    ctx.beginPath(); ctx.arc(x, y - 16, 3, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * The pin, out in the world.
   *
   * A thin column of light standing on the spot, so it can be seen over roofs
   * from streets away, and — when it is behind you or off to the side — a
   * small arrow at the edge of the glass pointing round to it. Arriving puts
   * it away. Nothing else in the third-person view is a marker; this one is
   * there because the player put it there.
   */
  private drawBeacon(ctx: CanvasRenderingContext2D, eye: CamState, a: number): void {
    const wp = this.waypoint;
    if (!wp || a < 0.02) return;
    const sim = this.sim;
    const d = Math.hypot(wp.x - sim.player.pos.x, wp.y - sim.player.pos.y);
    const foot = this.perspective.project3(eye, wp.x, wp.y, 0, this.w, this.h);
    const head = this.perspective.project3(eye, wp.x, wp.y, 14, this.w, this.h);
    ctx.save();
    const onScreen = foot && head && head.x > 20 && head.x < this.w - 20 && foot.y > 0 && head.y < this.h;
    if (onScreen && foot && head) {
      const g = ctx.createLinearGradient(foot.x, foot.y, head.x, head.y);
      g.addColorStop(0, alpha(VENEER.player, 0.75 * a));
      g.addColorStop(1, alpha(VENEER.player, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(2, Math.min(7, 0.35 * foot.s));
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = alpha('#0B1117', 0.6 * a);
      const label = `${Math.round(d)} m`;
      const wd = ctx.measureText(label).width + 10;
      const ly = Math.max(this.safe.top + 14, Math.min(this.h - 20, (foot.y + head.y) / 2));
      roundRect(ctx, head.x - wd / 2, ly - 8, wd, 16, 8); ctx.fill();
      ctx.fillStyle = alpha('#F6F4EE', 0.95 * a);
      ctx.fillText(label, head.x, ly + 0.5);
    } else {
      // Round the edge: the direction relative to the way the camera faces.
      const rel = Math.atan2(wp.y - eye.pos.y, wp.x - eye.pos.x) - eye.yaw;
      const sx = Math.sin(rel), sy = -Math.cos(rel);
      // An ellipse well inside the glass, clear of the thumbs' corners and
      // of whatever the HUD has along the bottom edge.
      const rx = this.w / 2 - 44, ry = this.h / 2 - 110;
      const k = 1 / Math.max(Math.abs(sx) / rx, Math.abs(sy) / ry);
      const x = this.w / 2 + sx * k, y = this.h / 2 - 20 + sy * k;
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = alpha('#0B1117', 0.55 * a);
      const label = `${Math.round(d)} m`;
      const wd = ctx.measureText(label).width + 10;
      roundRect(ctx, x - sx * 26 - wd / 2, y - sy * 26 - 8, wd, 16, 8); ctx.fill();
      ctx.fillStyle = alpha('#F6F4EE', 0.95 * a);
      ctx.fillText(label, x - sx * 26, y - sy * 26 + 4);
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(sy, sx));
      ctx.fillStyle = alpha(VENEER.player, 0.9 * a);
      ctx.strokeStyle = alpha('#0B1117', 0.6 * a);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-9, -11); ctx.lineTo(-4, 0); ctx.lineTo(-9, 11); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ the stone's life

  /** Bits of the world a stone knocked loose: dust, chips, leaves, sparks, birds. */
  private particles: Particle[] = [];
  /** Seconds since the band was let go, and how far it had been drawn. */
  private release = { t: 99, draw: 0 };
  /** A short jolt of the aiming view on release and on a solid hit. */
  private recoil = 0;
  /** True once the player has taken a shot this afternoon; retires the hint. */
  private shotTaken = false;
  /** Whether the host is a phone, for the one-time pull hint. */
  touchHints = false;

  /** The band has just been let go. */
  onRelease(draw: number): void {
    this.release = { t: 0, draw };
    this.recoil = Math.max(this.recoil, 0.35 + draw * 0.65);
    this.shotTaken = true;
  }

  /** A solid hit near enough to feel. */
  jolt(amount: number): void { this.recoil = Math.max(this.recoil, amount); }

  /** A tree was hit; it shivers for a second and a half. */
  shakeTree(id: string): void { this.perspective.treeShake.set(id, 1); }

  /**
   * Throw some of the world into the air.
   *
   * `kind` decides what: pale dust off a lawn or a road, grey chips off a wall,
   * green leaves out of a tree, bright sparks off metal, and birds — which go
   * up and away rather than falling.
   */
  burst(kind: Particle['kind'], pos: Vec2, z: number, n: number, heading = 0, force = 1): void {
    const seed = pos.x * 12.9898 + pos.y * 78.233 + this.particles.length;
    const rnd = (i: number) => {
      const v = Math.sin(seed + i * 43.758) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < n; i++) {
      const a = heading + Math.PI + (rnd(i) - 0.5) * (kind === 'bird' ? 2.2 : 3.4);
      const sp = (kind === 'bird' ? 5 : kind === 'leaf' ? 1.2 : 2.2) * (0.5 + rnd(i + 7)) * force;
      const life = kind === 'bird' ? 2.6 : kind === 'leaf' ? 2.2 + rnd(i + 3) : kind === 'dust' ? 0.7 : 0.55;
      this.particles.push({
        kind,
        x: pos.x + (rnd(i + 11) - 0.5) * (kind === 'leaf' ? 2.4 : 0.2),
        y: pos.y + (rnd(i + 13) - 0.5) * (kind === 'leaf' ? 2.4 : 0.2),
        z: z + (kind === 'leaf' ? (rnd(i + 17) - 0.5) * 1.6 : 0.05),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        vz: kind === 'bird' ? 3 + rnd(i + 5) * 2 : kind === 'leaf' ? 0.3 : (1.2 + rnd(i + 5) * 2.4) * force,
        life, max: life,
        size: kind === 'dust' ? 0.16 + rnd(i + 19) * 0.12 : kind === 'bird' ? 0.14 : kind === 'leaf' ? 0.07 : 0.04,
        phase: rnd(i + 23) * 6.28,
      });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  private stepParticles(dt: number): void {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.kind === 'bird') {
        p.vz += 1.2 * dt;
        p.phase += dt * 22;
      } else if (p.kind === 'leaf') {
        // Leaves fall slowly and side to side.
        p.vz = Math.max(-0.9, p.vz - 2.2 * dt);
        p.phase += dt * 3;
        p.vx *= 0.97; p.vy *= 0.97;
      } else {
        p.vz -= (p.kind === 'dust' ? 4 : 9.81) * dt;
        if (p.kind === 'dust') { p.vx *= 0.9; p.vy *= 0.9; }
      }
      p.x += p.vx * dt + (p.kind === 'leaf' ? Math.sin(p.phase) * 0.6 * dt : 0);
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0 && p.kind !== 'bird') { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
      keep.push(p);
    }
    this.particles = keep;
    for (const [id, v] of this.perspective.treeShake) {
      const n = v - dt / 1.5;
      if (n <= 0) this.perspective.treeShake.delete(id); else this.perspective.treeShake.set(id, n);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, eye: CamState): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const at = this.perspective.project3(eye, p.x, p.y, p.z, this.w, this.h);
      if (!at) continue;
      const k = p.life / p.max;
      const r = Math.max(0.8, Math.min(14, p.size * at.s));
      switch (p.kind) {
        case 'dust':
          ctx.fillStyle = alpha('#D9CFBE', 0.55 * k);
          ctx.beginPath(); ctx.arc(at.x, at.y, r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill();
          break;
        case 'leaf':
          ctx.fillStyle = alpha(p.phase % 2 > 1 ? VENEER.treeLight : VENEER.tree, Math.min(1, k * 2));
          ctx.beginPath(); ctx.ellipse(at.x, at.y, r * 1.4, r * 0.6, p.phase, 0, Math.PI * 2); ctx.fill();
          break;
        case 'spark':
          ctx.fillStyle = alpha('#FFE3A3', k);
          ctx.beginPath(); ctx.arc(at.x, at.y, Math.max(1, r * 0.7), 0, Math.PI * 2); ctx.fill();
          break;
        case 'chip':
          ctx.fillStyle = alpha('#8A8D90', k);
          ctx.fillRect(at.x - r / 2, at.y - r / 2, r, r);
          break;
        case 'bird': {
          // Two strokes that beat: a bird at any distance.
          const flap = Math.sin(p.phase) * r * 0.9;
          ctx.strokeStyle = alpha('#2B3036', Math.min(1, k * 1.5));
          ctx.lineWidth = Math.max(1, r * 0.35);
          ctx.beginPath();
          ctx.moveTo(at.x - r * 1.6, at.y - flap);
          ctx.quadraticCurveTo(at.x - r * 0.6, at.y - r * 0.2, at.x, at.y);
          ctx.quadraticCurveTo(at.x + r * 0.6, at.y - r * 0.2, at.x + r * 1.6, at.y - flap);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  }

  /**
   * Where the stone will go, drawn in the world rather than on the glass.
   *
   * The dotted arc is the real ballistic path at the draw you are holding — it
   * reaches the thing under the sight when the pull is enough to get there and
   * visibly falls short when it is not, which is how a player learns the draw
   * without being told a number. It stops where it would meet a wall. Nothing
   * is snapped and nothing is highlighted: the arc is physics, not a lock.
   */
  private drawTrajectory(ctx: CanvasRenderingContext2D, eye: CamState, from: Vec2, draw: number, strength: number): void {
    const sim = this.sim;
    const { angle, pitch } = sim.aim;
    const speed = MUZZLE_MIN + draw * (MUZZLE_MAX - MUZZLE_MIN);
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const hz = Math.cos(pitch);
    const pts: Array<{ x: number; y: number; z: number }> = [];
    let end: { x: number; y: number; z: number; ground: boolean } | null = null;
    const targets = sim.ballisticTargets();
    let struck: BallisticTarget | null = null;
    for (let i = 1; i <= 90; i++) {
      const t = i * 0.035;
      const x = from.x + dir.x * speed * hz * t;
      const y = from.y + dir.y * speed * hz * t;
      const z = LAUNCH_Z + Math.sin(pitch) * speed * t - 0.5 * PROJ_GRAVITY * t * t;
      if (z <= 0) { end = { x, y, z: 0, ground: true }; break; }
      const b = sim.world.buildingAt({ x, y });
      if (b && z < b.height) { end = { x, y, z, ground: false }; break; }
      // It stops where the stone would: at whatever it meets first.
      const hit = targets.find((tg) => Math.hypot(tg.pos.x - x, tg.pos.y - y, tg.z - z) <= tg.radius + 0.28);
      if (hit && Math.hypot(hit.pos.x - from.x, hit.pos.y - from.y) > 1.5) { end = { x, y, z, ground: false }; struck = hit; break; }
      pts.push({ x, y, z });
    }
    if (strength <= 0.01) return;
    ctx.save();
    // Dots, spaced along the flight, larger near and smaller far.
    for (let i = 2; i < pts.length; i += 2) {
      const p = pts[i];
      const at = this.perspective.project3(eye, p.x, p.y, p.z, this.w, this.h);
      if (!at) continue;
      const r = Math.max(2.1, Math.min(5, 0.08 * at.s));
      const fade = 1 - 0.6 * i / (pts.length + 8);
      ctx.fillStyle = alpha('#12181F', 0.45 * strength * fade);
      ctx.beginPath(); ctx.arc(at.x, at.y, r + 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = alpha('#F6F4EE', 0.95 * strength * fade);
      ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (end) {
      // Where it comes down: a ring lying on the ground, or a tick on a wall.
      ctx.strokeStyle = alpha(VENEER.player, 0.95 * strength);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (end.ground) {
        // Big enough to read edge-on from eye height twenty metres away.
        const rr = 0.5 + Math.hypot(end.x - from.x, end.y - from.y) * 0.03;
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const at = this.perspective.project3(eye, end.x + Math.cos(a) * rr, end.y + Math.sin(a) * rr, 0.02, this.w, this.h);
          if (!at) continue;
          if (k === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
        }
      } else {
        const at = this.perspective.project3(eye, end.x, end.y, end.z, this.w, this.h);
        if (at) { ctx.moveTo(at.x - 6, at.y - 6); ctx.lineTo(at.x + 6, at.y + 6); ctx.moveTo(at.x + 6, at.y - 6); ctx.lineTo(at.x - 6, at.y + 6); }
      }
      ctx.stroke();
      // In the street, drawn: what this stone would *do* there, in a word or three.
      // Under the mark rather than over it: over things is where the world's
      // own prompts float, and the words must be readable at a light pull.
      if (!sim.aimMode && sim.player.draw > 0.05) {
        const at = this.perspective.project3(eye, end.x, end.y, end.z, this.w, this.h);
        if (at) this.readoutPill(ctx, readThrow(sim, end, struck), at.x, at.y + 24, 0.95);
      }
    }
    ctx.restore();
  }

  /** A few words over a place in the street, kept on the glass. */
  private readoutPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, a: number): void {
    ctx.font = '700 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 14;
    const cx = Math.max(tw / 2 + 8, Math.min(this.w - tw / 2 - 8, x));
    const cy = Math.max(this.safe.top + 70, Math.min(this.h - 40, y));
    ctx.fillStyle = alpha('#0B1117', 0.7 * a);
    roundRect(ctx, cx - tw / 2, cy - 9, tw, 18, 9); ctx.fill();
    ctx.fillStyle = alpha('#F6F4EE', 0.95 * a);
    ctx.fillText(text, cx, cy + 0.5);
  }

  render(dt: number): void {
    const sim = this.sim;
    const ctx = this.ctx;

    this.stepParticles(dt);
    this.release.t += dt;
    this.controls.throwHint = this.touchHints && !this.shotTaken;
    this.controls.slingReady = clamp01(sim.slingReady);
    this.recoil = Math.max(0, this.recoil - dt * 4.5);

    // Aiming is a place the player goes, not a layer on top of the world.
    this.aimFade += (sim.aimMode ? 1 : -1) * dt * 5.5;
    this.aimFade = clamp01(this.aimFade);
    if (sim.aimMode || this.aimFade > 0.01) {
      this.renderAiming(ctx, dt);
      if (sim.aimMode) {
        if (this.controlVisual) this.controls.draw(ctx, this.controlVisual, this.w, this.h, this.safe);
        return;
      }
    }

    /*
     * Two views, and which one you are in means something.
     *
     * Third person is your body: you, the board, the pavement, and the camera
     * on the wall that is pointing at you. The plan view is the town drawn as
     * data, from above, because a plan is where structure is legible — and,
     * once SAFEtrace VISION is unlocked, it is also where coverage, edges,
     * forecast and evidence become readable. Holding PLAN crosses from one to
     * the other, which is what the peel has always been for.
     */
    this.chase.cinematic = this.cam.scripted;
    this.chase.update(sim, dt);
    if (sim.planViewBlend < 0.999) {
      const eye = this.chase.state(sim);
      this.lastEye = eye;
      this.perspective.lens = 1;
      this.perspective.draw(ctx, sim, eye, this.w, this.h, false);
      this.drawParticles(ctx, eye);
      this.drawStreaks(ctx, eye);
      // A sling being pulled back: the arc it will fly, from the rider.
      if (sim.player.aiming && !sim.aimMode && sim.player.draw > 0.02) {
        this.drawTrajectory(ctx, eye, sim.player.pos, sim.shotDraw(), 0.35 + sim.player.draw * 0.65);
      }
      this.drawHeldSling(ctx);
      this.drawMousePull(ctx);
      this.drawSkateHud(ctx);
      this.drawSpeech(ctx, eye, dt);
      this.drawInteractPrompt(ctx, eye, dt);
      this.drawBeacon(ctx, eye, 1 - sim.planViewBlend);
    }
    if (sim.planViewBlend <= 0.001) {
      if (this.controlVisual) {
        this.controls.update(this.controlVisual, dt, this.showControlHome, this.sim.planViewActive);
        this.controls.draw(ctx, this.controlVisual, this.w, this.h, this.safe);
      }
      return;
    }
    ctx.globalAlpha = sim.planViewBlend;

    // Opening the plan rises from the street to the map, rather than cutting.
    const planOpen = sim.planViewActive && sim.planViewBlend > 0;
    if (planOpen && !this.planWasOpen) {
      this.cam.pos = { ...sim.player.pos };
      this.cam.zoom = 15 * Math.min(1.15, Math.max(0.92, Math.min(this.w, this.h) / 810));
      this.cam.planPan = { x: 0, y: 0 };
    }
    this.planWasOpen = planOpen;
    this.cam.plan = planOpen || sim.planViewBlend > 0.05;
    this.cam.planDetail = sim.visionUnlocked;

    this.cam.follow(
      sim.player.pos, sim.player.vel, sim.player.speed, sim.playerMaxSpeed, dt,
      this.settings.cameraShake,
    );

    // The peel leads the blend slightly on the way in and trails on the way out,
    // which is what makes it feel like a wave rather than a fade.
    const target = sim.planViewBlend;
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
    this.drawPlanOverlay(ctx, sim.planViewBlend);

    ctx.globalAlpha = 1;

    if (this.controlVisual) {
      this.controls.update(this.controlVisual, dt, this.showControlHome, this.sim.planViewActive);
      this.controls.draw(ctx, this.controlVisual, this.w, this.h, this.safe);
    }
  }

  /**
   * What the skating view needs on top of it, and nothing more: a speed read,
   * and a warning when something is actually looking at you. Coverage geometry
   * belongs in the plan view, where it can be read.
   */
  private renderAiming(ctx: CanvasRenderingContext2D, dt: number): void {
    const sim = this.sim;
    void dt;
    const draw = clamp01(sim.player.draw);
    const from = sim.aimAnchor ?? sim.player.pos;
    // The release throws the eye up a touch and lets it settle.
    const kick = this.recoil * this.recoil * 0.035 * this.settings.cameraShake;
    const eye = {
      pos: { x: from.x, y: from.y, z: EYE_Z },
      yaw: sim.aim.angle,
      pitch: sim.lookPitch + kick,
    };
    // Attention narrows as the pull comes up: about ten per cent at full draw.
    const eased = draw * draw * (3 - 2 * draw);
    this.perspective.lens = 1 + eased * 0.1;
    this.lastEye = eye;
    this.perspective.draw(ctx, sim, eye, this.w, this.h, true);
    this.drawParticles(ctx, eye);
    this.drawStreaks(ctx, eye);
    // A ghost of the path while slack, confident once drawn.
    // Held back for a moment after a shot, so the stone is the thing to watch.
    const settle = clamp01((this.release.t - 0.5) / 0.5);
    this.drawTrajectory(ctx, eye, from, Math.max(draw, 0.35), Math.max(0.22 * settle + eased * 0.78, eased));
    this.perspective.lens = 1;

    const cx = this.w / 2, cy = this.h / 2 - kick * 900;

    /*
     * No brackets on the thing under the sight.
     *
     * There were: a target the ballistic solver had picked out got a set of
     * corner marks drawn round it, and the reticle changed colour to say so.
     * Nothing was ever snapped or magnetised — the bearing has always been
     * exactly where the thumb put it — but a box that appears around a drone
     * the moment you sweep across it *reads* as a lock, and a player who
     * believes the game is locking on has stopped aiming. So the reticle is
     * one shape, one colour, in one place, and it says nothing about what is
     * behind it.
     */

    // The reticle: a ring that closes as the band loads. Empty means not ready.
    const rr = 26 - draw * 11;
    ctx.strokeStyle = alpha('#12181F', 0.55);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = alpha('#F6F4EE', 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - rr - 9, cy); ctx.lineTo(cx - rr - 3, cy);
    ctx.moveTo(cx + rr + 3, cy); ctx.lineTo(cx + rr + 9, cy);
    ctx.moveTo(cx, cy - rr - 9); ctx.lineTo(cx, cy - rr - 3);
    ctx.stroke();

    // Draw strength, as an arc filling around the reticle.
    if (draw > 0.02) {
      ctx.strokeStyle = alpha(VENEER.player, 0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rr + 8, -Math.PI / 2, -Math.PI / 2 + draw * Math.PI * 2);
      ctx.stroke();
    }

    /*
     * No bearings column here.
     *
     * There was one, drawn low on the right — and the HUD draws its own,
     * labelled, against the same edge, which does not go away when the sling
     * comes up. So aiming showed the player two columns of dots, one of them
     * unlabelled, counting the same thing. Two of a thing is worse than one of
     * it: the second one is a question.
     */
    const shot = sim.lastShot;
    if (shot && shot.label && sim.tick - shot.tick < 110) {
      const a = 1 - (sim.tick - shot.tick) / 110;
      ctx.fillStyle = alpha(shot.hit ? VENEER.player : '#9AA3A9', a);
      ctx.font = '600 13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(shot.label, cx, cy - 52);
      ctx.textAlign = 'left';
    }

    this.drawSlingInHands(ctx, draw);
    if (this.touchHints && !this.shotTaken) this.drawPullHint(ctx, draw);

    // A frame, so it is obvious this is a state and not the world.
    ctx.strokeStyle = alpha('#12181F', 0.5);
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
  }

  /**
   * The slingshot, held in two hands, showing what the draw is doing.
   *
   * This used to be the control scheme drawn as an object, literally: the
   * fork rendered at the raw screen position of the left thumb, the pouch at
   * the raw screen position of the right, on the theory that a prop glued to
   * each thumb's actual coordinate needs no translation — "nothing on screen
   * is a metaphor for the input; it is the input." It reads well as a
   * sentence and broke down against an actual two-thumb grip: a thumb resting
   * anywhere in the *middle* of its own half — not an edge case, the ordinary
   * comfortable spot — puts the two hands most of a phone's width apart, and
   * the cords from two fork tips to one pouch that far to one side cross each
   * other in a wide X across the centre of the screen. Worse, since the left
   * thumb's whole job is dragging to swing the camera, every bit of aiming
   * physically relocated the entire prop, arms included, which is what a
   * report of "jumps unexpectedly" and "not fluid" describes exactly.
   *
   * The fork now rests at a single fixed point — `slingRest` — for the whole
   * time a shot is being lined up, whatever the aim thumb is doing. That
   * thumb's drag already reaches the camera through `takeAimDrag`, which
   * reads only the *change* in position; the object never needed to track
   * where it landed. The pouch moves along one fixed axis out from the fork,
   * by an amount proportional to `draw` (0 at rest, 1 at a full pull) — the
   * same clean mapping a joystick's cap uses, and one that costs nothing on
   * a mouse either, where a bound cursor position was never available to draw
   * from anyway.
   *
   * Drawn in screen space at the bottom of the view rather than as world
   * geometry: it is held against the eye, so it does not belong in the
   * projection, and this way it costs nothing and never clips into a wall.
   */
  private drawSlingInHands(ctx: CanvasRenderingContext2D, drawIn: number): void {
    /*
     * The band is a spring, and it behaves like one.
     *
     * Let go and the pouch does not simply reappear at rest: it snaps forward
     * through the fork, overshoots, and rings back and forth a few times with
     * the cords slapping — which is the whole of "release" as a feeling, and
     * happens in the frame the stone leaves. Held at full draw too long, the
     * arms start to shake.
     */
    const rt = this.release.t;
    const spring = rt < 0.7 ? -this.release.draw * 0.42 * Math.exp(-rt * 7.5) * Math.cos(rt * 34) : 0;
    const draw = drawIn + spring;
    const held = this.sim.player.drawHeld;
    const shake = held > 1.4 && !this.settings.reduceMotion ? Math.min(1, (held - 1.4) * 0.8) : 0;
    const jx = shake * Math.sin(this.release.t * 71) * 2.2;
    const jy = shake * Math.cos(this.release.t * 53) * 1.8;
    const base = this.h + 18;
    const fx = this.slingRest.x + jx - this.recoil * this.recoil * 10;
    const forkY = this.slingRest.y - 54 + jy + this.recoil * this.recoil * 14;
    const span = Math.min(46, this.w * 0.115);
    const prong = Math.min(54, this.h * 0.085);
    const skin = '#E8BE9B';
    // Rest is close in, against the fork; full draw is a fixed reach back and
    // down, toward where a right hand pulling to the cheek actually ends up —
    // never further than the arm below can plausibly stretch.
    const restPull = { x: fx + 26, y: forkY + prong * 0.4 };
    const drawX = Math.min(120, this.w * 0.28);
    const drawY = Math.min(150, this.h * 0.24);
    const pullX = restPull.x + drawX * draw;
    const pullY = restPull.y + drawY * draw;

    /*
     * A stick and a string, which is what this is.
     *
     * It used to be a machined fork with a wide rubber band folded through a
     * point: two straight lines, one thick V, and a dot. That is a diagram of a
     * catapult, and at any size it collapsed into a letter Y.
     *
     * What a fourteen-year-old actually has is a forked branch cut out of a
     * hedge — thicker at the grip than at the tips, never straight, with a stub
     * where a twig was taken off — with cord whipped onto each prong and a
     * scrap of leather between the two cords holding the stone. Every part of
     * that is drawn below, because every part of it is why the object reads as
     * something somebody made rather than something the game issued them.
     */
    const crotch = { x: fx, y: forkY };
    const grab = { x: fx, y: forkY + prong * 1.2 };
    // Under load the prongs bow in toward the pouch: green wood gives.
    const flex = Math.max(0, draw) * 6;
    const tipL = { x: fx - span + flex, y: forkY - prong + flex * 0.5 };
    // The right prong is shorter and sits a little lower. A branch that forks
    // symmetrically is a branch nobody believes.
    const tipR = { x: fx + span * 0.92 - flex * 0.4, y: forkY - prong * 0.9 + flex * 0.8 };
    const BARK = '#6E5236';
    const LIT = '#9C7B51';
    const CORD = '#D8C7A4';
    const LEATHER = '#5A452E';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Forward hand and arm, holding the fork out. The arm comes up from the
    // bottom-left corner, which is where the thumb that owns it lives.
    ctx.strokeStyle = shade(VENEER.player, -0.34);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(this.w * 0.08, base);
    ctx.lineTo(fx, forkY + prong * 1.05);
    ctx.stroke();

    // --- the branch ---------------------------------------------------------
    // Drawn before the hand, so the hand closes around the grip rather than
    // the stick being laid on top of a fist.
    ctx.strokeStyle = BARK;
    taperedStroke(ctx, grab, crotch, 12, 9.5, -3);
    taperedStroke(ctx, crotch, tipL, 9, 4.6, -7);
    taperedStroke(ctx, crotch, tipR, 8.5, 4.2, 6);
    // The stub, where a twig was cut off. One detail, and it does more than
    // the other three put together.
    taperedStroke(ctx,
      { x: fx + 1, y: forkY + prong * 0.52 },
      { x: fx + 11, y: forkY + prong * 0.34 }, 5.5, 2.4, 2, 4);

    // The lit side, up and to the left, thinner and offset just enough to read
    // as a round stick rather than a flat one.
    ctx.strokeStyle = LIT;
    taperedStroke(ctx,
      { x: grab.x - 1.8, y: grab.y - 1.8 }, { x: crotch.x - 1.8, y: crotch.y - 1.8 },
      4.5, 3.4, -3);
    taperedStroke(ctx,
      { x: crotch.x - 1.8, y: crotch.y - 2 }, { x: tipL.x - 1.4, y: tipL.y - 1.6 },
      3.4, 1.6, -7);
    taperedStroke(ctx,
      { x: crotch.x - 1.2, y: crotch.y - 2 }, { x: tipR.x - 1.2, y: tipR.y - 1.6 },
      3.2, 1.5, 6);

    // --- cord, whipping and pouch -------------------------------------------
    // Where the pouch hangs, and which way round it is: its length lies across
    // the pull, because that is where the two cords come in from.
    const ax = pullX - fx, ay = pullY - forkY;
    const len = Math.hypot(ax, ay) || 1;
    const perp = { x: -ay / len, y: ax / len };
    const half = 8.5;
    const endA = { x: pullX + perp.x * half, y: pullY + perp.y * half };
    const endB = { x: pullX - perp.x * half, y: pullY - perp.y * half };
    /*
     * Which cord goes to which end of the pouch.
     *
     * "Whichever end is nearer" is the obvious rule and it is wrong: at a long
     * draw the pouch is nearly edge-on, so the two distances differ by a
     * couple of pixels out of three hundred and the answer flips — and a
     * flipped answer draws the cords crossing each other in mid-air. Of the two
     * possible pairings the shorter *total* is always the one that does not
     * cross, which is true for any geometry the player can produce, including
     * drawing back past the fork.
     */
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const straight = d(tipL, endA) + d(tipR, endB) <= d(tipL, endB) + d(tipR, endA);
    const nearL = straight ? endA : endB;
    const nearR = straight ? endB : endA;

    // Slack when it is not drawn, taut when it is. String does not thin the way
    // rubber does, so the tension has to read from the sag instead.
    const sag = (1 - Math.min(1, Math.max(0, draw))) * 7 + (rt < 0.5 ? Math.sin(rt * 60) * 6 * Math.exp(-rt * 8) : 0);
    ctx.strokeStyle = CORD;
    ctx.lineWidth = 2.2;
    for (const [tip, end] of [[tipL, nearL], [tipR, nearR]] as const) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + end.x) / 2, (tip.y + end.y) / 2 + sag, end.x, end.y);
      ctx.stroke();
    }

    // Whipping: the turns of thread that actually hold a cord onto a stick.
    // Kept just below the tip and just inside the branch's own width, so it
    // reads as binding rather than as something caught on the end.
    ctx.lineWidth = 1.5;
    for (const tip of [tipL, tipR]) {
      const dx = crotch.x - tip.x, dy = crotch.y - tip.y;
      const n = Math.hypot(dx, dy) || 1;
      const ux = dx / n, uy = dy / n;
      for (let i = 0; i < 3; i++) {
        const at = { x: tip.x + ux * (3.5 + i * 3.2), y: tip.y + uy * (3.5 + i * 3.2) };
        ctx.beginPath();
        ctx.moveTo(at.x - uy * 3.1, at.y + ux * 3.1);
        ctx.lineTo(at.x + uy * 3.1, at.y - ux * 3.1);
        ctx.stroke();
      }
    }

    // Seated back along the draw, so the fingers are behind the pouch rather
    // than on top of it: the stone is the thing the player is aiming, and it
    // has to stay visible at every draw length.
    const back = { x: pullX + (ax / len) * 12, y: pullY + (ay / len) * 12 };
    ctx.strokeStyle = shade(VENEER.player, -0.34);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(this.w * 0.92, base);
    ctx.lineTo(back.x + 2, back.y + 14);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(back.x, back.y + 8, 13, 0, Math.PI * 2); ctx.fill();

    /*
     * The drawing hand, always — including before it is doing anything.
     *
     * This used to appear only once the right thumb was already on the glass,
     * which meant a player entering the mode saw a slingshot held in one hand
     * and had to be told the other half. Now the arm is there from the first
     * frame, reaching up from the bottom-right corner to the pouch, so the
     * object itself says where each thumb goes: one hand on the fork at the
     * left, one on the pouch at the right. There is no ring, no label and no
     * hint text, because the thing in front of the player is the instruction.
     */
    // The pouch: a scrap of leather, drawn as one round-capped stroke across
    // the pull, with the stone sitting in it.
    ctx.strokeStyle = LEATHER;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(endA.x, endA.y); ctx.lineTo(endB.x, endB.y);
    ctx.stroke();
    ctx.strokeStyle = shade(LEATHER, 0.22);
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(endA.x - 1, endA.y - 1.4); ctx.lineTo(endB.x - 1, endB.y - 1.4);
    ctx.stroke();

    // The stone, lit from up and left so it reads as a lump off a driveway
    // rather than a dot. Gone for a moment after a shot — it is in the air —
    // and back in the pouch by the time the band has stopped ringing.
    if (rt < 0.45) { ctx.restore(); this.drawForeHand(ctx, fx, forkY, prong, skin); return; }
    ctx.fillStyle = '#4E545B';
    ctx.beginPath(); ctx.arc(pullX, pullY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#767D85';
    ctx.beginPath(); ctx.arc(pullX - 1, pullY - 1.1, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9AA1A8';
    ctx.beginPath(); ctx.arc(pullX - 2.4, pullY - 2.6, 2.2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    this.drawForeHand(ctx, fx, forkY, prong, skin);
  }

  /** The forward hand, closed around the grip. */
  private drawForeHand(ctx: CanvasRenderingContext2D, fx: number, forkY: number, prong: number, skin: string): void {
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(fx, forkY + prong * 0.82, 13, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * The first time only, on a phone: which thumb does what.
   *
   * Two quiet words over the two halves of the glass and a line showing the
   * pull, gone for good after the first stone. A human could not find the
   * pull at all with the object alone as the instruction; one shot is all
   * it takes to never need this again.
   */
  private drawPullHint(ctx: CanvasRenderingContext2D, draw: number): void {
    const a = (1 - draw) * (this.settings.reduceMotion ? 0.8 : 0.55 + 0.35 * Math.sin(this.release.t * 3.4));
    if (a < 0.02) return;
    const px = this.w * 0.75, py = this.h * 0.58;
    const lx = this.w * 0.25;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px ui-monospace, Menlo, monospace';
    ctx.lineCap = 'round';
    const pill = (text: string, x: number, y: number) => {
      const wd = ctx.measureText(text).width + 16;
      const cx = Math.max(wd / 2 + 6, Math.min(this.w - wd / 2 - 6, x));
      // The words hold still and solid; only the guide lines breathe.
      const solid = 1 - draw;
      ctx.fillStyle = alpha('#0B1117', 0.7 * solid);
      roundRect(ctx, cx - wd / 2, y - 10, wd, 20, 10); ctx.fill();
      ctx.fillStyle = alpha('#F6F4EE', 0.95 * solid);
      ctx.fillText(text, cx, y + 0.5);
    };
    ctx.strokeStyle = alpha('#F6F4EE', a);
    ctx.lineWidth = 2.2;
    // Right: touch and pull back.
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(px, py + 24); ctx.lineTo(px + 18, py + 96); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(px + 10, py + 88); ctx.lineTo(px + 18, py + 98); ctx.lineTo(px + 24, py + 86); ctx.stroke();
    pill(SLING_HINT.pull, px, py - 36);
    // Left: drag to aim.
    ctx.beginPath();
    ctx.moveTo(lx - 30, py); ctx.lineTo(lx + 30, py);
    ctx.moveTo(lx - 30, py); ctx.lineTo(lx - 22, py - 6); ctx.moveTo(lx - 30, py); ctx.lineTo(lx - 22, py + 6);
    ctx.moveTo(lx + 30, py); ctx.lineTo(lx + 22, py - 6); ctx.moveTo(lx + 30, py); ctx.lineTo(lx + 22, py + 6);
    ctx.stroke();
    pill(SLING_HINT.aim, lx, py - 36);
    ctx.restore();
  }

  /**
   * Where the sling sits when no thumb is on it.
   *
   * Set by the host to the same point the movement pad invites a first touch,
   * so the fork rests exactly where the left thumb already is.
   */
  slingRest = { x: 120, y: 560 };

  /**
   * The only thing the skating view puts on top of itself.
   *
   * There used to be a speed bar under the left thumb as well. It had no label,
   * it duplicated something the world already says better — the road going past
   * — and a human asked what it was for, which is the only question a piece of
   * permanent UI is not allowed to raise. Gone.
   */
  /*
   * No trick name on screen.
   *
   * There was one, flashed low in the frame, on the theory that a button which
   * rolls the dice owes the player a word. It does not: the board is right
   * there doing the thing, and a caption over it is the game explaining its
   * own animation. If a kickflip does not read as a kickflip, the fix is the
   * kickflip.
   */

  /** How faded in the "you can touch this" marker is, 0..1. */
  private promptFade = 0;
  private promptId: string | null = null;

  /**
   * The one thing in the world that says "this opens something".
   *
   * A node used to open its panel because the player was near it, which is how
   * a box headed CM-009 arrived over the middle of a street somebody was
   * skating down. Proximity now buys a label and nothing else: the node's own
   * id, the word the player will press, and a ring on the thing itself so
   * there is no doubt which object is being talked about. Press it and the
   * screen opens; skate past and nothing happens, ever.
   *
   * It is drawn only while something is actually in reach, so it is never a
   * permanent label on the world — the town does not wear name tags.
   */
  private drawInteractPrompt(ctx: CanvasRenderingContext2D, eye: CamState, dt: number): void {
    const sim = this.sim;
    /*
     * One thing in reach, whichever kind it is: a node on a wall, a person, a
     * thing on a step. People and places use the same quiet grammar as nodes
     * — nothing until you are standing there, and then a ring and a word.
     */
    let target: { id: string; pos: Vec2; z: number; title: string; verb: string; mono: boolean } | null = null;
    const node = sim.interactCandidate;
    if (node && !sim.engagedWith) {
      target = { id: node.id, pos: node.pos, z: NODE_LABEL_Z, title: node.id, verb: this.interactVerb, mono: true };
    } else if (sim.interest && !sim.engagedWith) {
      const i = sim.interest;
      const sp = i.kind === 'place' ? sim.placeById(i.id)?.sceneProp : undefined;
      const z = i.kind === 'person' ? 2.25 : Math.max(0.9, (sp ? sim.sceneProp(sp)?.z ?? 0.4 : 0.4) + 0.7);
      target = {
        id: i.id, pos: i.pos, z, title: i.label,
        verb: `${this.interactVerb} · ${i.kind === 'person' ? 'TALK' : 'LOOK'}`, mono: false,
      };
    }
    // A different target restarts the fade, so the label never appears to
    // teleport from one object to the next.
    if (target && target.id !== this.promptId) { this.promptId = target.id; this.promptFade = 0; }
    if (!target) this.promptId = null;
    this.promptFade = clamp01(this.promptFade + (target ? 4.5 : -6) * dt);
    if (this.promptFade < 0.01 || !target) return;

    const at = this.perspective.screenOf(eye, target.pos, target.z, this.w, this.h);
    if (!at) return;
    const a = smoothstep(this.promptFade);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const accent = target.mono ? VENEER.accent : '#F2C86B';

    // The object itself, ringed.
    ctx.strokeStyle = alpha(accent, 0.55 * a);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(at.x, at.y, target.mono ? 13 : 10, 0, Math.PI * 2); ctx.stroke();

    const label = target.title;
    ctx.font = target.mono ? '700 12px ui-monospace, Menlo, monospace' : '600 12.5px Inter, system-ui, sans-serif';
    const wid = Math.max(64, ctx.measureText(label).width + 22);
    const boxY = at.y - 42;
    ctx.fillStyle = alpha('#121A22', 0.82 * a);
    roundRect(ctx, at.x - wid / 2, boxY - 15, wid, 30, 4);
    ctx.fill();
    ctx.strokeStyle = alpha(accent, 0.5 * a);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = alpha('#F6F4EE', 0.95 * a);
    ctx.fillText(label, at.x, boxY - 5);
    ctx.font = '600 9px ui-monospace, Menlo, monospace';
    ctx.fillStyle = alpha(accent, 0.95 * a);
    ctx.fillText(target.verb, at.x, boxY + 8);

    // A short leader down to the thing, so the label belongs to it.
    ctx.strokeStyle = alpha(accent, 0.4 * a);
    ctx.beginPath();
    ctx.moveTo(at.x, boxY + 15);
    ctx.lineTo(at.x, at.y - 12);
    ctx.stroke();
    ctx.restore();
  }

  private drawSkateHud(ctx: CanvasRenderingContext2D): void {
    if (!this.sim.playerObserved) return;
    // The top edge warms when a lens actually has you. Deliberately not a
    // meter: you are being looked at, not scored.
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, alpha(VENEER.player, 0.16));
    g.addColorStop(0.3, alpha(VENEER.player, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
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

    /*
     * The plan, and then the machine's reading of it.
     *
     * These are two different things and the split is the whole of the plan
     * view / VISION separation. The first half is a plan of a suburb —
     * streets, buildings, the road graph — and a resident is entitled to that
     * from the first frame, on any device, by holding one control.
     *
     * The second half is what SAFEtrace makes of the same town: who it can
     * see, what it thinks they are doing, where it thinks they are going, and
     * what it is holding against them. That arrives when the story says so.
     * Unlocking VISION does not hand the player a new button; it fills in the
     * map they already had.
     */
    this.machine.drawGround(ctx, this.cam, this.w, this.h, view, opts);
    this.machine.drawStructure(ctx, this.cam, this.w, this.h, view, opts);

    // Structure resolves first; the population and its scores arrive after.
    const detail = smoothstep((this.peel - 0.24) / 0.48);
    const before = ctx.globalAlpha;
    ctx.globalAlpha = before * detail;
    if (this.sim.visionUnlocked) {
      this.machine.drawSurveillance(ctx, this.cam, this.w, this.h, view, opts);
      this.machine.drawAerial(ctx, this.cam, this.w, this.h, opts);
      this.machine.drawEvidence(ctx, this.cam, this.w, this.h, opts);
      this.machine.drawPrediction(ctx, this.cam, this.w, this.h, opts);
      this.machine.drawSubjects(ctx, this.cam, this.w, this.h, view, opts);
    } else {
      this.machine.drawLocator(ctx, this.cam, this.w, this.h, opts);
    }
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

    // People with names are on the plan too — the plan is where you find them.
    for (const p of sim.people) {
      if (!p.visible) continue;
      this.drawPerson(ctx, p.pos, p.heading, p.uniform ? VENEER.uniform : p.tint, 0, machine);
    }

    if (sim.devonVisible) {
      this.drawPerson(ctx, sim.devonPos, 0, VENEER.friend, 0, machine, sim.devonFollowing && !sim.devonStopped);
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

  /**
   * The player, and the fact that they are skating.
   *
   * A human looked at this and read it as a vehicle rather than a person on a
   * board, which it was: a rounded rectangle with an ellipse on it and no legs
   * at all. There are legs now, and the back one comes off and pushes against
   * the ground when the character actually pushes — driven by `pushPhase`, so
   * it happens when a push happens and never loops on its own.
   */
  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const sim = this.sim;
    const p = sim.player;
    const z = this.cam.zoom;
    // Height reads as very little in an oblique view, so the player's own hop
    // is exaggerated. Nobody else's is: this is the one thing you are flying.
    const lift = p.z * ROOF_K * 2.6;
    const c = this.cam.toScreen({ x: p.pos.x, y: p.pos.y - lift }, this.w, this.h);
    const ground = this.cam.toScreen(p.pos, this.w, this.h);

    // Airborne shadow tells you how high you are, and shrinks as you climb.
    if (p.z > 0.03) {
      const k = clamp01(p.z / 1.1);
      ctx.fillStyle = VENEER.shadowSoft;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, (0.75 - k * 0.2) * z, (0.5 - k * 0.14) * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(p.heading);

    // How much of a push stride we are through, and how far the leg reaches.
    const pushing = p.pushPhase > 0 && p.stance !== 'AIR';
    const reach = pushing ? Math.sin(p.pushPhase * Math.PI) : 0;

    if (p.onBoard) {
      ctx.fillStyle = p.stance === 'BAIL' ? '#8A8F93' : '#2F343A';
      roundRect(ctx, -1.05 * z, -0.42 * z, 2.1 * z, 0.84 * z, 0.3 * z);
      ctx.fill();
      ctx.fillStyle = VENEER.player;
      roundRect(ctx, -0.85 * z, -0.3 * z, 1.7 * z, 0.6 * z, 0.22 * z);
      ctx.fill();
    }

    // Legs, drawn under the body. The front foot stays planted across the deck;
    // the back foot swings off the tail and reaches for the road.
    const legW = 0.20 * z;
    ctx.strokeStyle = shade(VENEER.player, -0.62);
    ctx.lineCap = 'round';
    ctx.lineWidth = legW;
    const side = p.lean >= 0 ? 1 : -1;

    // Front foot: on the board, always.
    ctx.beginPath();
    ctx.moveTo(0.08 * z, -0.06 * z * side);
    ctx.lineTo(0.52 * z, -0.24 * z * side);
    ctx.stroke();

    // Back foot: on the tail, or off and pushing.
    ctx.beginPath();
    ctx.moveTo(-0.06 * z, 0.06 * z * side);
    if (pushing) {
      // Off the board, out to the side and behind, planting on the ground.
      ctx.lineTo((-0.55 - reach * 0.5) * z, (0.34 + reach * 0.72) * z * side);
    } else {
      ctx.lineTo(-0.58 * z, 0.22 * z * side);
    }
    ctx.stroke();

    // The body: leans into the carve, and shifts forward over the pushing foot.
    const lean = p.stance === 'SLIDE' ? 0.35 * side : p.lean * 0.42;
    ctx.translate(reach * 0.30 * z, 0);
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
    for (const d of this.sim.droppedRocks) {
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

/** Break a line into lines no wider than `max`, at spaces. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}
