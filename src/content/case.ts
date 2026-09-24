/**
 * The case: what actually happened on Northgate Lane, broken into the pieces a
 * kid on a skateboard can find.
 *
 * What happened, in full — which nobody in the game ever says in one breath:
 *
 *   At 04:39:52 the drainage camera on the south Maple apron logs two subjects
 *   going down into the Channel: 4417 and ARAYA, DEVON M.
 *
 *   At 04:41 a courier, hood up against the drizzle, carries a parcel up to
 *   14 Northgate Lane. The house is a SAFEtrace HOME "secure address": no porch
 *   drops. So the courier picks the parcel back up off the step and leaves it
 *   with the neighbour at No. 16. The doorbell sees an unrecognised adult take
 *   an item from the porch, and files a burglary on its owner's behalf.
 *
 *   CM-207 has the courier's hooded face at 04:41:07. SVC-VISION finds it 61%
 *   similar to a Ridgeline pupil. SVC-PREDICT weights that by where each pupil
 *   usually goes, and Devon — forty-one visits to a cousin on Northgate Lane —
 *   comes out at 98.7%, over a threshold a parents' petition lowered from 99.
 *
 * Every component did what it was designed to do. The player can assemble all
 * of that, some of it, or none of it, and then decide who to show it to.
 */
import type { CaseDefs, ClueDef, DeductionDef, ThreadDef } from '../sim/casefile';

export const THREADS: ThreadDef[] = [
  {
    id: 'match',
    question: 'How was it 98.7% sure it was Devon?',
    answered: "It wasn't sure of the face. It was sure of the street.",
  },
  {
    id: 'where',
    question: 'Can anyone prove where Devon was at 4:41?',
    answered: 'SAFEtrace can. It wrote it down itself.',
  },
  {
    id: 'burglary',
    question: 'What actually happened on Northgate Lane?',
    answered: 'Nothing was stolen. A parcel moved one door down.',
  },
  {
    id: 'who',
    question: 'Whose face was in the frame?',
    answered: 'Somebody doing their job in the rain.',
  },
  {
    id: 'system',
    question: 'Who decided any of this?',
    answered: 'Nobody. Everybody. One reasonable step at a time.',
  },
];

export const CLUES: ClueDef[] = [
  // ---------------------------------------------------------------- the match
  {
    id: 'c-match', thread: 'match', source: 'self', where: 'Every phone in the Channel',
    title: 'The match',
    body: 'FACIAL MATCH CONFIRMED. 98.7%. ARAYA, DEVON M. A burglary in Northgate — and Devon was standing right next to me.',
  },
  {
    id: 'c-cm207', thread: 'match', source: 'record', where: 'CM-207, Northgate Lane',
    title: 'The frame',
    body: 'CM-207 caught the frame at 04:41:07. No fault in 411 days. It passed the frame on exactly the way it was built to.',
  },
  {
    id: 'c-vision', thread: 'match', source: 'record', where: 'SVC-VISION',
    title: 'The face',
    body: "The frame was checked against a gallery that includes 812 Ridgeline kids. Raw similarity to Devon: 61.2%. The face was hooded and half turned away.",
  },
  {
    id: 'c-predict', thread: 'match', source: 'record', where: 'SVC-PREDICT',
    title: 'The association',
    body: "Devon's 'Northgate association' is 0.97 — forty-one visits to his cousin on Northgate Lane. The match score is the face weighted by that.",
  },
  {
    id: 'c-review', thread: 'system', source: 'record', where: 'SVC-REVIEW',
    title: 'The threshold',
    body: 'Review 11-04: a parents\' petition lowered the match threshold from 99.0% to 97.0%. False positives went up 340%. "Within tolerance." Approved by P. Venn.',
  },
  // ------------------------------------------------------------- where devon was
  {
    id: 'c-with-me', thread: 'where', source: 'self', where: 'Me',
    title: 'He was with me',
    body: "Devon was with me in the Channel the whole time. That's my word. My word isn't a record.",
  },
  {
    id: 'c-apron', thread: 'where', source: 'person', where: 'Devon',
    title: 'The apron camera',
    body: "Devon: \"the camera on the apron. the little light came on when we went down. it saw us.\"",
  },
  {
    id: 'c-drainage', thread: 'where', source: 'record', where: 'CM-D01, the south Maple apron',
    title: 'The drainage log',
    body: 'The drainage camera logged two subjects entering the Channel at 04:39:52 — SUBJECT 4417 and ARAYA, DEVON M. It never compared that with anything.',
  },
  // ------------------------------------------------------------------ burglary
  {
    id: 'c-autoreport', thread: 'burglary', source: 'place', where: "No. 14's front door",
    title: 'Reported on her behalf',
    body: "The SAFEtrace HOME panel by No. 14's door, still lit: 'UNRECOGNISED ADULT REMOVED AN ITEM FROM YOUR PORCH — 04:41. INCIDENT REPORTED ON YOUR BEHALF.'",
  },
  {
    id: 'c-resident', thread: 'burglary', source: 'person', where: 'Mrs. Carvalho, No. 14',
    title: 'Mrs. Carvalho',
    body: "She didn't report anything — she was at work; the app did it. Nothing's missing. Except a parcel she's been waiting on all week.",
  },
  {
    id: 'c-parcel', thread: 'burglary', source: 'place', where: "No. 16's front step",
    title: 'The parcel next door',
    body: "On No. 16's step: a parcel addressed to 14 Northgate Lane. A courier's card taped on top — 'Tried 14. Secure address, no porch drops. Left with neighbour.'",
  },
  {
    id: 'c-alert', thread: 'burglary', source: 'place', where: 'The Vine Street shelter',
    title: 'The community alert',
    body: "The bus shelter screen is running a SAFEtrace CARE alert: Devon's school photo, PERSON OF INTEREST — NORTHGATE. Posted 04:43, to every phone on the Lane.",
  },
  {
    id: 'c-brennan', thread: 'burglary', source: 'person', where: 'Mr. Brennan, No. 12',
    title: 'An eyewitness',
    body: "Mr. Brennan says he saw 'the Araya boy' outside No. 14. 'Clear as day. I'd know him anywhere.'",
  },
  // ----------------------------------------------------------------------- who
  {
    id: 'c-courier', thread: 'who', source: 'person', where: 'The courier',
    title: 'The courier',
    body: "\"Had one for 14. Doorbell said secure address, no porch drops, so I picked it back up and left it at 16. Twenty to five? Hood up. It was spitting.\"",
  },
  // -------------------------------------------------------------------- system
  {
    id: 'c-mara', thread: 'system', source: 'person', where: 'Mara, Okonjo Cycle & Board',
    title: 'Where it all goes',
    body: "Mara watched them fit Northgate's cameras. \"It all goes out through a cabinet at Relay 12 — the haulage yard off East Avenue. Nobody voted on any of it.\"",
  },
  {
    id: 'c-tx2', thread: 'system', source: 'record', where: 'TX-2, Relay 12',
    title: 'The shed',
    body: 'TX-2 carries every frame Northgate takes. No storage, no matching, no decisions. Just carriage — 100% availability, 41 months.',
  },
  {
    id: 'c-provision', thread: 'system', source: 'record', where: 'MT-R12, Relay 12',
    title: 'Provisioning',
    body: "Relay 12 was bought for winter gritting telemetry. Camera segments get added to it without council approval. 'No capacity review scheduled. None required.'",
  },
  {
    id: 'c-staff', thread: 'system', source: 'record', where: 'CM-R07, Relay 12',
    title: 'The staff camera',
    body: 'The office camera at Relay 12 runs on a different uplink. Staff are told, can object, and it is deleted after 30 days.',
  },
  {
    id: 'c-record', thread: 'system', source: 'record', where: 'SVC-RECORD',
    title: "Devon's record",
    body: "SVC-RECORD: 'CONTACT 04:52. NO FURTHER ACTION.' Kept indefinitely. Subjects cannot amend it.",
  },
];

export const DEDUCTIONS: DeductionDef[] = [
  {
    id: 'd-posterior', thread: 'match', from: ['c-vision', 'c-predict'], key: true,
    title: 'Sure of the street, not the face',
    body: "The face was a 61% match. The other thirty-seven points came from where Devon usually goes. It didn't recognise him. It recognised Northgate.",
  },
  {
    id: 'd-threshold', thread: 'system', from: ['c-review', 'c-match'],
    title: 'Under the old line',
    body: '98.7 clears 97, not 99. Before the petition, this match would never have fired.',
  },
  {
    id: 'd-witnessed', thread: 'where', from: ['c-apron', 'c-with-me'],
    title: "It isn't just my word",
    body: "If the apron camera saw us go down, then somewhere there's a record of where Devon was. It's on the apron. I just have to go and read it.",
  },
  {
    id: 'd-alibi', thread: 'where', from: ['c-drainage', 'c-cm207'], key: true,
    title: 'Two places at once',
    body: "SAFEtrace logged Devon entering the Channel at 04:39:52. Seventy-five seconds later CM-207 'saw' him on Northgate Lane, across town. Nobody put the two records side by side.",
  },
  {
    id: 'd-nobody-called', thread: 'burglary', from: ['c-resident', 'c-autoreport'],
    title: 'Nobody called it in',
    body: 'Mrs. Carvalho was at work. No person reported a burglary. The house did, on her behalf.',
  },
  {
    id: 'd-no-burglary', thread: 'burglary', from: ['c-parcel', 'c-autoreport'], key: true,
    title: 'A parcel, not a burglary',
    body: "The 'item removed from the porch' at 04:41 was her own parcel, carried one door down because the house wouldn't let it be left. Nothing was stolen. There was no burglary.",
  },
  {
    id: 'd-hood', thread: 'who', from: ['c-courier', 'c-vision'], key: true,
    title: 'The face in the hood',
    body: 'The face CM-207 caught was hooded, at twenty to five, outside No. 14. So was the courier. Whoever the frame is of, it was somebody delivering a parcel.',
  },
  {
    id: 'd-witness', thread: 'burglary', from: ['c-brennan', 'c-alert'], disproves: 'c-brennan',
    title: 'What Mr. Brennan saw',
    body: "The alert with Devon's photo went out at 04:43. Mr. Brennan saw the alert, and then he remembered a boy. He never saw Devon.",
  },
  {
    id: 'd-nobody', thread: 'system', from: ['c-provision', 'c-review'],
    title: 'Nobody decided',
    body: "Nobody voted for any of it. A gritting sensor had cameras added to it one segment at a time; a petition moved a threshold two points. Every step was somebody's reasonable idea.",
  },
  {
    id: 'd-object', thread: 'system', from: ['c-staff', 'c-record'],
    title: 'Who gets to object',
    body: "The people who work at Relay 12 can object to their own footage, and it's gone in thirty days. Devon can't object to his, and it's kept forever.",
  },
  {
    id: 'd-carriage', thread: 'system', from: ['c-mara', 'c-tx2'],
    title: 'One cabinet',
    body: 'Every frame from Northgate goes through one cabinet in a haulage yard, which does nothing but pass it along. There is nothing there to switch off, because nothing there decides.',
  },
];

/** Things a player can believe that are not true. */
export const MISLEADING = ['c-brennan'] as const;

export const CASE: CaseDefs = { threads: THREADS, clues: CLUES, deductions: DEDUCTIONS };

/**
 * The record a node gives up when it is read, in the notes. Only once the
 * afternoon has given the player a reason to care what it says.
 */
export const RECORD_CLUES: Record<string, string> = {
  'CM-207': 'c-cm207',
  'SVC-VISION': 'c-vision',
  'SVC-PREDICT': 'c-predict',
  'SVC-REVIEW': 'c-review',
  'SVC-RECORD': 'c-record',
  'TX-2': 'c-tx2',
  'MT-R12': 'c-provision',
  'CM-R07': 'c-staff',
  'CM-D01': 'c-drainage',
};

// ------------------------------------------------------------------- places

/**
 * What you see when you stop and look. The first line is what is there; a
 * clue, if any, goes in the notes.
 */
export interface PlaceText { text: string; clue?: string }

export const PLACES: Record<string, PlaceText> = {
  'p-panel': {
    text: "A SAFEtrace HOME panel beside No. 14's door. The screen is still lit: 'UNRECOGNISED ADULT REMOVED AN ITEM FROM YOUR PORCH — 04:41. INCIDENT REPORTED ON YOUR BEHALF. Nothing more is needed from you.'",
    clue: 'c-autoreport',
  },
  'p-parcel': {
    text: "A parcel on No. 16's step. It's addressed to 14 Northgate Lane. A courier's card is taped on top: 'Tried 14 — secure address, no porch drops. Left with neighbour.'",
    clue: 'c-parcel',
  },
  'p-tape': {
    text: "Tape across No. 14's drive: INCIDENT SCENE — SAFEtrace CITY. There's nothing on the other side of it but a lawn.",
  },
  'p-alert': {
    text: "The shelter screen is running a community alert on a loop. Devon's school photo — the one with the bad haircut. PERSON OF INTEREST — NORTHGATE. Posted 04:43.",
    clue: 'c-alert',
  },
  'p-graffiti': {
    text: "Sprayed along the channel wall, old and sun-faded: SMILE — YOU'RE PREDICTED. Someone's written underneath it, newer: not down here.",
  },
  'p-dropin': {
    text: "A SAFEtrace CARE poster on the noticeboard: COMMUNITY DROP-IN — TODAY, 5PM, BELLHAVEN COMMUNITY CENTRE. 'Meet Priya Venn, your Regional Operations lead. Your questions make us better.'",
  },
  'p-enrol': {
    text: "A laminated sign on the school gate: 'All Ridgeline pupils are enrolled in SAFEtrace SCHOOL. Opt-out forms are available from reception.' Someone's drawn a clock on it with the hands stuck at 'never'.",
  },
  'p-window': {
    text: "Mara's shop window. A hand-lettered card between two decks: BOARDS FIXED. NO QUESTIONS ASKED.",
  },
  'p-window-case': {
    text: "Mara's window is covered in your notes now, in her handwriting and yours. Someone has stopped to read them. Then someone else.",
  },
  'p-devon-board': {
    text: "Devon's board, leaning against his front step. There's fresh grip tape on the nose, and he's written on it in marker: NOT A MATCH.",
  },
};

// ------------------------------------------------------------------ endings

export type ReportTarget = 'priya' | 'mara' | 'dropped';
export type EndingId = 'review' | 'noted' | 'window' | 'rumour' | 'dropped';

export interface CaseStanding {
  /** Load-bearing findings the player actually made. */
  keyFindings: number;
  /** A stop or a contact on the player's own record. */
  onRecord: boolean;
  /** Still believes something their own notes would disprove. */
  misled: boolean;
}

/**
 * How strong the case reads to somebody who was not there.
 *
 * Four findings are what the case is made of. A contact on your own record
 * makes you a party to it rather than a witness, and repeating a claim your
 * own notes could have disproved hands anybody who wants to doubt you the
 * reason to. Neither erases work; each costs one.
 */
export function caseStrength(s: CaseStanding): number {
  return Math.max(0, s.keyFindings - (s.onRecord ? 1 : 0) - (s.misled ? 1 : 0));
}

/** The strength at which the case stops being a kid's story and starts being a record. */
export const CASE_HOLDS = 3;

export function resolveEnding(report: ReportTarget, s: CaseStanding): EndingId {
  if (report === 'dropped') return 'dropped';
  const strong = caseStrength(s) >= CASE_HOLDS;
  if (report === 'priya') return strong ? 'review' : 'noted';
  return strong ? 'window' : 'rumour';
}

export interface Ending {
  id: EndingId;
  title: string;
  /** What changed, a line at a time. */
  epilogue: string[];
  /** The one line SAFEtrace says about it. */
  system: string;
}

export const ENDINGS: Record<EndingId, Ending> = {
  review: {
    id: 'review',
    title: 'A Second Line',
    system: 'INC-4100 RECLASSIFIED — MISATTRIBUTION UNDER REVIEW',
    epilogue: [
      'Priya Venn opened a formal review that evening. She read every page of your notes, twice.',
      "INC-4100 was reclassified: no offence, misattribution. Devon's record was not deleted — it can't be — but it has a second line now, under the first.",
      "The match threshold went back to 99% the following quarter. The petition that lowered it wasn't mentioned in the minutes.",
      "Devon still doesn't skate Northgate Lane. But he goes to his cousin's again.",
    ],
  },
  noted: {
    id: 'noted',
    title: 'Your Concern Has Been Logged',
    system: 'FEEDBACK RECEIVED — REFERENCE CX-20417',
    epilogue: [
      'Priya Venn listened, and she was kind about it, and she logged it under reference CX-20417.',
      '"Association is not an accusation," she said. You could tell she believed it.',
      "Nothing in Devon's record changed. Nothing in the system needed to. It had worked exactly as designed.",
      'You still have the notes. They were right. They just were not enough.',
    ],
  },
  window: {
    id: 'window',
    title: 'The Window',
    system: 'UNVERIFIED CLAIMS CIRCULATING — COMMUNITY GUIDANCE ISSUED',
    epilogue: [
      "Mara put the whole thing in her window, in marker and printouts: the frame, the face, the drainage log, the parcel.",
      'By the weekend half of Bellhaven had stopped to read it. By the council meeting, 380 people had signed to put the threshold back to 99%.',
      'SAFEtrace issued community guidance about unverified claims. Your Community Safety Score dropped eleven points and never quite came back.',
      "Devon keeps a photo of the window on his phone. He says it's the only record of him he likes.",
    ],
  },
  rumour: {
    id: 'rumour',
    title: 'A Kid Defending His Friend',
    system: 'MISINFORMATION ADVISORY — NORTHGATE',
    epilogue: [
      'Mara put your notes in her window. People read them the way people read a kid defending a friend.',
      "There were holes in it, and the holes were what got repeated. Mr. Brennan told anyone who'd listen that he'd seen the boy himself.",
      'The notice came down after a week. The community alert stayed up for a month.',
      "Devon stopped coming to the Commons. He said it wasn't your fault. It sort of was.",
    ],
  },
  dropped: {
    id: 'dropped',
    title: 'Let It Go',
    system: 'NO FURTHER ACTION',
    epilogue: [
      'You told Devon you would let it go, and you did.',
      "His record says CONTACT 04:52 — NO FURTHER ACTION, and it will say that for the rest of his life, to anyone who's allowed to ask.",
      'He was grateful. He meant it. The two of you never skate Northgate Lane again, and neither of you says why.',
      'The town is very safe. Everyone says so.',
    ],
  },
};

export const ENDING_ORDER: EndingId[] = ['review', 'window', 'noted', 'rumour', 'dropped'];
