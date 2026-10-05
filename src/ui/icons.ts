/**
 * The interface's icon set: one line weight, one grid, one organisation.
 *
 * Every glyph the DOM layer shows comes from here, drawn on a 16-unit grid
 * with a 1.5-unit stroke and no fills, so a pause mark, a camera and a lock
 * all read as parts of the same instrument. Nothing here is an emoji and
 * nothing is borrowed from an icon library: the set is small on purpose.
 */
const WRAP = (body: string, cls = ''): string =>
  `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  /** Two bars: the world held still. */
  pause: WRAP('<path d="M5.5 3v10M10.5 3v10"/>'),
  /** A pencil line: something written down by hand. */
  note: WRAP('<path d="M3 13l1-3.5 6.5-6.5 2.5 2.5-6.5 6.5L3 13zM9.5 4l2.5 2.5"/>'),
  /** Two things joined: a connection made. */
  link: WRAP('<path d="M6.5 9.5l3-3M5 11l-1 1a2.1 2.1 0 01-3-3l2-2a2.1 2.1 0 013 0M11 5l1-1a2.1 2.1 0 013 3l-2 2a2.1 2.1 0 01-3 0"/>'),
  /** Confirmed. */
  check: WRAP('<path d="M3 8.5l3 3 7-7"/>'),
  /** A camera housing and its lens. */
  camera: WRAP('<path d="M2 5.5h2.5l1.5-2h4l1.5 2H14v7H2z"/><circle cx="8" cy="9" r="2.4"/>'),
  /** A target: the thing the system has fixed on. */
  target: WRAP('<circle cx="8" cy="8" r="4.5"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>'),
  /** Signal: three arcs, the mark on every UNDERWATCH housing. */
  signal: WRAP('<path d="M8 12.5v.01M5.2 9.7a4 4 0 015.6 0M2.5 7a7.8 7.8 0 0111 0"/>'),
  /** Restricted. */
  lock: WRAP('<rect x="3.5" y="7" width="9" height="7"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>'),
  /** Filed away. */
  archive: WRAP('<path d="M2.5 3h11v3h-11zM3.5 6v7.5h9V6M6.5 9h3"/>'),
  /** Attention. */
  alert: WRAP('<path d="M8 2.5l6 11H2z"/><path d="M8 7v3M8 12v.01"/>'),
  /** A place. */
  pin: WRAP('<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 00-9 0C3.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.5"/>'),
  /** Next. */
  chevron: WRAP('<path d="M6 3.5L10.5 8 6 12.5"/>'),
  /** The eye: being looked at. */
  eye: WRAP('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  /** A person: a subject. */
  person: WRAP('<circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5"/>'),
  /** Sector: a quarter of the grid. */
  grid: WRAP('<path d="M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11"/>'),
  /** Close. */
  close: WRAP('<path d="M4 4l8 8M12 4l-8 8"/>'),
};

export type IconName = keyof typeof ICON;
