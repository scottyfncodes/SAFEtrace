/**
 * Escalation and asset tasking.
 *
 * All escalation logic lives here so it is auditable in one place. Assets have
 * no opinions; they receive tasking. Attention is a finite resource the player
 * can move.
 */
import { type Vec2, dist } from '../../core/math';
import { forecastPoint } from './prediction';
import { PURSUIT, PursuitDirector } from './pursuit';
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

export class Dispatcher {
  private lastTaskTick = new Map<string, number>();
  /** Anomaly flags raised by noise events and REROUTE. */
  private anomalies: Array<{ pos: Vec2; tick: number; expires: number; reason: string }> = [];

  /**
   * Who is being pursued, and how far along that has got.
   *
   * The dispatcher used to infer this from a confidence number every tick,
   * which meant "we lost them" was a side effect rather than a state. It is a
   * state now, it lives here, and it is the only thing permitted to hand a
   * unit a live position.
   */
  readonly pursuit = new PursuitDirector();

  reset(): void { this.lastTaskTick.clear(); this.pursuit.reset(); this.anomalies.length = 0; }

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
     * Advance every pursuit, then act on what it says.
     *
     * A TRACK task is the only kind that carries a trackId, and a trackId is
     * the only way an asset can ask for a live position — so cancelling them
     * the moment a pursuit stops being PURSUING is what makes losing somebody
     * mechanically real rather than a wording change. What replaces them below
     * is an INVESTIGATE task pointed at a place, which is all a unit that
     * cannot see you is entitled to.
     */
    const state = new Map<string, ReturnType<PursuitDirector['update']>>();
    for (const t of tracks) {
      const s = this.pursuit.update(t.id, t, tick);
      state.set(t.id, s);
      if (s === 'PURSUING') continue;
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
       * And there is no way onto the list except through the pursuit machine,
       * which begins every session NOT_PURSUING and can only be started by a
       * reported offence.
       */
      const pursuit = state.get(t.id) ?? 'NOT_PURSUING';
      if (pursuit === 'NOT_PURSUING' || pursuit === 'CLEAR') continue;
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

      /*
       * Two completely different orders, and which one is issued is decided by
       * whether anything can currently see the subject.
       *
       * PURSUING: aim at the forecast, not the truth. This is the whole game,
       * and it is the only branch that writes a trackId — which is the only
       * way an asset can keep asking where the subject is now.
       *
       * Anything else: a place. The last known location, or a point in the
       * search pattern around it. A unit given one of these drives there, has
       * a look, and goes back to its beat. It cannot follow somebody it cannot
       * see, because it was never told where they are.
       */
      const live = pursuit === 'PURSUING';
      let target: Vec2;
      if (live) {
        const lead = lvl === 'INTERVENTION' ? 2.5 : 5.0;
        target = t.predictionConfidence > 0.25
          ? forecastPoint(t, lead, speedOf(t))
          : t.estimate;
      } else {
        const from = this.pursuit.get(t.id).lastKnown;
        if (!from) continue;
        target = from;
      }

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
      const taskKind: Task['kind'] = live ? 'TRACK' : 'INVESTIGATE';
      const wants: Asset['kind'][] = ['drone'];
      if (lvl === 'PATROL_DISPATCH' || lvl === 'INTERVENTION') wants.push('patrol');

      let sent = false;
      for (const kind of wants) {
        if (live && assets.some((a) => a.kind === kind && a.task?.trackId === t.id)) continue;
        // Searching units are re-pointed on a slow cadence rather than every
        // time the cooldown lapses, so a search reads as a sweep. Only this
        // search's own orders count: a drone already out looking at a knocked
        // bin is busy, and the pool being busy is the decoy working.
        if (!live && assets.some((a) => a.kind === kind
          && a.task?.reason === SYSTEM.searchingLastKnown
          && tick - a.task.issuedTick < PURSUIT.searchRetaskTicks)) continue;
        const at = live ? target : (this.pursuit.searchPoint(t.id, tick, `${kind}:${t.id}`) ?? target);
        const asset = this.pickAsset(assets, kind, at);
        if (!asset) continue;
        const task: Task = {
          id: `TSK-${++taskCounter}`,
          assetId: asset.id,
          kind: taskKind,
          target: at,
          // Deliberately absent unless the subject is actually in view. This is
          // the whole of "the police do not get your live coordinates".
          trackId: live ? t.id : undefined,
          reason: !live
            ? SYSTEM.searchingLastKnown
            : lvl === 'INTERVENTION'
              ? SYSTEM.interventionAuthorized
              : `SUBJECT MONITORING — PREDICTIVE RISK ${Math.round(t.risk.total)}%`,
          issuedTick: tick,
          expiresTick: tick + (live ? (lvl === 'INTERVENTION' ? 60 * 40 : 60 * 22) : PURSUIT.searchRetaskTicks),
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
