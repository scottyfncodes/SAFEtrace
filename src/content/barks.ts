/**
 * What you overhear.
 *
 * Bellhaven talks to itself whether or not the player is listening. Skate
 * slowly past two neighbours and you catch a line of it — and what the town is
 * saying changes as the afternoon does: the weather, then the burglary, then
 * the boy, then whatever the player did about it.
 *
 * Some of it is useful. Some of it is wrong in exactly the way a town is wrong
 * about a thing it read on its phone. None of it is addressed to you.
 */
export type BarkPhase = 'before' | 'matched' | 'released' | 'reported';

export interface Bark {
  id: string;
  phase: BarkPhase;
  /** Only in this district, if set. */
  district?: string;
  /** Spoken from a fixed place (a public-address speaker), not by a passer-by. */
  at?: { x: number; y: number };
  lines: string[];
  /** Only after this report, for the reported phase. */
  after?: 'priya' | 'mara' | 'dropped';
  /**
   * Said in any phase, but only in a district that has had this kind of
   * trouble recently (see surveillance/disturbance.ts). This is one of the
   * ways the player finds out they have been loud: the neighbours say so.
   */
  trouble?: 'noise' | 'broken' | 'tamper';
}

export const BARKS: Bark[] = [
  // ------------------------------------------------------------- before
  { id: 'b-weather', phase: 'before', lines: ["Lovely out, isn't it.", "App says clear till evening."] },
  { id: 'b-score', phase: 'before', district: 'maple', lines: ['Our street went up to 94 this month.', "Did it? Must be the new doorbell."] },
  { id: 'b-plaza', phase: 'before', district: 'commons', lines: ['They put two more cameras on the cinema.', "Good. Kids were sitting on the steps."] },
  { id: 'b-school', phase: 'before', district: 'ridgeline', lines: ['Did you sign the SCHOOL form?', "You don't sign it. You're just in it."] },
  { id: 'b-pa-before', phase: 'before', at: { x: 356, y: 70 }, lines: ['SAFEtrace CARE: Bellhaven Commons is a safe space. Thank you for keeping it that way.'] },

  // ------------------------------------------------------------ matched
  { id: 'b-burglary', phase: 'matched', lines: ['Did you get the alert? Northgate.', 'A burglary. In the afternoon. On Northgate Lane.'] },
  { id: 'b-kid', phase: 'matched', district: 'commons', lines: ["They're saying it was a kid from Ridgeline.", 'One of the skaters. It had his name and everything.'] },
  { id: 'b-photo', phase: 'matched', district: 'maple', lines: ["That's the Araya boy, isn't it. From the alert.", "He's always been polite to me."] },
  { id: 'b-pa-alert', phase: 'matched', at: { x: 84, y: 97 }, lines: ['SAFEtrace CARE: Northgate residents — a person of interest has been identified. Please remain aware.'] },

  // ----------------------------------------------------------- released
  { id: 'b-carvalho', phase: 'released', district: 'northgate', lines: ["Ines is back from work. Says she never called anybody.", "Then who did?"] },
  { id: 'b-courier', phase: 'released', district: 'northgate', lines: ["That courier's been up and down the Lane all day.", 'Hood up, in this. Poor sod.'] },
  { id: 'b-brennan', phase: 'released', district: 'northgate', lines: ["Gerald says he saw the boy himself.", 'Gerald says a lot of things.'] },
  { id: 'b-dropin', phase: 'released', district: 'commons', lines: ["There's a SAFEtrace woman at the community centre tonight.", 'A drop-in. You can ask her things, apparently.'] },
  { id: 'b-devon-home', phase: 'released', district: 'maple', lines: ["They let the Araya boy go. He's home.", 'His mum was out on the drive for an hour.'] },
  { id: 'b-relay', phase: 'released', district: 'relay', lines: ['Half the cameras in town come through that shed.', 'Nobody told us. They just turned up.'] },
  { id: 'b-channel', phase: 'released', district: 'channel', lines: ["There's a camera on the apron now. Wasn't there when I was a kid.", 'Floods, they said.'] },

  // ----------------------------------------------------------- reported
  { id: 'b-window', phase: 'reported', after: 'mara', lines: ["Have you read the thing in Okonjo's window?", 'The parcel bit. Tell me that isn\'t true.'] },
  { id: 'b-window-2', phase: 'reported', after: 'mara', district: 'commons', lines: ["There's a petition going round. Put the number back to 99.", "I signed the first one. I'll sign this one too."] },
  { id: 'b-review', phase: 'reported', after: 'priya', lines: ['The app says there\'s a review. About the Northgate thing.', "A review. So it's fine, then."] },
  { id: 'b-dropped', phase: 'reported', after: 'dropped', lines: ['Whatever happened with that boy?', "Nothing. It's in the past."] },

  // ------------------------------------------------------------ trouble
  { id: 'b-bangs', phase: 'before', trouble: 'noise', lines: ["That's the third bang this afternoon.", 'Kids. Or the bins. Or kids in the bins.'] },
  { id: 'b-clatter', phase: 'before', trouble: 'noise', lines: ['Something keeps clattering out the front.', "The app says it's logged. So that's all right, then."] },
  { id: 'b-camera-down', phase: 'before', trouble: 'broken', lines: ["The camera on the corner's gone dark.", "They'll have somebody out. They always do."] },
  { id: 'b-two-more', phase: 'before', trouble: 'broken', lines: ['Somebody broke the one by the post box.', "Now they'll put up two."] },
  { id: 'b-doorbell', phase: 'before', trouble: 'tamper', lines: ['My doorbell said it was offline for a minute.', 'Mine said everything was normal. Which is worse?'] },
];

/** How long a line hangs in the air, and how long the town is quiet after. */
export const BARK_LINE_SECONDS = 3.4;
export const BARK_GAP_SECONDS = 22;
/** You hear people about this far away, if you are not tearing past them. */
export const BARK_RANGE = 10;
export const BARK_MAX_SPEED = 6.5;
