/** The town, as data. Every field here is something the machine renderer can read. */
import type { Vec2 } from '../core/math';

export type SurfaceKind =
  | 'asphalt' | 'smoothConcrete' | 'roughConcrete' | 'grass' | 'gravel' | 'dirt' | 'water' | 'tile';

export interface SurfacePatch {
  id: string;
  kind: SurfaceKind;
  poly: Vec2[];
  /** Higher wins where patches overlap. */
  priority: number;
}

export type BuildingKind =
  | 'house' | 'shop' | 'school' | 'civic' | 'utility' | 'garage' | 'shed' | 'structure';

export interface Building {
  id: string;
  kind: BuildingKind;
  poly: Vec2[];
  height: number;
  wall: string;
  roof: string;
  district: string;
  /** Machine-mode metadata. These are real fields, not decoration. */
  occupants?: number;
  label?: string;
  nodeIds: string[];
}

/** A wall segment that blocks camera line of sight. */
export interface Occluder { a: Vec2; b: Vec2; height: number; }

/** Overhead cover: defeats drone observation entirely. */
export interface Cover { id: string; poly: Vec2[]; height: number; kind: 'deck' | 'canopy' | 'awning' | 'tunnel' | 'carport'; }

export type PropKind =
  | 'tree' | 'bush' | 'car' | 'bin' | 'hydrant' | 'bench' | 'pole' | 'sign'
  | 'planter' | 'hoop' | 'mailbox' | 'cone' | 'fenceGate' | 'speaker' | 'ammoCache';

export interface Prop {
  id: string;
  kind: PropKind;
  pos: Vec2;
  rot: number;
  scale: number;
  /** Colour override for variety. */
  tint?: string;
  /** Can be hit by a projectile to produce an effect. */
  hittable?: boolean;
  nodeId?: string;
  district: string;
  /** Runtime, mutable. */
  knocked?: boolean;
  alarmUntil?: number;
}

export type FeatureKind = 'bank' | 'kicker' | 'drop' | 'gap' | 'curb' | 'rail' | 'pool';

export interface SkateFeature {
  id: string;
  kind: FeatureKind;
  poly: Vec2[];
  /** Direction the feature pushes/faces, radians. */
  facing: number;
  /** Height change in metres (positive = up). */
  rise: number;
  /** Speed granted at the lip for kickers/banks. */
  boost: number;
  district: string;
}

export interface RoadNode { id: string; pos: Vec2; district: string; }

export interface RoadEdge {
  a: string;
  b: string;
  width: number;
  /** How commonly residents use this edge. Prediction is biased by this. */
  prior: number;
  surface: SurfaceKind;
}

export interface District {
  id: string;
  name: string;
  centre: Vec2;
  radius: number;
}

export interface WorldData {
  bounds: { min: Vec2; max: Vec2 };
  districts: District[];
  surfaces: SurfacePatch[];
  buildings: Building[];
  occluders: Occluder[];
  covers: Cover[];
  props: Prop[];
  features: SkateFeature[];
  roadNodes: RoadNode[];
  roadEdges: RoadEdge[];
  sensors: SensorData[];
  network: NetworkData;
  spawns: { player: Vec2; devon: Vec2; dronePads: Vec2[]; patrolStarts: Vec2[] };
  npcRoutes: Vec2[][];
  droneRoutes: Vec2[][];
  patrolRoutes: Vec2[][];
}

export type SensorKind = 'porch' | 'street' | 'plaza' | 'school' | 'reader' | 'doorbell' | 'facility';

export interface SensorData {
  id: string;
  nodeId: string;
  kind: SensorKind;
  pos: Vec2;
  /** Mount height in metres; matters for slingshot ballistics. */
  height: number;
  /** Home facing, radians. */
  facing: number;
  fov: number;
  range: number;
  /** Sweep half-arc in radians; 0 = fixed. */
  sweep: number;
  /** Seconds per full sweep cycle. */
  sweepPeriod: number;
  /** Phase offset so a street's cameras are not synchronised. */
  sweepPhase: number;
  /** Quality multiplier for identity recognition. */
  recognitionBias: number;
  district: string;
  label: string;
}

export type NetworkNodeKind =
  | 'CAMERA' | 'JUNCTION' | 'UPLINK' | 'PLATE_READER' | 'SIGN' | 'SPEAKER' | 'DOOR' | 'SERVICE';

export interface NetworkNodeData {
  id: string;
  kind: NetworkNodeKind;
  pos: Vec2;
  segmentId: string;
  label: string;
  edges: string[];
  /** Records revealed by QUERY. */
  records?: string[];
}

export interface NetworkSegmentData {
  id: string;
  uplinkId: string;
  label: string;
  nodeIds: string[];
}

export interface NetworkData {
  nodes: NetworkNodeData[];
  segments: NetworkSegmentData[];
}
