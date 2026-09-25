# SAFETRACE™

A teenage skater in a beautiful, already-completely-surveilled suburb slowly
learns to see the machine underneath the town, and discovers that the only way
to stay free of it is to become something it cannot predict.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 463 tests: simulation, story, the case, determinism, architecture, touch, feel
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
in the veneer, SAFEtrace VISION, and the advertisement's reprise.

The session starts solo. Devon is somewhere down the street, not already
riding beside you — you skate to him, and he starts following once you
actually arrive.

After the match, the afternoon is an investigation. There is an answer to
what happened on Northgate Lane, and it is spread across records you read at
the camera or relay that holds them, things left on doorsteps, and what the
people of Bellhaven will tell you. You write it down, you put two things
side by side in your notes to work something out, and then you decide who to
show it to — Priya Venn at the SAFEtrace drop-in, Mara's shop window, or
nobody. Five endings are read off what you did and what you worked out.

## Controls

| | |
|---|---|
| `W` | push — hold it to keep pushing, or tap it in rhythm |
| `A` `D` | carve — turning radius grows with speed |
| `Space` | ollie; hold briefly to load |
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
| `Q` | the plan: tap to open and close (or hold to peek); click it to pin where you are going |
| `Esc` | put away whatever is open; otherwise pause |
| `F3` | diagnostics, including the pursuit state and the risk decomposition |

Nothing opens on its own. A node's panel appears because you pressed `E` — or,
on a phone, because you tapped the thing itself — and never because you skated
past it.

A phone gets three buttons in the bottom-right: `SLING`, `TRICK` and `PLAN`.
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
you. You can keep skating with it open. SAFEtrace VISION is a story unlock, and
what it changes is what the plan contains — coverage, subjects, the forecast.

**The Community Safety Score** is not on the screen. SAFEtrace has been keeping
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
src/content/  Bellhaven, every SAFEtrace string, the story beats
src/render/   the veneer, the machine, and the peel between them
src/ui/       the advertisement, the diegetic phone, notifications
src/audio/    fully synthesised WebAudio
```

## The surveillance model

The most important distinction in the codebase is **Subject** versus **Track**:
a Subject is what is true, a Track is what SAFEtrace believes. The whole game
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

## Testing

463 tests, all headless, in about twenty seconds.

- **Simulation** — cone geometry, occlusion, confidence decay, misattribution,
  risk decomposition, ballistic reconstruction, subject linking, escalation.
- **Loop** — the slingshot, evidence, hacking and drone chains end to end,
  including that the game declines to let you shoot a person.
- **Determinism** — a 60-second replay hashes identically from the same seed.
- **Architecture** — the layering rules above, and that every player-visible
  SAFEtrace string lives in one file, because that voice must be edited as a
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
- **Touch** — the gesture engine is pure, so every thumb is a synthetic trace:
  the two-thumb slingshot, and a nine-viewport ergonomics matrix asserting touch
  target sizes, separation between neighbours, safe-area clearance and screen
  coverage on the iPhone sizes this actually has to work on.

## Status

The slice is a complete afternoon: the advertisement, a solo start, Devon,
the Channel, the match, the stop, an investigation with an answer, a
decision, the advertisement again, and one of five endings. The afternoon is
saved as it goes and can be continued. The design record for the latest pass —
controls, the camera, the plan, the score and the slingshot — is
[`docs/37-the-feel-pass.md`](docs/37-the-feel-pass.md).

The playtest gate in [`docs/13-vertical-slice.md`](docs/13-vertical-slice.md)
§4 is still a set of observations of people, and still the most useful next
thing anybody can do with this build.
