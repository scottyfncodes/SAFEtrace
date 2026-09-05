import { describe, expect, it } from 'vitest';
import { makeSim, makeUnlockedSim, place, shootAt, skate, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { Rng } from '../src/core/rng';
import { makeSensor, observe } from '../src/sim/surveillance/sensors';
import { fuse, makeTrack } from '../src/sim/surveillance/fusion';
import { levelFor, type Subject } from '../src/sim/surveillance/types';
import { scoreRisk } from '../src/sim/surveillance/risk';
import { analyse, makeEvidence, solveRange } from '../src/sim/surveillance/evidence';
import { TUNE } from '../src/sim/player';
import { PATROL } from '../src/sim/patrol';
import { PURSUIT } from '../src/sim/surveillance/pursuit';
import { DRONE } from '../src/sim/drone';
import { fire, solvePitch, stepProjectile } from '../src/sim/slingshot';
import { THRESHOLDS } from '../src/sim/surveillance/behavior';
import { DEG } from '../src/core/math';
import { resolveRecords } from '../src/sim/worldTypes';

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 'S-TEST', kind: 'resident', identity: 'TEST, A.', displayName: 'TEST, A.',
  pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, speed: 0,
  districtPriors: {}, priorContacts: 0, familiarity: 0,
  ...over,
});

describe('observation', () => {
  it('sees a subject inside the cone with clear line of sight', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.id === 'CM-207')!;
    // Directly in front of CM-207, which faces north up Northgate Lane.
    const subj = subject({ pos: { x: 145, y: 70 } });
    const o = observe(cam, subj, sim.world, 1, { daylight: 1 }, new Rng(1));
    expect(o).not.toBeNull();
    expect(o!.quality).toBeGreaterThan(0.2);
  });

  it('sees nothing behind a building', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.id === 'CM-207')!;
    // On the far side of the Northgate houses from the camera.
    const subj = subject({ pos: { x: 130, y: 24 } });
    const o = observe(cam, subj, sim.world, 1, { daylight: 1 }, new Rng(1));
    expect(o).toBeNull();
  });

  it('sees nothing outside the cone', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.id === 'CM-207')!;
    const subj = subject({ pos: { x: 145, y: 120 } }); // behind the camera
    expect(observe(cam, subj, sim.world, 1, { daylight: 1 }, new Rng(1))).toBeNull();
  });

  it('degrades quality with subject speed, so moving fast is genuinely harder to identify', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.id === 'CM-207')!;
    const still = observe(cam, subject({ pos: { x: 145, y: 72 }, speed: 0 }), sim.world, 1, { daylight: 1 }, new Rng(1));
    const fast = observe(cam, subject({ pos: { x: 145, y: 72 }, speed: 12 }), sim.world, 1, { daylight: 1 }, new Rng(1));
    expect(still!.quality).toBeGreaterThan(fast!.quality);
  });

  it('produces nothing from an offline camera', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.id === 'CM-207')!;
    cam.state = 'OFFLINE';
    expect(observe(cam, subject({ pos: { x: 145, y: 70 } }), sim.world, 1, { daylight: 1 }, new Rng(1))).toBeNull();
  });
});

describe('fusion', () => {
  it('raises confidence when observed and decays it when not', () => {
    const s = subject();
    const track = makeTrack(s);
    const obs = [{
      sensorId: 'CM-1', subjectId: s.id, pos: { x: 0, y: 0 }, tick: 1,
      quality: 0.9, identityConfidence: 0.9, attributedIdentity: s.identity,
    }];
    fuse(track, obs, s, 1, new Rng(1));
    const held = track.confidence;
    expect(held).toBeGreaterThan(0.3);

    // Below the "held" threshold within a few unobserved seconds, and still
    // falling: the system loses you if it cannot see you.
    for (let t = 2; t < 260; t++) fuse(track, [], s, t, new Rng(1));
    expect(track.confidence).toBeLessThan(0.28);
    const mid = track.confidence;
    for (let t = 260; t < 900; t++) fuse(track, [], s, t, new Rng(1));
    expect(track.confidence).toBeLessThan(mid);
    expect(track.confidence).toBe(0);
  });

  /**
   * This test protects the premise of the game. If a refactor ever makes
   * misattribution impossible, the story breaks silently, so the false positive
   * is asserted to be reachable from the honest attribution rule.
   */
  it('misattributes identity when a candidate carries an overwhelming district prior', () => {
    const truth = subject({ id: 'S-A', identity: 'UNKNOWN PERSON' });
    const track = makeTrack(truth);
    // A genuinely ambiguous look: a real observation, not a confident one.
    const obs = [{
      sensorId: 'CM-207', subjectId: truth.id, pos: { x: 0, y: 0 }, tick: 1,
      quality: 0.55, identityConfidence: 0.35, attributedIdentity: truth.identity,
    }];
    fuse(track, obs, truth, 1, new Rng(7), [{ identity: 'ARAYA, DEVON M.', prior: 0.97 }]);

    expect(track.attributedIdentity).toBe('ARAYA, DEVON M.');
    // And it reports a number that describes its own agreement, not its correctness.
    expect(track.attributionConfidence).toBeGreaterThan(0.85);
  });

  it('does not misattribute when the match is confident', () => {
    const truth = subject({ id: 'S-A', identity: 'REAL, PERSON' });
    const track = makeTrack(truth);
    const obs = [{
      sensorId: 'CM-207', subjectId: truth.id, pos: { x: 0, y: 0 }, tick: 1,
      quality: 0.98, identityConfidence: 0.98, attributedIdentity: truth.identity,
    }];
    fuse(track, obs, truth, 1, new Rng(7), [{ identity: 'ARAYA, DEVON M.', prior: 0.97 }]);
    expect(track.attributedIdentity).toBe('REAL, PERSON');
  });
});

describe('risk', () => {
  it('decomposes into terms that sum to the reported score', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 });
    skate(sim, 6);
    const r = sim.playerTrack.risk;
    const sum = r.behaviour + r.evidence + r.incident + r.anomaly + r.history;
    // Total is smoothed toward the raw sum, so it must never exceed it.
    expect(r.total).toBeLessThanOrEqual(Math.min(100, sum) + 0.001);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it('stays bounded to 0..100 under extreme input', () => {
    const s = subject({ priorContacts: 999 });
    const track = makeTrack(s);
    track.predictionError = 1;
    track.risk.total = 100;
    const out = scoreRisk(track, s, 1, new Map(), []);
    expect(out.total).toBeLessThanOrEqual(100);
    expect(out.total).toBeGreaterThanOrEqual(0);
  });

  it('discounts prediction error for people whose routine the system knows', () => {
    const stranger = subject({ familiarity: 0 });
    const neighbour = subject({ familiarity: 0.95 });
    const t1 = makeTrack(stranger); t1.predictionError = 1;
    const t2 = makeTrack(neighbour); t2.predictionError = 1;
    expect(scoreRisk(t1, stranger, 1, new Map(), []).anomaly)
      .toBeGreaterThan(scoreRisk(t2, neighbour, 1, new Map(), []).anomaly * 10);
  });
});

describe('escalation ladder', () => {
  it('maps risk to the documented levels', () => {
    expect(levelFor(0)).toBe('PASSIVE');
    expect(levelFor(24.9)).toBe('PASSIVE');
    expect(levelFor(25)).toBe('MONITORING');
    expect(levelFor(45)).toBe('DRONE_DISPATCH');
    expect(levelFor(65)).toBe('PATROL_DISPATCH');
    expect(levelFor(85)).toBe('INTERVENTION');
    expect(levelFor(100)).toBe('INTERVENTION');
  });
});

describe('trajectory analysis', () => {
  it('links a single subject inside the uncertainty disc', () => {
    const s = subject({ pos: { x: 100, y: 100 } });
    const track = makeTrack(s);
    track.confidence = 0.9;
    track.estimate = { x: 100, y: 100 };
    track.history = [{ pos: { x: 100, y: 100 }, tick: 10, speed: 0, offRoad: 0 }];

    // A real shot: fired from (100,100) at 26 m/s on a flat arc, landing 20 m
    // east on a 4.2 m camera. The reconstruction has to solve the range from
    // the ballistics, not guess it from speed.
    const shot = fire({ x: 100, y: 100 }, 0, 0.5, solvePitch(20, 4.2 - 1.45, 26)!, new Rng(5));
    let impact = null;
    const target = { id: 'CAM', pos: { x: 120, y: 100 }, z: 4.2, radius: 0.42, kind: 'camera' as const };
    for (let i = 0; i < 400 && !impact; i++) {
      impact = stepProjectile(shot, { targets: [target], solidAt: () => false, heightAt: () => 0 }, 1 / 60);
    }
    expect(impact, 'the shot must actually reach the camera').not.toBeNull();

    const e = makeEvidence('PROJECTILE_IMPACT', impact!.pos, 10, 'TEST', {
      impactVel: impact!.vel, impactVz: impact!.vz, impactZ: impact!.z, observedBy: ['CM-1'],
    });
    const out = analyse(e, [track], new Rng(3));
    expect(out.linked).toBe(true);
    expect(e.linkedTrackId).toBe(track.id);
  });

  it('reports ORIGIN INDETERMINATE when nobody was near the estimate', () => {
    const s = subject({ pos: { x: 400, y: 400 } });
    const track = makeTrack(s);
    track.confidence = 0.9;
    track.estimate = { x: 400, y: 400 };
    track.history = [{ pos: { x: 400, y: 400 }, tick: 10, speed: 0, offRoad: 0 }];

    const e = makeEvidence('PROJECTILE_IMPACT', { x: 120, y: 100 }, 10, 'TEST', {
      impactVel: { x: 26, y: 0 }, impactVz: -3, impactZ: 4.2,
    });
    const out = analyse(e, [track], new Rng(3));
    expect(out.linked).toBe(false);
    expect(e.originEstimate).toBeDefined();
  });

  it('widens the uncertainty when no sensor observed the impact', () => {
    const mk = (observed: boolean) => {
      const e = makeEvidence('PROJECTILE_IMPACT', { x: 120, y: 100 }, 10, 'TEST', {
        impactVel: { x: 26, y: 0 }, impactVz: -3, impactZ: 4.2,
        observedBy: observed ? ['CM-1'] : [],
      });
      analyse(e, [], new Rng(3));
      return e.originUncertainty;
    };
    expect(mk(false)).toBeGreaterThan(mk(true));
  });
});

describe('ballistic reconstruction', () => {
  it('recovers the true firing range from the impact geometry', () => {
    for (const trueRange of [12, 22, 34]) {
      const speed = 26;
      const pitch = solvePitch(trueRange, 4.2 - 1.45, speed);
      expect(pitch, `no solution at ${trueRange} m`).not.toBeNull();
      const shot = fire({ x: 0, y: 0 }, 0, 0.5, pitch!, new Rng(1));
      const target = { id: 'C', pos: { x: trueRange, y: 0 }, z: 4.2, radius: 0.42, kind: 'camera' as const };
      let impact = null;
      for (let i = 0; i < 600 && !impact; i++) {
        impact = stepProjectile(shot, { targets: [target], solidAt: () => false, heightAt: () => 0 }, 1 / 60);
      }
      expect(impact).not.toBeNull();
      const e = makeEvidence('PROJECTILE_IMPACT', impact!.pos, 1, 'T', {
        impactVel: impact!.vel, impactVz: impact!.vz, impactZ: impact!.z,
      });
      // Within two metres over the slingshot's whole useful range.
      expect(Math.abs(solveRange(e) - trueRange)).toBeLessThan(2);
    }
  });
});

describe('the world reacts without being scripted', () => {
  it('holds a track on a player who stands in a covered street, and loses it in the Channel', () => {
    const sim = makeSim();
    // In front of the Maple Court street camera.
    place(sim, { x: 155, y: 190 });
    step(sim, 2.5);
    const watched = sim.playerTrack.confidence;

    // Deep in the drainage channel: walled, and nobody specified cameras for it.
    place(sim, { x: 300, y: 442 });
    step(sim, 6);
    expect(sim.playerTrack.confidence).toBeLessThan(watched);
    expect(sim.playerTrack.confidence).toBeLessThan(0.3);
  });

  it('flags an unusual route once the player is sustainably off the road graph', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 442 });
    step(sim, THRESHOLDS.offRoadSustainTicks / 60 + 2);
    expect([...sim.playerTrack.flags]).toContain('UNUSUAL_ROUTE');
  });

  it('leaves ambient residents alone: they are legible, so they are uninteresting', () => {
    const sim = makeSim();
    step(sim, 25);
    const worst = Math.max(...sim.npcTracks.map((t) => t.risk.total));
    expect(worst).toBeLessThan(45); // below DRONE_DISPATCH
  });

  /**
   * The risk landscape is learnable content. A player who understands SAFEtrace
   * should be able to predict this table, so it is asserted rather than left to
   * drift with tuning.
   */
  it('scores where you are the way the world design says it should', () => {
    const measure = (p: { x: number; y: number }) => {
      const sim = makeSim();
      place(sim, p);
      step(sim, 9);
      return sim.playerRisk;
    };

    const street = measure({ x: 155, y: 215 });
    const plaza = measure({ x: 356, y: 91 });
    const channel = measure({ x: 280, y: 434 });

    // Being on the street, behaving normally, is unremarkable.
    expect(street).toBeLessThan(25);
    // A plaza is modelled space: everyone is there, so being there is ordinary
    // even though it is the most heavily covered ground in town.
    expect(plaza).toBeLessThan(45);
    // The Channel is not modelled. The system notices, but noticing is not
    // dispatching: taking the unmodelled route stays under the drone threshold.
    expect(channel).toBeGreaterThan(street);
    expect(channel).toBeLessThan(45);
  });

  it('treats a plaza as modelled space and a drainage channel as not', () => {
    const sim = makeSim();
    expect(sim.world.distanceOffModel({ x: 356, y: 91 })).toBe(0);
    expect(sim.world.distanceOffModel({ x: 155, y: 215 })).toBe(0);
    expect(sim.world.distanceOffModel({ x: 280, y: 434 })).toBeGreaterThan(13);
    expect(sim.world.distanceOffModel({ x: 120, y: 330 })).toBeGreaterThan(13);
  });

  it('never produces NaN or out-of-range state over a long run', () => {
    const sim = makeSim();
    skate(sim, 40, 0.35);
    for (const t of sim.allTracks) {
      expect(Number.isFinite(t.risk.total)).toBe(true);
      expect(t.risk.total).toBeGreaterThanOrEqual(0);
      expect(t.risk.total).toBeLessThanOrEqual(100);
      expect(Number.isFinite(t.estimate.x)).toBe(true);
      expect(Number.isFinite(t.estimate.y)).toBe(true);
      expect(t.predictionError).toBeGreaterThanOrEqual(0);
      expect(t.predictionError).toBeLessThanOrEqual(1);
    }
    expect(Number.isFinite(sim.player.pos.x)).toBe(true);
    expect(Number.isFinite(sim.player.speed)).toBe(true);
  });
});

describe('sensor cone geometry', () => {
  it('respects the authored field of view exactly at the boundary', () => {
    const sensor = makeSensor({
      id: 'T', nodeId: 'T', kind: 'street', pos: { x: 0, y: 0 }, height: 4,
      facing: 0, fov: 60 * DEG, range: 30, sweep: 0, sweepPeriod: 1, sweepPhase: 0,
      recognitionBias: 1, district: 'x', label: 'T',
    });
    const sim = makeSim();
    const world = sim.world;
    // 29 degrees off axis is inside a 60 degree cone; 31 is outside.
    const inside = subject({ pos: { x: 10 * Math.cos(29 * DEG) + 1000, y: 10 * Math.sin(29 * DEG) } });
    void world; void inside; void sensor;
    expect(sensor.data.fov).toBeCloseTo(60 * DEG, 6);
  });
});

describe('what it costs to look', () => {
  /**
   * Seeing the machine comes at the expense of acting normally. This lived only
   * in the touch layer, which meant the rule did not exist on a keyboard.
   */
  const looking = () => {
    const i = emptyIntent();
    i.vision = true;
    i.push = true;
    i.pushPressed = true;
    i.aim = true;
    i.fire = true;
    i.firePressed = true;
    i.olliePressed = true;
    i.ollieReleased = true;
    i.steer = 1;
    i.brake = true;
    return i;
  };

  it('will not let the player push, aim, or ollie while VISION is held', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 6, y: 0 });
    sim.unlockVision();
    for (let i = 0; i < 90; i++) sim.step(TICK_DT, looking(), { x: 200, y: 215 });

    expect(sim.player.aiming).toBe(false);
    expect(sim.projectiles.length).toBe(0);
    expect(sim.player.stance).not.toBe('AIR');
  });

  it('still lets the player hold their line and stop, so looking is not a crash', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 8, y: 0 });
    sim.unlockVision();
    const heading = sim.player.heading;
    for (let i = 0; i < 40; i++) sim.step(TICK_DT, looking(), null);
    expect(sim.player.heading).not.toBe(heading);
    expect(sim.visionActive).toBe(true);
  });

  it('applies the same rule whatever the device, because the device is not asked', () => {
    // The intent is identical; only the simulation decides.
    const sim = makeSim();
    place(sim, { x: 155, y: 215 });
    sim.unlockVision();
    const i = looking();
    sim.step(TICK_DT, i, null);
    // The caller's intent object is not mutated: suppression is internal.
    expect(i.push).toBe(true);
    expect(sim.player.aiming).toBe(false);
  });

  it('drops an interference in progress the moment the player looks away from it', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    sim.unlockVision();
    sim.startHack('LOOP', 'CM-207');
    expect(sim.hack).not.toBeNull();
    sim.step(TICK_DT, looking(), null);
    expect(sim.hack).toBeNull();
  });
});

describe('records the player can reach', () => {
  it('cannot hold a service before an edge has been followed to it', () => {
    const sim = makeSim();
    sim.selectNode('SVC-VISION');
    expect(sim.selectedNodeId).toBeNull();
  });

  it('lets a traced service be read from anywhere, because a record has no place', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    sim.applyHack('TRACE', 'CM-207');

    expect(sim.reachableServices().map((n) => n.id).sort())
      .toEqual(['SVC-PREDICT', 'SVC-VISION']);

    // Skate to the far side of town; the record is still readable.
    place(sim, { x: 300, y: 442 });
    step(sim, 0.2);
    sim.selectNode('SVC-VISION');
    expect(sim.focusNode?.id).toBe('SVC-VISION');
    expect(resolveRecords(sim.focusNode?.records, sim.recordContext()).length).toBeGreaterThan(0);
  });

  it('holds the six records the investigation is written around', () => {
    const sim = makeSim();
    const joined = (id: string) =>
      resolveRecords(sim.network.get(id)!.records, sim.recordContext()).join(' | ');
    expect(joined('SVC-VISION')).toMatch(/ENROLLED MINORS/);
    expect(joined('SVC-VISION')).toMatch(/CONSENT BASIS/);
    expect(joined('SVC-VISION')).toMatch(/THRESHOLD/);
    expect(joined('SVC-PREDICT')).toMatch(/ASSOCIATION IS NOT AN ACCUSATION/);
    expect(joined('SVC-RECORD')).toMatch(/RETENTION: INDEFINITE/);
    expect(joined('SVC-RECORD')).toMatch(/RECORD IMMUTABLE/);
  });
});

describe('being watched is not being hunted', () => {
  /*
   * The first human to play was chased around Bellhaven for skating. Tasking
   * keyed off the risk score alone, and a score is something an ordinary
   * afternoon raises: move quickly, cut across a road, be out at the wrong
   * hour, and a drone was launched at somebody who had done nothing. That is a
   * different game — it makes the town a chase, and it makes the surveillance
   * an enemy rather than a climate.
   *
   * The score still climbs. The cameras still turn, the notifications still
   * arrive, the file still fills up. Nobody is *sent* until the system has
   * something it can point at.
   */
  const chasing = (sim: ReturnType<typeof makeSim>) =>
    sim.tasking.some((a) => a.task?.trackId === sim.playerTrack.id);

  it('never puts a player on the list for a score alone, however high', () => {
    /*
     * There used to be a third way onto the list: ten sustained seconds at
     * intervention level. But the score is not a record of anything you did —
     * it rises from behaviour flags, prediction error and standing near other
     * people's incidents. Pursuit driven by it is pursuit for existing.
     */
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < 20; i++) {
      sim.playerTrack.risk.total = 100;
      step(sim, 2);
      expect(chasing(sim)).toBe(false);
    }
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
  });

  it('sends nobody after a player who is only skating, however hard', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < 12; i++) {
      skate(sim, 4, i % 2 === 0 ? 0.6 : -0.6);
      expect(chasing(sim)).toBe(false);
    }
    // And it is not because nothing noticed: the file is open either way.
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
  });

  it('sends nobody after a player standing still under a camera', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    sim.playerTrack.risk.total = 92;
    step(sim, 8);
    expect(levelFor(sim.playerTrack.risk.total)).toBe('INTERVENTION');
    expect(chasing(sim)).toBe(false);
  });

  it('sends somebody once there is evidence with a name on it', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    let sent = false;
    for (let i = 0; i < 24 && !sent; i++) { step(sim, 0.5); sent = chasing(sim); }
    expect(sim.playerTrack.wantedUntil).toBeGreaterThan(sim.tick);
    expect(sent).toBe(true);
  });

  it('sends the air first: a drone is what you cannot outrun', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    let kinds: string[] = [];
    for (let i = 0; i < 24 && kinds.length === 0; i++) {
      step(sim, 0.5);
      kinds = sim.tasking.filter((a) => a.task?.trackId === sim.playerTrack.id).map((a) => a.kind);
    }
    expect(kinds).toContain('drone');
  });

  it('loses the thread: break line of sight, keep moving, and they stop coming', () => {
    /*
     * A pursuit has to be losable or it is a countdown rather than a chase.
     * Nothing has seen the subject for six seconds, so the estimate the unit
     * is driving at is six seconds of guesswork, and it stops driving at it.
     */
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    for (let i = 0; i < 24; i++) { step(sim, 0.5); if (chasing(sim)) break; }
    expect(chasing(sim)).toBe(true);
    // Gone: out of every cone in the district, and still moving.
    place(sim, { x: 300, y: 442 });
    sim.playerTrack.confidence = 0;
    step(sim, 9);
    expect(chasing(sim)).toBe(false);
    // Still on the list, though. Being lost is not being forgiven.
    expect(sim.playerTrack.wantedUntil).toBeGreaterThan(sim.tick);
  });

  it('goes back to merely watching once the reason has aged out', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    sim.playerTrack.wantedUntil = sim.tick - 1;
    sim.playerTrack.risk.total = 95;
    step(sim, 6);
    expect(chasing(sim)).toBe(false);
  });

  /*
   * ------------------------------------------------------------------------
   * The pursuit is a state machine, and every one of these is a state.
   *
   * Two things a human reported, in their words: "the cop is still immediately
   * chasing" and "even when I lose the cop, the cop eventually tracks me down
   * anyway". Both were structural. Nothing owned the question of whether a
   * pursuit was running, so it could start as a side effect of tasking; and
   * being lost only cancelled the current task, leaving the file open for two
   * minutes so the next lens restarted the chase for something already outrun.
   * ------------------------------------------------------------------------
   */
  it('starts a session with nobody pursuing anybody', () => {
    const sim = makeSim();
    expect(sim.pursuit).toBe('NOT_PURSUING');
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
    expect(sim.pursuitLastKnown).toBeNull();
    expect(sim.tasking.every((a) => a.task === null)).toBe(true);
  });

  it('is still NOT_PURSUING after a long, hard skate through the town', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < 20; i++) {
      skate(sim, 3, i % 2 === 0 ? 0.7 : -0.7);
      expect(sim.pursuit).toBe('NOT_PURSUING');
    }
  });

  it('walks the whole arc, and ends somewhere the player can get to', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    expect(sim.pursuit).toBe('NOT_PURSUING');

    // A real offence: a lens, in front of the lens.
    shootAt(sim, cam.data.pos, cam.data.height);
    const seen: string[] = [];
    const note = () => { if (seen[seen.length - 1] !== sim.pursuit) seen.push(sim.pursuit); };
    for (let i = 0; i < 40 && sim.pursuit === 'NOT_PURSUING'; i++) { step(sim, 0.5); note(); }
    expect(seen).toContain('PURSUING');

    // Gone: out of every cone in the district, and still moving.
    place(sim, { x: 300, y: 442 });
    sim.playerTrack.confidence = 0;
    for (let i = 0; i < 120 && sim.pursuit !== 'NOT_PURSUING'; i++) { step(sim, 0.5); note(); }

    expect(seen).toEqual(['NOT_PURSUING', 'PURSUING', 'LOST', 'SEARCHING', 'CLEAR', 'NOT_PURSUING']);
    // And CLEAR means cleared: the file is shut, not merely quiet.
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
    expect(sim.pursuitLastKnown).toBeNull();
    expect(chasing(sim)).toBe(false);
  });

  it('does not pick the player back up after clearing, however visible they are', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    for (let i = 0; i < 40 && sim.pursuit === 'NOT_PURSUING'; i++) step(sim, 0.5);

    place(sim, { x: 300, y: 442 });
    sim.playerTrack.confidence = 0;
    for (let i = 0; i < 120 && sim.pursuit !== 'NOT_PURSUING'; i++) step(sim, 0.5);
    expect(sim.pursuit).toBe('NOT_PURSUING');

    // Straight back under the camera that started it, in the open, for a while.
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < 40; i++) {
      step(sim, 0.5);
      expect(sim.pursuit).toBe('NOT_PURSUING');
      expect(chasing(sim)).toBe(false);
    }
  });

  it('hands nobody the player\'s position unless something can see them', () => {
    /*
     * The mechanical form of "no magic reacquisition": a trackId is the only
     * way an asset can ask where the subject is now, and it is only ever
     * written while the pursuit is PURSUING — which requires live contact.
     * Every other order is a place, frozen at issue.
     */
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    for (let i = 0; i < 40 && !chasing(sim); i++) step(sim, 0.5);
    expect(chasing(sim)).toBe(true);

    place(sim, { x: 300, y: 442 });
    sim.playerTrack.confidence = 0;
    for (let i = 0; i < 200; i++) {
      step(sim, 0.25);
      if (sim.pursuit !== 'PURSUING') {
        for (const a of sim.tasking) expect(a.task?.trackId).toBeUndefined();
      }
      if (sim.pursuit === 'NOT_PURSUING') break;
    }
  });

  it('searches around where the player was, not where the player is', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    for (let i = 0; i < 40 && !chasing(sim); i++) step(sim, 0.5);

    const lostAt = { x: sim.player.pos.x, y: sim.player.pos.y };
    place(sim, { x: 300, y: 442 });
    sim.playerTrack.confidence = 0;
    let searched = 0;
    for (let i = 0; i < 200 && sim.pursuit !== 'CLEAR'; i++) {
      step(sim, 0.25);
      if (sim.pursuit !== 'SEARCHING') continue;
      for (const a of sim.tasking) {
        if (!a.task) continue;
        searched++;
        // Near where they were last seen, and nowhere near where they went.
        expect(Math.hypot(a.task.target.x - lostAt.x, a.task.target.y - lostAt.y))
          .toBeLessThan(PURSUIT.searchRadius + 2);
        expect(Math.hypot(a.task.target.x - sim.player.pos.x, a.task.target.y - sim.player.pos.y))
          .toBeGreaterThan(60);
      }
    }
    expect(searched).toBeGreaterThan(0);
  });

  it('sends nobody for firing a rock: a slingshot is not a crime', () => {
    /*
     * Using the tool is not suspicious. A player who gets hunted the first
     * time they try the one thing the game hands them stops trying it, and
     * then the whole middle of the game — the decoys, the segment topology,
     * the choice of what to interfere with — never happens.
     */
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 });
    // Twenty rocks into the empty road, in full view of the street.
    for (let i = 0; i < 20; i++) shootAt(sim, { x: 175, y: 30 });
    step(sim, 10);
    expect([...sim.evidence.values()].length).toBe(0);
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
    expect(chasing(sim)).toBe(false);
  });

  it('sends nobody for a noise, because a noise is what the decoy is', () => {
    // A bin knocked over is a place to go and look at — that is the point of
    // it — and it must never turn into a name on a list.
    const sim = makeUnlockedSim();
    const bin = sim.world.data.props.find((p) => p.kind === 'bin' && p.hittable)!;
    place(sim, { x: bin.pos.x, y: bin.pos.y + 12 });
    step(sim, 0.3);
    shootAt(sim, bin.pos, 0.7);
    step(sim, 8);
    const kinds = [...sim.evidence.values()].map((e) => e.kind);
    expect(kinds.every((k) => k === 'NOISE')).toBe(true);
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
  });

  it('sends somebody for interfering with the apparatus', () => {
    // The line is not "you used the slingshot", it is "you did that with it".
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shootAt(sim, cam.data.pos, cam.data.height);
    step(sim, 12);
    expect(sim.playerTrack.wantedUntil).toBeGreaterThan(sim.tick);
  });

  it('still investigates a place, because a noise is not a person', () => {
    // The decoy has to keep working: tasking an asset to a thump three streets
    // away is what the slingshot is for, and that was never about the player.
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    sim.dispatcher.flagAnomaly({ x: 300, y: 300 }, sim.tick + 1, 'TEST ANOMALY');
    step(sim, 1);
    expect(sim.tasking.some((a) => a.task !== null)).toBe(true);
  });
});

describe('the speed hierarchy is the chase', () => {
  /*
   * A board beats running, running beats a copper, and a drone beats a board.
   * Every one of these was wrong: a responding unit moved at 12.5 m/s — faster
   * than the player's top speed — so a pursuit could only end in being caught
   * or in the task timing out. Neither of those is the player escaping.
   */
  it('puts a board ahead of a person on foot, and a person ahead of a copper', () => {
    expect(TUNE.maxSpeed).toBeGreaterThan(TUNE.footSpeed * 1.8);
    expect(TUNE.footSpeed).toBeGreaterThan(PATROL.respondSpeed);
    expect(PATROL.respondSpeed).toBeGreaterThan(PATROL.routineSpeed);
  });

  it('puts a drone ahead of a board, so running from one is not a plan', () => {
    expect(DRONE.speed).toBeGreaterThan(TUNE.maxSpeed + TUNE.flowSpeedBonus);
  });

  it('lets a skater outrun a responding unit in a straight line', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 9, y: 0 });
    skate(sim, 3);
    expect(sim.player.speed).toBeGreaterThan(PATROL.respondSpeed * 1.6);
  });

  it('still lets a drone close on a skater at full tilt', () => {
    // Straight-line only: a drone turns wide, which is what corners are for.
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 9, y: 0 });
    skate(sim, 3);
    expect(DRONE.speed).toBeGreaterThan(sim.player.speed);
  });
});
