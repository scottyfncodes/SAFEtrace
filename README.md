# SAFETRACE™

A teenage skater in a beautiful, already-completely-surveilled suburb slowly
learns to see the machine underneath the town, and discovers that the only way
to stay free of it is to become something it cannot predict.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 352 tests: simulation, determinism, architecture, content, touch
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

## Controls

| | |
|---|---|
| `W` | push (a rhythm, not a throttle) |
| `A` `D` | carve — turning radius grows with speed |
| `Space` | ollie; hold briefly to load |
| `S` | brake / powerslide |
| `Shift` | step off the board |
| `F` | take out the slingshot, and stand still to use it |
| Left mouse | draw the band; release to throw |
| `E` then `1`–`6` | reach for the node you are standing next to, and act on it |
| `Q` | hold for the plan view — the town from above, from the first frame |
| `F3` | diagnostics, including the pursuit state and the risk decomposition |

Nothing opens on its own. A node's panel appears because you pressed `E` — or,
on a phone, because you tapped the thing itself — and never because you skated
past it. On a phone the slingshot is two thumbs: the left one drags the sling
where you want it, the right one pulls the band back and lets go.

A phone gets three buttons, in the bottom-right, from the first frame: `SLING`,
`TRICK`, and `PLAN`. The plan view is a *view* and is always available on every
device. SAFEtrace VISION is a story unlock, and what it changes is what the plan
view contains — coverage, subjects, the forecast — not how you open it.

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

352 tests, all headless, in about ten seconds.

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
- **Touch** — the gesture engine is pure, so every thumb is a synthetic trace:
  the two-thumb slingshot, and a nine-viewport ergonomics matrix asserting touch
  target sizes, separation between neighbours, safe-area clearance and screen
  coverage on the iPhone sizes this actually has to work on.

## Status

Phases 0 through 7 of the roadmap. The slice is playable end to end; broad
content production is deliberately the last phase, per
[`docs/16-production-roadmap.md`](docs/16-production-roadmap.md).
