# 38 — Stealth, Manipulation, and Escalation

Fourteenth pass. The brief was a systems rebalance rather than a feature: make
the primary fantasy *move through a surveilled town, understand how it reacts,
manipulate it when useful, and escalate to sabotage only when necessary*,
without taking destruction away.

The player's vocabulary is a ladder, not a sequence of mission steps:

| Rung | What it manipulates | What it leaves behind |
| --- | --- | --- |
| **Avoid** — skate round it | position | nothing |
| **Hide** — wait, break line of sight, settle behind cover | what the system knows | nothing |
| **Distract** — a stone somewhere else | attention | a little noise, in that place |
| **Manipulate** — a hack | information and systems | nothing now; a digital trace later |
| **Sabotage** — break the camera | the apparatus | a lot, in that place and along its segment |
| **Destroy / hit a person** | everything | the most of all, and evidence |

## What reading the code found

The pieces were mostly already there, and several were already doing exactly
the right thing: cameras turned toward sounds (pass 37), hiding broke contact
through confidence decay, the pursuit machine refused to chase anybody without
an offence, and trajectory analysis was an honest forensic model. The problem
was the **exchange rate** between the rungs:

| | Finding |
| --- | --- |
| **Dominant** | A stone in a bin turned a camera for 8 s. A stone in the lens turned it off for **6 minutes**. When the shot could not be traced to anyone — a skill the game teaches — breaking the camera cost *nothing at all*: "ORIGIN INDETERMINATE — INCIDENT LOGGED" was a sentence with no incident behind it. Destruction was strictly better than distraction. |
| **Farmable** | The same distraction worked forever. Nothing remembered that a street had had seven stones in a minute. |
| **Contradictory** | Waiting behind a wall for a camera to sweep past earned `LOITERING` after seven seconds — from a network that could not see you. Waiting was punished as a verb. |
| **Missing** | The skateboard made no sound. Kickflipping under a camera's nose was as quiet as coasting past it. |
| **Missing** | Before VISION the plan drew a town with no cameras in it, which is the one thing a kid who has skated these streets all afternoon does know. It could not answer "where am I visible" or "what happens if I throw a stone there". |
| **Invisible** | A hack's cost was only described in a design doc. The panel offered `LOOP` and `REROUTE` with no hint that one comes back to bite and the other does not. |

## Disturbance: what a place remembers

`src/sim/surveillance/disturbance.ts`. Evidence is about a *person*: it
back-projects and links to a name, or doesn't. Disturbance is about a *place*.
Every intervention leaves heat where it happened, whether or not anybody is ever
blamed, and the heat fades:

| Kind | Weight | Half-life | Reach |
| --- | --- | --- | --- |
| stone on the ground | 0.75 | 75 s | 36 m |
| birds out of a tree | 0.5 | 60 s | 36 m |
| bin / cone / sign knocked | 1.0 | 90 s | 36 m |
| REROUTE (a false flag) | 0.8 | 90 s | 36 m |
| SUPPRESS (a track glitch) | 1.2 | 120 s | 36 m |
| car alarm | 2.0 | 120 s | 48 m |
| camera knocked askew / frozen | 2.2 | 150 s | 48 m |
| LOOP found out, MASK | 2.5 | 200 s | 48 m |
| camera, junction or drone broken | 4.5 | 240 s | 64 m |
| a person hit | 5.0 | 240 s | 64 m |

Skating leaves nothing, ever. The levels are **QUIET → NOTICED (1.6) →
PATTERN (3.5) → REVIEW (7)**, with hysteresis on the way down. In practice:
two stones in one spot pass unremarked, the third is noticed, and the fifth
makes a pattern. One broken camera is a pattern on its own.

It is not a meter and it is not on the HUD. It surfaces through the world:

- **Cameras stop falling for it.** In a PATTERN place, a noise no longer turns
  the cameras toward the sound. They turn back along the line the stone came
  in on, toward where the system estimates it was thrown from, using the same
  `solveRange` arithmetic as trajectory analysis. The distraction becomes a
  spotlight on the thrower: `REPEAT ACOUSTIC EVENT — ORIGIN REVIEW`.
- **Cameras get watchful.** Each camera eases toward a `vigilance` set by the
  heat around it. A watchful camera sweeps up to 60% wider, hears up to 50%
  further, and sees up to 22% better, and a *fixed* camera starts to scan. A
  broken or tampered node also puts the cameras on its **own network
  segment** on watch, falling off over 75 m. Its neighbours close ranks; the
  far end of the circuit doesn't care.
- **Somebody comes to look — at a place.** A broken camera gets a drone sent to
  the pole. A district that becomes a PATTERN gets a unit, unless one is
  already on its way there; REVIEW gets two. These are INVESTIGATE tasks
  at a location. None of this can start a pursuit. That still needs something
  linked to a name (`reportOffence`), and a test holds that line.
- **Forensics get sharper.** Evidence remembers how scrutinised its place was
  when it happened. Under full scrutiny the analysis runs 40% sooner (less time
  to leave) and searches a disc 35% tighter. A LOOP in a hot place has its
  integrity check come up to 50% sooner.
- **"Incident logged" is true.** Damage nobody could be linked to now opens a
  `DEVICE_FAULT` incident. Open incidents already make everyone nearby a little
  more interesting to the risk model. These close when the place goes quiet;
  the story's own incidents are left alone.
- **People look up.** In a PATTERN street, residents glance at a skater going
  past. The town also *says* so: new overheard lines, chosen by what kind of
  trouble the district has mostly had — noise ("That's the third bang this
  afternoon"), breakage ("Somebody broke the one by the post box." "Now they'll
  put up two."), or tampering.
- **The system says it, about the place.** `RECURRING ACTIVITY`, `PATTERN
  DETECTED`, `AREA UNDER REVIEW`, `AREA REVIEW CLOSED`, with the district's
  name and never the player's.

The player is meant to arrive at *"I've been making too much noise here"*
through a camera looking back at them, a neighbour looking up, and a line of
overheard conversation. Not through a number.

## The skateboard is a stealth instrument

- **Noise is visibility.** A push is a 2.5 m sound, a pop 4.5 m, a landing
  3–8 m by speed (plus 1.5 m for a trick or grab), and a bail 12 m. A pan-and-tilt
  camera in earshot looks at the rider. Rolling is silent. So a kickflip under
  a camera's nose gets you looked at, and coasting past it doesn't. Skating
  never counts as disturbance, and it never starts a pursuit.
- **Speed already blurred you** (observation quality falls with speed), and
  that stays: cross open ground fast.
- **Stopping is a verb.** A tree crown on the sight line thins a camera's view
  to under half. A parked car or a hedge right beside you hides you completely,
  but only once you've *stopped* and settled low. Rolling past a car, you're
  seen over it. This soft cover applies to the player only, so the town's own
  tracking, and the false positive that depends on it, are exactly as they were.
- **Waiting is allowed.** `LOITERING` and `RECKLESS_VELOCITY` are judgements
  about behaviour, and are now only made about a subject the system is actually
  holding. `UNUSUAL_ROUTE` is unchanged on purpose: the model knows where you
  are *not*, and the Sable Lane alley stays a choice with a cost (existing
  tests pin that).

## PLAN is the player's model of the surveillance

`src/render/plan.ts` reads the world into data (pure, tested); the renderer
draws it.

- **Before VISION**, the plan now shows the cameras the player has *noticed*:
  any within 26 m with a clear line, and any that have had the player in view.
  They're drawn in warm ink, not the machine's cyan (this is the player's sketch,
  not SAFEtrace's map), each with the arc it has been seen to swing through.
  A camera that has you right now is drawn hot, and a dead one is a grey cross.
  VISION doesn't change the questions, only how much of the machine's answer is
  on the page: every cone, plus `VIGILANCE n%` on a watchful camera, plus the
  districts SAFEtrace itself has flagged, ringed and labelled.
- **Put a pin down and it becomes a question.** The cameras a stone at the
  pin would turn are drawn again as white, dashed ghost cones facing the pin,
  so the gap they would leave in the route is visible. If there's a bin or a
  car beside the pin, what *that* would turn is drawn too. In a place that
  has heard too much, the ghosts are red and face *you*. The preview and the
  real thing share one function (`Sim.wouldHear`), so they cannot disagree.
- **Where you caused trouble** is a small cross (a bigger one for breakage),
  fading as the place forgets and merged per spot.
- **It says what it sees**, above the usage hints, in the player's voice
  before VISION and the machine's after: `A CAMERA HAS YOU IN VIEW` / `IN VIEW —
  CM-207`; `PEOPLE ROUND HERE ARE STARTING TO LOOK UP` / `THIS AREA: PATTERN —
  NOISE NO LONGER TRUSTED`; `A STONE BY THE PIN TURNS 1 CAMERA YOU'VE SEEN ·
  THE BIN THERE, 3`; `NOISE BY THE PIN: THEY'D LOOK BACK UP THE THROW`.

That's a complete plan in the brief's sense: *CM-207 covers my way → a stone
by the bin turns it → cross while it looks.* And when it stops working: *they
have stopped believing noises here → LOOP it, or go round by Sable Lane, or
break it and live with the drone.*

## Hacking reads as the clean middle

Each verb in the node panel now shows its trace under its name: `QUERY` and
`TRACE` — *no trace*; `LOOP` — *found later*; `REROUTE` — *false flag*;
`SUPPRESS` — *glitch logged*; `MASK` — *tamper logged*. Mechanically:

- **LOOP** leaves nothing when it runs. When the integrity check finds it, it
  leaves a 2.5 tamper mark where it happened, and the check comes sooner on a
  street already under review.
- **REROUTE** is a false flag the place remembers (0.8); do it to one street
  too often and that street becomes a pattern like any other.
- **SUPPRESS** is a small glitch (1.2) and **MASK** a tamper (2.5) on top of its
  existing evidence.

The distinction the brief asked for holds: the slingshot moves **attention**
(local, physical, heard by people too, immediate, and it wears out); hacking
moves **information and systems** (it needs you standing still at a node, it's
invisible to people, it's cleaner, and its bill arrives later).

## Sabotage is escalation

It still works, fully: a lens shot out is dark for six minutes, which no
distraction or hack comes close to. That's what makes it the rung you reach
for. But it now solves the problem by creating new ones: a drone at the pole
within seconds, its neighbours on the segment scanning, the street a pattern
where noises no longer fool anyone, forensics that are faster and tighter
there, and neighbours who look up. If it was traced to you, that's a pursuit,
exactly as before.

Found in play: the investigation's `CM-207` beat said `FEED NOMINAL` even when
the player had already shot CM-207 out. It now says `FEED DOWN — RECORD
RETAINED`. Sabotage stops a lens, not a file.

## Played, and changed by playing

The build was driven in headless Chromium through real keyboard and mouse
input (tilting the sight with `S`/`W`, drawing with the mouse button), on
desktop and at 390×664 touch. Changes that came from that play:

- **Plan cones were slivers.** `fov` is radians and was converted again.
- **One broken camera put 16 cameras on watch.** A network segment runs across
  half the town, so the segment alert now falls off over 75 m. Six cameras,
  graded by distance.
- **One sabotage produced six notification cards.** The separate "unit
  inspecting" line is gone (VISION labels the drone with why it's coming), and
  a PATTERN doesn't request a second unit for a spot one is already heading to.
- **A dead camera read `VIGILANCE 75%`.** A camera that isn't working isn't
  watching anything.
- **The ghost cone was the same colour as the real one.** Ghosts are white and
  dashed now.
- **Seven stones before anything noticed** was too forgiving, so it's now
  noticed at three and a pattern at five.
- **Hack trace labels ran into the verb** (`QUERYNO TRACE`); they stack now.
- **Five crosses in a row for five stones**; marks merge per spot.

The complete loop reproduced through real input: stones 1–6 turned CM-207 to
the noise, the street was noticed at the third and became a pattern at the
sixth (a unit was sent), and the seventh stone turned the camera to within two
metres of where the player was standing.

## Preserved

The skating model's constants, the slingshot's physics, draw, arc, bounce,
material reactions and sounds, the pursuit state machine and its one door
(`reportOffence`), evidence linking, the false positive (untouched: soft cover
is player-only and ran through the existing regression test), the story, the
case, the five endings, VISION as a content gate, the controls, and the art.

## What was tested

491 tests. This branch took the suite from 446 to 470. Merging in passes
#4 (the drag-back throw) and #5 (noise with a cost) brought it to 491. #5's
own count rule (three noises in 50 s) was folded into the ledger rather than
kept alongside it: two systems deciding "this is a pattern" would dispatch
twice and message twice, and #5's rule also sat inside `drawAttention`, where
this pass puts the board's noise. It would have sent units after kids for
skating. #5's `disturbance:flagged` event survives, fired when a district
becomes a PATTERN, and its tests now run against the ledger's thresholds.
A pulled-back throw is tested to leave the same trace as an aimed one.

New: `tests/escalation.test.ts` covers:

- the ledger ranks the ladder, fades, holds a level against flicker, and lets
  it go, and knows what kind of trouble a street has had;
- skating, pushing, carving and a trick record nothing and chase nobody;
- a stone turns CM-207 to the noise; the third is noticed; after enough, the
  camera looks back up the throw to within 8 m of the thrower, the system says
  so, and a unit is sent to a *place*; it forgets, given time, and the trick
  works again;
- residents in a PATTERN street look at the skater;
- a real shot that takes CM-207's lens out brings a drone to it, puts CM-008
  (fixed, same segment) on watch until it visibly scans, and leaves the far end
  of the segment calm;
- a watchful camera hears further;
- unattributed damage opens an incident that closes when the place cools;
- disturbance alone never starts a pursuit;
- hot-place forensics are sooner and tighter;
- LOOP is clean at the time and traced when checked, and checked sooner in a
  hot segment; REROUTE is a remembered false flag;
- a trick landed under a camera turns it to the rider, and rolling past without
  pushing does not;
- unwatched waiting is not loitering, and watched waiting is;
- a tree crown thins a view, and a parked car hides a stopped rider but not a
  rolling one;
- the plan shows only noticed cameras before VISION and all after, says when
  you are in view, and with a pin reports what a stone would turn (agreeing with
  the real throw) and, after a pattern, that they would look back.
