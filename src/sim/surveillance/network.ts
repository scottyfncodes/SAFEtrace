/**
 * The hackable graph. The network is a place, not a minigame.
 * QUERY and TRACE are free; interference costs time, proximity, and evidence.
 */
import { type Vec2, dist } from '../../core/math';
import type { NetworkData, NetworkNodeData, NetworkSegmentData } from '../worldTypes';

export type NodeState = 'NOMINAL' | 'LOOPED' | 'DEGRADED' | 'OFFLINE' | 'TAMPERED';

export interface NetworkNode extends NetworkNodeData {
  state: NodeState;
  stateUntil: number;
  /** 0..1; integrity checks reduce this and eventually reveal tampering. */
  integrity: number;
  /** Tick at which an integrity check on a LOOP will fire. */
  checkTick: number;
  discovered: boolean;
}

export type HackVerb = 'QUERY' | 'TRACE' | 'LOOP' | 'SUPPRESS' | 'REROUTE' | 'MASK';

export interface VerbSpec {
  verb: HackVerb;
  seconds: number;
  label: string;
  description: string;
  /** Leaves a trace the system can later act on. */
  detectable: boolean;
}

export const VERBS: Record<HackVerb, VerbSpec> = {
  QUERY:    { verb: 'QUERY',    seconds: 0.8, label: 'QUERY',    description: 'Read node properties and recent records.', detectable: false },
  TRACE:    { verb: 'TRACE',    seconds: 1.2, label: 'TRACE',    description: 'Follow an edge and reveal what is on the other end.', detectable: false },
  LOOP:     { verb: 'LOOP',     seconds: 2.4, label: 'LOOP',     description: 'Node reports its last nominal state. Integrity check follows.', detectable: true },
  SUPPRESS: { verb: 'SUPPRESS', seconds: 3.0, label: 'SUPPRESS', description: 'Reduce confidence in an active track.', detectable: true },
  REROUTE:  { verb: 'REROUTE',  seconds: 2.0, label: 'REROUTE',  description: 'Flag a location as anomalous. Assets will investigate.', detectable: false },
  MASK:     { verb: 'MASK',     seconds: 4.0, label: 'MASK',     description: 'Drop your identity attribution to UNKNOWN.', detectable: true },
};

export const LOOP_DURATION_TICKS = 60 * 22;
export const INTEGRITY_CHECK_MIN = 60 * 45;
export const INTEGRITY_CHECK_MAX = 60 * 90;

export class Network {
  readonly nodes = new Map<string, NetworkNode>();
  readonly segments = new Map<string, NetworkSegmentData>();

  constructor(data: NetworkData) {
    for (const n of data.nodes) {
      this.nodes.set(n.id, {
        ...n,
        state: 'NOMINAL',
        stateUntil: 0,
        integrity: 1,
        checkTick: -1,
        discovered: false,
      });
    }
    for (const s of data.segments) this.segments.set(s.id, s);
  }

  get(id: string): NetworkNode | undefined { return this.nodes.get(id); }

  nodesNear(p: Vec2, r: number): NetworkNode[] {
    const out: NetworkNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.kind === 'SERVICE') continue;
      if (dist(n.pos, p) <= r) out.push(n);
    }
    out.sort((a, b) => dist(a.pos, p) - dist(b.pos, p));
    return out;
  }

  nearest(p: Vec2, r: number): NetworkNode | null {
    let best: NetworkNode | null = null;
    let bd = r;
    for (const n of this.nodes.values()) {
      if (n.kind === 'SERVICE') continue;
      const d = dist(n.pos, p);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  segmentNodes(segmentId: string): NetworkNode[] {
    const seg = this.segments.get(segmentId);
    if (!seg) return [];
    return seg.nodeIds.map((id) => this.nodes.get(id)).filter((n): n is NetworkNode => !!n);
  }

  update(tick: number): NetworkNode[] {
    const expired: NetworkNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.stateUntil > 0 && tick >= n.stateUntil) {
        n.state = 'NOMINAL';
        n.stateUntil = 0;
        expired.push(n);
      }
    }
    return expired;
  }

  /** Nodes whose LOOP integrity check is due this tick. */
  dueChecks(tick: number): NetworkNode[] {
    const out: NetworkNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.checkTick > 0 && tick >= n.checkTick) { out.push(n); n.checkTick = -1; }
    }
    return out;
  }
}
