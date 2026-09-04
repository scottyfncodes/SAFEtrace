/**
 * The surveillance domain model.
 *
 * The single most important distinction in this file is Subject vs Track:
 * a Subject is what is true, a Track is what SAFEtrace believes.
 * The whole game lives in the gap between them.
 */
import type { Vec2 } from '../../core/math';

export type SubjectKind = 'player' | 'friend' | 'resident' | 'unknown';

export interface Subject {
  id: string;
  kind: SubjectKind;
  /** The identity SAFEtrace has on file. */
  identity: string;
  displayName: string;
  pos: Vec2;
  vel: Vec2;
  /** True speed, m/s. */
  speed: number;
  /** Prior association weight per district: used by fusion and prediction. */
  districtPriors: Record<string, number>;
  /** Contacts on record; raises the risk floor. */
  priorContacts: number;
  /**
   * How well SAFEtrace already knows this person's routine, 0..1. A resident
   * who walks the same route every afternoon is legible, so their prediction
   * error is not read as anomalous. The player has almost no history, which is
   * precisely why the system finds them interesting.
   */
  familiarity: number;
}

export interface Observation {
  sensorId: string;
  subjectId: string;
  pos: Vec2;
  tick: number;
  /** 0..1 how well the subject was seen. */
  quality: number;
  /** 0..1 how confident the identity match is. */
  identityConfidence: number;
  /** The identity the observation was attributed to. May be wrong. */
  attributedIdentity: string;
}

export type BehaviourFlag =
  | 'NORMAL_TRANSIT'
  | 'LOITERING'
  | 'UNUSUAL_ROUTE'
  | 'EVASIVE'
  | 'RECKLESS_VELOCITY'
  | 'PROXIMITY_TO_EVIDENCE';

export interface TrackSample { pos: Vec2; tick: number; speed: number; offRoad: number; }

export interface RiskBreakdown {
  behaviour: number;
  evidence: number;
  incident: number;
  anomaly: number;
  history: number;
  decay: number;
  total: number;
}

export interface Track {
  id: string;
  /** The subject this track actually follows (ground truth link, for the sim). */
  subjectId: string;
  /** The identity SAFEtrace has attributed. Can be wrong. This is the whole point. */
  attributedIdentity: string;
  attributionConfidence: number;
  /** The system's position estimate; drifts when unobserved. */
  estimate: Vec2;
  estimatedVel: Vec2;
  /** 0..1 belief that this track is live and accurate. */
  confidence: number;
  lastObservedTick: number;
  history: TrackSample[];
  flags: Set<BehaviourFlag>;
  /** Forecast polyline along the road graph. */
  prediction: Vec2[];
  predictionConfidence: number;
  /** Running measure of how wrong the forecast has been, 0..1. */
  predictionError: number;
  risk: RiskBreakdown;
  /** Evidence ids linked to this track. */
  linkedEvidence: string[];
  /** Ticks during which the track is invisible to sensors (LOOP/MASK). */
  suppressedUntil: number;
  maskedUntil: number;
}

export type IncidentKind = 'BURGLARY' | 'VANDALISM' | 'TRESPASS' | 'ANOMALY' | 'DEVICE_FAULT';

export interface Incident {
  id: string;
  kind: IncidentKind;
  pos: Vec2;
  tick: number;
  district: string;
  open: boolean;
  label: string;
  /** Identities the system has associated with this incident. */
  associated: string[];
}

export type EvidenceKind =
  | 'PROJECTILE_IMPACT' | 'NODE_OFFLINE' | 'NODE_TAMPER' | 'NOISE' | 'DRONE_INTERFERENCE';

export type EvidenceStage = 'NEW' | 'ANALYSING' | 'RESOLVED';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  pos: Vec2;
  tick: number;
  /** Velocity of the projectile at impact, for back-projection. */
  impactVel?: Vec2;
  observedBy: string[];
  stage: EvidenceStage;
  analysisCompleteTick: number;
  originEstimate?: Vec2;
  originUncertainty: number;
  linkedTrackId?: string;
  linkedIdentity?: string;
  /** Weight this contributes to a linked subject's risk. */
  weight: number;
  label: string;
}

export type EscalationLevel =
  | 'PASSIVE' | 'MONITORING' | 'DRONE_DISPATCH' | 'PATROL_DISPATCH' | 'INTERVENTION';

export const ESCALATION_THRESHOLDS: Array<{ level: EscalationLevel; at: number }> = [
  { level: 'PASSIVE', at: 0 },
  { level: 'MONITORING', at: 25 },
  { level: 'DRONE_DISPATCH', at: 45 },
  { level: 'PATROL_DISPATCH', at: 65 },
  { level: 'INTERVENTION', at: 85 },
];

export function levelFor(risk: number): EscalationLevel {
  let out: EscalationLevel = 'PASSIVE';
  for (const t of ESCALATION_THRESHOLDS) if (risk >= t.at) out = t.level;
  return out;
}

export interface Task {
  id: string;
  assetId: string;
  kind: 'PATROL' | 'INVESTIGATE' | 'TRACK' | 'RETURN' | 'RELAY';
  target: Vec2;
  trackId?: string;
  reason: string;
  issuedTick: number;
  expiresTick: number;
}
