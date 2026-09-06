# 31 — Vertical slice feel, and the playtest gate

Eleventh pass. Not a feature pass: an audit of whether the slice is ready to put
in front of a person who has never seen it, and the smallest set of fixes that
audit justified.

The brief for this pass was explicit about what *not* to do — no new systems, no
more world, no Northgate, no new surveillance mechanics, no architectural
rewrite — and about the failure mode to avoid: treating every uncertainty as a
code bug. Most of what follows is therefore a finding rather than a diff.

## The audit

| | Finding |
| --- | --- |
| **Confirmed working** | Pursuit starts `NOT_PURSUING` and can only be started by a reported offence; a three-minute hard skate never starts one; a broken contact reaches `CLEAR` and stays cleared. Plan view opens on `Q` and on the `PLAN` button from the first frame, with no unlock gate. Node panels open only on an explicit interact. The two-thumb sling does not move the aim when either thumb is released. All covered by tests that were already passing. |
| **Likely tuning issue** | None found that measurement supported. Standing start to 90 % of top speed: **3.0 s**. Quarter turn at cruise: **1.0 s**. Brake from 9 m/s: **1.13 s over 5.5 m**. Those are inside the range the skating spec asks for, and every constant in `TUNE` carries the rationale of the pass that set it. Left alone. |
| **UX issue** | Two. The pursuit had three lines for ending and none for starting. The trick verb had a button on a phone and an unlisted key on a desktop. Both fixed below. |
| **Documentation issue** | The README claimed "Phases 0 through 7", which reads as a phase completed. Phase 7's gate is six playtester observations, and none of them has been made. Also a stale test count, and `R` missing from the controls table. |
| **Actual bug** | One, in pacing. Below. |
| **Playtest-only question** | Everything the slice actually ships on: whether the peel lands, whether the sling-into-a-camera move is discovered, whether the reprise gets a reaction, whether a stranger skates a clean line inside four minutes. No amount of further implementation answers any of these. |

## The bug: the afternoon started thirty-two seconds late

The advertisement runs for 32.5 seconds, and the world runs underneath it,
because it is the same world — that is deliberate and it is the whole reason the
opening shot works. But `main.ts` steps the simulation during the advertisement
and returns *before* `story.update()`. So the story director's first frame saw
`sim.tick` already near 2000, while its opening beats were gated on absolute
ticks:

```
welcome                 tick > 90        (1.5 s)
devon-suggests-channel  tick > 60 * 12   (12 s)
incident                tick > 60 * 25   (25 s)
```

All three gates were long since satisfied. The consequence:

- `welcome` and `devon-suggests-channel` fired **on the same frame**, and the
  second's `hud.say` overwrote the first's. *"Devon: took you long enough"* —
  the first line either character speaks — was never seen by anybody who did not
  skip the advertisement.
- `incident`'s time gate was pre-satisfied, so the hook could fire the moment
  the player came within forty metres of the Channel, with none of the intended
  exploration in between.

This never showed up in browser testing because every automated run pressed
Escape at ~700 ms, which is the one path where the story clock and the
simulation clock agree.

`StoryState.startedAt` already existed for exactly this — declared, initialised
to zero, and never once written or read. It is wired up now: the advertisement's
`onDone` calls `story.begin()`, and the three absolute gates measure through a
`since()` helper instead. A player who watches the advertisement all the way
through and one who skips it now get the same afternoon.

The test asserts the shape rather than the numbers: run the world for
thirty-three seconds with the story asleep, `begin()`, and then check that
`welcome` still lands a couple of seconds in and that the two openers are at
least eight seconds apart — a conversation, not one frame with two speakers.

## Both ends of the pursuit

`contactLost`, `searchingLastKnown`, `pursuitCleared`. Three lines, all of them
for a pursuit winding down. Nothing for one starting.

So a player heard **"SUBJECT NOT LOCATED — SEARCH STOOD DOWN"** as the payoff to
something they had never been told had begun. The system spoke only about its
own failures, which is exactly backwards for a system whose whole character is
that it narrates itself confidently.

Two lines complete the set, and the distinction between them is the one the
state machine already makes:

- `UNIT DISPATCHED — SUBJECT LOCATION` — entering `PURSUING`. Something has eyes
  on you, and the unit is being sent to where you are.
- `UNIT RESPONDING — LAST REPORTED LOCATION` — entering `ALERT`. Nobody has eyes
  on you, and the unit is being sent to where you *were*.

No new state, no new mechanic, no change to tasking. The machine already knew
the difference; it just never said so.

## The trick nobody could find

A phone has a `TRICK` button in the corner. A keyboard had `R`, which appeared
in neither the on-screen prompt strip nor the README. Half the players had a
verb the other half did not know existed.

`R` is in both now. That makes the prompt strip eight items, so it wraps and
centres rather than running off the edge of a narrow window.

## What the README now says

The status section used to read "Phases 0 through 7 of the roadmap", which any
reader takes as seven phases completed. Phase 7's gate, in
`13-vertical-slice.md` §4, is six things — a stranger skating a clean line
inside four minutes without instruction, the sling-into-a-camera move happening
by accident and then on purpose, somebody asking *"how did it know I was going
there?"* unprompted, somebody routing around remembered coverage, the peel
stopping conversation, the reprise getting a reaction.

Every one of those is an observation of a person. The build satisfies §2 — the
contents list — completely. It has not been through §4 at all, because §4 cannot
be run by a machine. The status section says that now, in those terms.

## The recommendation this pass ends on

Not another implementation pass. The two defects found here were a pacing bug
and a missing line of copy, and it took a full audit to surface them, which is
what a diminishing return looks like. Everything still open is a question about
a person's first ten minutes, and the only instrument for that is a person.

## What was tested

356 tests. `npm run typecheck` clean, `npm test` 356 passing across 11 files in
about fourteen seconds, `npx vite build` green at 202 kB / 68 kB gzipped.

---

## Addendum — "Here he comes"

The pass above went out, the site went live, and the first report back was a
screenshot of the opening advertisement with three words attached:

> Here he comes.

The blue figure is Devon. He has a board now, which is the previous pass
working. What that pass did not touch is what he *does*, and this is the
measurement over the thirty-three seconds of the advertisement — during which
the player is frozen, because the advertisement steps the world with an empty
intent:

```
 0s  gap = 11.31 m   devon 0.00   player 0.00
 3s  gap =  7.88 m   devon 1.20   player 0.00
 6s  gap =  4.69 m   devon 1.20   player 0.00
 9s  gap =  2.81 m   devon 1.20   player 0.00     <- closest
15s  gap =  5.16 m   devon 0.00   player 0.00
```

Devon crossed **eight and a half metres of grass at walking pace to stand
2.8 m off the back of a player who could not move**, and then settled at five
and held it. That is the first thing that happens in the game, over the words
*"A place worth looking after."*

The cause is one term:

```ts
const speed = Math.min(this.player.speed * 1.05 + 1.2, Math.max(0, d) * 2.2);
//                                          ^^^^^
```

A flat floor, so Devon closes at 1.2 m/s regardless of whether the player is
moving at all. And because his station is a point 5.5 m *behind* the player,
the straight line to it goes past their shoulder — which is where the 2.8 m
comes from. He is not stopping next to you; he is walking through you to get
to a spot behind you.

The floor now scales with the player:

```ts
const floor = Math.min(1.2, this.player.speed);
```

Identical at any speed anybody actually skates at, zero when they are standing
still. Stand still, and Devon stands still.

| | Before | After |
| --- | --- | --- |
| Gap through the advertisement | 11.31 → **2.81** → 5.16 m | 11.31 m, unchanged |
| Devon's speed while the player is frozen | 1.20 m/s | 0.00 m/s |
| Closest approach over a 20 s ride | — | 4.54 m |
| Still follows a moving player | yes | yes — 10.98 m/s against the player's 11.25 |

### The lesson, again, one layer further in

Pass 30 concluded that when a report survives a fix the tests say worked, the
question is not "what else is wrong with the mechanism" but "what is the player
actually looking at". That was right, and it was still not the whole answer.

Devon was drawn wrong *and* behaved wrong, and fixing the drawing made the
behaviour easier to see rather than fixing it. A figure that crosses open ground
toward you while you cannot move is the most tail-like event in the build, it
happens before the player has ever had control, and four passes of "the cop is
hunting me immediately" were very likely looking straight at it.

The thing that finally located it was not reading the follow code. It was
printing the gap, in metres, once a second, over exactly the window the player
was complaining about.
