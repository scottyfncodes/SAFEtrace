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

  reset(): void { this.lastTaskTick.clear(); this.anomalies.length = 0; }

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

    // Highest-risk track drives the headline escalation level.
    let top: Track | null = null;
    for (const t of tracks) if (!top || t.risk.total > top.risk.total) top = t;
    const level = top ? levelFor(top.risk.total) : 'PASSIVE';

    // 1. Track-driven tasking, strongest first.
    const ordered = [...tracks].sort((a, b) => b.risk.total - a.risk.total);
    for (const t of ordered) {
      const lvl = levelFor(t.risk.total);
      if (lvl === 'PASSIVE' || lvl === 'MONITORING') continue;
      const last = this.lastTaskTick.get(t.id) ?? -9999;
      if (tick - last < RETASK_COOLDOWN) continue;

      // Aim at the forecast, not the truth. This is the whole game.
      const lead = lvl === 'INTERVENTION' ? 2.5 : 5.0;
      const target = t.predictionConfidence > 0.25
        ? forecastPoint(t, lead, speedOf(t))
        : t.estimate;

      const wantKind: Asset['kind'] = lvl === 'DRONE_DISPATCH' ? 'drone' : 'patrol';
      const asset = this.pickAsset(assets, wantKind, target)
        ?? this.pickAsset(assets, wantKind === 'drone' ? 'patrol' : 'drone', target);
      if (!asset) continue;

      const task: Task = {
        id: `TSK-${++taskCounter}`,
        assetId: asset.id,
        kind: lvl === 'INTERVENTION' || lvl === 'PATROL_DISPATCH' ? 'TRACK' : 'INVESTIGATE',
        target,
        trackId: t.id,
        reason: lvl === 'INTERVENTION'
          ? 'INTERVENTION AUTHORIZED'
          : `SUBJECT MONITORING — PREDICTIVE RISK ${Math.round(t.risk.total)}%`,
        issuedTick: tick,
        expiresTick: tick + (lvl === 'INTERVENTION' ? 60 * 40 : 60 * 22),
      };
      asset.task = task;
      asset.available = false;
      this.lastTaskTick.set(t.id, tick);
      issued.push(task);
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
