# 36 — An afternoon with an ending

Twelfth pass, and the first one whose brief was "finished" rather than
"playtestable". The audit found a slice that worked and a game that stopped:
after the player read the six records, the advertisement played again and
the town went back to being a town with nothing left in it.

## What the audit found

| | Finding |
| --- | --- |
| **Broken** | Pressing Enter on the preferences card also skipped the whole advertisement — Enter is a skip key and the same press landed on the next frame. Nobody who used a keyboard had seen the opening. |
| **Broken** | The advertisement's scripted tour moved the flat plan camera. The world has been drawn in third person since pass 24, so every shot of the tour — the Commons, the school, Relay 12 — was the same frame of a kid standing on Maple Court. |
| **Broken** | The incident needed only the player at the Channel. A player who skated straight there alone got "Devon: I'm right here" from a boy eighty metres away on a lawn. |
| **Broken** | During his own stop Devon vanished: he was simply not drawn. The beat whose whole point is that the player must watch had nothing to watch. |
| **Missing** | An ending. A choice. Anybody to talk to. A pause menu — the first screen says "these can be changed at any time" and there was nowhere to change them. Save. App icons. |
| **Thin** | The investigation was six records read in a network panel. It explained the machine; it never asked the player to work anything out. |

## The case

The answer to what happened on Northgate Lane is now a real one, and nobody
says it in one breath. At 04:41 a courier, hood up in the drizzle, could not
leave a parcel on a SAFEtrace HOME "secure address", picked it back up off
the step and left it next door. The doorbell filed that as a burglary on its
owner's behalf. CM-207's frame of the courier was 61% similar to a Ridgeline
pupil; SVC-PREDICT weighted it by where each pupil usually goes, and Devon —
forty-one visits to a cousin on the Lane — came out at 98.7%, over a
threshold a parents' petition had lowered from 99. Seventy-five seconds
earlier, the drainage camera on the apron had logged Devon going down into
the Channel. Both records sat in the same system. Nothing compared them.

That is split into clues found three ways — reading the node that holds the
record, stopping to look at something on a doorstep or a wall, and talking
to people — and connected in a notebook. `src/sim/casefile.ts` is the pure
logic: learn, connect a pair, disprove, and count. `src/content/case.ts` is
the content: five open questions, nineteen clues, eleven deductions, four of
them load-bearing, and one piece of misinformation (Mr. Brennan saw the
alert, not the boy).

The notebook never says which pair to try. It says, per question, whether
something in it fits together — the difference between "look harder at your
notes" and "go outside".

## People

Mara at her shop, Mrs. Carvalho on her taped-off drive, Mr. Brennan next
door, a courier working the Lane, the officer at the stop, Priya Venn at a
drop-in advertised on a poster from the first minute, and Devon at home.
`src/content/talk.ts` is every conversation as a function of story state and
of what the player already knows, so nobody tells you about a thing you have
not found a reason to ask about.

Proximity follows the rule the network nodes already had: nothing is marked
from a distance, and the prompt appears only when you are standing there,
slowly enough to notice.

## Choices, and what they cost

- **The stop.** Walk up to the officer and speak up for Devon, or stand back.
  Speaking up puts the player on file as a party present (a contact on their
  own record, the same number a patrol contact writes) and gets them Devon's
  hint about the apron camera there and then. Standing back keeps them off
  the record, and Devon tells them later, at home.
- **Who you show it to.** Priya, Mara's window, or Devon ("I'm going to let
  it go"). Each confirmation says honestly how strong the case reads —
  Mara's "it's a lot of maybes, love" is the case-strength function in her
  voice — and each has a "Not yet".

The ending is read off the notes: four key findings, minus one for being on
file and one for repeating something your own notes could have disproved.
Three or more holds. `resolveEnding` is a table and is tested as one.

| Taken to | Case holds | Case doesn't |
| --- | --- | --- |
| Priya | A Second Line — a review, a reclassification, the threshold back at 99 | Your Concern Has Been Logged |
| Mara's window | The Window — a petition, and a score that never quite recovers | A Kid Defending His Friend |
| Nobody | Let It Go | |

The advertisement returns after the decision, not after the reading, and the
ending card shows the page it was read from.

## A town that is talking

Overheard lines (`src/content/barks.ts`) follow the afternoon — the weather,
then the burglary, then the boy, then whatever the player did — and are only
caught by a player going slowly enough to hear them. Some are hints. Some are
the town being wrong in the way a town is wrong about a thing it read on its
phone. Residents glance at Devon after the alert. Tape, a parcel, an alert on
a shelter screen and the notes in Mara's window appear and go with the story.

## Presentation

The third-person view was extruded footprints in two colours. Buildings now
have pitched roofs on homes, windows by the floor, doors, house numbers on
Northgate Lane, shopfront glass and signs (`OKONJO CYCLE & BOARD` is
readable from the street), all as decals painted with their wall so they can
never sort wrongly. Ground shadows from the one four-o'clock sun, trees with
crowns, cars with cabins. None of it touches a footprint or a height the
simulation reads.

The chase camera eases in around walls instead of snapping, frames whoever
you are talking to, flies the advertisement's tour, and hands the last shot
to the rider as a move rather than a cut.

The player's own sounds are in E minor, a pencil and a pluck; everything
SAFEtrace makes is still its bell in A. Districts have their own air.

## What was deliberately left alone

- **Skating.** Pass 31 measured it inside spec and every constant in `TUNE`
  carries its reason. Nothing here gave a reason to move one.
- **The surveillance model, pursuit and dispatch.** Untouched. The only new
  writer of `priorContacts` is the stop, and it goes through the same field a
  patrol contact does.
- **The slingshot and hacking.** They remain the tools for getting to the
  records; the case gives them somewhere to go.
- **No title screen.** Contradiction 2 still holds. The preferences card
  grew a "Continue the afternoon" line when there is one to continue.

## What was tested

409 tests (from 378): the case's internal consistency, every clue reachable
from somewhere a player can go, record clues backed by the records' own text,
the notebook's connect and disprove, the ending table, the incident refusing
to fire without Devon, the stop choice and both of its consequences, a
burglary worked out from a doorstep and a parcel, conversations ending when
the player skates away, a made case to Priya coming back round to the
advertisement, overheard lines by phase, and an afternoon saved and restored
without replaying a single beat. Two hardening tests that dropped the player
into the Channel alone now bring Devon along, because the story now requires
it.
