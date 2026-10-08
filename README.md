# UNDERWATCH

A teenage skater in a beautiful, already-completely-surveilled suburb slowly
learns to see the machine underneath the town, and discovers that the only way
to stay free of it is to become something it cannot predict.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 704 tests: simulation, escalation, story, the case, determinism, architecture, touch, feel
npm run build
```

## What this is

A playable vertical slice, built from a complete pre-production pass. The
design record lives in [`docs/`](docs/00-README.md) and is the authority on what
the game is trying to be; [`docs/17-contradictions.md`](docs/17-contradictions.md)
records the ten conflicts found inside the original brief and how each was
settled.

The slice contains the opening advertisement, a dense playable district, the
skating and slingshot models, the full surveillance simulation, hacking, drones,
the false-positive incident involving the player's best friend, the first crack
in the veneer, UNDERWATCH VISION, and the advertisement's reprise.

The session starts solo. Devon is somewhere down the street, not already
riding beside you — you skate to him, and he starts following once you
actually arrive.

After the match, the afternoon is an investigation. There is an answer to
what happened on Northgate Lane, and it is spread across records you read at
the camera or relay that holds them, things left on doorsteps, and what the
people of Bellhaven will tell you. You write it down, you put two things
side by side in your notes to work something out, and then you decide who to
show it to — Priya Venn at the UNDERWATCH drop-in, Mara's shop window, or
nobody. Five endings are read off what you did and what you worked out.

## Jobs

The title screen is the town itself: the kid on Maple Court, the nearest
cameras sweeping, and a bracket that has already found them. **Ride** is
jobs: the same town with the story left out; the afternoon (or a saved one
to continue) sits under it. Accessibility options are one labelled control
on the title and in the pause menu, and a system set to reduce motion is
honoured on a first launch. Pick a job from the board, read one line, and skate. Each job is a place
to be and whatever is watching on the way, never a route. Being seen does not
fail a job. Your exposure climbs from UNSEEN through SPOTTED and TRACKED to
UNDERWATCH, drones come to where you were last seen, and you skate out of it
until the city says **SIGNAL LOST**. Runs are scored on STYLE, TIME, EXPOSURE
and FLOW, with bests kept per job. `T` restarts a job and `J` opens the board.
Each day has its own conditions — CLEAR, DUSK (every camera sees less) or
MAINTENANCE (some cameras are down) — shown on the board. The first job opens
on the Lot's kickers. See [`docs/47-the-first-minute.md`](docs/47-the-first-minute.md).
See [`docs/44-jobs-exposure-and-the-getaway.md`](docs/44-jobs-exposure-and-the-getaway.md).

## Recon and the plan

When a camera covers the way to where you are going, the strip under the run
says so. Open the plan (`Q` / `PLAN`) and it is the recon layer: hold a camera
in the middle of the map to learn its sweep and timing, and mark a spot to
learn what a stone there would turn. Pressing `PLAN` again commits — the intel
becomes a chain (`STONE → CM-207 TURNS → THERE`) carried out into the street
with live timing, and the town decides whether it holds. A blown plan always
says why, and it is always something recon could have shown you. See
[`docs/49-recon-and-the-plan.md`](docs/49-recon-and-the-plan.md).

## Controls

| | |
|---|---|
| `W` | push — hold it to keep pushing, or tap it in rhythm |
| `A` `D` | carve — turning radius grows with speed |
| `Space` | ollie; hold briefly to load |
| `C` | grind: on the ground it pops you onto the lit rail or ledge, in the air it catches it; ollie or trick off |
| `R` | trick — which trick is the board's business, not yours |
| `G` | grab — cycles through six, same reasoning as `R` |
| `S` | brake / powerslide |
| `Shift` | step off the board |
| Right mouse, dragged | look round the rider; the camera settles back behind you |
| Left mouse, dragged back | the slingshot: pull back from anywhere, let go to throw — on the move |
| Left mouse, held still | point at a thing and hold: the draw loads, let go to throw at it |
| `F` | steady aim: stand still and look down the sling (mouse or `A` `D` `W` `S` to aim) |
| `E` | talk to whoever you are next to, look at what is in front of you, or reach into a node |
| `1`–`3` | answer, in a conversation; act on a node, at a node |
| `N` | your notes: what you know, and what goes with what |
| `Q` | recon: open the plan, hold a camera in the middle to read it, click to pin where you are going (then click elsewhere to read a spot); `Q` again commits to the plan, `Esc` just closes it |
| `Esc` | put away whatever is open; otherwise pause |
| `H` | hold to see every control, without stopping |
| `F3` | diagnostics, including the pursuit state and the risk decomposition |

Nothing opens on its own. A node's panel appears because you pressed `E` — or,
on a phone, because you tapped the thing itself — and never because you skated
past it.

**Grinds and ramps.** Press `C` (or `GRIND` on a phone) near a rail, ledge,
bench or the top of a Channel wall. On the ground it pops you onto the line;
in the air it catches it. The line you're heading for is lit in your colour.
You ride the line to its end, or ollie or `TRICK` off it. Kickers are real
slopes: ride up them and leave the lip with air that grows with your speed.
**The Lot**, a poured pad in the field between Commons Street and Ridgeline
Road, has kickers, flat bars, a handrail and a ledge, with paths in from every
side. See [`docs/45-grinds-ramps-and-the-lot.md`](docs/45-grinds-ramps-and-the-lot.md).

A phone gets four buttons in the bottom-right: `SLING`, `TRICK`, `GRIND` and `PLAN`.
`GRIND` pops you onto the lit rail, or catches it if you're already in the air.
Tap `TRICK` to flip the board, hold it to grab. Drag on empty glass to look
round. `SLING` takes the slingshot out — nothing else changes, you are still
in the street and can keep skating — and then a pull back anywhere on the
right of the glass is a throw: the pull points it, its length says how far,
and letting go throws. `SLING` again puts it away. (The old first-person
aiming is still there as "Classic slingshot" in the pause menu.)

**The plan** is the town as a map: districts, streets by name, the buildings with names, the
people you have met and the things you have looked at. You open it to work out
where you are going, tap the map to pin it, and follow the pin — a column of
light in the street, or an arrow at the edge of the screen when it is behind
you. You can keep skating with it open. It also shows the cameras you have
noticed, which way they swing and which one has you — and, with a pin down,
which of them a stone there would turn. UNDERWATCH VISION is a story unlock, and
what it changes is what the plan contains — every camera, subjects, the
forecast, and the places UNDERWATCH has flagged.

**The Community Safety Score** is not on the screen. UNDERWATCH has been keeping
it about you all along; you find out by reading a camera's record (it lists who
it is holding, and the number beside them) or by opening the plan once VISION
has put subjects on it. After that it is in your notes, on the plan, and it
speaks up only when it moves from one band to another.

## The idea, in one table

The game does not escalate by adding surveillance. Bellhaven is maximally
instrumented in the first frame and the camera count never changes. What
escalates is comprehension.

| Stage | Player state |
|---|---|
| 0 | This town is nice. |
| 1 | There are a lot of cameras here. |
| 2 | It is watching everything. |
| 3 | It thinks it knows people. |
| 4 | It thinks it knows *me*. |
| 5 | The town has been a machine the whole time. |

## How it is built

**No engine, no assets.** TypeScript, Vite, and Canvas2D. Every visual is vector
geometry generated from typed data and every sound is synthesised at runtime.

That is not a cost-saving measure the art direction has to survive. It is the
reason the art direction is possible: machine vision is not a filter over a
picture of a town, it is a second renderer reading the same records the
simulation uses. When the veneer peels and a house becomes
`RES 115 · 4 OCCUPANTS · NODE CM-017 · SEG S-M1`, those are the object's actual
fields.

**The simulation never touches presentation.** `src/sim` imports nothing from
`render`, `ui`, or `audio`, touches no DOM, and calls neither `Math.random` nor
`Date.now`. A test enforces all four. That is what makes the surveillance model
steppable headlessly and reproducible from a seed, which matters enormously for
a system this emergent.

```
src/core/     engine primitives: math, seeded RNG, event bus, input intent, loop
src/sim/      the game as pure logic, including surveillance/
src/content/  Bellhaven, every UNDERWATCH string, the story beats
src/render/   the veneer, the machine, and the peel between them
src/ui/       the advertisement, the diegetic phone, notifications
src/audio/    fully synthesised WebAudio
```

## The surveillance model

The most important distinction in the codebase is **Subject** versus **Track**:
a Subject is what is true, a Track is what UNDERWATCH believes. The whole game
lives in the gap between those two objects.

```
sensors -> observations -> fusion -> tracks
                                      |-> behaviour classification
                                      |-> prediction along the road graph
                                      '-> risk scoring -> dispatch -> assets
evidence ---------------------------------------------^
```

Three properties of that pipeline carry the game:

**Prediction runs on the road graph, so freedom lives off it.** Assets are
dispatched to where the model thinks you will be, not to where you are. The
Channel, the backyards and the parking decks are deliberately not on the graph.

**Flowing is how you become unpredictable.** The skating flow state feeds
directly into the player's prediction-error term. The skill mechanic and the
thesis are the same mechanic; flow is never displayed as a number and is never
scored.

**The false positive is real.** Nothing scripts it. Fusion runs an honest
posterior combining match confidence with each identity's prior association with
the district, and under the documented conditions it attributes an observation
to the wrong person and reports 98.7% — a number describing its own agreement,
not its correctness. A regression test asserts that this remains reachable,
because if a refactor ever made it impossible the premise would break silently.

## Avoid, hide, distract, manipulate, sabotage

The player's vocabulary is a ladder, and every rung leaves a different
amount behind. Skating round a camera leaves nothing. Waiting out of sight
is not loitering to a network that cannot see you, and a stopped rider
behind a parked car is hidden. A stone somewhere else turns the cameras
that hear it, and the board is not quiet either: a kickflip under a lens
gets you looked at. A hack is clean when it runs and traced later. Breaking
a camera works for six minutes.

What stops the top rung from being the only one is **disturbance**: each
place remembers what happened in it, and the town reacts to the place rather
than to you. A street that has heard too many stones stops turning toward
them and looks back up the throw. A dead camera brings a drone to its pole,
and its neighbours on the circuit start to scan. Forensics run faster there,
residents look up, and the neighbours start talking about it. None of this
sends anybody after you; only something linked to your name does that. The
plan shows the cameras you have noticed and which one has you, and with a
pin down it shows which cameras a stone there would turn. See
[`docs/38-stealth-manipulation-and-escalation.md`](docs/38-stealth-manipulation-and-escalation.md).

## Testing

704 tests, all headless, in about thirty seconds.

- **Recon and the plan** — what recon learns and when, how intel becomes a
  committed plan, and that every way a plan is blown happens for the reason
  it gives (`tests/recon.test.ts`).
- **Simulation** — cone geometry, occlusion, confidence decay, misattribution,
  risk decomposition, ballistic reconstruction, subject linking, escalation.
- **Loop** — the slingshot, evidence, hacking and drone chains end to end,
  including that the game declines to let you shoot a person.
- **Determinism** — a 60-second replay hashes identically from the same seed.
- **Architecture** — the layering rules above, and that every player-visible
  UNDERWATCH string lives in one file, because that voice must be edited as a
  single document or it drifts.
- **Content** — the shipped town validates: every sensor on a segment, every
  segment on an uplink, a connected road graph, and the Channel genuinely off it.
- **The case** — every clue reachable from somewhere a player can go, every
  record clue backed by the record's actual text, the ending table, the stop
  choice and its consequence, conversations, overheard lines, and an afternoon
  saved and restored without replaying anything.
- **Feel** — the sling draws only while pulled and eases in, a stone skips on
  a road and dies in a lawn, rolls out, glances off walls, sends birds out of
  a tree once, and turns cameras toward the sound; the plan can be skated in;
  the score is found, not shown; the lens gives an upright phone room to see.
- **Escalation** — going round leaves nothing; a stone works until a place
  has heard too many and then turns the camera back up the throw; a broken
  camera brings a drone and puts its neighbours on watch; a hack is clean now
  and traced later; the board's own noise turns cameras; hiding is not
  loitering; and the plan's preview of a throw agrees with the throw.
- **Touch** — the gesture engine is pure, so every thumb is a synthetic trace:
  the two-thumb slingshot, and a nine-viewport ergonomics matrix asserting touch
  target sizes, separation between neighbours, safe-area clearance and screen
  coverage on the iPhone sizes this actually has to work on.

## Status

The slice is a complete afternoon: the advertisement, a solo start, Devon,
the Channel, the match, the stop, an investigation with an answer, a
decision, the advertisement again, and one of five endings. The afternoon is
saved as it goes and can be continued. The design record for the latest pass —
the escalation ladder, disturbance, the board as a stealth instrument, and the
plan as a model of the surveillance — is
[`docs/38-stealth-manipulation-and-escalation.md`](docs/38-stealth-manipulation-and-escalation.md).

The playtest gate in [`docs/13-vertical-slice.md`](docs/13-vertical-slice.md)
§4 is still a set of observations of people, and still the most useful next
thing anybody can do with this build.
