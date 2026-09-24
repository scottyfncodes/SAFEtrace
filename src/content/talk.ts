/**
 * What people say.
 *
 * Every conversation is a function of what has happened and what the player
 * knows, so nobody repeats themselves into a void and nobody tells you about a
 * thing you have not found a reason to ask about. Choices are few and they are
 * real: each one either writes something into the story or does nothing, and
 * the ones that do nothing say so ("Not yet").
 *
 * People speak in their own voices. Devon types in lower case because he is
 * sixteen. SAFEtrace is not in this file at all.
 */
import { CASE_HOLDS, type ReportTarget } from './case';

export interface Line { who: string; text: string }
export interface Choice { id: string; label: string }
export interface Conversation {
  lines: Line[];
  /** Clues written into the notes as this is said. */
  learn?: string[];
  choices?: Choice[];
}

export type TalkEffect =
  | { kind: 'intervene' }
  | { kind: 'stand-back' }
  | { kind: 'report'; to: ReportTarget }
  | { kind: 'told-carvalho' }
  | { kind: 'none' };

export interface TalkContext {
  matched: boolean;
  devonStopped: boolean;
  devonReleased: boolean;
  /** null until the player has made the call at the stop. */
  intervened: boolean | null;
  has(id: string): boolean;
  /** Deductions made, of any kind. */
  deductions: number;
  /** Connections the player could make now from what they hold. */
  openConnections: number;
  strength: number;
  onRecord: boolean;
  misled: boolean;
  report: ReportTarget | null;
  /** How many times the player has already spoken to this person. */
  times: number;
  toldCarvalho: boolean;
}

const LEAVE: Choice = { id: 'leave', label: 'See you.' };
const NOT_YET: Choice = { id: 'not-yet', label: 'Not yet.' };

export const PEOPLE_NAMES: Record<string, string> = {
  devon: 'Devon',
  mara: 'Mara Okonjo',
  carvalho: 'Mrs. Carvalho',
  brennan: 'Mr. Brennan',
  courier: 'Courier',
  priya: 'Priya Venn',
  officer: 'Officer',
};

const say = (who: string, ...texts: string[]): Line[] => texts.map((text) => ({ who, text }));

// ----------------------------------------------------------------------- open

export function openConversation(id: string, c: TalkContext): Conversation {
  switch (id) {
    case 'devon': return devon(c);
    case 'mara': return mara(c);
    case 'carvalho': return carvalho(c);
    case 'brennan': return brennan(c);
    case 'courier': return courier(c);
    case 'priya': return priya(c);
    case 'officer': return officer(c);
    default: return { lines: [] };
  }
}

function devon(c: TalkContext): Conversation {
  const who = 'Devon';
  if (c.report) {
    return { lines: say(who, c.report === 'dropped'
      ? "thanks. for real. can we just skate somewhere nobody's looking."
      : "my mum read it. she cried a bit. the good kind, i think.") };
  }
  if (c.devonStopped) {
    if (c.intervened) {
      return { lines: say(who, "they want me to wait. it's fine.", "the camera on the apron. the little light came on when we went down. it saw us. remember that."), learn: ['c-apron'] };
    }
    return { lines: say(who, "don't. seriously. just wait over there.", "it's fine. it's fine, they just want to check.") };
  }
  if (!c.matched) {
    const banter = [
      "the channel's dry. we should go before someone fixes it.",
      "you're slow today. is that a new bearing noise or is that your knees.",
      "tomas says northgate's got a new ledge behind the parade. we should look sometime.",
    ];
    return { lines: say(who, banter[c.times % banter.length]) };
  }
  if (!c.devonReleased) {
    return { lines: say(who, "it says northgate. we've been down here an hour. how does it say northgate.") };
  }
  // Released, and home.
  const lines: Line[] = [];
  const learn: string[] = [];
  if (c.times === 0) {
    lines.push(...say(who, "they let me go. 'no further action.' my mum's furious. not at them. at me, for being there."));
    if (c.intervened) lines.push(...say(who, "you didn't have to step in back there. ...thanks. they wrote your name down too, you know."));
  }
  if (!c.has('c-apron')) {
    lines.push(...say(who, "you know what's stupid? the camera on the apron saw us go down. i watched the little light come on. it knows exactly where i was."));
    learn.push('c-apron');
  } else if (c.times > 0) {
    lines.push(...say(who, c.deductions > 2
      ? "you're actually doing this, huh."
      : "you've got that face on. the one before you drop in on something too big."));
  }
  return {
    lines, learn,
    choices: [
      { id: 'cousin', label: 'Your cousin lives on Northgate Lane?' },
      { id: 'drop', label: "I'm going to let it go." },
      LEAVE,
    ],
  };
}

function mara(c: TalkContext): Conversation {
  const who = 'Mara';
  if (c.report === 'mara') return { lines: say(who, "People keep stopping. I've had to wash the glass twice. Don't you dare stop being annoying.") };
  if (c.report) return { lines: say(who, 'Whatever you did, you did something. Most people never do.') };
  if (!c.matched) {
    const lines = [
      "That deck's delaminating. Bring it in some time and I'll do the trucks for free.",
      "Go on, the plaza's quiet this time of day. Mind the cameras on the cinema — they're new.",
    ];
    return { lines: say(who, lines[c.times % lines.length]) };
  }
  if (c.times === 0 || !c.has('c-mara')) {
    return {
      lines: say(who,
        "I heard. Devon's mum rang me. I've known that boy since he was nine and couldn't ollie a crack.",
        "You want to know how it decided? I watched them fit half those cameras. Everything Northgate sees goes out through a cabinet at Relay 12 — the haulage yard, far end of East Avenue.",
        "And the camera that took the frame will tell you where the frame went. The app lets anyone read the box they're standing next to. They call that transparency.",
      ),
      learn: ['c-mara'],
      choices: showChoices(c),
    };
  }
  const nudge = c.deductions === 0 && c.openConnections === 0
    ? 'Write down everything. Then go and stand in the places it happened. People forget; places don\'t.'
    : c.openConnections > 0
      ? "You've got more than you think. Put the pieces next to each other and read them again."
      : c.strength >= CASE_HOLDS
        ? "That's not a theory any more, is it. The question is who you show it to."
        : 'Keep going. The honest version is always longer than the one on the alert.';
  return { lines: say(who, nudge), choices: showChoices(c) };
}

function showChoices(c: TalkContext): Choice[] {
  return c.devonReleased && c.deductions > 0 ? [{ id: 'show', label: 'Show her your notes.' }, LEAVE] : [LEAVE];
}

function carvalho(c: TalkContext): Conversation {
  const who = 'Mrs. Carvalho';
  if (c.times === 0) {
    return {
      lines: say(who,
        "Are you with the— no, you're a child. Sorry. There have been a lot of people.",
        "I didn't report anything. I was at work. The app did it for me — 'on your behalf', it said.",
        "Nothing's gone. Except a parcel I've been waiting for all week, and that was never here to steal.",
      ),
      learn: ['c-resident'],
      choices: parcelChoice(c),
    };
  }
  if (c.toldCarvalho) return { lines: say(who, "They had that poor boy's face on every phone in the street. Over a parcel.") };
  return { lines: say(who, "I keep looking at the door. It's my door. It doesn't feel like my door."), choices: parcelChoice(c) };
}

function parcelChoice(c: TalkContext): Choice[] | undefined {
  return c.has('c-parcel') && !c.toldCarvalho ? [{ id: 'parcel', label: "Your parcel's next door, at 16." }, LEAVE] : undefined;
}

function brennan(c: TalkContext): Conversation {
  const who = 'Mr. Brennan';
  if (c.times === 0) {
    return {
      lines: say(who,
        'Terrible business. Terrible. On this street.',
        "It was the Araya boy. I saw him outside fourteen, clear as day. I'd know him anywhere.",
      ),
      learn: ['c-brennan'],
    };
  }
  if (c.has('c-alert')) {
    return {
      lines: say(who, 'Back again?'),
      choices: [{ id: 'alert', label: 'Did you see him — or the alert?' }, LEAVE],
    };
  }
  return { lines: say(who, "Kids these days. I said it to the officer and I'll say it to you: clear as day.") };
}

function courier(c: TalkContext): Conversation {
  const who = 'Courier';
  if (c.has('c-courier')) return { lines: say(who, "Can't stop, mate. Forty-one drops and the van's in a bus lane.") };
  if (!c.matched) return { lines: say(who, "You all right? Don't skate in the road, yeah?") };
  return {
    lines: say(who,
      "Northgate? Yeah, I had one for fourteen earlier.",
      "Doorbell told me it was a 'secure address' — no porch drops. So I picked it back up off the step and left it at sixteen.",
      'Twenty to five, maybe? Hood up. It was spitting. Why — they complain?',
    ),
    learn: ['c-courier'],
  };
}

function priya(c: TalkContext): Conversation {
  const who = 'Priya Venn';
  if (c.report === 'priya') {
    return { lines: say(who, c.strength >= CASE_HOLDS
      ? "It's open. It'll take weeks, and it'll be boring, and it'll be on his record in a good way. Go home."
      : "I've logged it. I mean that. I'm sorry it isn't more.") };
  }
  const lines: Line[] = [];
  if (c.times === 0) {
    lines.push(...say(who,
      "Hi — Priya. Regional operations. I run these drop-ins because people deserve to be able to ask questions.",
      "I can't discuss anyone's individual record. But I can tell you the system is working as designed.",
    ));
  }
  if (c.has('c-review')) {
    lines.push(...say(who, "You've read Review 11-04? Then you know that was parents, asking for their children. I signed it because they were right about the harms."));
  } else if (c.times > 0) {
    lines.push(...say(who, 'Association is not an accusation. A match is not a charge. I say that a lot, because it matters.'));
  }
  return { lines, choices: c.deductions > 0 ? [{ id: 'show', label: 'Show her your notes.' }, LEAVE] : [LEAVE] };
}

function officer(c: TalkContext): Conversation {
  const who = 'Officer';
  if (c.intervened === null && c.devonStopped) {
    return {
      lines: say(who, 'Just a check, this. Step back for me, please.'),
      choices: [
        { id: 'intervene', label: "He's been with me all afternoon." },
        { id: 'stand-back', label: 'Okay.' },
      ],
    };
  }
  return { lines: say(who, c.devonStopped ? "Won't be long. Step back, please." : 'Afternoon.') };
}

// --------------------------------------------------------------------- choose

export function chooseOption(
  id: string, choice: string, c: TalkContext,
): { conversation: Conversation; effect: TalkEffect } {
  const none: TalkEffect = { kind: 'none' };
  if (choice === 'leave') return { conversation: { lines: [] }, effect: none };
  if (choice === 'not-yet') {
    const who = PEOPLE_NAMES[id] ?? '';
    return { conversation: { lines: say(who, id === 'devon' ? 'yeah. okay.' : 'Take your time. It is not going anywhere.') }, effect: none };
  }

  if (id === 'officer') {
    if (choice === 'intervene') {
      return {
        conversation: { lines: say('Officer', "Then you'll be a party present. Name?", "...Thank you. That's logged.") },
        effect: { kind: 'intervene' },
      };
    }
    return { conversation: { lines: say('Officer', "Won't be long.") }, effect: { kind: 'stand-back' } };
  }

  if (id === 'devon') {
    if (choice === 'cousin') {
      return { conversation: { lines: say('Devon', "tomas. number 22. i'm there like twice a week. forty-one times, apparently.", "that's why, isn't it. it's not my face. it's where i go.") }, effect: none };
    }
    if (choice === 'drop') {
      return {
        conversation: {
          lines: say('Devon', "yeah?"),
          choices: [{ id: 'drop-confirm', label: "Yeah. I'm letting it go." }, { id: 'not-yet', label: 'Actually — not yet.' }],
        },
        effect: none,
      };
    }
    if (choice === 'drop-confirm') {
      return {
        conversation: { lines: say('Devon', 'okay.', "...okay. thanks. i mean it. my mum says it just makes it worse, when you push.") },
        effect: { kind: 'report', to: 'dropped' },
      };
    }
  }

  if (id === 'mara') {
    if (choice === 'show') {
      const lines: Line[] = [];
      if (c.strength >= CASE_HOLDS) {
        lines.push(...say('Mara', "...Right.", "This isn't a theory, is it. It's their own records, in their own order. Nobody's put them side by side before."));
      } else {
        lines.push(...say('Mara', "It's a lot of maybes, love. People will read it as you sticking up for your mate. Which you are."));
      }
      if (c.misled) lines.push(...say('Mara', "And the neighbour who says he saw him — are you sure about that bit? Because that's the bit they'll check first."));
      if (c.onRecord) lines.push(...say('Mara', "They've got you on file now, too. Somebody will bring that up."));
      lines.push(...say('Mara', 'I can put it in my window. Everybody walks past this shop. But once it is up, it is up.'));
      return {
        conversation: { lines, choices: [{ id: 'window', label: 'Put it in your window.' }, NOT_YET] },
        effect: none,
      };
    }
    if (choice === 'window') {
      return {
        conversation: { lines: say('Mara', "Get me the marker. The big one.") },
        effect: { kind: 'report', to: 'mara' },
      };
    }
  }

  if (id === 'priya' ) {
    if (choice === 'show') {
      const lines: Line[] = [];
      if (c.strength >= CASE_HOLDS) {
        lines.push(...say('Priya Venn',
          '...',
          "Where did you get the drainage log? No — don't tell me. It's ours. That's the point, isn't it.",
          "This is a misattribution. I can't delete a record — nobody can, that's the design. But I can open a review, and a review goes on the record too.",
        ));
      } else {
        lines.push(...say('Priya Venn',
          'I can see how much you care about your friend.',
          "But association isn't an accusation, and a match isn't a charge. If you want this looked at properly, I'd need more than this.",
        ));
      }
      if (c.misled) lines.push(...say('Priya Venn', "And you've got an eyewitness here who puts him on the street. You understand that works against you."));
      if (c.onRecord) lines.push(...say('Priya Venn', "You're on file yourself, from today. That makes you a party to this, not a witness."));
      return {
        conversation: { lines, choices: [{ id: 'review', label: 'Ask her to open a review.' }, NOT_YET] },
        effect: none,
      };
    }
    if (choice === 'review') {
      return {
        conversation: { lines: say('Priya Venn', c.strength >= CASE_HOLDS ? 'Okay. Okay. Give me your notes.' : "I'll log it. That's what I can do.") },
        effect: { kind: 'report', to: 'priya' },
      };
    }
  }

  if (id === 'carvalho' && choice === 'parcel') {
    return {
      conversation: { lines: say('Mrs. Carvalho', '...At sixteen?', "Oh, for— so the 'burglar' was the delivery. They had that poor boy's face on every phone in the street. Over a parcel.") },
      effect: { kind: 'told-carvalho' },
    };
  }

  if (id === 'brennan' && choice === 'alert') {
    return {
      conversation: { lines: say('Mr. Brennan', "I— well. It came up on the phone. With his picture. And then I looked out, and...", 'There was someone. There was definitely someone.') },
      effect: none,
    };
  }

  return { conversation: { lines: [] }, effect: none };
}
