/**
 * The simulation orchestrator.
 *
 * Tick order is load-bearing and is documented in docs/02-technical-architecture.md.
 * Sensors run after movement so the system reacts to the present frame; dispatch
 * runs after prediction so assets route to where the model thinks you are going,
 * which is the entire game.
 */
import { EventBus } from '../core/events';
import type { Intent } from '../core/input';
import {
  type Vec2, angleOf, clamp01, dist, fromAngle, norm, pointInPoly, polyBounds,
} from '../core/math';
import { Rng, hashString } from '../core/rng';
import { World } from './world';
import type { SimEvents } from './events';
import { aimSway, makePlayer, updatePlayer, type PlayerState, maxSpeedFor } from './player';
import {
  type Projectile, type BallisticTarget, fire, stepProjectile, resolveCameraHit,
  collectBearings, type DroppedBearing, solvePitch, LAUNCH_Z, MUZZLE_MIN, MUZZLE_MAX,
} from './slingshot';
import { type Drone, makeDrone, updateDrone, droneSees, destabilise, assignTask, DRONE } from './drone';
import { type Patrol, makePatrol, updatePatrol, assignPatrolTask, PATROL } from './patrol';
import { type Npc, makeNpcs, updateNpc } from './npc';
import { makeSensor, observe, updateSensor, type Sensor } from './surveillance/sensors';
import { fuse, makeTrack } from './surveillance/fusion';
import { classify, resetBehaviourMemory } from './surveillance/behavior';
import { measureError, predict } from './surveillance/prediction';
import { scoreRisk } from './surveillance/risk';
import { analyse, makeEvidence, resetEvidenceIds } from './surveillance/evidence';
import { Network, VERBS, LOOP_DURATION_TICKS, INTEGRITY_CHECK_MIN, INTEGRITY_CHECK_MAX, type HackVerb, type NetworkNode } from './surveillance/network';
import { Dispatcher, resetTaskIds, type Asset } from './surveillance/dispatch';
import type { EscalationLevel, Evidence, Incident, Observation, Subject, Track } from './surveillance/types';
import { levelFor } from './surveillance/types';
import { SYSTEM, CARE } from '../content/copy';

/** How far the player can reach into the network without walking to it. */
export const SELECT_RANGE = 16;

/**
 * You only hear a camera's servo if you are close and moving slowly, which is
 * what makes noticing one a moment rather than a constant.
 */
const SERVO_AUDIBLE_SPEED = 3.2;

export interface HackAction {
  verb: HackVerb;
  nodeId: string;
  ticksRemaining: number;
  ticksTotal: number;
}

export interface SimOptions { seed?: number; daylight?: number; }

let msgId = 0;

export class Sim {
  readonly world: World;
  readonly bus = new EventBus<SimEvents>();
  readonly rng: Rng;

  tick = 0;
  time = 0;
  daylight: number;

  player: PlayerState;
  playerSubject: Subject;
  playerTrack: Track;

  devon: Subject;
  devonTrack: Track;
  devonPos: Vec2;
  devonFollowing = true;
  devonStopped = false;

  sensors: Sensor[] = [];
  sensorById = new Map<string, Sensor>();
  network: Network;
  dispatcher = new Dispatcher();

  drones: Drone[] = [];
  patrols: Patrol[] = [];
  npcs: Npc[] = [];
  npcSubjects: Subject[] = [];
  npcTracks: Track[] = [];

  projectiles: Projectile[] = [];
  droppedBearings: DroppedBearing[] = [];
  evidence = new Map<string, Evidence>();
  incidents: Incident[] = [];

  hack: HackAction | null = null;
  focusNode: NetworkNode | null = null;
  /**
   * A node the player has deliberately reached for, which outranks whatever
   * happens to be nearest. Touch selects; a keyboard simply walks up to things.
   */
  selectedNodeId: string | null = null;
  discoveredNodes = new Set<string>();

  escalation: EscalationLevel = 'PASSIVE';
  visionUnlocked = false;
  /** 0..1 blend into machine vision; the renderer drives the peel from this. */
  visionBlend = 0;
  visionActive = false;
  /** A forced, brief crack in the veneer. Seconds. */
  crackTimer = 0;

  /** Direction shadows fall. One sun, fixed at roughly four in the afternoon. */
  readonly sun: Vec2 = norm({ x: 0.55, y: 0.34 });

  private observationBuffer = new Map<string, Observation[]>();
  private assets: Asset[] = [];
  private lastEscalation: EscalationLevel = 'PASSIVE';
  private aimAngle = 0;
  private aimPitch = 0.18;

  constructor(worldData: ConstructorParameters<typeof World>[0], opts: SimOptions = {}) {
    this.rng = new Rng(opts.seed ?? 0x5afe7ace);
    this.daylight = opts.daylight ?? 1;
    this.world = new World(worldData);
    this.network = new Network(worldData.network);

    resetBehaviourMemory();
    resetEvidenceIds();
    resetTaskIds();

    for (const sd of worldData.sensors) {
      const s = makeSensor(sd);
      this.sensors.push(s);
      this.sensorById.set(sd.id, s);
    }

    this.player = makePlayer(worldData.spawns.player);
    // Facing south down Maple Court, the way the advertisement's last shot looks.
    this.player.heading = Math.PI / 2;
    this.playerSubject = {
      id: 'SUBJ-4417',
      kind: 'player',
      identity: '4417',
      displayName: 'SUBJECT 4417',
      pos: { ...this.player.pos },
      vel: { x: 0, y: 0 },
      speed: 0,
      districtPriors: { maple: 0.95, commons: 0.7, ridgeline: 0.8, northgate: 0.2, channel: 0.35, relay: 0.05 },
      priorContacts: 0,
      familiarity: 0.15,
    };
    this.playerTrack = makeTrack(this.playerSubject);

    this.devonPos = { ...worldData.spawns.devon };
    this.devon = {
      id: 'SUBJ-2210',
      kind: 'friend',
      identity: 'ARAYA, DEVON M.',
      displayName: 'ARAYA, DEVON M.',
      pos: { ...this.devonPos },
      vel: { x: 0, y: 0 },
      speed: 0,
      // Devon's cousin lives in Northgate. Devon has been there many times.
      // The prior was reasonable. The prior was decisive.
      districtPriors: { maple: 0.9, commons: 0.75, ridgeline: 0.85, northgate: 0.97, channel: 0.4, relay: 0.05 },
      priorContacts: 0,
      familiarity: 0.55,
    };
    this.devonTrack = makeTrack(this.devon);

    this.npcs = makeNpcs(worldData.npcRoutes, this.rng.fork(11));
    for (const n of this.npcs) {
      const s: Subject = {
        id: `SUBJ-${hashString(n.id) % 9000 + 1000}`,
        kind: 'resident',
        identity: n.name,
        displayName: n.name,
        pos: { ...n.pos },
        vel: { x: 0, y: 0 },
        speed: 0,
        districtPriors: {},
        priorContacts: 0,
        familiarity: 0.92,
      };
      this.npcSubjects.push(s);
      this.npcTracks.push(makeTrack(s));
    }

    this._allSubjects.push(this.playerSubject, this.devon, ...this.npcSubjects);
    this._allTracks.push(this.playerTrack, this.devonTrack, ...this.npcTracks);

    worldData.droneRoutes.forEach((route, i) => {
      const pad = worldData.spawns.dronePads[i] ?? route[0];
      const d = makeDrone(`UAV-${(i + 1).toString().padStart(2, '0')}`, route, pad);
      this.drones.push(d);
      this.assets.push({ id: d.id, kind: 'drone', pos: d.pos, available: true, task: null });
    });

    worldData.patrolRoutes.forEach((route, i) => {
      const home = worldData.spawns.patrolStarts[i] ?? route[0];
      const p = makePatrol(`GRD-${(i + 1).toString().padStart(2, '0')}`, route, home);
      this.patrols.push(p);
      this.assets.push({ id: p.id, kind: 'patrol', pos: p.pos, available: true, task: null });
    });
  }

  /**
   * Membership never changes after construction, so these are built once. They
   * are read several times per tick and again per frame; rebuilding them was
   * the largest single source of garbage in the hot path.
   */
  private readonly _allTracks: Track[] = [];
  private readonly _allSubjects: Subject[] = [];

  get allTracks(): Track[] { return this._allTracks; }
  get allSubjects(): Subject[] { return this._allSubjects; }

  message(register: 'SYSTEM' | 'CARE', lines: string[], duration = 4.2, emphasis: 'normal' | 'strong' = 'normal'): void {
    this.bus.emit('safetrace:message', { id: `MSG-${++msgId}`, register, lines, duration, emphasis });
  }

  // ======================================================================
  // TICK
  // ======================================================================

  step(dt: number, intent: Intent, pointerWorld: Vec2 | null): void {
    this.tick++;
    this.time += dt;

    // Seeing the machine costs you the ability to act on it. The touch layer
    // enforced this for thumbs; it belongs here, so it holds for every device
    // and cannot drift between them.
    const looking = this.visionUnlocked && intent.vision;
    if (looking) intent = suppressWhileLooking(intent);

    // 1-2. Input and movement.
    this.updateAim(intent, pointerWorld);
    updatePlayer(this.player, intent, this.world, dt);
    this.emitPlayerFeedback();

    this.playerSubject.pos = this.player.pos;
    this.playerSubject.vel = this.player.vel;
    this.playerSubject.speed = this.player.speed;

    this.updateDevon(dt);

    // 3. Projectiles and the evidence they create.
    this.updateProjectiles(dt, intent);

    // 4. Ambient residents.
    for (let i = 0; i < this.npcs.length; i++) {
      updateNpc(this.npcs[i], dt, this.world, this.rng);
      const s = this.npcSubjects[i];
      const n = this.npcs[i];
      s.vel = { x: (n.pos.x - s.pos.x) / dt, y: (n.pos.y - s.pos.y) / dt };
      s.speed = Math.hypot(s.vel.x, s.vel.y);
      s.pos = { ...n.pos };
    }

    // 5. Sensors -> observations.
    for (const s of this.sensors) updateSensor(s, this.tick, this.time);
    this.gatherObservations();

    // 6-9. Fusion, behaviour, prediction, risk.
    this.updateTracking();

    // 10. Evidence analysis.
    this.updateEvidence();

    // 11. Dispatch.
    this.updateDispatch();

    // 12. Assets act on their orders.
    this.updateAssets(dt);

    // 13. Hacking, network integrity, vision blend.
    if (looking && this.hack) this.cancelHack();
    this.updateHack(intent, dt);
    this.updateNetwork();
    this.updateVision(intent, dt);

    // 14. Deliver events.
    this.bus.flush();
  }

  // ---------------------------------------------------------------- movement

  private emitPlayerFeedback(): void {
    const p = this.player;
    if (p.pushedThisTick) this.bus.emit('player:push', { pos: p.pos, speed: p.speed });
    if (p.poppedThisTick) this.bus.emit('player:pop', { pos: p.pos });
    if (p.landedThisTick) this.bus.emit('player:land', { pos: p.pos, speed: p.speed });
    if (p.bailedThisTick) this.bus.emit('player:bail', { pos: p.pos });
  }

  private updateDevon(dt: number): void {
    if (this.devonStopped || !this.devonFollowing) {
      this.devon.vel = { x: 0, y: 0 };
      this.devon.speed = 0;
      this.devon.pos = { ...this.devonPos };
      return;
    }
    // Devon skates a few metres behind, badly.
    const target = {
      x: this.player.pos.x - Math.cos(this.player.heading) * 5.5,
      y: this.player.pos.y - Math.sin(this.player.heading) * 5.5,
    };
    const d = dist(this.devonPos, target);
    const speed = Math.min(this.player.speed * 1.05 + 1.2, Math.max(0, d) * 2.2);
    if (d > 0.4) {
      const dir = norm({ x: target.x - this.devonPos.x, y: target.y - this.devonPos.y });
      const to = { x: this.devonPos.x + dir.x * speed * dt, y: this.devonPos.y + dir.y * speed * dt };
      this.devonPos = this.world.resolveCollision(this.devonPos, to, 0.4);
    }
    this.devon.vel = { x: (this.devonPos.x - this.devon.pos.x) / dt, y: (this.devonPos.y - this.devon.pos.y) / dt };
    this.devon.speed = Math.hypot(this.devon.vel.x, this.devon.vel.y);
    this.devon.pos = { ...this.devonPos };
  }

  // ---------------------------------------------------------------- slingshot

  private updateAim(intent: Intent, pointerWorld: Vec2 | null): void {
    if (pointerWorld) {
      this.aimAngle = angleOf({ x: pointerWorld.x - this.player.pos.x, y: pointerWorld.y - this.player.pos.y });
    } else if (this.player.speed > 0.5) {
      this.aimAngle = angleOf(this.player.vel);
    }

    // Elevation is implicit. The player points at a thing; the character works
    // out the arc, the way someone who has done this a thousand times would.
    const muzzle = MUZZLE_MIN + clamp01(this.player.draw) * (MUZZLE_MAX - MUZZLE_MIN);
    const dir = fromAngle(this.aimAngle);
    let best: BallisticTarget | null = null;
    let bestAlong = Infinity;

    for (const t of this.ballisticTargets()) {
      const rel = { x: t.pos.x - this.player.pos.x, y: t.pos.y - this.player.pos.y };
      const along = rel.x * dir.x + rel.y * dir.y;
      if (along < 2 || along > 70) continue;
      // Lateral tolerance widens with distance, so distant targets stay pickable.
      const lateral = Math.abs(rel.x * -dir.y + rel.y * dir.x);
      if (lateral > Math.max(2.2, along * 0.11) + t.radius) continue;
      if (along < bestAlong) { bestAlong = along; best = t; }
    }

    if (best) {
      const solved = solvePitch(bestAlong, best.z - LAUNCH_Z, muzzle);
      this.aimPitch = solved ?? Math.atan2(best.z - LAUNCH_Z, bestAlong);
    } else if (pointerWorld) {
      // No target on the line: put the bearing on the ground where they pointed.
      const d = dist(this.player.pos, pointerWorld);
      const solved = d > 2 ? solvePitch(d, -LAUNCH_Z, muzzle) : null;
      this.aimPitch = solved ?? 0.1;
    } else {
      this.aimPitch = 0.14;
    }
    void intent;
  }

  get aim(): { angle: number; pitch: number; sway: number } {
    return { angle: this.aimAngle, pitch: this.aimPitch, sway: aimSway(this.player) };
  }

  ballisticTargets(): BallisticTarget[] {
    const out: BallisticTarget[] = [];
    for (const s of this.sensors) {
      if (s.state === 'OFFLINE') continue;
      if (dist(s.data.pos, this.player.pos) > 70) continue;
      out.push({ id: s.data.id, pos: s.data.pos, z: s.data.height, radius: 0.42, kind: 'camera' });
    }
    for (const d of this.drones) {
      if (d.state === 'DESTABILISED') continue;
      if (dist(d.pos, this.player.pos) > 70) continue;
      out.push({ id: d.id, pos: d.pos, z: d.z, radius: DRONE.hitRadius, kind: 'drone' });
    }
    for (const n of this.network.nodes.values()) {
      if (n.kind !== 'JUNCTION') continue;
      if (dist(n.pos, this.player.pos) > 70) continue;
      out.push({ id: n.id, pos: n.pos, z: 1.6, radius: 0.55, kind: 'junction' });
    }
    for (const p of this.world.propsNear(this.player.pos, 70)) {
      if (!p.hittable || p.knocked) continue;
      const z = p.kind === 'pole' || p.kind === 'sign' ? 3.2 : 0.7;
      out.push({ id: p.id, pos: p.pos, z, radius: p.kind === 'car' ? 1.5 : 0.6, kind: 'prop' });
    }
    return out;
  }

  private updateProjectiles(dt: number, intent: Intent): void {
    if (intent.firePressed && this.player.aiming && this.player.bearings > 0 && this.player.draw > 0.12) {
      this.player.bearings--;
      // Sway is the documented reward for skating well, and it belongs on the
      // shot rather than only on the reticle: the reticle must not promise
      // accuracy the projectile does not have.
      const sway = aimSway(this.player);
      const angle = this.aimAngle + this.rng.gauss() * sway;
      const proj = fire(this.player.pos, angle, this.player.draw, this.aimPitch, this.rng);
      this.projectiles.push(proj);
      this.player.draw = 0;
      this.bus.emit('player:fire', { pos: this.player.pos, draw: this.player.draw });
    }

    if (this.projectiles.length === 0) return;
    const targets = this.ballisticTargets();
    const ctx = {
      targets,
      solidAt: (p: Vec2) => this.world.buildingAt(p) !== null,
      heightAt: (p: Vec2) => this.world.buildingAt(p)?.height ?? 0,
    };

    const keep: Projectile[] = [];
    for (const proj of this.projectiles) {
      const impact = stepProjectile(proj, ctx, dt);
      if (impact) {
        this.resolveImpact(impact.kind, impact.pos, impact.vel, impact.vz, impact.z, impact.targetId);
        continue;
      }
      if (proj.life > 0) keep.push(proj);
    }
    this.projectiles = keep;

    // Bearings roll and can be picked back up: a physical constraint, not an economy.
    if (this.player.bearings < this.player.maxBearings) {
      const { kept, collected } = collectBearings(this.droppedBearings, this.player.pos, 1.6);
      if (collected > 0) {
        this.droppedBearings = kept;
        this.player.bearings = Math.min(this.player.maxBearings, this.player.bearings + collected);
        this.bus.emit('player:collect', { count: collected });
      }
    }
    // Resupply points.
    for (const p of this.world.propsNear(this.player.pos, 3)) {
      if (p.kind === 'ammoCache' && this.player.bearings < this.player.maxBearings) {
        this.player.bearings = this.player.maxBearings;
        this.bus.emit('player:collect', { count: 0 });
      }
    }
  }

  private resolveImpact(
    kind: string, pos: Vec2, vel: Vec2, vz: number, z: number, targetId?: string,
  ): void {
    this.bus.emit('projectile:impact', { kind: kind as never, pos, targetId });
    this.droppedBearings.push({ pos: { ...pos }, tick: this.tick });
    if (this.droppedBearings.length > 40) this.droppedBearings.shift();

    const observedBy = this.sensorsObserving(pos);

    if (kind === 'cameraLens' && targetId) {
      const s = this.sensorById.get(targetId);
      if (!s) return;
      const result = resolveCameraHit(vel, s.facing, this.rng);
      if (result === 'cameraLens') {
        s.state = 'OFFLINE';
        s.stateUntil = this.tick + 60 * 360;
        this.bus.emit('sensor:offline', { sensorId: s.data.id, label: s.data.label });
        this.message('SYSTEM', [SYSTEM.cameraOffline(s.data.id)], 3.4);
        this.addEvidence('NODE_OFFLINE', pos, `NODE ${s.data.id} OFFLINE`, { vel, vz, z }, observedBy);
      } else if (result === 'cameraMotor') {
        s.state = 'FROZEN';
        s.stateUntil = this.tick + 60 * 90;
        this.bus.emit('sensor:misaligned', { sensorId: s.data.id, label: s.data.label });
        this.message('SYSTEM', [SYSTEM.cameraFault(s.data.id)], 3.0);
        this.addEvidence('PROJECTILE_IMPACT', pos, `PTZ FAULT — ${s.data.id}`, { vel, vz, z }, observedBy);
      } else {
        s.state = 'MISALIGNED';
        s.knockOffset = this.rng.sign() * (0.7 + this.rng.next() * 1.2);
        s.stateUntil = this.tick + 60 * 75;
        this.bus.emit('sensor:misaligned', { sensorId: s.data.id, label: s.data.label });
        this.message('SYSTEM', [SYSTEM.cameraFault(s.data.id)], 3.0);
        this.addEvidence('PROJECTILE_IMPACT', pos, `ALIGNMENT FAULT — ${s.data.id}`, { vel, vz, z }, observedBy);
      }
      return;
    }

    if (kind === 'drone' && targetId) {
      const d = this.drones.find((x) => x.id === targetId);
      if (!d) return;
      destabilise(d, this.rng.int(60 * 20, 60 * 45));
      this.releaseAsset(d.id);
      this.bus.emit('drone:destabilised', { droneId: d.id });
      this.message('SYSTEM', [SYSTEM.droneFault], 3.4);
      this.addEvidence('DRONE_INTERFERENCE', pos, `UNIT ${d.id} FAULT`, { vel, vz, z }, observedBy);
      return;
    }

    if (kind === 'junction' && targetId) {
      const n = this.network.get(targetId);
      if (!n) return;
      n.state = 'DEGRADED';
      n.stateUntil = this.tick + 60 * 90;
      for (const sn of this.network.segmentNodes(n.segmentId)) {
        const sensor = this.sensorById.get(sn.id);
        if (sensor && sensor.state === 'ONLINE') {
          sensor.state = 'DEGRADED';
          sensor.stateUntil = this.tick + 60 * 90;
        }
      }
      this.message('SYSTEM', [SYSTEM.segmentDegraded(n.segmentId)], 3.6);
      this.addEvidence('NODE_TAMPER', pos, `JUNCTION ${n.id} FAULT`, { vel, vz, z }, observedBy);
      return;
    }

    if (kind === 'prop' && targetId) {
      const prop = this.world.data.props.find((p) => p.id === targetId);
      if (!prop) return;
      prop.knocked = true;
      const isCar = prop.kind === 'car';
      const label = isCar ? 'VEHICLE ALARM' : SYSTEM.noiseAnomaly;
      if (isCar) prop.alarmUntil = this.tick + 60 * 30;
      // The most powerful use of the slingshot: making a sound somewhere you are not.
      this.bus.emit('noise:event', { pos, label });
      this.dispatcher.flagAnomaly(pos, this.tick, label, isCar ? 60 * 20 : 60 * 12);
      this.addEvidence('NOISE', pos, label, null, observedBy);
      return;
    }
  }

  private sensorsObserving(p: Vec2): string[] {
    const out: string[] = [];
    for (const s of this.sensors) {
      if (s.state === 'OFFLINE' || s.state === 'LOOPED') continue;
      if (dist(s.data.pos, p) > s.data.range) continue;
      if (this.world.blocked(s.data.pos, p, s.data.height)) continue;
      out.push(s.data.id);
    }
    return out;
  }

  private addEvidence(
    kind: Evidence['kind'], pos: Vec2, label: string,
    ballistics: { vel: Vec2; vz: number; z: number } | null = null,
    observedBy: string[] = [],
  ): void {
    const e = makeEvidence(kind, pos, this.tick, label, {
      impactVel: ballistics?.vel,
      impactVz: ballistics?.vz,
      impactZ: ballistics?.z,
      observedBy,
    });
    this.evidence.set(e.id, e);
    this.bus.emit('evidence:created', { evidence: e });
    if (kind !== 'NOISE') {
      this.message('SYSTEM', [SYSTEM.impact, SYSTEM.analysing], 3.0);
    }
  }

  // ---------------------------------------------------------------- tracking

  private gatherObservations(): void {
    this.observationBuffer.clear();
    const subjects = this.allSubjects;
    const params = { daylight: this.daylight };

    for (const s of this.sensors) {
      if (s.state === 'LOOPED') continue;
      let sawPlayer = false;
      for (const subj of subjects) {
        if (dist(s.data.pos, subj.pos) > s.data.range) continue;
        const o = observe(s, subj, this.world, this.tick, params, this.rng);
        if (!o) continue;
        let arr = this.observationBuffer.get(subj.id);
        if (!arr) { arr = []; this.observationBuffer.set(subj.id, arr); }
        arr.push(o);
        if (subj.kind === 'player') sawPlayer = true;
      }
      // The first time a player hears a camera turn to follow them is a
      // designed moment. dwell was being counted and thrown away.
      const wasHolding = s.dwell > 0;
      s.dwell = sawPlayer ? s.dwell + 1 : 0;
      if (sawPlayer && !wasHolding && this.player.speed < SERVO_AUDIBLE_SPEED) {
        this.bus.emit('sensor:noticed', { sensorId: s.data.id, pos: s.data.pos });
      }
    }

    // Drones observe through the same pipeline; overhead cover defeats them.
    for (const d of this.drones) {
      for (const subj of subjects) {
        if (!droneSees(d, this.world, subj.pos)) continue;
        let arr = this.observationBuffer.get(subj.id);
        if (!arr) { arr = []; this.observationBuffer.set(subj.id, arr); }
        const q = clamp01(1 - dist(d.pos, subj.pos) / Math.max(6, Math.tan(DRONE.coneHalf) * d.z));
        arr.push({
          sensorId: d.id, subjectId: subj.id, pos: { ...subj.pos }, tick: this.tick,
          quality: q * 0.9, identityConfidence: q * 0.86, attributedIdentity: subj.identity,
        });
      }
      d.spotlight = droneSees(d, this.world, this.player.pos);
    }

    // Ground units observe too, in a narrow cone, at close range.
    for (const p of this.patrols) {
      for (const subj of subjects) {
        const dd = dist(p.pos, subj.pos);
        if (dd > PATROL.observeRadius) continue;
        const bearing = angleOf({ x: subj.pos.x - p.pos.x, y: subj.pos.y - p.pos.y });
        if (Math.abs(Math.atan2(Math.sin(bearing - p.heading), Math.cos(bearing - p.heading))) > PATROL.observeHalfFov) continue;
        if (this.world.blocked(p.pos, subj.pos, 1.7)) continue;
        let arr = this.observationBuffer.get(subj.id);
        if (!arr) { arr = []; this.observationBuffer.set(subj.id, arr); }
        const q = clamp01(1 - dd / PATROL.observeRadius);
        arr.push({
          sensorId: p.id, subjectId: subj.id, pos: { ...subj.pos }, tick: this.tick,
          quality: q, identityConfidence: q * 0.95, attributedIdentity: subj.identity,
        });
      }
    }
  }

  private updateTracking(): void {
    const subjects = this.allSubjects;
    const tracks = this.allTracks;
    const openEvidence = [...this.evidence.values()];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const subject = subjects[i];
      const obs = this.observationBuffer.get(subject.id) ?? [];

      // Candidate identities for misattribution: anyone with a strong prior
      // association with this district. Devon's Northgate prior lives here.
      const district = this.world.districtAt(subject.pos)?.id ?? '';
      const candidates: Array<{ identity: string; prior: number }> = [];
      if (subject.kind !== 'friend' && district) {
        for (const other of subjects) {
          if (other.id === subject.id) continue;
          const prior = other.districtPriors[district] ?? 0;
          if (prior > 0.9) candidates.push({ identity: other.identity, prior });
        }
      }

      fuse(track, obs, subject, this.tick, this.rng, candidates);

      const pedestrian = this.world.districtAt(subject.pos)?.id === 'commons'
        || this.world.districtAt(subject.pos)?.id === 'ridgeline';
      classify(track, subject, this.world, this.tick, openEvidence, pedestrian);

      // Prediction only for tracks the system is actually holding.
      if (track.confidence > 0.2 || track === this.playerTrack) {
        const p = predict(track, this.world, subject);
        track.prediction = p.path;
        track.predictionConfidence = p.confidence;
      } else {
        track.prediction = [];
        track.predictionConfidence = 0;
      }
      // Flowing is literally how you become unpredictable: the skill mechanic
      // and the thesis are the same mechanic.
      const flowBoost = track === this.playerTrack ? this.player.flow * 0.35 : 0;
      track.predictionError = clamp01(
        measureError(track, subject, this.world, track.predictionError) + flowBoost * 0.012,
      );

      track.risk = scoreRisk(track, subject, this.tick, this.evidence, this.incidents);
    }

    this.announceBehaviour();
  }

  private lastFlagAnnounce = new Map<string, number>();

  private announceBehaviour(): void {
    const t = this.playerTrack;
    for (const f of t.flags) {
      if (f === 'NORMAL_TRANSIT') continue;
      const last = this.lastFlagAnnounce.get(f) ?? -9999;
      if (this.tick - last < 60 * 20) continue;
      this.lastFlagAnnounce.set(f, this.tick);
      const line =
        f === 'UNUSUAL_ROUTE' ? SYSTEM.unusualRoute
        : f === 'EVASIVE' ? SYSTEM.evasive
        : f === 'LOITERING' ? SYSTEM.loitering
        : f === 'RECKLESS_VELOCITY' ? SYSTEM.reckless
        : SYSTEM.proximity;
      this.message('SYSTEM', [line, SYSTEM.risk(t.risk.total)], 3.6);
    }
  }

  // ---------------------------------------------------------------- evidence

  private updateEvidence(): void {
    for (const e of this.evidence.values()) {
      if (e.stage === 'RESOLVED') continue;
      if (e.stage === 'NEW') e.stage = 'ANALYSING';
      if (this.tick < e.analysisCompleteTick) continue;

      const outcome = analyse(e, this.allTracks, this.rng);
      this.bus.emit('evidence:resolved', { evidence: e, linked: outcome.linked, candidateCount: outcome.candidateCount });

      if (e.originEstimate && e.kind !== 'NOISE') {
        const rel = { x: e.originEstimate.x - e.pos.x, y: e.originEstimate.y - e.pos.y };
        const conf = clamp01(1 - e.originUncertainty / 40) * 100;
        this.message('SYSTEM', [
          SYSTEM.originEstimated(Math.hypot(rel.x, rel.y), compass(angleOf(rel)), conf),
          SYSTEM.subjectSearch,
        ], 3.8);
      }

      if (outcome.linked && e.linkedTrackId) {
        const t = this.allTracks.find((x) => x.id === e.linkedTrackId);
        if (t && !t.linkedEvidence.includes(e.id)) t.linkedEvidence.push(e.id);
        this.message('SYSTEM', [SYSTEM.subjectLinked(t?.attributedIdentity ?? 'UNKNOWN')], 3.4, 'strong');
      } else if (e.kind !== 'NOISE') {
        this.message('SYSTEM', [SYSTEM.originIndeterminate], 3.4);
      }
    }
  }

  // ---------------------------------------------------------------- dispatch

  private updateDispatch(): void {
    for (const a of this.assets) {
      const d = this.drones.find((x) => x.id === a.id);
      if (d) { a.pos = d.pos; continue; }
      const p = this.patrols.find((x) => x.id === a.id);
      if (p) a.pos = p.pos;
    }

    const result = this.dispatcher.update(
      this.tick, this.allTracks, this.assets,
      (t) => (t === this.playerTrack ? Math.max(4, this.player.speed) : 4),
    );

    for (const task of result.issued) {
      const d = this.drones.find((x) => x.id === task.assetId);
      if (d) { assignTask(d, task); this.message('SYSTEM', [SYSTEM.droneDispatch], 3.2); continue; }
      const p = this.patrols.find((x) => x.id === task.assetId);
      if (p) {
        assignPatrolTask(p, task, this.world);
        this.message('SYSTEM', [task.kind === 'TRACK' ? SYSTEM.intervention : SYSTEM.patrolDispatch], 3.4,
          task.kind === 'TRACK' ? 'strong' : 'normal');
      }
    }
    for (const task of result.cancelled) {
      const d = this.drones.find((x) => x.id === task.assetId);
      if (d) assignTask(d, null);
      const p = this.patrols.find((x) => x.id === task.assetId);
      if (p) assignPatrolTask(p, null, this.world);
    }

    this.escalation = result.level;
    if (this.escalation !== this.lastEscalation) {
      this.bus.emit('escalation:changed', {
        from: this.lastEscalation, to: this.escalation, risk: this.playerTrack.risk.total,
      });
      if (this.escalation === 'MONITORING' && this.lastEscalation === 'PASSIVE') {
        this.message('SYSTEM', [SYSTEM.subjectMonitoring, SYSTEM.risk(this.playerTrack.risk.total)], 3.8);
      }
      this.lastEscalation = this.escalation;
    }
  }

  private releaseAsset(id: string): void {
    const a = this.assets.find((x) => x.id === id);
    if (a) { a.task = null; a.available = true; }
  }

  private updateAssets(dt: number): void {
    for (const d of this.drones) {
      let live: Vec2 | null = null;
      if (d.task?.kind === 'TRACK' && d.task.trackId) {
        const t = this.allTracks.find((x) => x.id === d.task!.trackId);
        if (t) live = t.confidence > 0.25 ? t.estimate : d.task.target;
      }
      const before = d.state;
      updateDrone(d, dt, live);
      if (before !== 'DESTABILISED' && d.state === 'PATROL' && d.task === null) this.releaseAsset(d.id);
      if (d.state === 'RETURN' && before === 'DESTABILISED') this.releaseAsset(d.id);
    }

    for (const p of this.patrols) {
      let live: Vec2 | null = null;
      if (p.task?.kind === 'TRACK' && p.task.trackId) {
        const t = this.allTracks.find((x) => x.id === p.task!.trackId);
        // The unit routes to the forecast, not to the truth.
        if (t) live = t.confidence > 0.25 ? t.estimate : p.task.target;
      }
      updatePatrol(p, dt, this.world, live);

      if (p.state === 'INTERVENING' && dist(p.pos, this.player.pos) < PATROL.contactRadius) {
        p.contactTicks++;
        if (p.contactTicks === 60) {
          this.playerSubject.priorContacts++;
          this.bus.emit('patrol:contact', { patrolId: p.id });
          this.message('SYSTEM', [SYSTEM.interventionComplete], 4.2, 'strong');
          this.message('CARE', [CARE.stopped], 4.0);
          assignPatrolTask(p, null, this.world);
          this.releaseAsset(p.id);
          // A contact costs future freedom, not a life. That is the right
          // punishment for this game.
          this.playerTrack.risk.total = Math.max(0, this.playerTrack.risk.total - 40);
          this.playerTrack.linkedEvidence.length = 0;
          p.contactTicks = 0;
        }
      } else if (p.state !== 'INTERVENING') {
        p.contactTicks = 0;
      }
    }
  }

  // ---------------------------------------------------------------- hacking

  /** The node the player could act on right now. */
  updateFocus(): void {
    if (this.selectedNodeId) {
      const chosen = this.network.get(this.selectedNodeId);
      if (chosen && (chosen.kind === 'SERVICE' || dist(chosen.pos, this.player.pos) <= SELECT_RANGE)) {
        this.focusNode = chosen;
        return;
      }
      // Skating away from a node lets it go, without a menu to dismiss.
      this.selectedNodeId = null;
      if (this.hack) this.cancelHack();
    }
    this.focusNode = this.network.nearest(this.player.pos, 14) ?? null;
  }

  /**
   * Reach for a specific node, or let go of the one being held.
   *
   * A service has no location: it is a record, reached by following an edge to
   * it rather than by standing next to it. So a discovered service can be held
   * from wherever the player traced it.
   */
  selectNode(id: string | null): void {
    if (id === null) {
      this.selectedNodeId = null;
      return;
    }
    const node = this.network.get(id);
    if (!node) return;
    if (node.kind !== 'SERVICE' && dist(node.pos, this.player.pos) > SELECT_RANGE) return;
    if (node.kind === 'SERVICE' && !this.discoveredNodes.has(id)) return;
    this.selectedNodeId = id;
    this.focusNode = node;
  }

  /** Services this player has followed an edge to, and may now read. */
  reachableServices(): NetworkNode[] {
    const out: NetworkNode[] = [];
    for (const id of this.discoveredNodes) {
      const n = this.network.get(id);
      if (n && n.kind === 'SERVICE') out.push(n);
    }
    return out;
  }

  canHack(verb: HackVerb): boolean {
    if (!this.focusNode) return false;
    if (verb === 'LOOP') return this.focusNode.kind === 'CAMERA';
    return true;
  }

  startHack(verb: HackVerb, nodeId?: string): boolean {
    const id = nodeId ?? this.focusNode?.id;
    if (!id) return false;
    const spec = VERBS[verb];
    this.hack = { verb, nodeId: id, ticksRemaining: Math.round(spec.seconds * 60), ticksTotal: Math.round(spec.seconds * 60) };
    this.bus.emit('hack:started', { verb, nodeId: id, seconds: spec.seconds });
    return true;
  }

  cancelHack(): void {
    if (!this.hack) return;
    this.bus.emit('hack:cancelled', { verb: this.hack.verb, nodeId: this.hack.nodeId });
    this.hack = null;
  }

  private updateHack(intent: Intent, _dt: number): void {
    this.updateFocus();
    if (!this.hack) return;
    // The cost of interfering is time standing still, in a town full of cameras.
    if (this.player.speed > 1.4 || intent.toggleStance) { this.cancelHack(); return; }
    const node = this.network.get(this.hack.nodeId);
    if (!node || dist(node.pos, this.player.pos) > 16) { this.cancelHack(); return; }

    this.hack.ticksRemaining--;
    if (this.hack.ticksRemaining > 0) return;

    const { verb, nodeId } = this.hack;
    this.hack = null;
    this.applyHack(verb, nodeId);
    this.bus.emit('hack:completed', { verb, nodeId });
  }

  applyHack(verb: HackVerb, nodeId: string): void {
    const node = this.network.get(nodeId);
    if (!node) return;
    node.discovered = true;
    this.discoveredNodes.add(nodeId);

    switch (verb) {
      case 'QUERY':
        for (const e of node.edges) this.discoveredNodes.add(e);
        break;
      case 'TRACE':
        for (const e of node.edges) {
          this.discoveredNodes.add(e);
          const n = this.network.get(e);
          if (n) n.discovered = true;
        }
        break;
      case 'LOOP': {
        const s = this.sensorById.get(nodeId);
        if (s) {
          s.state = 'LOOPED';
          s.stateUntil = this.tick + LOOP_DURATION_TICKS;
          s.loopedAtTick = this.tick;
          node.state = 'LOOPED';
          node.stateUntil = s.stateUntil;
          // Cheating is possible but not free: the check comes later, and the
          // evidence it creates is retroactive.
          node.checkTick = this.tick + this.rng.int(INTEGRITY_CHECK_MIN, INTEGRITY_CHECK_MAX);
          this.message('SYSTEM', [SYSTEM.loopActive(nodeId)], 3.0);
        }
        break;
      }
      case 'SUPPRESS': {
        this.playerTrack.confidence *= 0.6;
        this.playerTrack.suppressedUntil = this.tick + 60 * 6;
        this.message('SYSTEM', [SYSTEM.risk(this.playerTrack.risk.total)], 2.6);
        break;
      }
      case 'REROUTE': {
        // No evidence at all if the flag is plausible. This is why the network
        // verbs feel powerful compared to breaking things.
        this.dispatcher.flagAnomaly(node.pos, this.tick, SYSTEM.noiseAnomaly, 60 * 16);
        this.message('SYSTEM', [SYSTEM.noiseAnomaly, SYSTEM.droneDispatch], 3.4);
        break;
      }
      case 'MASK': {
        this.playerTrack.maskedUntil = this.tick + 60 * 30;
        this.playerTrack.attributedIdentity = 'UNKNOWN';
        this.message('SYSTEM', [SYSTEM.maskActive], 3.4);
        this.addEvidence('NODE_TAMPER', node.pos, `IDENTITY SERVICE ANOMALY — ${nodeId}`, null, this.sensorsObserving(node.pos));
        break;
      }
    }
  }

  private updateNetwork(): void {
    this.network.update(this.tick);
    for (const n of this.network.dueChecks(this.tick)) {
      // The loop is discovered after the fact, creating evidence where it happened.
      this.message('SYSTEM', [SYSTEM.integrityFail(n.id), SYSTEM.tamperLogged], 4.0, 'strong');
      this.addEvidence('NODE_TAMPER', n.pos, `TAMPER — ${n.id}`, null, []);
    }
  }

  // ---------------------------------------------------------------- vision

  private updateVision(intent: Intent, dt: number): void {
    if (this.crackTimer > 0) {
      this.crackTimer -= dt;
      this.visionBlend = Math.min(1, this.visionBlend + dt * 2.6);
      this.visionActive = true;
      return;
    }
    this.visionActive = this.visionUnlocked && intent.vision;
    const target = this.visionActive ? 1 : 0;
    // Roughly 600 ms in, 430 ms out. Coming back is faster, so the real world
    // returns a little too suddenly, which is the correct feeling.
    const rate = this.visionActive ? 1.45 : 2.3;
    this.visionBlend += Math.sign(target - this.visionBlend) * Math.min(Math.abs(target - this.visionBlend), rate * dt);
  }

  crackTheVeneer(seconds: number): void {
    this.crackTimer = seconds;
    this.bus.emit('veneer:crack', { seconds });
  }

  unlockVision(): void {
    if (this.visionUnlocked) return;
    this.visionUnlocked = true;
    this.bus.emit('vision:unlocked', {});
  }

  // ---------------------------------------------------------------- incidents

  openIncident(kind: Incident['kind'], pos: Vec2, label: string, district: string): Incident {
    const inc: Incident = {
      id: `INC-${this.incidents.length + 4100}`,
      kind, pos: { ...pos }, tick: this.tick, district, open: true, label, associated: [],
    };
    this.incidents.push(inc);
    this.bus.emit('incident:opened', { incident: inc });
    return inc;
  }

  /**
   * Ask fusion what it would conclude, given the incident, and let it be wrong.
   * Nothing here forces the answer: it runs the same posterior the sensors run,
   * with the priors the identities actually carry.
   */
  runIdentityMatch(incident: Incident): { identity: string; confidence: number } {
    let bestIdentity = 'UNKNOWN';
    let bestPrior = 0;
    for (const s of this.allSubjects) {
      const prior = s.districtPriors[incident.district] ?? 0;
      if (prior > bestPrior) { bestPrior = prior; bestIdentity = s.identity; }
    }
    // Reported confidence is the system's internal agreement, not its
    // correctness. A 0.97 prior reports as 98.7%, and that number is the whole
    // problem: it is high enough that the town has agreed to act on it.
    const confidence = 90 + bestPrior * 9 + this.rng.range(-0.03, 0.03);
    incident.associated.push(bestIdentity);
    return { identity: bestIdentity, confidence: Math.min(99.4, confidence) };
  }

  // ---------------------------------------------------------------- queries

  /** True while any active sensor can currently see the player. */
  get playerObserved(): boolean {
    const arr = this.observationBuffer.get(this.playerSubject.id);
    return !!arr && arr.length > 0;
  }

  sensorsSeeingPlayer(): Sensor[] {
    const arr = this.observationBuffer.get(this.playerSubject.id) ?? [];
    const ids = new Set(arr.map((o) => o.sensorId));
    return this.sensors.filter((s) => ids.has(s.data.id));
  }

  get playerRisk(): number { return this.playerTrack.risk.total; }
  get playerLevel(): EscalationLevel { return levelFor(this.playerTrack.risk.total); }
  get playerMaxSpeed(): number { return maxSpeedFor(this.player); }

  buildingUnderPlayer(): boolean {
    const b = this.world.buildingAt(this.player.pos);
    return b !== null && pointInPoly(b.poly, this.player.pos);
  }

  boundsOf(poly: Vec2[]) { return polyBounds(poly); }
}

/**
 * What a player may still do while the world is peeled open: keep their line,
 * and stop. Not push, not aim, not fire, not reach into anything.
 */
function suppressWhileLooking(intent: Intent): Intent {
  return {
    ...intent,
    push: false, pushPressed: false,
    aim: false, fire: false, firePressed: false,
    olliePressed: false, ollieReleased: false, ollieHeld: false,
    interact: false, interactPressed: false,
    drawAmount: null, aimVector: null, pointerActive: false,
  };
}

const COMPASS = ['EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'NORTH', 'NORTHEAST'];

export function compass(angle: number): string {
  const i = Math.round(((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}
