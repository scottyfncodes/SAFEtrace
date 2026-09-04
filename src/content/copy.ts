/**
 * Every string SAFEtrace says, in one file.
 *
 * Not for localisation convenience — for tone control. This voice must be
 * edited as a single document or it will drift, and its consistency is the
 * entire characterisation.
 */

export const BRAND = {
  name: 'SAFEtrace',
  tm: 'SAFEtrace™',
  products: [
    { name: 'SAFEtrace™ HOME', line: 'Protect your family.' },
    { name: 'SAFEtrace™ SCHOOL', line: 'Safer classrooms. Smarter communities.' },
    { name: 'SAFEtrace™ CITY', line: 'Predict. Prevent. Protect.' },
    { name: 'SAFEtrace™ VISION', line: 'Advanced identity recognition.' },
    { name: 'SAFEtrace™ PREDICT', line: "Don't wait for danger." },
    { name: 'SAFEtrace™ CARE', line: 'Someone is always looking out.' },
  ],
};

/** The clinical register. All caps, present tense, never exclamatory. */
export const SYSTEM = {
  identityConfirmed: 'IDENTITY CONFIRMED',
  subjectMonitoring: 'SUBJECT MONITORING INITIATED',
  unusualRoute: 'UNUSUAL ROUTE DETECTED',
  behaviouralAnomaly: 'BEHAVIORAL ANOMALY DETECTED',
  loitering: 'EXTENDED PRESENCE LOGGED',
  reckless: 'VELOCITY ADVISORY — PEDESTRIAN ZONE',
  proximity: 'SUBJECT PROXIMATE TO OPEN INCIDENT',
  evasive: 'INTERMITTENT COVERAGE — SUBJECT PRIORITISED',
  risk: (n: number) => `PREDICTIVE RISK: ${Math.round(n)}%`,
  cameraOffline: (id: string) => `CAMERA OFFLINE — NODE ${id}`,
  cameraFault: (id: string) => `ALIGNMENT FAULT — NODE ${id}`,
  impact: 'PROJECTILE IMPACT DETECTED',
  analysing: 'TRAJECTORY ANALYSIS IN PROGRESS',
  originEstimated: (m: number, dir: string, c: number) =>
    `ORIGIN ESTIMATED — ${Math.round(m)} M ${dir} — CONFIDENCE ${Math.round(c)}%`,
  subjectSearch: 'SUBJECT SEARCH INITIATED',
  subjectLinked: (id: string) => `SUBJECT LINKED — ${id}`,
  originIndeterminate: 'ORIGIN INDETERMINATE — INCIDENT LOGGED',
  droneDispatch: 'UNIT DISPATCHED — INVESTIGATING ANOMALY',
  patrolDispatch: 'GROUND UNIT ROUTED TO PREDICTED POSITION',
  intervention: 'INTERVENTION AUTHORIZED',
  interventionComplete: 'CONTACT LOGGED — RECORD UPDATED',
  segmentDegraded: (id: string) => `SEGMENT ${id} DEGRADED — CACHED MODE`,
  integrityFail: (id: string) => `INTEGRITY CHECK FAILED — NODE ${id}`,
  tamperLogged: 'TAMPER EVENT LOGGED — RETROACTIVE REVIEW',
  noiseAnomaly: 'AUDIO ANOMALY — UNATTRIBUTED',
  droneFault: 'UNIT FAULT — ENGINEER NOTIFIED',
  recordImmutable: 'REQUEST DECLINED — RECORD IMMUTABLE',
  retention: 'RETENTION POLICY: INDEFINITE',
  matchConfirmed: 'FACIAL MATCH CONFIRMED',
  matchConfidence: (n: number) => `${n.toFixed(1)}% CONFIDENCE`,
  matchSubject: (name: string) => `SUBJECT: ${name}`,
  incidentReported: (kind: string, where: string) => `${kind} REPORTED — ${where}`,
  maskActive: 'IDENTITY UNRESOLVED — SUBJECT UNKNOWN',
  identityUnresolved: 'IDENTITY UNRESOLVED',
  interventionAuthorized: 'INTERVENTION AUTHORIZED',
  loopActive: (id: string) => `NODE ${id} — FEED NOMINAL`,
};

/** The consumer register. Same company. The game never comments on the gap. */
export const CARE = {
  welcome: "You're almost home. We'll keep an eye out.",
  friendSafe: (name: string) => `${name} is at Ridgeline Secondary. Everything looks normal.`,
  monthly: 'Your neighbourhood is 12% safer this month. Thank you for participating.',
  weather: "Clear until evening. It's a good day to be outside.",
  reminder: 'Two neighbours reported feeling safer this week.',
  score: (n: number) => `Community Safety Score: ${Math.round(100 - n)}`,
  stopped: 'This will only take a moment. Thank you for your patience.',
};

/** The opening advertisement. Rendered by the game's own renderer, in Bellhaven. */
export interface AdBeat {
  seconds: number;
  headline?: string;
  sub?: string;
  /** Camera framing in world space. */
  look: { x: number; y: number; zoom: number };
  wordmark?: boolean;
  title?: boolean;
}

export const AD_SCRIPT: AdBeat[] = [
  { seconds: 4.5, look: { x: 150, y: 232, zoom: 8.5 }, headline: 'Bellhaven', sub: 'A place worth looking after.' },
  { seconds: 4.0, look: { x: 132, y: 200, zoom: 11.5 }, headline: 'SAFEtrace™ HOME', sub: 'Protect your family.' },
  { seconds: 4.0, look: { x: 366, y: 96, zoom: 10.5 }, headline: 'SAFEtrace™ CITY', sub: 'Predict. Prevent. Protect.' },
  { seconds: 4.0, look: { x: 348, y: 318, zoom: 10.0 }, headline: 'SAFEtrace™ SCHOOL', sub: 'Safer classrooms. Smarter communities.' },
  { seconds: 3.6, look: { x: 505, y: 206, zoom: 12.0 }, headline: 'SAFEtrace™ PREDICT', sub: "Don't wait for danger." },
  { seconds: 4.4, look: { x: 170, y: 250, zoom: 9.0 }, headline: 'SAFEtrace™ CARE', sub: 'Someone is always looking out.' },
  { seconds: 5.0, look: { x: 158, y: 214, zoom: 11.0 }, wordmark: true },
  { seconds: 3.0, look: { x: 158, y: 214, zoom: 12.6 }, title: true },
];

export const AD_REPRISE_ANNOTATIONS: Record<number, string> = {
  0: '11,204 RESIDENTS ENROLLED',
  1: '3,880 HOUSEHOLD NODES — AUDIO AND VIDEO',
  2: 'PREDICTIVE RISK COMPUTED CONTINUOUSLY FOR ALL SUBJECTS',
  3: '812 ENROLLED MINORS IN IDENTITY GALLERY',
  4: 'FORECAST HORIZON: 15 SECONDS — ROAD GRAPH',
  5: 'RETENTION: INDEFINITE',
};

/** Dialogue. Kept short: the strongest moments in this game are notifications. */
export const DIALOGUE = {
  devonOpening: [
    "Devon: took you long enough.",
    "Devon: channel? the water's been off since Tuesday.",
    "Devon: race you to the bridge. no pushing after the apron.",
  ],
  devonAfterMatch: [
    "Devon: ...that's my name.",
    "Devon: I'm right here. I'm literally right here.",
    "Devon: it says Northgate. we've been here an hour.",
  ],
  devonStopped: [
    "Devon: it's fine. it's fine, they just want to check.",
    "Devon: don't do anything. seriously.",
  ],
  playerThought: [
    "It was 98.7% sure.",
    "It wasn't lying. It was just sure.",
  ],
};
