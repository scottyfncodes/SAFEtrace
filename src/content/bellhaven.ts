/**
 * Bellhaven.
 *
 * Dense, not large. ~560 x 520 metres, four districts, and at least two routes
 * between any pair of them — one of which is barely covered. Prediction runs on
 * the road graph, so the spaces deliberately left off it (the Channel,
 * backyards, the parking decks) are where the player is free.
 */
import { TownBuilder, pt } from './builder';
import type { WorldData } from '../sim/worldTypes';

const ROOF_TERRACOTTA = '#C4714E';
const ROOF_SLATE = '#56626E';
const ROOF_SAND = '#B98A5E';
const WALL_WARM = '#F0E3D0';
const WALL_COOL = '#DCE4E8';
const WALL_CREAM = '#EDE0C8';

export function buildBellhaven(): WorldData {
  const b = new TownBuilder();

  // ---------------------------------------------------------------- districts
  b.district('northgate', 'Northgate', pt(125, 60), 130);
  b.district('commons', 'Bellhaven Commons', pt(380, 90), 150);
  b.district('maple', 'Maple Court', pt(140, 230), 130);
  b.district('ridgeline', 'Ridgeline Secondary', pt(370, 330), 150);
  b.district('channel', 'The Channel', pt(280, 430), 280);
  b.district('relay', 'Relay 12', pt(515, 210), 60);

  // ---------------------------------------------------------------- network
  b.uplink('TX-1', pt(392, 82), 'BELLHAVEN CENTRAL UPLINK');
  b.uplink('TX-2', pt(514, 206), 'RELAY 12 — DISTRICT UPLINK');

  b.service('SVC-VISION', 'SAFEtrace VISION — IDENTITY RECOGNITION', pt(392, 74), [
    'GALLERY: BELLHAVEN RESIDENTS (11,204)',
    'GALLERY: RIDGELINE SECONDARY — ENROLLED MINORS (812)',
    'CONSENT BASIS: PARENT / GUARDIAN, SAFEtrace SCHOOL T&C 4.2',
    'MATCH THRESHOLD: 97.0%',
    'THRESHOLD LAST REVISED: LOWERED FROM 99.0% AFTER REVIEW 11-04',
    'REVIEW 11-04 OUTCOME: EARLIER DETECTION, TWO HARMS PREVENTED',
  ]);
  b.service('SVC-PREDICT', 'SAFEtrace PREDICT — ASSOCIATION & FORECAST', pt(400, 74), [
    'MODEL: ROUTE PRIOR v9',
    'INPUTS: LOCATION HISTORY, ASSOCIATES, TIME OF DAY, INCIDENT TYPE',
    'ASSOCIATION IS NOT AN ACCUSATION.',
  ]);
  b.service('SVC-RECORD', 'SAFEtrace RECORD — SUBJECT HISTORY', pt(384, 74), [
    'RETENTION: INDEFINITE',
    'AMENDMENT: NOT AVAILABLE TO SUBJECTS',
    'REQUEST DECLINED — RECORD IMMUTABLE',
  ]);

  b.segment('S-C1', 'TX-1', 'BELLHAVEN COMMONS');
  b.segment('S-M1', 'TX-1', 'MAPLE COURT RESIDENTIAL');
  b.segment('S-R1', 'TX-1', 'RIDGELINE SECONDARY');
  b.segment('S-N2', 'TX-2', 'NORTHGATE');
  b.segment('S-CH', 'TX-2', 'UTILITY / DRAINAGE');
  b.segment('S-X1', 'TX-2', 'RELAY 12 PERIMETER');

  // ---------------------------------------------------------------- roads
  b.in('commons');
  const ave = b.road('Bellhaven Avenue', [
    pt(20, 150), pt(70, 150), pt(155, 150), pt(220, 150),
    pt(300, 150), pt(380, 150), pt(460, 150), pt(540, 150),
  ], { width: 9, prior: 1.5 });

  b.in('northgate');
  const ng = b.road('Northgate Lane', [pt(30, 60), pt(70, 60), pt(145, 60), pt(220, 60)], { width: 7, prior: 0.95 });
  const vine = b.road('Vine Street', [pt(70, 95), pt(70, 120)], { width: 7, prior: 0.9 });
  b.joinRoad(ng[1], vine[0], 0.9);
  b.joinRoad(vine[1], ave[1], 0.9);
  const aspen = b.road('Aspen Street', [pt(220, 95), pt(220, 120)], { width: 7, prior: 0.85 });
  b.joinRoad(ng[3], aspen[0], 0.85);
  b.joinRoad(aspen[1], ave[3], 0.85);

  b.in('commons');
  const market = b.road('Market Street', [pt(300, 60), pt(380, 60), pt(460, 60)], { width: 8, prior: 1.25 });
  const commonsWay = b.road('Commons Way', [pt(300, 95), pt(300, 120)], { width: 8, prior: 1.2 });
  b.joinRoad(market[0], commonsWay[0], 1.2);
  b.joinRoad(commonsWay[1], ave[4], 1.2);
  const fir = b.road('Fir Way', [pt(380, 95), pt(380, 120)], { width: 7, prior: 0.8 });
  b.joinRoad(market[1], fir[0], 0.8);
  b.joinRoad(fir[1], ave[5], 0.8);
  const eastN = b.road('East Avenue', [pt(460, 95), pt(460, 120)], { width: 7, prior: 1.0 });
  b.joinRoad(market[2], eastN[0], 1.0);
  b.joinRoad(eastN[1], ave[6], 1.0);

  b.in('maple');
  const maple = b.road('Maple Court', [pt(155, 195), pt(155, 240)], { width: 7, prior: 0.9 });
  b.joinRoad(ave[2], maple[0], 0.9);

  const ridge = b.road('Ridgeline Road', [
    pt(60, 280), pt(110, 280), pt(155, 280), pt(230, 280), pt(300, 280), pt(380, 280), pt(455, 280),
  ], { width: 8, prior: 1.2 });
  b.joinRoad(maple[1], ridge[2], 0.9);

  const birch = b.road('Birch Lane', [pt(110, 240), pt(70, 240)], { width: 6.5, prior: 0.6 });
  b.joinRoad(maple[1], birch[0], 0.6);
  b.joinRoad(birch[1], ridge[0], 0.6);

  // The cul-de-sac. Low prior, so the forecast rarely sends anyone here.
  const cds = b.road('Sycamore Close', [
    pt(110, 312), pt(94, 332), pt(114, 348), pt(140, 336), pt(128, 310),
  ], { width: 6, prior: 0.35 });
  b.joinRoad(ridge[1], cds[0], 0.35);
  b.joinRoad(cds[4], cds[0], 0.35);

  b.in('ridgeline');
  const cedar = b.road('Cedar Street', [pt(230, 195), pt(230, 240)], { width: 7, prior: 0.8 });
  b.joinRoad(ave[3], cedar[0], 0.8);
  b.joinRoad(cedar[1], ridge[3], 0.8);
  const eastS = b.road('East Avenue South', [pt(460, 195), pt(460, 240)], { width: 7, prior: 0.95 });
  b.joinRoad(ave[6], eastS[0], 0.95);
  b.joinRoad(eastS[1], ridge[6], 0.95);
  const school = b.road('Ridgeline Loop', [pt(300, 340), pt(380, 340), pt(450, 340)], { width: 6.5, prior: 0.55 });
  b.joinRoad(ridge[4], school[0], 0.55);
  b.joinRoad(school[2], ridge[6], 0.55);

  b.in('relay');
  const relay = b.road('Service Access', [pt(505, 206), pt(528, 178)], { width: 5, prior: 0.15, sidewalk: false });
  b.joinRoad(relay[1], ave[7], 0.15);

  // ---------------------------------------------------------------- northgate
  b.in('northgate').useSegment('S-N2');
  b.rectSurface(10, 10, 240, 130, 'grass', 0);
  const ngHouses: Array<[number, number, number, string]> = [
    [40, 30, 0, ROOF_SLATE], [85, 30, 0, ROOF_TERRACOTTA], [130, 30, 0, ROOF_SAND],
    [175, 30, 0, ROOF_SLATE], [215, 30, 0, ROOF_TERRACOTTA],
    [45, 95, 180, ROOF_TERRACOTTA], [100, 95, 180, ROOF_SLATE], [180, 95, 180, ROOF_SAND],
  ];
  for (const [x, y, rot, roof] of ngHouses) {
    b.house({
      at: pt(x, y), w: 10, d: 8, rot, roof, wall: WALL_CREAM,
      occupants: 2 + ((x + y) % 4),
      drivewayDir: y < 60 ? 90 : 270,
      camera: { facing: y < 60 ? 90 : 270, range: 21, fov: 70 },
    });
  }

  /**
   * CM-207. The camera that produces the match. There is nothing wrong with it,
   * and that is the entire point of the story.
   */
  b.camera({
    id: 'CM-207', pos: pt(145, 88), facing: 270, kind: 'street',
    fov: 80, range: 34, sweep: 22, sweepPeriod: 13, height: 4.6, bias: 0.97,
    label: 'NORTHGATE LN / VINE — STREET',
  });
  b.junction(pt(112, 88), 'NORTHGATE JUNCTION', 'JX-207');
  b.link('CM-207', 'JX-207');
  b.link('CM-207', 'SVC-VISION');
  b.link('CM-207', 'SVC-PREDICT');
  b.link('JX-207', 'TX-2');
  b.plateReader(pt(222, 62), 'NORTHGATE LN — PLATE READER');
  b.trees([pt(60, 118), pt(125, 118), pt(200, 120), pt(30, 78)]);
  b.prop('bin', pt(118, 45), 0);
  b.prop('bin', pt(160, 45), 0);
  b.prop('car', pt(52, 47), Math.PI / 2, { tint: '#4E7FA8' });
  b.prop('car', pt(190, 112), Math.PI / 2, { tint: '#D96C5F' });

  // ---------------------------------------------------------------- commons
  b.in('commons').useSegment('S-C1');
  b.rectSurface(255, 15, 285, 125, 'roughConcrete', 0, true);

  // Retail strip along Market Street.
  b.building('shop', [pt(268, 22), pt(360, 22), pt(360, 48), pt(268, 48)], {
    height: 6.5, wall: WALL_COOL, roof: ROOF_SLATE, label: 'BELLHAVEN MARKET',
  });
  b.building('shop', [pt(370, 22), pt(430, 22), pt(430, 48), pt(370, 48)], {
    height: 6.2, wall: WALL_WARM, roof: ROOF_SAND, label: "OKONJO CYCLE & BOARD",
  });
  b.building('shop', [pt(440, 22), pt(500, 22), pt(500, 48), pt(440, 48)], {
    height: 6.2, wall: WALL_COOL, roof: ROOF_SLATE, label: 'PHARMACY',
  });
  b.cover([pt(268, 48), pt(500, 48), pt(500, 53), pt(268, 53)], 'awning', 3.6);

  /*
   * The plaza. Ledges, planters, a stair set and smooth ground: the best flat
   * in Bellhaven, and the most heavily covered ground in the district. Being
   * here is fine, because everyone is here. The cost is that your behaviour is
   * scored precisely.
   */
  b.rectSurface(300, 66, 112, 50, 'smoothConcrete', 3, true);
  // Flanking blocks, so the plaza is a room rather than a field.
  b.building('civic', [pt(262, 64), pt(296, 64), pt(296, 116), pt(262, 116)], {
    height: 8, wall: WALL_CREAM, roof: ROOF_SAND, label: 'BELLHAVEN LIBRARY',
  });
  b.building('shop', [pt(416, 64), pt(468, 64), pt(468, 116), pt(416, 116)], {
    height: 8.5, wall: WALL_COOL, roof: ROOF_SLATE, label: 'BELLHAVEN CINEMA',
  });
  b.camera({ pos: pt(296, 90), facing: 0, kind: 'plaza', fov: 76, range: 30, sweep: 20, sweepPeriod: 10, height: 5.0, bias: 0.95, label: 'LIBRARY FORECOURT' });
  b.camera({ pos: pt(416, 90), facing: 180, kind: 'plaza', fov: 76, range: 30, sweep: 20, sweepPeriod: 10, sweepPhase: 0.5, height: 5.0, bias: 0.95, label: 'CINEMA FORECOURT' });

  // Ledges, a fountain, a stair set, and a bank against the library wall: the
  // best flat in Bellhaven, and its most heavily covered ground.
  b.ledge(pt(306, 76), pt(340, 76));
  b.ledge(pt(352, 76), pt(386, 76));
  b.ledge(pt(306, 106), pt(340, 106));
  b.ledge(pt(352, 106), pt(386, 106));
  b.ledge(pt(398, 78), pt(398, 104));
  b.stairs(pt(356, 120), 24, 9, 90, 1.1);
  b.kicker(pt(356, 131), 14, 6, 90, 4.0);
  b.bank(pt(300, 91), 9, 22, 0, 2.0, 3.2);
  b.prop('planter', pt(356, 91), 0, { scale: 2.0, tint: '#7FB2C4' });
  for (const [x, y] of [[314, 91], [330, 91], [382, 91], [398, 91]] as Array<[number, number]>) {
    b.prop('planter', pt(x, y), 0, { scale: 0.9 });
  }
  b.prop('bench', pt(322, 84), 0);
  b.prop('bench', pt(390, 84), 0);
  b.prop('bench', pt(322, 99), 0);
  b.prop('bench', pt(390, 99), 0);
  for (const x of [304, 309, 314, 319]) b.prop('mailbox', pt(x, 68), Math.PI / 2);
  b.trees([pt(346, 68), pt(370, 68), pt(346, 114), pt(370, 114)], 0.8);
  b.speaker(pt(356, 70), 'COMMONS PLAZA — PUBLIC ADDRESS');
  b.ammoCache(pt(400, 55), 'OKONJO CYCLE & BOARD');

  b.camera({ pos: pt(306, 68), facing: 55, kind: 'plaza', fov: 78, range: 38, sweep: 34, sweepPeriod: 12, height: 5.4, bias: 0.96, label: 'PLAZA WEST' });
  b.camera({ pos: pt(406, 68), facing: 125, kind: 'plaza', fov: 78, range: 38, sweep: 34, sweepPeriod: 12, sweepPhase: 0.5, height: 5.4, bias: 0.96, label: 'PLAZA EAST' });
  b.camera({ pos: pt(356, 114), facing: 270, kind: 'plaza', fov: 90, range: 32, sweep: 0, height: 5.0, bias: 0.94, label: 'PLAZA SOUTH' });
  b.camera({ pos: pt(272, 50), facing: 20, kind: 'street', fov: 66, range: 30, sweep: 18, sweepPeriod: 9, height: 4.4, label: 'MARKET ST WEST' });
  b.camera({ pos: pt(498, 50), facing: 160, kind: 'street', fov: 66, range: 30, sweep: 18, sweepPeriod: 9, sweepPhase: 0.33, height: 4.4, label: 'MARKET ST EAST' });
  b.plateReader(pt(302, 140), 'COMMONS WAY — PLATE READER');
  b.junction(pt(392, 122), 'COMMONS JUNCTION', 'JX-C1');
  b.link('JX-C1', 'TX-1');

  /**
   * The parking structure. Two decks of overhead cover, and the single best
   * drone-blind route in the slice.
   */
  const deck = [pt(470, 75), pt(534, 75), pt(534, 132), pt(470, 132)];
  b.building('structure', deck, { height: 8.5, wall: '#CFCABB', roof: '#B7B2A4', label: 'COMMONS PARKING — DECK 2' });
  b.cover(deck, 'deck', 8.5);
  // The decks are open at the ends: the interior is drivable and skateable.
  b.rectSurface(474, 79, 56, 49, 'smoothConcrete', 5);
  b.prop('car', pt(486, 88), 0, { tint: '#6FA36B' });
  b.prop('car', pt(486, 108), 0, { tint: '#8C6BB1' });
  b.prop('car', pt(518, 88), Math.PI, { tint: '#E0A83D' });
  b.camera({ pos: pt(472, 128), facing: 20, kind: 'facility', fov: 60, range: 22, height: 3.2, bias: 0.7, interior: true, label: 'PARKING — DECK 2 SW' });
  b.trees([pt(252, 100), pt(252, 62), pt(478, 100), pt(478, 62)]);
  b.prop('bin', pt(345, 55), 0);
  b.prop('bin', pt(462, 55), 0);
  b.prop('bin', pt(300, 124), 0);
  b.prop('hydrant', pt(268, 118));
  b.prop('hydrant', pt(452, 62));
  b.prop('sign', pt(330, 132), 0, { tint: 'SAFEtrace CITY' });
  b.prop('car', pt(285, 132), 0, { tint: '#4FA39B' });
  b.prop('car', pt(420, 132), Math.PI, { tint: '#C9576F' });

  // ---------------------------------------------------------------- maple court
  b.in('maple').useSegment('S-M1');
  b.rectSurface(20, 165, 220, 175, 'grass', 0);

  const mapleHouses: Array<[number, number, number, string, boolean]> = [
    [122, 192, 0, ROOF_TERRACOTTA, true], [122, 232, 0, ROOF_SLATE, false],
    [122, 268, 0, ROOF_SAND, true], [188, 192, 180, ROOF_SLATE, true],
    [188, 232, 180, ROOF_TERRACOTTA, false], [188, 268, 180, ROOF_SAND, true],
    [60, 200, 90, ROOF_TERRACOTTA, false], [60, 262, 90, ROOF_SLATE, true],
  ];
  for (const [x, y, rot, roof, garage] of mapleHouses) {
    const facing = x < 155 ? 0 : x > 155 ? 180 : 90;
    b.house({
      at: pt(x, y), w: 12, d: 9.5, rot, roof, wall: x % 2 === 0 ? WALL_WARM : WALL_CREAM,
      occupants: 2 + ((x * 7 + y) % 4),
      drivewayDir: facing, garage,
      camera: { facing, range: 23, fov: 76, sweep: 0 },
    });
  }

  // The cul-de-sac houses.
  for (const [x, y, r] of [[100, 322, 200], [104, 356, 340], [146, 352, 20]] as Array<[number, number, number]>) {
    b.house({ at: pt(x, y), w: 11, d: 9, rot: r, roof: ROOF_SLATE, wall: WALL_COOL, occupants: 3, drivewayDir: 60, camera: { facing: 60, range: 20 } });
  }

  b.junction(pt(155, 258), 'MAPLE COURT JUNCTION', 'JX-M1');
  b.link('JX-M1', 'TX-1');
  b.camera({ pos: pt(155, 176), facing: 90, kind: 'street', fov: 74, range: 34, sweep: 26, sweepPeriod: 10, height: 4.4, label: 'MAPLE CT NORTH' });
  b.camera({ pos: pt(155, 300), facing: 270, kind: 'street', fov: 74, range: 34, sweep: 26, sweepPeriod: 10, sweepPhase: 0.5, height: 4.4, label: 'MAPLE CT SOUTH' });

  // The empty pool, the half-built extension, and the low walls between
  // backyards. All three are shortcuts that the road graph knows nothing about.
  b.rectSurface(206, 246, 20, 14, 'smoothConcrete', 6);
  b.bank(pt(216, 253), 18, 8, 0, 2.4, 3.8);
  b.building('shed', [pt(58, 300), pt(72, 300), pt(72, 312), pt(58, 312)], { height: 2.6, wall: '#CDBBA2', roof: '#8B7355' });
  b.rectSurface(30, 250, 26, 26, 'dirt', 4);
  b.prop('cone', pt(34, 254)); b.prop('cone', pt(50, 254)); b.prop('cone', pt(42, 270));
  b.ammoCache(pt(42, 262), 'CONSTRUCTION SITE');
  b.lowWall(pt(96, 214), pt(96, 250));
  b.lowWall(pt(214, 214), pt(214, 250));
  b.lowWall(pt(96, 286), pt(214, 286));
  b.trees([pt(100, 180), pt(210, 180), pt(88, 250), pt(224, 300), pt(76, 336), pt(178, 318)]);
  b.prop('bin', pt(140, 205)); b.prop('bin', pt(170, 245)); b.prop('bin', pt(140, 285));
  b.prop('hydrant', pt(166, 210)); b.prop('hydrant', pt(120, 292));
  b.prop('car', pt(136, 172), Math.PI / 2, { tint: '#4E7FA8' });
  b.prop('car', pt(176, 262), Math.PI / 2, { tint: '#E0A83D' });
  b.prop('hoop', pt(196, 300), 0);
  b.kicker(pt(126, 252), 7, 5, 90, 3.6);
  b.ledge(pt(140, 200), pt(140, 226));
  b.ledge(pt(170, 274), pt(170, 298));

  // ---------------------------------------------------------------- ridgeline
  b.in('ridgeline').useSegment('S-R1');
  b.rectSurface(250, 292, 240, 120, 'grass', 0);
  b.rectSurface(262, 300, 200, 34, 'roughConcrete', 3, true);

  b.building('school', [pt(268, 300), pt(430, 300), pt(430, 332), pt(268, 332)], {
    height: 9, wall: WALL_COOL, roof: ROOF_SLATE, label: 'RIDGELINE SECONDARY',
  });
  // The gym, and the bank on its back wall: the best transition in town.
  b.building('school', [pt(300, 352), pt(370, 352), pt(370, 386), pt(300, 386)], {
    height: 11, wall: '#E4E0D4', roof: '#6A7480', label: 'RIDGELINE — GYMNASIUM',
  });
  b.bank(pt(335, 392), 66, 12, 90, 3.0, 4.6);
  // Loading dock: a four-foot drop into a run-out that happens to also be a dock.
  b.rectSurface(392, 352, 34, 26, 'smoothConcrete', 4);
  b.feature('drop', [pt(392, 352), pt(426, 352), pt(426, 358), pt(392, 358)], 90, 1.2, 0);
  b.kicker(pt(409, 376), 16, 7, 90, 4.4);
  b.prop('bin', pt(432, 360)); b.prop('bin', pt(432, 370));

  b.fence(pt(250, 292), pt(250, 404));
  b.fence(pt(490, 404), pt(490, 292));
  // The gaps in the fence: behind the bike racks, and either side of the
  // grounds store. Not on any map SAFEtrace has, because they are not gates.
  b.fence(pt(250, 292), pt(340, 292));
  b.fence(pt(356, 292), pt(462, 292));
  b.fence(pt(482, 292), pt(490, 292));
  b.fence(pt(250, 404), pt(318, 404));
  b.fence(pt(342, 404), pt(462, 404));
  b.fence(pt(482, 404), pt(490, 404));

  b.camera({ pos: pt(349, 298), facing: 270, kind: 'school', fov: 86, range: 38, sweep: 30, sweepPeriod: 9, height: 5.2, bias: 0.98, label: 'RIDGELINE — MAIN ENTRANCE' });
  b.camera({ pos: pt(268, 336), facing: 20, kind: 'school', fov: 74, range: 32, sweep: 24, sweepPeriod: 11, height: 4.8, bias: 0.97, label: 'RIDGELINE — WEST YARD' });
  b.camera({ pos: pt(430, 336), facing: 160, kind: 'school', fov: 74, range: 32, sweep: 24, sweepPeriod: 11, sweepPhase: 0.4, height: 4.8, bias: 0.97, label: 'RIDGELINE — EAST YARD' });
  b.camera({ pos: pt(300, 388), facing: 60, kind: 'school', fov: 70, range: 30, sweep: 0, height: 4.6, bias: 0.95, label: 'RIDGELINE — FIELD' });
  b.speaker(pt(349, 292), 'RIDGELINE — ANNOUNCEMENTS');
  b.junction(pt(452, 320), 'RIDGELINE JUNCTION', 'JX-R1');
  b.link('JX-R1', 'TX-1');
  b.prop('sign', pt(349, 288), 0, { tint: 'SAFEtrace SCHOOL' });
  b.ledge(pt(280, 344), pt(324, 344));
  b.ledge(pt(376, 344), pt(420, 344));
  b.stairs(pt(349, 342), 22, 7, 90, 0.9);
  for (const x of [292, 298, 304, 310]) b.prop('mailbox', pt(x, 296), Math.PI / 2);
  b.trees([pt(262, 350), pt(262, 386), pt(470, 350), pt(470, 386), pt(440, 296)]);
  b.cover([pt(268, 336), pt(430, 336), pt(430, 344), pt(268, 344)], 'awning', 4);

  // ---------------------------------------------------------------- greenway
  /*
   * Bellhaven Greenway. Community facilities, a court, a playground, and the
   * paths down to the drainage aprons. None of the paths are on the road graph,
   * which is exactly why they matter: the forecast cannot follow you here.
   */
  b.in('maple').useSegment('S-M1');
  b.rectSurface(20, 292, 226, 110, 'grass', 0);

  // The court. Smooth, flat, and the second best skate spot in town.
  b.rectSurface(56, 306, 30, 52, 'smoothConcrete', 4);
  b.prop('hoop', pt(71, 310), 0);
  b.prop('hoop', pt(71, 354), Math.PI);
  b.ledge(pt(52, 306), pt(52, 358));
  b.kicker(pt(90, 332), 9, 12, 0, 3.6);

  // The playground, and the community hall that watches it.
  b.rectSurface(178, 306, 40, 34, 'dirt', 4);
  b.prop('bench', pt(178, 346), 0);
  b.prop('bench', pt(206, 346), 0);
  b.prop('bin', pt(220, 344));
  b.building('civic', [pt(176, 356), pt(222, 356), pt(222, 380), pt(176, 380)], {
    height: 5.5, wall: WALL_CREAM, roof: ROOF_SAND, label: 'GREENWAY COMMUNITY HALL',
  });
  b.camera({ pos: pt(199, 354), facing: 270, kind: 'school', fov: 82, range: 30, sweep: 24, sweepPeriod: 11, height: 4.6, bias: 0.96, label: 'GREENWAY HALL — PLAY AREA' });
  b.cover([pt(176, 380), pt(222, 380), pt(222, 388), pt(176, 388)], 'awning', 3.6);
  b.trees([pt(36, 300), pt(36, 342), pt(36, 384), pt(112, 300), pt(112, 372),
           pt(150, 316), pt(150, 366), pt(238, 306), pt(238, 356), pt(238, 392)]);
  b.ammoCache(pt(199, 344), 'GREENWAY HALL');

  // The four ways down to the water. Paved, obvious on the ground, and
  // invisible to a model that only knows about streets.
  b.path([pt(60, 286), pt(60, 340), pt(62, 396)], 3.6);
  b.path([pt(196, 286), pt(196, 350), pt(196, 418)], 3.6);
  b.path([pt(330, 396), pt(330, 436)], 3.6);
  b.path([pt(455, 286), pt(472, 300), pt(472, 396), pt(470, 442)], 3.6);
  // A cross-path linking the court, the playground and the hall.
  b.path([pt(60, 340), pt(120, 340), pt(178, 340), pt(196, 350)], 3.0);
  b.path([pt(196, 350), pt(240, 366), pt(268, 396)], 3.0);

  // ---------------------------------------------------------------- the channel
  /*
   * The Channel is the fastest route in Bellhaven and almost uncovered — not
   * because it is hidden, but because it is not a place anyone is supposed to
   * be, so nobody specified cameras for it. Its walls are 2.4 m of concrete:
   * they defeat a street camera's line of sight completely, and they mean the
   * only ways in or out are the four aprons.
   */
  b.in('channel').useSegment('S-CH');
  const chanPts: Array<[number, number]> = [[20, 400], [150, 420], [280, 440], [400, 450], [545, 456]];
  const aprons: Array<[number, number, number]> = [[62, 406, 90], [196, 428, 90], [330, 444, 270], [470, 452, 270]];
  const HALF = 9;

  for (let i = 1; i < chanPts.length; i++) {
    const [x0, y0] = chanPts[i - 1];
    const [x1, y1] = chanPts[i];
    b.surface([pt(x0, y0 - HALF), pt(x1, y1 - HALF), pt(x1, y1 + HALF), pt(x0, y0 + HALF)], 'smoothConcrete', 6);
    // The low-flow trickle down the invert, and the expansion joints across it.
    b.surface([pt(x0, y0 - 1.1), pt(x1, y1 - 1.1), pt(x1, y1 + 1.1), pt(x0, y0 + 1.1)], 'roughConcrete', 7);

    // Walls, in segments, with gaps at the aprons.
    const span = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(span / 16));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
      const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
      const mx = (ax + bx) / 2;
      const atApron = aprons.some(([px]) => Math.abs(mx - px) < 12);
      if (atApron) continue;
      for (const side of [-1, 1]) {
        b.building('structure', [
          pt(ax, ay + side * HALF), pt(bx, by + side * HALF),
          pt(bx, by + side * (HALF + 1.6)), pt(ax, ay + side * (HALF + 1.6)),
        ], { height: 2.4, wall: '#BDB9AC', roof: '#A9A497', label: 'CHANNEL WALL' });
      }
    }
  }

  // Four access aprons. Committing to the Channel is a real decision because
  // you can only leave it in four places.
  for (const [x, y, facing] of aprons) {
    b.surface([pt(x - 11, y - 18), pt(x + 11, y - 18), pt(x + 11, y + 18), pt(x - 11, y + 18)], 'smoothConcrete', 7);
    b.feature('bank', [pt(x - 11, y - 18), pt(x + 11, y - 18), pt(x + 11, y + 18), pt(x - 11, y + 18)], facing, 2.6, 3.2);
  }

  // Footbridges: the covered sections. The culvert defeats drones outright.
  for (const [x, y] of [[150, 420], [400, 450]] as Array<[number, number]>) {
    b.building('structure', [pt(x - 5, y - 13), pt(x + 5, y - 13), pt(x + 5, y + 13), pt(x - 5, y + 13)], {
      height: 4.2, wall: '#C6C0B2', roof: '#9E9788', label: 'FOOTBRIDGE',
    });
    b.cover([pt(x - 15, y - 11), pt(x + 15, y - 11), pt(x + 15, y + 11), pt(x - 15, y + 11)], 'tunnel', 4.2);
  }

  // One camera. It watches the apron, because that is where a planner assumed
  // people would enter. Nobody specified the Channel itself.
  b.camera({ pos: pt(196, 406), facing: 90, kind: 'facility', fov: 58, range: 26, height: 4.0, bias: 0.72, label: 'DRAINAGE ACCESS — SOUTH MAPLE' });
  b.junction(pt(330, 426), 'DRAINAGE JUNCTION', 'JX-CH');
  b.link('JX-CH', 'TX-2');
  b.prop('cone', pt(212, 424)); b.prop('cone', pt(182, 424));
  b.prop('bin', pt(268, 434));
  b.trees([pt(90, 384), pt(240, 412), pt(360, 428), pt(500, 438), pt(140, 462), pt(300, 470)]);

  // ---------------------------------------------------------------- relay 12
  b.in('relay').useSegment('S-X1');
  b.rectSurface(486, 176, 62, 66, 'gravel', 3);
  b.fence(pt(486, 176), pt(548, 176));
  b.fence(pt(486, 176), pt(486, 242));
  b.fence(pt(486, 242), pt(548, 242));
  b.building('utility', [pt(500, 196), pt(530, 196), pt(530, 220), pt(500, 220)], {
    height: 4.5, wall: '#D8D3C4', roof: '#9AA0A6', label: 'RELAY 12',
  });
  b.camera({ pos: pt(498, 192), facing: 315, kind: 'facility', fov: 70, range: 30, sweep: 30, sweepPeriod: 8, height: 4.6, bias: 0.9, label: 'RELAY 12 — PERIMETER NW' });
  b.camera({ pos: pt(532, 224), facing: 135, kind: 'facility', fov: 70, range: 30, sweep: 30, sweepPeriod: 8, sweepPhase: 0.5, height: 4.6, bias: 0.9, label: 'RELAY 12 — PERIMETER SE' });
  b.prop('sign', pt(494, 180), 0, { tint: 'SAFEtrace CITY — RESTRICTED' });
  b.link('TX-2', 'SVC-VISION');
  b.link('TX-1', 'SVC-VISION');
  b.link('TX-1', 'SVC-PREDICT');
  b.link('TX-2', 'SVC-RECORD');


  // ------------------------------------------------- avenue frontage & infill
  b.in('commons').useSegment('S-C1');
  b.building('civic', [pt(236, 96), pt(268, 96), pt(268, 130), pt(236, 130)], {
    height: 7, wall: WALL_COOL, roof: ROOF_SLATE, label: 'BELLHAVEN COMMUNITY CENTRE',
  });
  b.camera({ pos: pt(252, 132), facing: 90, kind: 'street', fov: 70, range: 28, sweep: 20, sweepPeriod: 10, height: 4.4, label: 'COMMUNITY CENTRE' });
  b.building('shop', [pt(408, 122), pt(452, 122), pt(452, 142), pt(408, 142)], {
    height: 5.5, wall: WALL_WARM, roof: ROOF_SAND, label: 'LAUNDRY',
  });
  b.building('shop', [pt(336, 122), pt(396, 122), pt(396, 142), pt(336, 142)], {
    height: 5.5, wall: WALL_CREAM, roof: ROOF_TERRACOTTA, label: 'CAFE',
  });
  b.cover([pt(336, 142), pt(452, 142), pt(452, 147), pt(336, 147)], 'awning', 3.4);

  // Townhouses along the north side of the avenue: a continuous wall of
  // frontage that makes the avenue feel like a street rather than a corridor.
  b.in('northgate').useSegment('S-N2');
  for (let i = 0; i < 6; i++) {
    const x = 34 + i * 32;
    b.building('house', [pt(x, 122), pt(x + 26, 122), pt(x + 26, 142), pt(x, 142)], {
      height: 6.4, wall: i % 2 === 0 ? WALL_WARM : WALL_CREAM,
      roof: i % 3 === 0 ? ROOF_SLATE : ROOF_TERRACOTTA,
      occupants: 2 + (i % 3), label: `TERRACE ${200 + i}`,
    });
    if (i % 2 === 0) {
      b.camera({ pos: pt(x + 13, 143), facing: 90, kind: 'doorbell', fov: 82, range: 18, height: 2.6, bias: 0.86, label: `TERRACE ${200 + i} DOORBELL` });
    }
  }

  // Back-garden sheds. Small, solid, and exactly the right height to duck behind.
  b.in('maple').useSegment('S-M1');
  for (const [x, y] of [[104, 212], [104, 288], [206, 212], [206, 288], [46, 222]] as Array<[number, number]>) {
    b.building('shed', [pt(x, y), pt(x + 10, y), pt(x + 10, y + 8), pt(x, y + 8)], {
      height: 2.6, wall: '#CDBBA2', roof: '#8B7355',
    });
  }

  b.in('ridgeline').useSegment('S-R1');
  b.building('school', [pt(268, 352), pt(288, 352), pt(288, 386), pt(268, 386)], {
    height: 5, wall: WALL_COOL, roof: ROOF_SLATE, label: 'RIDGELINE — ANNEX',
  });
  b.building('shed', [pt(438, 352), pt(456, 352), pt(456, 368), pt(438, 368)], {
    height: 3, wall: '#D3CDBE', roof: '#8B7355', label: 'GROUNDS STORE',
  });
  b.prop('bench', pt(300, 296)); b.prop('bench', pt(400, 296));

  // ---------------------------------------------------------------- routes
  const npcRoutes: Array<Array<{ x: number; y: number }>> = [
    [pt(70, 145), pt(155, 145), pt(220, 145), pt(155, 145)],
    [pt(300, 145), pt(380, 145), pt(460, 145), pt(380, 145)],
    [pt(300, 66), pt(380, 66), pt(460, 66), pt(380, 66)],
    [pt(290, 108), pt(440, 108), pt(440, 82), pt(290, 82)],
    [pt(160, 200), pt(160, 270), pt(160, 200)],
    [pt(120, 285), pt(220, 285), pt(120, 285)],
    [pt(30, 66), pt(145, 66), pt(220, 66), pt(145, 66)],
    [pt(270, 296), pt(430, 296), pt(270, 296)],
    [pt(112, 316), pt(140, 340), pt(100, 350), pt(112, 316)],
    [pt(232, 200), pt(232, 270), pt(232, 200)],
    [pt(462, 200), pt(462, 270), pt(462, 200)],
    [pt(310, 344), pt(440, 344), pt(310, 344)],
    [pt(66, 200), pt(66, 270), pt(66, 200)],
    [pt(340, 132), pt(340, 76), pt(340, 132)],
    [pt(200, 155), pt(200, 60), pt(200, 155)],
    [pt(475, 84), pt(528, 84), pt(528, 124), pt(475, 124)],
    [pt(60, 155), pt(60, 240), pt(60, 155)],
    [pt(410, 296), pt(410, 344), pt(410, 296)],
  ];

  const droneRoutes: Array<Array<{ x: number; y: number }>> = [
    [pt(120, 90), pt(240, 120), pt(160, 220), pt(70, 180)],
    [pt(320, 80), pt(460, 90), pt(470, 160), pt(330, 140)],
    [pt(300, 300), pt(450, 320), pt(430, 390), pt(290, 370)],
  ];

  const patrolRoutes: Array<Array<{ x: number; y: number }>> = [
    [pt(70, 150), pt(220, 150), pt(380, 150), pt(220, 150)],
    [pt(300, 280), pt(455, 280), pt(460, 195), pt(380, 150), pt(300, 150)],
  ];

  return b.build({
    bounds: { min: pt(0, 0), max: pt(560, 500) },
    spawns: {
      player: pt(158, 214),
      devon: pt(166, 222),
      dronePads: [pt(120, 90), pt(392, 88), pt(440, 320)],
      patrolStarts: [pt(70, 150), pt(300, 280)],
    },
    npcRoutes,
    droneRoutes,
    patrolRoutes,
  });
}
