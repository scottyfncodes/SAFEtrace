/**
 * Relay 12.
 *
 * A haulage yard on the eastern edge of Bellhaven with a windowless hall in the
 * middle of it. The hall is not a headquarters and nobody in it is watching
 * anybody: it is a cabinet full of optics, and the district exists to make that
 * disappointing in the right way.
 *
 * Three things are true here, and the player is meant to find all three by
 * reading rather than by being told.
 *
 * The first is that TX-2 carries Northgate. Every camera the player has been
 * hiding from all morning delivers through this shed, and TX-2's log will say
 * so in the player's own handwriting: break something in Northgate, walk here,
 * and the frame is listed with the camera's id on it.
 *
 * The second is the control case. The compound office camera hangs on the same
 * fence, twenty metres from the hall, and it is not on TX-2 — it goes to
 * Bellhaven Central because staff monitoring is a different purpose, with
 * notification, an objection procedure, and thirty days of retention. The
 * people who work here got the protections the street did not.
 *
 * The third is that nobody decided this. The site was commissioned out of a
 * road-resurfacing budget for gritting telemetry, the haulier's private CCTV
 * was adopted for free, and segments were provisioned onto it one at a time by
 * people who each had a good reason. There is no villain in the shed.
 *
 * And there is no switch. TX-2 is carriage. Reading it is the whole verb.
 */
import type { TownBuilder } from './builder';
import { pt, uplinkRecords } from './builder';

const WALL_COOL = '#DCE4E8';
const WALL_PLANT = '#D8D3C4';
const ROOF_SLATE = '#56626E';
const ROOF_TIN = '#9AA0A6';
const CABIN = '#E4E0D4';
const CABIN_ROOF = '#8E9AA2';

/** The compound fence, as a rectangle. Everything is authored against it. */
export const YARD = { x0: 478, y0: 168, x1: 552, y1: 300 };
/** The south-east fence gap where the surface-water outfall leaves the site. */
export const OUTFALL_GAP = { x0: 534, x1: 548, y: 300 };
/** The node chain the district's investigation walks, in the order it is walked. */
export const RELAY_CHAIN = ['JX-CH', 'TX-2', 'MT-R12', 'JX-R12', 'CM-R07', 'SVC-VISION'];

export function authorRelay12(b: TownBuilder): void {
  b.in('relay').useSegment('S-X1');

  // ------------------------------------------------------------------- ground
  b.rectSurface(YARD.x0, YARD.y0, YARD.x1 - YARD.x0, YARD.y1 - YARD.y0, 'gravel', 3);
  // The apron and the weighbridge deck are the only smooth concrete on site,
  // which makes them the two best places to skate and the two places a camera
  // was specified for. That is not a coincidence anywhere in Bellhaven.
  b.rectSurface(490, 232, 58, 16, 'smoothConcrete', 5, false);
  b.rectSurface(500, 282, 28, 14, 'smoothConcrete', 5, false);

  // Fence, with the three ways through it: the north gate onto Service Access,
  // the west gate onto East Avenue South, and the outfall.
  b.fence(pt(YARD.x0, YARD.y0), pt(506, YARD.y0));
  b.fence(pt(518, YARD.y0), pt(YARD.x1, YARD.y0));
  b.fence(pt(YARD.x0, YARD.y0), pt(YARD.x0, 192));
  b.fence(pt(YARD.x0, 204), pt(YARD.x0, YARD.y1));
  b.fence(pt(YARD.x1, YARD.y0), pt(YARD.x1, YARD.y1));
  b.fence(pt(YARD.x0, YARD.y1), pt(OUTFALL_GAP.x0, YARD.y1));
  b.fence(pt(OUTFALL_GAP.x1, YARD.y1), pt(YARD.x1, YARD.y1));

  // ------------------------------------------------------------------- admin
  b.building('structure', [pt(480, 192), pt(490, 192), pt(490, 202), pt(480, 202)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'GATEHOUSE',
  });
  b.building('civic', [pt(484, 176), pt(508, 176), pt(508, 192), pt(484, 192)], {
    height: 4.2, wall: WALL_COOL, roof: ROOF_SLATE, label: 'COMPOUND OFFICE', occupants: 4,
  });
  b.building('structure', [pt(514, 176), pt(534, 176), pt(534, 190), pt(514, 190)], {
    height: 3.6, wall: CABIN, roof: CABIN_ROOF, label: 'CANTEEN', occupants: 6,
  });
  b.building('structure', [pt(538, 174), pt(550, 174), pt(550, 181), pt(538, 181)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN A',
  });
  b.building('structure', [pt(538, 185), pt(550, 185), pt(550, 192), pt(538, 192)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN B',
  });
  b.building('utility', [pt(516, 194), pt(530, 194), pt(530, 202), pt(516, 202)], {
    height: 3.4, wall: WALL_PLANT, roof: ROOF_TIN, label: 'TRANSFORMER HOUSING',
  });
  b.building('utility', [pt(536, 194), pt(550, 194), pt(550, 204), pt(536, 204)], {
    height: 3.6, wall: WALL_PLANT, roof: ROOF_TIN, label: 'GENERATOR HOUSE',
  });

  // -------------------------------------------------------------------- hall
  // Windowless, unremarkable, and the reason the district exists. It is the
  // same size as the canteen and a metre taller.
  b.building('utility', [pt(496, 206), pt(530, 206), pt(530, 230), pt(496, 230)], {
    height: 5.2, wall: WALL_PLANT, roof: ROOF_TIN, label: 'RELAY 12',
  });
  // The prefab row, set back off the hall so the lane between them is walkable.
  // TX-2's cabinet is in that lane, which is the only reason the lane matters.
  b.building('structure', [pt(480, 206), pt(490, 206), pt(490, 214), pt(480, 214)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN C',
  });
  b.building('structure', [pt(480, 218), pt(490, 218), pt(490, 226), pt(480, 226)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN D',
  });
  b.building('structure', [pt(480, 230), pt(490, 230), pt(490, 238), pt(480, 238)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN E',
  });
  b.building('shed', [pt(536, 206), pt(548, 206), pt(548, 216), pt(536, 216)], {
    height: 3.4, wall: '#CDBBA2', roof: '#8B7355', label: 'CABLE DRUM STORE',
  });

  // ----------------------------------------------------------------- haulage
  b.building('structure', [pt(498, 250), pt(530, 250), pt(530, 280), pt(498, 280)], {
    height: 8.0, wall: '#C9CEC8', roof: '#7E8A82', label: 'VENN HAULAGE — DEPOT',
  });
  b.building('structure', [pt(493, 233), pt(501, 233), pt(501, 239), pt(493, 239)], {
    height: 2.8, wall: '#8C6E4E', roof: '#7B6044', label: 'CONTAINER 1',
  });
  b.building('structure', [pt(493, 241), pt(501, 241), pt(501, 247), pt(493, 247)], {
    height: 2.8, wall: '#6E7C6A', roof: '#5F6B5C', label: 'CONTAINER 2',
  });
  for (let i = 0; i < 4; i++) {
    const y = 248 + i * 10;
    b.building('shed', [pt(480, y), pt(492, y), pt(492, y + 8), pt(480, y + 8)], {
      height: 2.8, wall: '#CDBBA2', roof: '#8B7355', label: `LOCK-UP ${i + 1}`,
    });
  }
  b.building('structure', [pt(536, 246), pt(548, 246), pt(548, 254), pt(536, 254)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'PORTACABIN F',
  });
  b.building('shed', [pt(480, 290), pt(492, 290), pt(492, 298), pt(480, 298)], {
    height: 2.6, wall: '#CDBBA2', roof: '#8B7355', label: 'GRIT STORE',
  });
  b.building('structure', [pt(528, 284), pt(538, 284), pt(538, 294), pt(528, 294)], {
    height: 3.0, wall: CABIN, roof: CABIN_ROOF, label: 'WEIGHBRIDGE HUT',
  });
  // The pump house went in last, on the outfall, and it left a six-metre slot
  // between itself and the east fence. Nobody drew that slot; it is what is
  // left over once two assets are sited by two people on two different years.
  b.building('utility', [pt(534, 268), pt(546, 268), pt(546, 282), pt(534, 282)], {
    height: 3.2, wall: WALL_PLANT, roof: ROOF_TIN, label: 'PUMP HOUSE',
  });

  // ---------------------------------------------------------------- sensors
  // Seven of the eight hang on TX-2. The eighth is the argument.
  b.camera({
    id: 'CM-R01', pos: pt(479.6, 197), facing: 165, kind: 'facility',
    fov: 86, range: 32, height: 4.4, bias: 0.9, label: 'RELAY 12 — WEST GATE',
    records: [
      'FEED: NOMINAL',
      'PURPOSE AT INSTALL: VEHICLE ACCESS CONTROL',
      'PURPOSE NOW: SVC-VISION, SVC-PREDICT',
      'RETENTION: 90 DAYS',
    ],
  });
  b.camera({
    id: 'CM-R02', pos: pt(512, 174), facing: 270, kind: 'facility',
    fov: 78, range: 26, height: 4.4, bias: 0.9, label: 'RELAY 12 — NORTH GATE',
  });
  b.camera({
    id: 'CM-R08', pos: pt(548, 244), facing: 180, kind: 'facility',
    fov: 60, range: 26, height: 4.4, bias: 0.88, label: 'RELAY 12 — EAST YARD',
  });

  b.segment('S-X3', 'TX-2', 'RELAY 12 — YARD & HAULAGE');
  b.camera({
    id: 'CM-R03', pos: pt(495.6, 208), facing: 135, kind: 'facility',
    fov: 74, range: 24, height: 4.6, bias: 0.92, label: 'RELAY 12 — HALL DOOR',
    records: [
      'FEED: NOMINAL',
      'PURPOSE: PLANT ROOM ACCESS',
      'ALARM ON DOOR: YES',
      'ALARM ON CABINET: NO CABINET ACCESS ANTICIPATED',
      'RETENTION: 90 DAYS',
    ],
  });
  b.camera({
    id: 'CM-R04', pos: pt(516, 249.6), facing: 270, kind: 'facility',
    fov: 80, range: 30, sweep: 24, sweepPeriod: 9, height: 5.0, bias: 0.9,
    label: 'RELAY 12 — LOADING APRON',
    records: [
      'FEED: NOMINAL',
      'INSTALLED BY: VENN HAULAGE LTD, 2029',
      'PURPOSE AT INSTALL: LOAD DAMAGE DISPUTES',
      'PURPOSE NOW: SVC-VISION, SVC-PREDICT',
      'RETENTION: 90 DAYS',
    ],
  });
  b.camera({
    id: 'CM-R05', pos: pt(527.6, 289), facing: 180, kind: 'facility',
    fov: 54, range: 24, height: 3.4, bias: 0.86, label: 'RELAY 12 — WEIGHBRIDGE',
    records: [
      'FEED: NOMINAL',
      'SPECIFIED BY: TRADING STANDARDS, 2028',
      'FIELD OF VIEW: WEIGHBRIDGE DECK',
      'AREA COVERED: 392 M2 OF 9,768 M2 ON THIS SITE',
      'RETENTION: 90 DAYS',
    ],
  });
  b.camera({
    id: 'CM-R06', pos: pt(496.5, 249), facing: 90, kind: 'facility',
    fov: 64, range: 28, height: 4.2, bias: 0.88, label: 'RELAY 12 — LOCK-UP ROW',
  });
  b.junction(pt(496.4, 254), 'RELAY 12 — HAULAGE SEGMENT RELAY', 'JX-R12', [
    'SEGMENT RELAY — S-X3 YARD & HAULAGE',
    'ORIGIN: PRIVATE SITE CCTV, VENN HAULAGE LTD',
    'ADOPTED 2031 UNDER SAFEtrace CITY PARTNER SCHEME',
    'COST TO OPERATOR: NIL',
    'CONDITION OF ADOPTION: FEEDS AVAILABLE TO SVC-VISION',
    'OPERATOR RETAINS: NOTHING',
    'SELF-HEAL: 90S',
  ]);

  // The control case. Same fence, same morning, different uplink — and every
  // protection the street was never offered.
  b.segment('S-X2', 'TX-1', 'RELAY 12 — OFFICE / ADMIN');
  b.camera({
    id: 'CM-R07', pos: pt(496, 192.5), facing: 90, kind: 'facility',
    fov: 66, range: 20, height: 4.0, bias: 0.9, label: 'RELAY 12 — COMPOUND OFFICE',
    records: [
      'FEED: NOMINAL',
      'SEGMENT: S-X2 — OFFICE / ADMIN',
      'CARRIED BY: TX-1, BELLHAVEN CENTRAL',
      'NOT CARRIED BY THE UPLINK ON THIS SITE',
      'BASIS: STAFF MONITORING IS A SEPARATE PURPOSE, POLICY 6.1',
      'STAFF ARE NOTIFIED. STAFF MAY OBJECT.',
      'RETENTION: 30 DAYS',
    ],
  });

  // The site's own maintenance terminal, on the hall's east wall. Its record is
  // read out of the network as it stands today, because the number is the point.
  b.useSegment('S-X1');
  b.junction(pt(531.4, 224), 'RELAY 12 — MAINTENANCE TERMINAL', 'MT-R12', (ctx) => {
    const provisioned = ctx.network.segments.filter((s) => s.uplinkId === 'TX-2').length;
    return [
      'RELAY 12 — SITE MAINTENANCE TERMINAL',
      'ASSET OWNER: BELLHAVEN COUNCIL — HIGHWAYS',
      'COMMISSIONED 2029, CARRIAGEWAY RESURFACING BUDGET 14B',
      'ORIGINAL PURPOSE: WINTER GRITTING TELEMETRY',
      'SEGMENTS AT COMMISSIONING: 1',
      `SEGMENTS PROVISIONED TODAY: ${provisioned}`,
      'PROVISIONING DOES NOT REQUIRE COUNCIL APPROVAL',
      'NO CAPACITY REVIEW SCHEDULED. NONE REQUIRED.',
    ];
  });

  // Edges the investigation walks. Each is something this node genuinely knows
  // about the next: the site register knows its segment relay, the relay knows
  // what was adopted onto it, the adopted camera knows where its frames go.
  b.link('TX-2', 'MT-R12');
  b.link('MT-R12', 'JX-R12');
  b.link('JX-R12', 'CM-R07');
  b.link('CM-R07', 'SVC-VISION');

  // ---------------------------------------------------------------- dressing
  b.cover([pt(490, 232), pt(548, 232), pt(548, 248), pt(490, 248)], 'awning', 4.6);
  b.cover([pt(532, 262), pt(552, 262), pt(552, 300), pt(532, 300)], 'canopy', 4.0);
  b.prop('sign', pt(480, 172), 0, { tint: 'SAFEtrace CITY — RESTRICTED' });
  b.prop('sign', pt(514, 170), 0, { tint: 'BELLHAVEN COUNCIL — HIGHWAYS DEPOT 12' });
  b.prop('bin', pt(512, 194)); b.prop('bin', pt(533, 192));
  b.prop('cone', pt(506, 236)); b.prop('cone', pt(534, 236)); b.prop('cone', pt(541, 296));
  b.prop('hydrant', pt(506, 231));
  b.prop('car', pt(500, 201), 0, { tint: '#5B6E7F' });
  b.prop('car', pt(544, 232), Math.PI / 2, { tint: '#8A6E52' });
  b.prop('planter', pt(486, 186));
  b.trees([pt(470, 214), pt(470, 262), pt(558, 216), pt(558, 274)]);
  b.ammoCache(pt(486, 244), 'LOCK-UP ROW');

  // Skate content, all of it made of things a yard already has: a loading
  // ledge, the kerb off the apron, and the weighbridge ramp.
  b.ledge(pt(506, 240), pt(530, 240));
  b.kicker(pt(510, 246), 7, 5, 180, 3.4);
  b.bank(pt(514, 289), 20, 5, 0, 1.8, 2.8);
}

/**
 * TX-2's records: a preamble that says what carriage is, the archived line the
 * morning already wrote, and then whatever this uplink has actually carried
 * since. The last part is derived, so it cannot flatter the machine.
 */
export const TX2_RECORDS = uplinkRecords(
  'TX-2',
  [
    'SAFEtrace TRANSPORT — DISTRICT UPLINK TX-2',
    'SITE: RELAY 12, EAST BELLHAVEN',
    'FUNCTION: AGGREGATION AND CARRIAGE',
    'NO LOCAL STORAGE. NO LOCAL MATCHING. NO LOCAL DECISION.',
    'AVAILABILITY: 99.99% CONTRACTED, 100.00% ACHIEVED OVER 41 MONTHS',
  ],
  ['04:41:07  CM-207  DELIVERED  FRAME SET 0441-07, REFERRED SVC-VISION'],
);
