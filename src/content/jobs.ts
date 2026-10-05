/**
 * The jobs board.
 *
 * Nine jobs, every kind the runner knows, all in the same town with the same
 * board. Each one is a start, a place to be, and whatever is watching on the
 * way. None of them has a route. The fastest line and the quietest line are
 * rarely the same line, and both of them usually go over something.
 *
 * Briefs are one sentence. A job is understood in the time it takes to read
 * its destination.
 *
 * The order is the first minute. The board opens three at a time, and the
 * three a new player sees are the three things the game does: air off the
 * Lot's kickers seventy metres from the start, a ride across town, and a
 * stone through a camera. Ids are stable, so saved bests follow their job
 * whatever its number.
 */
import type { JobDef } from '../sim/jobs/types';

const N = -Math.PI / 2, S = Math.PI / 2, E = 0;

export const JOBS: JobDef[] = [
  {
    id: 'job-06', number: 1, kind: 'PHOTOGRAPH', title: 'SHOOT: THE LOT FROM THE AIR',
    brief: 'Somebody wants proof the lot exists. Take the shot at the top of a kicker.',
    // On the east path into the Lot, out of every lens, the east kicker
    // fifty-odd metres dead ahead: the first thing a new player does is air.
    start: { label: 'The Lot, east path', pos: { x: 445, y: 215 }, heading: Math.PI },
    stages: [{
      verb: 'SHOOT FROM', mode: 'any', done: 'CAPTURED',
      points: [
        { id: 'k1', label: 'WEST KICKER', pos: { x: 309, y: 215 }, radius: 6, air: 1.4 },
        { id: 'k2', label: 'EAST KICKER', pos: { x: 391, y: 215 }, radius: 6, air: 1.4 },
      ],
    }],
    threat: 'None — until you are seen getting there', target: 45,
  },
  {
    id: 'job-01', number: 2, kind: 'COURIER', title: 'GET TO: OKONJO CYCLE & BOARD',
    brief: 'A parcel for the board shop on Market Street. Get it there.',
    start: { label: 'Maple Court', pos: { x: 155, y: 262 }, heading: N },
    stages: [{
      verb: 'GET TO', mode: 'any', done: 'DELIVERED',
      points: [{ id: 'okonjo', label: 'OKONJO CYCLE & BOARD', pos: { x: 400, y: 57 }, radius: 8 }],
    }],
    threat: 'Street cameras', target: 55,
  },
  {
    id: 'job-03', number: 3, kind: 'SABOTAGE', title: 'HIT: THREE PLAZA CAMERAS',
    brief: 'Blind the plaza. A stone in the lens, or ride past the pole and cut its line.',
    start: { label: 'Commons Street', pos: { x: 340, y: 150 }, heading: N },
    stages: [{
      verb: 'HIT', mode: 'all', done: 'PLAZA BLIND',
      points: [
        { id: 'cm22', label: 'PLAZA WEST', pos: { x: 306, y: 68 }, radius: 2.6, sensorId: 'CM-022' },
        { id: 'cm23', label: 'PLAZA EAST', pos: { x: 406, y: 68 }, radius: 2.6, sensorId: 'CM-023' },
        { id: 'cm24', label: 'PLAZA SOUTH', pos: { x: 356, y: 114 }, radius: 2.6, sensorId: 'CM-024' },
      ],
    }],
    threat: 'The cameras themselves', target: 75,
  },
  {
    id: 'job-02', number: 4, kind: 'TAG', title: 'TAG: THE PLAZA LEDGES',
    brief: 'Grind all three plaza ledges and leave your mark on each. The cameras are right there.',
    start: { label: 'Commons Street', pos: { x: 300, y: 150 }, heading: N },
    stages: [{
      verb: 'GRIND', mode: 'all', done: 'TAGGED',
      points: [
        { id: 'l1', label: 'WEST LEDGE', pos: { x: 323, y: 76 }, radius: 14, grind: true },
        { id: 'l2', label: 'EAST LEDGE', pos: { x: 369, y: 76 }, radius: 14, grind: true },
        { id: 'l3', label: 'SOUTH LEDGE', pos: { x: 323, y: 106 }, radius: 14, grind: true },
      ],
    }],
    threat: 'Plaza cameras', target: 60,
  },
  {
    id: 'job-04', number: 5, kind: 'GHOST', title: 'GET TO: NORTHGATE PARADE — UNSEEN',
    brief: 'Nobody can know you were there. Rated on how little anything saw.',
    start: { label: 'Maple Court South', pos: { x: 155, y: 296 }, heading: N },
    stages: [{
      verb: 'GET TO', mode: 'any', done: 'IN AND OUT',
      points: [{ id: 'parade', label: 'NORTHGATE PARADE', pos: { x: 222, y: 84 }, radius: 7 }],
    }],
    threat: 'Every lens on Sable Lane', target: 80,
  },
  {
    id: 'job-05', number: 6, kind: 'SPEEDRUN', title: 'RUN: PARADE TO THE LOT',
    brief: 'Four checkpoints, in order, against the clock. The last one counts in the air.',
    start: { label: 'Northgate Parade', pos: { x: 220, y: 60 }, heading: E },
    stages: [
      { verb: 'THROUGH', mode: 'any', done: 'CHECKPOINT', points: [{ id: 'cp1', label: 'MARKET ST WEST', pos: { x: 272, y: 58 }, radius: 7 }] },
      { verb: 'THROUGH', mode: 'any', done: 'CHECKPOINT', points: [{ id: 'cp2', label: 'CINEMA FORECOURT', pos: { x: 404, y: 100 }, radius: 7 }] },
      { verb: 'THROUGH', mode: 'any', done: 'CHECKPOINT', points: [{ id: 'cp3', label: 'COMMONS STREET', pos: { x: 350, y: 150 }, radius: 8 }] },
      { verb: 'AIR', mode: 'any', done: 'FINISH', points: [{ id: 'cp4', label: 'THE LOT KICKER', pos: { x: 350, y: 186 }, radius: 7, air: 1.0 }] },
    ],
    threat: 'Plaza cameras', target: 60,
  },
  {
    id: 'job-07', number: 7, kind: 'EXTRACTION', title: 'LIFT: THE RELAY 12 DRIVE',
    brief: 'Take the drive off the loading apron, then get it to the Channel. Lifting it is loud.',
    start: { label: 'Ridgeline Road', pos: { x: 460, y: 200 }, heading: E },
    stages: [
      {
        verb: 'PICK UP', mode: 'any', done: 'DRIVE SECURED', alarm: 60,
        points: [{ id: 'relay', label: 'LOADING APRON', pos: { x: 512, y: 244 }, radius: 6 }],
      },
      {
        verb: 'GET OUT TO', mode: 'any', done: 'EXTRACTED',
        points: [{ id: 'channel', label: 'THE CHANNEL', pos: { x: 330, y: 420 }, radius: 14 }],
      },
    ],
    threat: 'Relay 12, then everything', target: 90,
  },
  {
    id: 'job-08', number: 8, kind: 'GETAWAY', title: 'LOSE THEM, THEN GREENWAY HALL',
    brief: 'You were seen at the cinema. Everything is on you. Break the signal, then get to the hall.',
    start: { label: 'Cinema Forecourt', pos: { x: 404, y: 100 }, heading: S },
    startExposure: 100,
    stages: [
      { verb: 'LOSE THEM', mode: 'any', loseSignal: true, done: 'CLEAN', points: [] },
      {
        verb: 'GET TO', mode: 'any', done: 'SAFE',
        points: [{ id: 'hall', label: 'GREENWAY HALL', pos: { x: 199, y: 392 }, radius: 9 }],
      },
    ],
    threat: 'Drones, live', target: 105,
  },
  {
    id: 'job-09', number: 9, kind: 'COURIER', title: 'BIG LINE: THE LOT, ALL OF IT',
    brief: 'From the far corner of town: grind the lot\'s handrail, then air both kickers. Nothing is off limits.',
    start: { label: 'Northgate Lane West', pos: { x: 30, y: 60 }, heading: E },
    stages: [
      { verb: 'GRIND', mode: 'any', done: 'RAIL', points: [{ id: 'hand', label: 'LOT HANDRAIL', pos: { x: 327, y: 232 }, radius: 12, grind: true }] },
      {
        verb: 'AIR', mode: 'all', done: 'TOP OF THE TOWN',
        points: [
          { id: 'w', label: 'WEST KICKER', pos: { x: 309, y: 215 }, radius: 6, air: 1.2 },
          { id: 'e', label: 'EAST KICKER', pos: { x: 391, y: 215 }, radius: 6, air: 1.2 },
        ],
      },
    ],
    threat: 'Everything', target: 110,
  },
];

/** Jobs open from the start; each one finished opens the next. */
export const JOBS_OPEN_AT_START = 3;

export function jobUnlocked(def: JobDef, finished: number): boolean {
  return def.number <= JOBS_OPEN_AT_START + finished;
}
