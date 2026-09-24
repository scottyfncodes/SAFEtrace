/**
 * The people of Bellhaven who have names, and the places worth a second look.
 *
 * Authored against the same builder as the geometry, and placed against it:
 * every position here is a doorstep, a shopfront or a shelter that already
 * exists in the town, because the fastest way to make a place feel lived in is
 * to put somebody on its front step.
 *
 * Most of it starts hidden. The afternoon puts people out — a woman comes home
 * from work to a taped-off drive, a courier works the Lane, a regional
 * operations lead runs a drop-in — and takes them back in again.
 */
import type { TownBuilder } from './builder';
import { pt } from './builder';

/** Northgate Lane's north side, west to east, by house number. */
export const NORTHGATE_NUMBERS: Array<[number, number]> = [[40, 10], [85, 12], [130, 14], [175, 16], [215, 18]];

/** Where Devon lives: the west-facing house on the east side of Maple Court. */
export const DEVON_HOME = pt(174.5, 272.4);

export function authorCast(b: TownBuilder): void {
  // ---------------------------------------------------------------- northgate
  b.in('northgate');
  // No. 14: the house that reported the burglary. Everything on its porch.
  b.sceneProp('sp-panel', 'screen', pt(126.6, 34.25), { rot: 90, w: 0.55, z: 1.45, tint: '#1D2A33', visible: false });
  b.place('p-panel', pt(126.6, 35.9), 'Door panel', { reach: 2.8, visible: false, sceneProp: 'sp-panel' });
  b.sceneProp('sp-tape', 'tape', pt(130, 46.4), { rot: 0, w: 6.4, z: 0.95, tint: '#E8C33A', visible: false });
  b.place('p-tape', pt(130, 48.2), 'Tape', { reach: 3.4, visible: false, sceneProp: 'sp-tape' });
  // No. 16: where the parcel went.
  b.sceneProp('sp-parcel', 'parcel', pt(172.2, 35.3), { rot: 12, w: 0.6, tint: '#B98A5E', visible: false });
  b.place('p-parcel', pt(172.2, 36.6), 'Parcel', { reach: 2.6, visible: false, sceneProp: 'sp-parcel' });
  // The Vine Street shelter, and the screen on the side of it.
  b.sceneProp('sp-alert', 'screen', pt(75.75, 101), { rot: 180, w: 1.6, z: 1.5, tint: '#E9F1F4', text: 'ALERT', visible: false });
  b.place('p-alert', pt(73.8, 101), 'Shelter screen', { reach: 3.2, visible: false, sceneProp: 'sp-alert' });

  b.person('carvalho', 'Mrs. Carvalho', '14 Northgate Lane', pt(134.2, 43.2), 90, '#3F7C8C', { visible: false });
  b.person('brennan', 'Mr. Brennan', '12 Northgate Lane', pt(89, 43.8), 120, '#8C7A5B', { visible: false });
  b.person('courier', 'Courier', 'Parcels', pt(214, 65.5), 180, '#E6C229', {
    visible: false, hood: true,
    route: [pt(214, 65.5), pt(176, 65.5), pt(118, 65.5), pt(176, 65.5)],
  });
  // The officer who stops Devon. Placed by the story when he is needed.
  b.person('officer', 'Officer', 'SAFEtrace CITY Partner', pt(196, 400), 90, '#28374D', { visible: false, uniform: true });

  // ------------------------------------------------------------------ commons
  b.in('commons');
  b.person('mara', 'Mara Okonjo', 'Okonjo Cycle & Board', pt(396, 53.2), 90, '#B0634A', {
    route: [pt(396, 53.2), pt(404, 53.6), pt(388, 53.4)],
  });
  b.sceneProp('sp-window', 'poster', pt(412, 48.25), { rot: 90, w: 2.2, z: 1.5, tint: '#F4EFE4', text: 'BOARDS FIXED' });
  b.place('p-window', pt(412, 50.6), 'Shop window', { reach: 2.8, sceneProp: 'sp-window' });
  b.sceneProp('sp-window-case', 'poster', pt(420, 48.25), { rot: 90, w: 3.6, z: 1.5, tint: '#FFFFFF', text: 'NOT A MATCH', visible: false });
  b.place('p-window-case', pt(420, 50.6), 'Shop window', { reach: 3.0, visible: false, sceneProp: 'sp-window-case' });
  // The drop-in, advertised from the first frame of play.
  b.sceneProp('sp-dropin', 'poster', pt(244, 130.3), { rot: 90, w: 1.4, z: 1.55, tint: '#2C8C8C', text: 'DROP-IN' });
  b.place('p-dropin', pt(244, 132.6), 'Poster', { reach: 2.8, sceneProp: 'sp-dropin' });
  b.person('priya', 'Priya Venn', 'SAFEtrace Regional Operations', pt(257, 134.2), 90, '#7C5A8E', { visible: false });

  // ------------------------------------------------------------------ channel
  b.in('channel');
  b.sceneProp('sp-graffiti', 'graffiti', pt(240, 425.2), { rot: 90, w: 6, z: 1.25, tint: '#D45A7A', text: "SMILE — YOU'RE PREDICTED" });
  b.place('p-graffiti', pt(240, 428.4), 'Wall', { reach: 3.6, sceneProp: 'sp-graffiti' });

  // ---------------------------------------------------------------- ridgeline
  b.in('ridgeline');
  b.sceneProp('sp-enrol', 'notice', pt(337.6, 291.2), { rot: 270, w: 0.9, z: 1.3, tint: '#F4F1E8', text: 'SCHOOL' });
  b.place('p-enrol', pt(337.6, 288.8), 'Gate sign', { reach: 2.8, sceneProp: 'sp-enrol' });

  // -------------------------------------------------------------------- maple
  b.in('maple');
  b.sceneProp('sp-devon-board', 'board', pt(176.3, 266.6), { rot: 0, w: 0.9, tint: '#5FBF52', visible: false });
  b.place('p-devon-board', pt(175, 266.8), "Devon's board", { reach: 2.4, visible: false, sceneProp: 'sp-devon-board' });
}
