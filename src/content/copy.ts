/**
 * Every string UNDERWATCH says, in one file.
 *
 * Not for localisation convenience — for tone control. This voice must be
 * edited as a single document or it will drift, and its consistency is the
 * entire characterisation.
 */

export const BRAND = {
  name: 'UNDERWATCH',
  tm: 'UNDERWATCH™',
  products: [
    { name: 'UNDERWATCH™ HOME', line: 'Protect your family.' },
    { name: 'UNDERWATCH™ SCHOOL', line: 'Safer classrooms. Smarter communities.' },
    { name: 'UNDERWATCH™ CITY', line: 'Predict. Prevent. Protect.' },
    { name: 'UNDERWATCH™ VISION', line: 'Advanced identity recognition.' },
    { name: 'UNDERWATCH™ PREDICT', line: "Don't wait for danger." },
    { name: 'UNDERWATCH™ CARE', line: 'Someone is always looking out.' },
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
  /** A few stones in the same place is a pattern, and patterns get a visit. */
  droneFault: 'UNIT FAULT — ENGINEER NOTIFIED',
  recordImmutable: 'REQUEST DECLINED — RECORD IMMUTABLE',
  retention: 'RETENTION POLICY: INDEFINITE',
  matchConfirmed: 'FACIAL MATCH CONFIRMED',
  matchConfidence: (n: number) => `${n.toFixed(1)}% CONFIDENCE`,
  matchSubject: (name: string) => `SUBJECT: ${name}`,
  incidentReported: (kind: string, where: string) => `${kind} REPORTED — ${where}`,
  maskActive: 'IDENTITY UNRESOLVED — SUBJECT UNKNOWN',
  /** SUPPRESS ran: the track it was holding went soft. */
  trackSuppressed: 'TRACK CONFIDENCE DEGRADED — REACQUIRING',
  identityUnresolved: 'IDENTITY UNRESOLVED',
  holdStill: 'COME TO A STOP TO INTERFERE',
  /**
   * What VISION actually gives you.
   *
   * This used to read "UNDERWATCH VISION — AVAILABLE" alongside a hint naming a
   * control, because unlocking it grew a button on the HUD. The plan view is
   * now a control the player has had since the first frame; what changes here
   * is what is drawn inside it. So the line names the content, not a key.
   */
  visionAvailable: 'UNDERWATCH VISION — SUBJECT LAYER ENABLED',
  /** The plan view's own caption, before there is anything else to say. */
  planView: 'PLAN VIEW',
  queryAvailable: 'QUERY AND TRACE AVAILABLE',
  interventionAuthorized: 'INTERVENTION AUTHORIZED',
  loopActive: (id: string) => `NODE ${id} — FEED NOMINAL`,
  /*
   * The pursuit says out loud what it does and does not know.
   *
   * A player who breaks contact and is then found anyway learns that escaping
   * is not a thing this game does. These three lines are the system admitting,
   * in its own register, that the fix is stale — and each of them corresponds
   * to a state the dispatcher is actually in, so the words are never a bluff.
   */
  /*
   * ...and it says when it starts, too.
   *
   * There were three lines for a pursuit ending and none for one beginning, so
   * "SEARCH STOOD DOWN" was the payoff to something the player had never been
   * told had started. These two are the other half of that set: the first is
   * somebody being sent to where you are, the second to where you were.
   */
  unitDispatched: 'UNIT DISPATCHED — SUBJECT LOCATION',
  unitResponding: 'UNIT RESPONDING — LAST REPORTED LOCATION',
  contactLost: 'VISUAL CONTACT LOST — LAST KNOWN POSITION HELD',
  searchingLastKnown: 'UNITS SEARCHING — LAST KNOWN POSITION',
  pursuitCleared: 'SUBJECT NOT LOCATED — SEARCH STOOD DOWN',
  /*
   * A bearing hit somebody. UNDERWATCH does not say "you hurt them", because
   * nobody was hurt and the system would not care if they had been. It logs an
   * incident against a subject, which is the only language it has.
   */
  personStruck: 'INCIDENT — OBJECT THROWN AT A PERSON',
  witnessed: (n: number) => n > 0
    ? `${n} WITNESS${n === 1 ? '' : 'ES'} IN RANGE. STATEMENTS REQUESTED.`
    : 'NO WITNESS STATEMENTS. FOOTAGE UNDER REVIEW.',
  incidentPerson: 'PUBLIC ORDER — PROJECTILE, PERSON',
  /*
   * Disturbance: the system noticing a place rather than a person.
   *
   * These never name the player, because the system does not know who it is
   * looking for — only that something keeps happening here. The player is
   * meant to read them as "I have been making too much noise on this street".
   */
  areaNoticed: (where: string) => `RECURRING ACTIVITY — ${where}`,
  areaPattern: (where: string) => `PATTERN DETECTED — ${where}`,
  areaReview: (where: string) => `AREA UNDER REVIEW — ${where} — COVERAGE INCREASED`,
  areaCleared: (where: string) => `AREA REVIEW CLOSED — ${where}`,
  /** A noise in a place that has had too many: it looks back up the throw instead. */
  noiseDiscounted: 'REPEAT ACOUSTIC EVENT — ORIGIN REVIEW',
  /** A broken node gets a visit. */
  nodeInspect: (id: string) => `NODE ${id} DOWN — UNIT INSPECTING`,
  /** Heavy physical evidence nobody could be linked to: it is still an incident. */
  incidentVandalism: 'DEVICE DAMAGE — PERSON UNKNOWN',
  /** The player spoke up at the stop, and is now part of the record of it. */
  partyPresent: 'PARTY PRESENT LOGGED — SUBJECT 4417 — INC-4100',
  /** The one line the system has about how the afternoon ended. */
  ending: {
    review: 'INC-4100 RECLASSIFIED — MISATTRIBUTION UNDER REVIEW',
    noted: 'FEEDBACK RECEIVED — REFERENCE CX-20417',
    window: 'UNVERIFIED CLAIMS CIRCULATING — COMMUNITY GUIDANCE ISSUED',
    rumour: 'MISINFORMATION ADVISORY — NORTHGATE',
    dropped: 'INC-4100 — NO FURTHER ACTION',
  } as Record<'review' | 'noted' | 'window' | 'rumour' | 'dropped', string>,
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
  communityAlert: 'Northgate community alert: a person of interest has been identified near you. Stay aware.',
  devonHome: 'Devon is on their way home. Everything looks normal.',
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
  { seconds: 4.0, look: { x: 132, y: 200, zoom: 11.5 }, headline: 'UNDERWATCH™ HOME', sub: 'Protect your family.' },
  { seconds: 4.0, look: { x: 366, y: 96, zoom: 10.5 }, headline: 'UNDERWATCH™ CITY', sub: 'Predict. Prevent. Protect.' },
  { seconds: 4.0, look: { x: 348, y: 318, zoom: 10.0 }, headline: 'UNDERWATCH™ SCHOOL', sub: 'Safer classrooms. Smarter communities.' },
  { seconds: 3.6, look: { x: 505, y: 206, zoom: 12.0 }, headline: 'UNDERWATCH™ PREDICT', sub: "Don't wait for danger." },
  { seconds: 4.4, look: { x: 170, y: 250, zoom: 9.0 }, headline: 'UNDERWATCH™ CARE', sub: 'Someone is always looking out.' },
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

/*
 * Two different kinds of sentence, and only one of them names a control.
 *
 * `inspect` is a control: reaching into a node is a new verb the player has
 * not used before, and they are told which button does it on the device in
 * their hands. `vision` is not a control and must never read like one — the
 * plan view has been one hold away since the first frame, on every device.
 * What the unlock changes is what that view contains, so the line describes
 * the content and is the same sentence everywhere.
 */
const VISION_UNLOCKED = 'COVERAGE AND SUBJECTS NOW IN PLAN VIEW';

export const HINTS = {
  keyboard: { vision: VISION_UNLOCKED, inspect: 'PRESS E' },
  touch: { vision: VISION_UNLOCKED, inspect: 'TAP THE NODE' },
};

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
  /** Said over his shoulder, to a player who has come in close during the stop. */
  officerStepBack: 'Step back for me, please.',
  /** Said quietly, to a player who has kept their distance. */
  devonKeptBack: 'yeah. there. stay there.',
  playerThought: [
    "It was 98.7% sure.",
    "It wasn't lying. It was just sure.",
    "Everything in here worked exactly the way it was meant to.",
    "Somebody's mum asked for this. And they were right.",
    "Somebody has to see all of this at once. The question is who.",
  ],
  devonWhere: "Devon (text): where are you. i'm at the bottom of maple court, on the kerb by the close.",
  devonNudge: "Devon: you coming or what? channel's south. past the greenway, down the apron.",
  devonAtStop: "Devon: you didn't have to— ...the camera on the apron. the light came on when we went down. it saw us. remember that.",
  maraText: 'Mara (text): heard about Devon. come by the shop if you want to know how it works. — M',
  sableLane: [
    "Devon: the lane behind the terraces. nobody's ever put a light back there.",
    "Devon: it thinks you're still on the road.",
  ],
};

/**
 * The phone widget's own words.
 *
 * "Community Safety Score" is what UNDERWATCH would call it, and the first human
 * to play read it as a statistic about the neighbourhood rather than a verdict
 * about them — which is a usability failure and also, accidentally, lets the
 * brand off the hook. One possessive fixes both: it is a score the town keeps
 * about you, and the widget now says so.
 */
export const PHONE = {
  scoreLabel: 'Your Community Safety Score',
  subject: 'Registered to',
  /**
   * It is not on the screen any more; it is found. These are the places it
   * turns up once it has been.
   */
  /** The line in a camera's own record: who it is holding, and their number. */
  record: (subject: string, n: number, band: string) => `HOLDING ${subject} · COMMUNITY SAFETY SCORE ${n} · ${band}`,
  /** The moment of finding it, as a note. */
  found: 'UNDERWATCH keeps a number on you',
  foundDetail: (n: number, band: string) => `Community Safety Score ${n} — ${band}`,
  /** When it moves between bands, once found: small, and gone. */
  moved: (n: number, band: string) => `Community Safety Score ${n} · ${band}`,
  /** On the plan, once found. */
  plan: (n: number, band: string) => `UNDERWATCH HAS YOU AT ${n} · ${band}`,
  /** In the notes, in the player's own words. */
  notes: (n: number, band: string, where: string) =>
    `UNDERWATCH has a number on me. It calls it my "Community Safety Score". Found it ${where === 'the plan' ? 'on the plan' : `in ${where}'s record`}. Right now it says ${n} — ${band.toLowerCase()}. Higher is better, apparently. Nobody asked me.`,
};

/**
 * The inspect panel's own framing.
 *
 * A human met this panel forty-four metres from the spawn and could not tell
 * whether it was danger, an objective, or scenery. The fields were never the
 * problem — a player does not need to know what a segment is on first sight.
 * What was missing was the category. One line above the identifier says what
 * kind of thing they are looking at, and the panel says plainly that reading is
 * free, which is the only thing they need to know to start.
 */
export const INSPECT = {
  heading: 'UNDERWATCH NETWORK',
  kind: {
    CAMERA: 'Camera',
    JUNCTION: 'Segment relay',
    UPLINK: 'District uplink',
    SERVICE: 'Record',
    PLATE_READER: 'Plate reader',
    SPEAKER: 'Public address',
    SIGN: 'Sign',
    DOOR: 'Door',
  } as Record<string, string>,
  dismiss: 'Close',
};

/**
 * The plan's own instructions. They say what the view is for — marking where
 * you are going — and they retire themselves once a pin has been put down.
 */
export const PLAN = {
  markTouch: 'TAP THE MAP TO MARK WHERE YOU ARE GOING',
  markMouse: 'CLICK THE MAP TO MARK WHERE YOU ARE GOING',
  moveTouch: 'DRAG TO LOOK AROUND · PLAN TO CLOSE',
  moveMouse: 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · Q TO CLOSE',
};

/**
 * Recon, and the plan it becomes (sim/recon.ts). The plan view is where the
 * player works a barrier out; PLAN is where they commit to how. Short,
 * because it is read on the move, and always about a thing the player could
 * have seen: a camera, its timing, a stone.
 */
export const RECON_COPY = {
  /** Under the reticle in the middle of the map. */
  focus: 'HOLD A CAMERA IN THE MIDDLE TO READ IT',
  spotted: (id: string) => `${id} SPOTTED`,
  timed: (id: string, sweepDeg: number, period: number) =>
    sweepDeg > 0 ? `${id} · SWINGS ${sweepDeg}° EVERY ${Math.round(period)}s` : `${id} · FIXED`,
  /** On the plan, the approach as it stands. */
  preview: (chain: string) => `PLAN: ${chain}`,
  noBarrier: 'NOTHING WATCHES THIS WAY',
  unscouted: (n: number) => `${n} CAMERA${n === 1 ? '' : 'S'} ON THIS WAY NOT READ YET`,
  noTarget: 'MARK WHERE YOU ARE GOING TO PLAN A WAY THERE',
  commitTouch: 'PLAN TO COMMIT · DRAG TO LOOK',
  commitMouse: 'Q TO COMMIT · DRAG TO LOOK · SCROLL TO ZOOM',
  /** One step of a plan, as the chain prints it. */
  step: {
    distract: (id: string) => `STONE → ${id} TURNS`,
    gap: (id: string, gap: number) => `${id} GAP ${gap.toFixed(1)}s`,
    covered: (id: string) => `${id} NEVER LOOKS AWAY`,
    unknown: (id: string) => `${id} ?`,
    target: (label: string | null) => label ?? 'THERE',
  },
  /** The stamp across the glass. */
  committed: 'PLAN SET',
  held: 'PLAN HELD',
  blown: 'PLAN BLOWN',
  /** Why, in a line: always something the recon could have shown. */
  reason: {
    unscouted: (id: string) => `${id} — NOT IN YOUR RECON`,
    mistimed: (id: string) => `${id} SWUNG BACK — MISTIMED`,
    unturned: (id: string) => `${id} WAS NEVER TURNED`,
    turning: (id: string) => `${id} HADN'T TURNED YET`,
    woreOff: (id: string) => `${id} TURNED BACK — TOO SLOW`,
    lookedBack: (id: string) => `${id} LOOKED BACK UP THE THROW`,
    inCone: (id: string) => `${id} NEVER LOOKS AWAY`,
    offRoute: (id: string) => `${id} — OFF YOUR WAY`,
  } as Record<string, (id: string) => string>,
  /** Live, on the strip, for the step being executed. */
  live: {
    throwAt: (id: string, m: number, arrow: string) => `STONE ${m} m ${arrow} → ${id}`,
    turned: (id: string, s: number) => `${id} TURNED · GO · ${s.toFixed(1)}s`,
    go: (id: string, s: number) => `${id} AWAY · GO · ${s.toFixed(1)}s`,
    wait: (id: string, s: number) => `${id} · WAIT ${s.toFixed(1)}s`,
    covered: (id: string) => `${id} NEVER LOOKS AWAY`,
    unknown: (id: string) => `${id} · NOT READ`,
    target: (m: number, arrow: string) => `${m} m ${arrow}`,
  },
  /** The barrier: something watches the way, and recon is one press away. */
  barrier: (id: string, touch: boolean) => `${id} COVERS YOUR WAY · ${touch ? 'PLAN' : 'Q'} TO RECON`,
};

/**
 * What the plan says about the surveillance, in the player's voice before
 * VISION and the machine's after it. These are readings, not instructions:
 * they say what the town will do, and leave what to do about it to the player.
 */
export const PLAN_READ = {
  inView: 'A CAMERA HAS YOU IN VIEW',
  seenBy: (ids: string[]) => `IN VIEW — ${ids.slice(0, 3).join(', ')}`,
  area: (level: string, vision: boolean): string => {
    if (vision) {
      return level === 'REVIEW' ? 'THIS AREA: UNDER REVIEW — COVERAGE INCREASED'
        : level === 'PATTERN' ? 'THIS AREA: PATTERN — NOISE NO LONGER TRUSTED'
          : 'THIS AREA: RECURRING ACTIVITY LOGGED';
    }
    return level === 'REVIEW' ? 'THIS STREET IS ON EDGE'
      : level === 'PATTERN' ? "YOU'VE MADE TOO MUCH NOISE ROUND HERE"
        : 'PEOPLE ROUND HERE ARE STARTING TO LOOK UP';
  },
  earshot: (
    e: { stone: string[]; loud: { kind: string; sensors: string[] } | null; wary: boolean },
    vision: boolean,
  ): string => {
    const cams = (n: number) => `${n} CAMERA${n === 1 ? '' : 'S'}${vision ? '' : " YOU'VE SEEN"}`;
    const thing = e.loud ? (e.loud.kind === 'car' ? 'THE CAR' : `THE ${e.loud.kind.toUpperCase()}`) : '';
    if (e.wary && (e.stone.length || e.loud?.sensors.length)) return "NOISE BY THE PIN: THEY'D LOOK BACK UP THE THROW";
    if (e.stone.length) {
      const more = e.loud && e.loud.sensors.length > e.stone.length ? ` · ${thing} THERE, ${e.loud.sensors.length}` : '';
      return `A STONE BY THE PIN TURNS ${cams(e.stone.length)}${more}`;
    }
    if (e.loud && e.loud.sensors.length) return `A STONE WON'T CARRY · ${thing} BY THE PIN TURNS ${cams(e.loud.sensors.length)}`;
    return 'NOTHING NEAR THE PIN WOULD HEAR A STONE';
  },
};

/** The first time the sling comes up on a phone, and never again after a shot. */
export const SLING_HINT = {
  aim: 'DRAG TO AIM',
  pull: 'PULL BACK · LET GO',
  /** The drag-back sling, the first time it comes out. */
  throw: 'PULL BACK FROM HERE · LET GO',
};

/** What a shot did. One word, in the aiming view, then gone. */
export const SHOT = {
  /** It landed, on nothing in particular. */
  ground: 'SHORT',
  /** It never landed at all. */
  miss: 'MISS',
};

/**
 * A job, out loud. The board's words are short and the city's are in its own
 * register: the city never says you are being chased, it says it is tracking.
 */
export const JOB = {
  run: {
    go: 'JOB ACTIVE',
    tracked: 'TRACKING ACTIVE',
    underwatch: 'UNDERWATCH',
    lost: 'SIGNAL LOST',
    cut: 'LINE CUT',
    complete: 'JOB COMPLETE',
    chainLost: 'CHAIN LOST',
  },
  /** The exposure chip, by level. */
  level: { UNSEEN: 'UNSEEN', SPOTTED: 'SPOTTED', TRACKED: 'TRACKED', UNDERWATCH: 'UNDERWATCH' },
  /** Today's conditions, on the board and in the brief. */
  today: 'TODAY',
  condition: {
    CLEAR: { name: 'CLEAR', line: () => 'An ordinary afternoon. Every camera is up.' },
    DUSK: { name: 'DUSK', line: () => 'Low light. Every camera sees less.' },
    MAINTENANCE: { name: 'MAINTENANCE', line: (n: number) => `${n} cameras down for service. Different gaps every day.` },
  } as Record<string, { name: string; line: (down: number) => string }>,
};

/**
 * The observation frame: what the system prints at the edge of the glass
 * about its own view of you. Terse, because it is bookkeeping, and only ever
 * read in the corner of the eye.
 */
export const FRAME = {
  /** The recording light's label. */
  rec: 'REC',
  /** No sensor has the rider in its picture. */
  noCamera: 'NO FIX',
  /** A sensor does, by its id. */
  camera: (id: string) => id,
  /** The state tag, by what the system is doing about you. */
  state: {
    UNSEEN: 'UNOBSERVED',
    SPOTTED: 'OBSERVED',
    TRACKED: 'TRACKING',
    UNDERWATCH: 'SUBJECT HELD',
  } as Record<string, string>,
  /** The sector the rider is in, for the readout. */
  sector: (name: string) => name,
  /** What the title screen says the system is doing. */
  ready: 'SYSTEM READY',
  /** The frame, while the system is sure of somebody. */
  match: (confidence: number) => `MATCH ${confidence.toFixed(1)}%`,
};

/**
 * The title screen. The town is the picture; these are the only words on it.
 * The verb is the game's own: you ride.
 */
export const TITLE = {
  premise: ['A kid on a skateboard.', 'A town that is already watching.'],
  ride: 'Ride',
  rideSub: 'Skate the city. Stay off the grid.',
  story: 'The afternoon',
  storySub: 'The story',
  continue: 'Continue the afternoon',
  restart: 'Start a new afternoon',
  /** The bracket's two lines, as the system prints them. */
  lock: (subject: string): [string, string] => [subject, 'TRACK ACQUIRED'],
  access: 'Accessibility',
  /** First launch only: what is behind the control, so nobody has to guess. */
  accessHint: 'motion, colour, text size',
  accessTitle: 'Accessibility',
  accessNote: 'Saved on this device. Also in the pause menu.',
};
