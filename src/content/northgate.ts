/**
 * Northgate.
 *
 * The older half of Bellhaven, and the place the story points at. It is
 * authored as its own module against the same builder the rest of the town
 * uses: no new geometry kinds, no new sensor types, no new verbs. If a district
 * cannot be added this way, the architecture has failed, and that is what this
 * slice exists to find out.
 *
 * Two ideas shape it.
 *
 * The first is that Northgate is *older* than Maple Court. Terraces back onto a
 * service alley, houses have detached garages, and the shops are a parade
 * rather than a plaza. That geometry produces something Maple Court does not
 * have: a continuous route behind the houses that no planner ever drew.
 *
 * The second is that the camera the player has come to read — CM-207 — faces
 * the street. Everything about the district is arranged so that the obvious way
 * to reach it is the way it is looking.
 */
import type { TownBuilder } from './builder';
import { pt } from './builder';

const ROOF_TERRACOTTA = '#C4714E';
const ROOF_SLATE = '#56626E';
const ROOF_SAND = '#B98A5E';
const WALL_CREAM = '#EDE0C8';
const WALL_COOL = '#DCE4E8';
const BRICK = '#B4735C';

/** The rear service alley: the spine of the district's alternative route. */
export const SABLE_LANE_Y = 112;
/** Where the garage row breaks, and the only way north to CM-207 from behind. */
export const SABLE_GAP_X = 144;

export function authorNorthgate(b: TownBuilder): void {
  b.in('northgate').useSegment('S-N2');
  b.rectSurface(10, 6, 246, 138, 'grass', 0);

  // ------------------------------------------------------------- the street
  const houses: Array<[number, number, number, string]> = [
    [40, 30, 0, ROOF_SLATE], [85, 30, 0, ROOF_TERRACOTTA], [130, 30, 0, ROOF_SAND],
    [175, 30, 0, ROOF_SLATE], [215, 30, 0, ROOF_TERRACOTTA],
    [45, 95, 180, ROOF_TERRACOTTA], [100, 95, 180, ROOF_SLATE], [180, 95, 180, ROOF_SAND],
  ];
  for (const [x, y, rot, roof] of houses) {
    b.house({
      at: pt(x, y), w: 10, d: 8, rot, roof, wall: WALL_CREAM,
      occupants: 2 + ((x + y) % 4),
      drivewayDir: y < 60 ? 90 : 270,
      camera: { facing: y < 60 ? 90 : 270, range: 21, fov: 70 },
    });
  }

  /*
   * CM-207. The camera that produces the match.
   *
   * It faces north, across Northgate Lane. There is nothing wrong with it, and
   * that is the entire point of the story — but it also means that walking up
   * the street to read it is walking into it.
   */
  b.camera({
    id: 'CM-207', pos: pt(145, 88), facing: 270, kind: 'street',
    fov: 80, range: 34, sweep: 22, sweepPeriod: 13, height: 4.6, bias: 0.97,
    label: 'NORTHGATE LN / VINE — STREET',
    records: [
      'FEED: NOMINAL',
      'NO FAULT RECORDED — 411 DAYS',
      'FRAME 04:41:07 CAPTURED, RELAYED VIA JX-207',
      'SERVICES: SVC-VISION, SVC-PREDICT',
    ],
  });
  b.junction(pt(112, 88), 'NORTHGATE JUNCTION', 'JX-207', [
    'SEGMENT S-N2 — 14 NODES',
    'FRAME 04:41:07 DELIVERED TO SVC-VISION IN 240 MS',
    'NO RETRANSMISSION, NO LOSS, NO DEGRADATION',
    'SELF-HEAL: 90S',
  ]);
  b.link('CM-207', 'JX-207');
  b.link('CM-207', 'SVC-VISION');
  b.link('CM-207', 'SVC-PREDICT');
  b.link('JX-207', 'TX-2');
  b.plateReader(pt(222, 62), 'NORTHGATE LN — PLATE READER');

  // Two street cameras, half a cycle out of phase, so the seam between them
  // travels. Learning where it is at a given moment is the whole skill.
  b.camera({
    pos: pt(74, 52), facing: 90, kind: 'street', fov: 78, range: 30,
    sweep: 30, sweepPeriod: 11, sweepPhase: 0, height: 4.4, bias: 0.94,
    label: 'NORTHGATE LN — WEST',
  });
  b.camera({
    pos: pt(200, 52), facing: 90, kind: 'street', fov: 78, range: 30,
    sweep: 30, sweepPeriod: 11, sweepPhase: 0.5, height: 4.4, bias: 0.94,
    label: 'NORTHGATE LN — EAST',
  });

  // ------------------------------------------------------------- the terraces
  for (let i = 0; i < 6; i++) {
    const x = 34 + i * 32;
    b.building('house', [pt(x, 122), pt(x + 26, 122), pt(x + 26, 142), pt(x, 142)], {
      height: 6.4, wall: i % 2 === 0 ? '#F0E3D0' : WALL_CREAM,
      roof: i % 3 === 0 ? ROOF_SLATE : ROOF_TERRACOTTA,
      occupants: 2 + (i % 3), label: `TERRACE ${200 + i}`,
    });
    if (i % 2 === 0) {
      b.camera({
        pos: pt(x + 13, 143), facing: 90, kind: 'doorbell', fov: 82, range: 18,
        height: 2.6, bias: 0.86, label: `TERRACE ${200 + i} DOORBELL`,
      });
    }
  }

  // --------------------------------------------------- the parade and the yard
  b.rectSurface(222, 36, 30, 46, 'roughConcrete', 1, true);
  b.building('shop', [pt(226, 40), pt(248, 40), pt(248, 58), pt(226, 58)], {
    height: 6.2, wall: BRICK, roof: ROOF_SLATE, label: 'NORTHGATE PARADE — GROCER',
  });
  b.building('shop', [pt(226, 62), pt(248, 62), pt(248, 78), pt(226, 78)], {
    height: 6.0, wall: WALL_COOL, roof: ROOF_SAND, label: 'NORTHGATE PARADE — LAUNDERETTE',
  });
  b.cover([pt(222, 58), pt(248, 58), pt(248, 62), pt(222, 62)], 'awning', 3.4);
  b.camera({
    pos: pt(224, 49), facing: 180, kind: 'street', fov: 70, range: 24,
    height: 4.2, bias: 0.9, label: 'NORTHGATE PARADE — SHOPFRONT',
  });
  b.camera({
    pos: pt(224, 70), facing: 180, kind: 'doorbell', fov: 84, range: 16,
    height: 2.6, bias: 0.86, label: 'NORTHGATE PARADE — SERVICE DOOR',
  });
  b.prop('bin', pt(232, 60)); b.prop('bin', pt(240, 60));
  b.ammoCache(pt(236, 84), 'NORTHGATE PARADE');

  /*
   * The substation. It carries the alley's cameras on their own segment, which
   * is the district's one topology lesson: the street and the alley do not fail
   * together, and knowing which junction serves which is worth more than
   * knocking either one down.
   */
  b.segment('S-N3', 'TX-2', 'NORTHGATE — REAR SERVICE');
  b.rectSurface(224, 14, 28, 24, 'gravel', 2);
  b.building('utility', [pt(228, 18), pt(246, 18), pt(246, 32), pt(228, 32)], {
    height: 4.0, wall: '#D8D3C4', roof: '#9AA0A6', label: 'NORTHGATE SUBSTATION',
  });
  b.fence(pt(224, 14), pt(252, 14));
  b.fence(pt(252, 14), pt(252, 38));
  b.junction(pt(232, 36), 'REAR SERVICE JUNCTION', 'JX-N3');
  b.link('JX-N3', 'TX-2');
  b.camera({
    pos: pt(226, 16), facing: 135, kind: 'facility', fov: 66, range: 24,
    sweep: 28, sweepPeriod: 8, height: 4.4, bias: 0.88,
    label: 'SUBSTATION — PERIMETER',
  });
  b.prop('sign', pt(226, 12), 0, { tint: 'SAFEtrace CITY — RESTRICTED' });

  // ------------------------------------------------------------- Sable Lane
  /*
   * The rear service alley. Paved, obvious on the ground, and — like the
   * greenway paths and the Channel — deliberately not on the road graph, so a
   * forecast cannot follow anyone down it.
   *
   * Its garages break in one place. That gap comes out behind CM-207.
   */
  b.path([pt(28, SABLE_LANE_Y), pt(226, SABLE_LANE_Y)], 4.2, 'smoothConcrete');

  const garages: Array<[number, number]> = [[36, 52], [76, 92], [104, 120], [168, 184], [198, 214]];
  for (const [x0, x1] of garages) {
    b.building('garage', [pt(x0, 103), pt(x1, 103), pt(x1, 109), pt(x0, 109)], {
      height: 3.0, wall: '#CDBBA2', roof: '#8B7355', label: 'GARAGE',
    });
  }
  // Two of them have carports over the standing. A drone loses you under these.
  b.cover([pt(74, 100), pt(94, 100), pt(94, 110), pt(74, 110)], 'carport', 3.2);
  b.cover([pt(166, 100), pt(186, 100), pt(186, 110), pt(166, 110)], 'carport', 3.2);

  b.building('shed', [pt(60, 116), pt(140, 116), pt(140, 121), pt(60, 121)], {
    height: 2.8, wall: '#C6BFAE', roof: '#8B7355', label: 'LOCK-UPS 1—9',
  });
  b.building('shed', [pt(152, 116), pt(214, 116), pt(214, 121), pt(152, 121)], {
    height: 2.8, wall: '#C6BFAE', roof: '#8B7355', label: 'LOCK-UPS 10—16',
  });

  // The one camera that watches the alley itself, and the one that watches the
  // way in from Aspen. Between them they leave the middle uncovered — which is
  // where the gap in the garages happens to be.
  b.useSegment('S-N3');
  b.camera({
    pos: pt(111, 115), facing: 270, kind: 'facility', fov: 60, range: 20,
    height: 3.4, bias: 0.80, label: 'SABLE LANE — MID',
  });
  // Angled across the mouth rather than straight down the lane, so it covers
  // both the way in and a stretch of the run — and sweeps between them, which
  // is the seam a player learns to use.
  b.camera({
    pos: pt(222, 104), facing: 125, kind: 'facility', fov: 60, range: 26,
    sweep: 24, sweepPeriod: 9, height: 4.0, bias: 0.72,
    label: 'SABLE LANE — EAST ACCESS',
  });

  // The bus shelter on Vine, watching where the alley crosses the street. The
  // third way in, and the one that costs the most.
  b.building('structure', [pt(76, 99), pt(86, 99), pt(86, 103), pt(76, 103)], {
    height: 2.8, wall: '#C6C0B2', roof: '#9E9788', label: 'VINE ST SHELTER',
  });
  b.camera({
    pos: pt(81, 98), facing: 150, kind: 'street', fov: 70, range: 24,
    height: 3.8, bias: 0.88, label: 'VINE ST — SHELTER',
  });
  b.speaker(pt(81, 97), 'VINE ST — PUBLIC ADDRESS');

  b.useSegment('S-N2');
  b.building('civic', [pt(20, 66), pt(32, 66), pt(32, 80), pt(20, 80)], {
    height: 4.2, wall: WALL_COOL, roof: ROOF_SLATE, label: 'NORTHGATE EXCHANGE',
  });

  // ---------------------------------------------------------------- dressing
  // A kerb cut into the alley, and a loading drop off the lock-ups: enough to
  // skate, not so much that the district becomes a park.
  b.kicker(pt(30, 112), 8, 6, 0, 3.2);
  b.feature('drop', [pt(140, 116), pt(152, 116), pt(152, 121), pt(140, 121)], 180, 0.9, 0);

  b.trees([pt(24, 90), pt(132, 98), pt(158, 98), pt(222, 128), pt(46, 128)]);
  b.prop('bin', pt(118, 45)); b.prop('bin', pt(160, 45));
  b.prop('bin', pt(58, 108)); b.prop('bin', pt(150, 108)); b.prop('bin', pt(192, 108));
  b.prop('hydrant', pt(96, 66)); b.prop('hydrant', pt(196, 108));
  b.prop('car', pt(52, 47), Math.PI / 2, { tint: '#4E7FA8' });
  b.prop('car', pt(190, 47), Math.PI / 2, { tint: '#D96C5F' });
  b.prop('car', pt(64, 106), 0, { tint: '#6FA36B' });
  b.prop('cone', pt(226, 106)); b.prop('cone', pt(226, 118));
  b.prop('mailbox', pt(236, 36), 0);
}
