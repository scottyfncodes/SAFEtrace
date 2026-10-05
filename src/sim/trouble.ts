/**
 * Trouble: what the town does about a kid with a slingshot.
 *
 * Heat is a number from nothing to five, and it climbs with what the rider
 * does with stones — a bin knocked over is nothing much, a window is
 * something, a windscreen sets off an alarm, and hitting a person is a
 * different order of thing altogether; hitting an officer is the worst of
 * all. What gets counted in full is what somebody saw: a camera with the
 * rider in its picture, a neighbour with a line of sight, or the person the
 * stone hit. What nobody saw counts for a little — somebody heard glass.
 *
 *   1  COMPLAINT   neighbours have noticed. Nobody comes.
 *   2  REPORTED    an officer walks over to where you were last seen.
 *   3  WANTED      an officer runs you down.
 *   4  PURSUIT     two officers, faster, and a drone overhead.
 *   5  LOCKDOWN    everyone, flat out, and two drones.
 *
 * Out of sight long enough, heat cools and the officers go back to their
 * beats. Caught — an officer's hand on you while you are slow enough to be
 * grabbed — and you are walked home, and your parents take the board and
 * the slingshot away. You get them back when your mom says so, and she says
 * so later every time.
 *
 * Nobody is hurt by any of this. A stone makes a person yelp and stagger and
 * run; it never injures anyone.
 */
import { type Vec2, dist } from '../core/math';
import type { Sim } from './sim';

export const HEAT = {
  /** What each act is worth, seen. */
  prop: 0.35,
  camera: 0.6,
  pane: 0.8,
  car: 0.9,
  drone: 1.0,
  person: 1.6,
  officer: 2.6,
  /** Unseen, an act counts for this share. */
  unseen: 0.3,
  /** Seconds out of sight, at each level, before heat starts to cool. */
  coolAfter: [0, 6, 8, 10, 13, 16],
  /** How fast it cools once it does, per second. */
  cool: 0.14,
  /** Officer speed at each level, m/s. A board is still faster; feet are not. */
  copSpeed: [0, 4.4, 4.6, 5.4, 6.0, 6.4],
  /** Officers sent at each level. */
  cops: [0, 0, 1, 1, 2, 9],
  /** Drones sent at each level. */
  drones: [0, 0, 0, 0, 1, 2],
  /** An officer sees this far, with a clear line. */
  copSight: 32,
  /** A hand on the shoulder: this close, for this long, slow enough to grab. */
  catchReach: 1.7,
  catchTime: 0.35,
  catchSpeed: 6.5,
  /** Grounded for this long, the first time, the second, and every time after. */
  groundedFor: [60, 120, 180],
};

export const HEAT_NAMES = ['CLEAR', 'COMPLAINT', 'REPORTED', 'WANTED', 'PURSUIT', 'LOCKDOWN'] as const;
export const heatLevel = (heat: number): number => Math.max(0, Math.min(5, Math.floor(heat + 1e-6)));

/** Where you are taken when you are caught. */
export const HOME = { x: 158, y: 214 };

export type TroubleNote =
  | { kind: 'level'; level: number; up: boolean }
  | { kind: 'act'; what: string; seen: boolean }
  | { kind: 'busted'; seconds: number; busts: number }
  | { kind: 'returned' };

export interface TroubleSave { busts: number; groundedLeft: number }

export class Trouble {
  heat = 0;
  /** Seconds since anything — an officer, a camera, a drone — had the rider. */
  unseenFor = 99;
  lastKnown: Vec2 | null = null;
  /** Officers and drones on the chase. */
  readonly units: string[] = [];
  readonly drones: string[] = [];
  busts = 0;
  /** Seconds left without the board and the sling, or 0. */
  groundedLeft = 0;
  private catchTimer = 0;
  private notes: TroubleNote[] = [];
  private off: Array<() => void> = [];
  private lastLevel = 0;

  constructor(private sim: Sim, saved?: TroubleSave) {
    sim.troubleActive = true;
    if (saved) {
      this.busts = saved.busts;
      this.groundedLeft = saved.groundedLeft;
      if (this.groundedLeft > 0) this.ground();
    }
    const bus = sim.bus;
    this.off.push(
      bus.on('projectile:impact', ({ kind, targetId }) => {
        if (kind === 'prop' && targetId) {
          const prop = sim.world.data.props.find((p) => p.id === targetId);
          this.act(prop?.kind === 'car' ? HEAT.car : HEAT.prop, prop?.kind === 'car' ? 'CAR' : 'PROPERTY', false);
        } else if (kind === 'cameraLens' || kind === 'cameraMount' || kind === 'cameraMotor') {
          this.act(HEAT.camera, 'CAMERA', false);
        } else if (kind === 'drone') {
          this.act(HEAT.drone, 'DRONE', false);
        } else if (kind === 'person' && targetId) {
          const officer = sim.patrols.some((p) => p.id === targetId);
          // The person you hit always saw you.
          this.act(officer ? HEAT.officer : HEAT.person, officer ? 'OFFICER' : 'PERSON', true);
        }
      }),
      bus.on('world:glass', () => this.act(HEAT.pane, 'WINDOW', false)),
    );
  }

  get level(): number { return heatLevel(this.heat); }
  get isGrounded(): boolean { return this.groundedLeft > 0; }

  takeNotes(): TroubleNote[] { const n = this.notes; this.notes = []; return n; }

  save(): TroubleSave { return { busts: this.busts, groundedLeft: this.groundedLeft }; }

  /** Is anybody looking at the rider right now: a lens, a drone, an officer, a neighbour? */
  witnessed(): boolean {
    const sim = this.sim;
    if (sim.playerSightings().ids.length > 0) return true;
    const p = sim.player.pos;
    for (const n of sim.npcs) {
      if (dist(n.pos, p) < 24 && !sim.world.blocked(n.pos, p, 1.5)) return true;
    }
    for (const c of sim.patrols) if (this.copSees(c.pos)) return true;
    return false;
  }

  private copSees(at: Vec2): boolean {
    const p = this.sim.player.pos;
    return dist(at, p) < HEAT.copSight && !this.sim.world.blocked(at, p, 1.7);
  }

  /** Something was done. Count it, in full if somebody saw. */
  private act(worth: number, what: string, victimSaw: boolean): void {
    if (this.isGrounded) return;
    const seen = victimSaw || this.witnessed();
    this.heat = Math.min(5.99, this.heat + worth * (seen ? 1 : HEAT.unseen));
    if (seen) { this.lastKnown = { ...this.sim.player.pos }; this.unseenFor = 0; }
    this.notes.push({ kind: 'act', what, seen });
  }

  step(dt: number): void {
    const sim = this.sim;
    if (this.isGrounded) {
      this.groundedLeft = Math.max(0, this.groundedLeft - dt);
      if (this.groundedLeft === 0) this.release();
      return;
    }

    // Who has the rider: the officers on the chase, any lens or drone.
    const p = sim.player;
    let seenNow = false;
    for (const id of this.units) {
      const c = sim.patrols.find((x) => x.id === id);
      if (c && this.copSees(c.pos)) seenNow = true;
    }
    if (this.level >= 2 && sim.playerSightings().ids.length > 0) seenNow = true;
    // An officer on the beat who sees a wanted kid joins in.
    if (this.level >= 2) {
      for (const c of sim.patrols) if (!this.units.includes(c.id) && dist(c.pos, p.pos) < 18 && this.copSees(c.pos)) { seenNow = true; this.heat = Math.max(this.heat, 3); }
    }
    if (seenNow) { this.unseenFor = 0; this.lastKnown = { ...p.pos }; }
    else this.unseenFor += dt;

    const lvl = this.level;
    if (this.heat > 0 && this.unseenFor > HEAT.coolAfter[lvl]) this.heat = Math.max(0, this.heat - HEAT.cool * dt);

    const now = this.level;
    if (now !== this.lastLevel) {
      this.notes.push({ kind: 'level', level: now, up: now > this.lastLevel });
      this.lastLevel = now;
    }
    this.dispatch(now, seenNow);

    // A hand on the shoulder.
    let near = false;
    for (const id of this.units) {
      const c = sim.patrols.find((x) => x.id === id);
      if (c && dist(c.pos, p.pos) < HEAT.catchReach && (p.speed < HEAT.catchSpeed || p.stance === 'BAIL')) near = true;
    }
    this.catchTimer = near ? this.catchTimer + dt : 0;
    if (this.catchTimer >= HEAT.catchTime) this.bust();
  }

  /** Send, speed up, or stand down officers and drones for this level. */
  private dispatch(lvl: number, live: boolean): void {
    const sim = this.sim;
    const want = HEAT.cops[lvl];
    const target = live ? sim.player.pos : (this.lastKnown ?? sim.player.pos);
    while (this.units.length > want) { const id = this.units.pop()!; sim.releasePatrol(id); }
    while (this.units.length < Math.min(want, sim.patrols.length)) {
      const free = sim.patrols
        .filter((c) => !this.units.includes(c.id))
        .sort((a, b) => dist(a.pos, target) - dist(b.pos, target))[0];
      if (!free) break;
      this.units.push(free.id);
    }
    for (const id of this.units) sim.commandPatrol(id, target, HEAT.copSpeed[lvl]);

    const wantD = HEAT.drones[lvl];
    while (this.drones.length > wantD) sim.releaseDrone(this.drones.pop()!);
    while (this.drones.length < wantD) {
      const free = sim.drones.filter((d) => d.state !== 'DESTABILISED' && !this.drones.includes(d.id))
        .sort((a, b) => dist(a.pos, target) - dist(b.pos, target))[0];
      if (!free) break;
      this.drones.push(free.id);
    }
    for (const id of this.drones) sim.commandDrone(id, target, true, 'POLICE SUPPORT');
  }

  /** Caught. Walked home; the board and the sling go in the cupboard. */
  bust(): void {
    this.busts++;
    const seconds = HEAT.groundedFor[Math.min(this.busts - 1, HEAT.groundedFor.length - 1)];
    this.groundedLeft = seconds;
    this.heat = 0;
    this.lastLevel = 0;
    this.catchTimer = 0;
    this.standDown();
    const p = this.sim.player;
    p.pos = { ...HOME };
    p.vel = { x: 0, y: 0 };
    p.speed = 0;
    p.z = 0;
    p.ground = 0;
    this.sim.dropGrind();
    this.sim.exitAimMode();
    this.ground();
    this.notes.push({ kind: 'busted', seconds, busts: this.busts });
  }

  private ground(): void {
    const p = this.sim.player;
    this.sim.grounded = true;
    p.onBoard = false;
    p.stance = 'FOOT';
    p.aiming = false;
    p.draw = 0;
  }

  /** Mom gives it all back. */
  private release(): void {
    this.sim.grounded = false;
    const p = this.sim.player;
    p.onBoard = true;
    p.stance = 'ROLL';
    this.notes.push({ kind: 'returned' });
  }

  private standDown(): void {
    for (const id of this.units) this.sim.releasePatrol(id);
    for (const id of this.drones) this.sim.releaseDrone(id);
    this.units.length = 0;
    this.drones.length = 0;
  }

  /** A new run: heat clears, the chase stands down. Being grounded does not. */
  reset(): void {
    this.heat = 0;
    this.lastLevel = 0;
    this.unseenFor = 99;
    this.lastKnown = null;
    this.catchTimer = 0;
    this.standDown();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.standDown();
    this.sim.troubleActive = false;
  }
}
