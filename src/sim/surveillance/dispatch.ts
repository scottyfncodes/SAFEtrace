/**
 * Escalation and asset tasking.
 *
 * All escalation logic lives here so it is auditable in one place. Assets have
 * no opinions; they receive tasking. Attention is a finite resource the player
 * can move.
 */
import { type Vec2, dist } from '../../core/math';
import { forecastPoint } from './prediction';
import { levelFor, type EscalationLevel, type Task, type Track } from './types';
import { SYSTEM } from '../../content/copy';

export interface Asset {
  id: string;
  kind: 'drone' | 'patrol';
  pos: Vec2;
  available: boolean;
  task: Task | null;
}

export interface DispatchResult {
  level: EscalationLevel;
  issued: Task[];
  cancelled: Task[];
}

let taskCounter = 0;
export function resetTaskIds(): void { taskCounter = 0; }

const RETASK_COOLDOWN = 90; // 1.5 s, so a wobbling score cannot spam tasking

/**
 * How long a unit keeps chasing a track it can no longer see.
 *
 * Confidence halves every two and a half seconds unobserved, so this is about
 * six seconds of nobody having eyes on you — long enough that ducking behind
 * one hedge is not an escape, short enough that breaking line of sight and
 * *keeping going* is. Without it a tasked unit re-routed to the last estimate
 * for the full life of the task and then re-routed again, which is a homing
 * missile with a uniform on.
 */
const LOST_CONTACT_TICKS = 60 * 6;

export class Dispatcher {
  private lastTaskTick = new Map<string, number>();
  /** Per track: the first tick its confidence dropped out of usable range. */
  private coldSince = new Map<string, number>();
  /** Anomaly flags raised by noise events and REROUTE. */
  private anomalies: Array<{ pos: Vec2; tick: number; expires: number; reason: string }> = [];

  reset(): void { this.lastTaskTick.clear(); this.coldSince.clear(); this.anomalies.length = 0; }

  flagAnomaly(pos: Vec2, tick: number, reason: string, durationTicks = 60 * 12): void {
    this.anomalies.push({ pos: { x: pos.x, y: pos.y }, tick, expires: tick + durationTicks, reason });
  }

  get activeAnomalies(): ReadonlyArray<{ pos: Vec2; tick: number; expires: number; reason: string }> {
    return this.anomalies;
  }

  update(
    tick: number,
    tracks: Track[],
    assets: Asset[],
    speedOf: (t: Track) => number,
  ): DispatchResult {
    this.anomalies = this.anomalies.filter((a) => a.expires > tick);

    const issued: Task[] = [];
    const cancelled: Task[] = [];

    // Expire finished tasks.
    for (const a of assets) {
      if (a.task && tick >= a.task.expiresTick) {
        cancelled.push(a.task);
        a.task = null;
        a.available = true;
      }
    }

    /*
     * Lose the thread.
     *
     * A pursuit has to be losable or it is not a pursuit, it is a countdown.
     * Nothing has seen the subject for six seconds — no camera, no drone, no
     * unit — so the estimate they are driving at is six seconds of guesswork
     * and they stop driving at it. They do not forget: the score is still up,
     * the file is still open, and anything that sees the player again starts
     * this over.
     */
    for (const t of tracks) {
      if (t.confidence >= 0.25) { this.coldSince.delete(t.id); continue; }
      const since = this.coldSince.get(t.id);
      if (since === undefined) { this.coldSince.set(t.id, tick); continue; }
      if (tick - since < LOST_CONTACT_TICKS) continue;
      for (const a of assets) {
        if (a.task?.trackId !== t.id) continue;
        cancelled.push(a.task);
        a.task = null;
        a.available = true;
      }
    }

    // Highest-risk track drives the headline escalation level.
    let top: Track | null = null;
    for (const t of tracks) if (!top || t.risk.total > top.risk.total) top = t;
    const level = top ? levelFor(top.risk.total) : 'PASSIVE';

    // 1. Track-driven tasking, strongest first.
    const ordered = [...tracks].sort((a, b) => b.risk.total - a.risk.total);
    for (const t of ordered) {
      /*
       * Watched is not hunted.
       *
       * Tasking used to key off the risk score alone, and a score is something
       * an ordinary afternoon can raise: skate quickly, cut off the road, be
       * out at the wrong hour, and a drone was launched at you for existing
       * energetically. That made the whole game a chase and left no room to
       * simply be in the town.
       *
       * A unit now goes after somebody the system has something *on* — see
       * Track.wantedUntil. The score still climbs, the notifications still
       * arrive, the cameras still hold you. Nobody comes until you have given
       * them a reason.
       */
      if (tick > t.wantedUntil) continue;
      /*
       * The score no longer decides *whether* anybody comes. It decides who,
       * and how hard: a drone goes to have a look at somebody the system has
       * something on, and a score at dispatch level is what turns that into a
       * patrol standing in the road.
       */
      const scored = levelFor(t.risk.total);
      const lvl: EscalationLevel =
        scored === 'PASSIVE' || scored === 'MONITORING' ? 'DRONE_DISPATCH' : scored;
      const last = this.lastTaskTick.get(t.id) ?? -9999;
      if (tick - last < RETASK_COOLDOWN) continue;

      // Aim at the forecast, not the truth. This is the whole game.
      const lead = lvl === 'INTERVENTION' ? 2.5 : 5.0;
      const target = t.predictionConfidence > 0.25
        ? forecastPoint(t, lead, speedOf(t))
        : t.estimate;

      /*
       * The air goes first, and the ground follows.
       *
       * These are two different threats and they were being issued as one, so
       * whichever asset happened to be nearest turned up and the other kind
       * never appeared. A drone is what you cannot outrun — it is faster in a
       * straight line than any board, it holds visual from above, and holding
       * visual is what keeps everybody else's estimate of you fresh. A unit on
       * the ground is what catches you when you make a mistake.
       *
       * So a subject the system wants gets a drone overhead, tracking, at any
       * level. A unit on the ground is added once the score says it is worth a
       * person's time. One of each at most: committing the whole pool to one
       * subject is exactly what a decoy is supposed to prevent.
       */
      const wants: Array<{ kind: Asset['kind']; taskKind: Task['kind'] }> = [
        { kind: 'drone', taskKind: 'TRACK' },
      ];
      if (lvl === 'PATROL_DISPATCH' || lvl === 'INTERVENTION') {
        wants.push({ kind: 'patrol', taskKind: 'TRACK' });
      }

      let sent = false;
      for (const want of wants) {
        if (assets.some((a) => a.kind === want.kind && a.task?.trackId === t.id)) continue;
        const asset = this.pickAsset(assets, want.kind, target);
        if (!asset) continue;
        const task: Task = {
          id: `TSK-${++taskCounter}`,
          assetId: asset.id,
          kind: want.taskKind,
          target,
          trackId: t.id,
          reason: lvl === 'INTERVENTION'
            ? SYSTEM.interventionAuthorized
            : `SUBJECT MONITORING — PREDICTIVE RISK ${Math.round(t.risk.total)}%`,
          issuedTick: tick,
          expiresTick: tick + (lvl === 'INTERVENTION' ? 60 * 40 : 60 * 22),
        };
        asset.task = task;
        asset.available = false;
        issued.push(task);
        sent = true;
      }
      if (sent) this.lastTaskTick.set(t.id, tick);
    }

    // 2. Anomaly-driven tasking. A bin knocked over three streets away is cheap
    //    and it genuinely moves the asset pool. This is the slingshot's best use.
    for (const a of this.anomalies) {
      if (a.tick !== tick) continue; // task once, on the tick it is raised
      const asset = this.pickAsset(assets, 'drone', a.pos) ?? this.pickAsset(assets, 'patrol', a.pos);
      if (!asset) continue;
      const task: Task = {
        id: `TSK-${++taskCounter}`,
        assetId: asset.id,
        kind: 'INVESTIGATE',
        target: { x: a.pos.x, y: a.pos.y },
        reason: a.reason,
        issuedTick: tick,
        expiresTick: tick + 60 * 18,
      };
      asset.task = task;
      asset.available = false;
      issued.push(task);
    }

    return { level, issued, cancelled };
  }

  private pickAsset(assets: Asset[], kind: Asset['kind'], target: Vec2): Asset | null {
    let best: Asset | null = null;
    let bd = Infinity;
    for (const a of assets) {
      if (a.kind !== kind || !a.available) continue;
      const d = dist(a.pos, target);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}
