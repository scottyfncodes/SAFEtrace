# 29 — Mobile UX, and the plan view as a control

Ninth pass driven by human play. Two halves: settling what the plan view *is*,
and then a dedicated pass over the whole touch layer.

The previous pass removed the eye button and reported the cost honestly: the
held plan view became keyboard-only, because the button that opened it had been
growing itself out of a story unlock. This pass fixes the cause rather than the
symptom.

---

## Part 1 — Plan View is a control, SAFEtrace VISION is content

The two were **one flag**. `intent.vision` opened the view, and the sim gated it
on `visionUnlocked`, so:

- a phone had no way into the plan view until the story fired, and then grew a
  button in front of a player who was mid-push;
- the keyboard's `Q` did nothing at all for the first several minutes of a
  session, with no explanation;
- "unlock VISION" meant "learn a new UI control", which is the wrong kind of
  discovery for what is a story beat about what the town can see.

They are now two things:

| | What it is | How it is reached | When |
| --- | --- | --- | --- |
| **Plan view** | A view of the town from above | `Q`, or the `PLAN` button | Always, from the first frame |
| **SAFEtrace VISION** | A story unlock | — | When Devon is stopped |

`Intent.planView` replaces `Intent.vision`; `Sim.planViewActive` /
`planViewBlend` replace `visionActive` / `visionBlend`; `Settings.holdForPlanView`
replaces `holdForVision`. `visionUnlocked` survives, unchanged, and now gates
only *content*.

### What each state of the view contains

The split fell exactly along a seam the renderer already had:

**Base (VISION locked)** — a plan of a suburb, which is a thing a resident is
entitled to have: ground, the 20 m grid, surfaces, buildings drawn as buildings
are drawn on a plan, and the road graph. Plus a locator: one dot, a heading, and
the district, captioned `PLAN VIEW`. A map with no "you are here" is not a map.

**Unlocked** — the same view, plus what SAFEtrace makes of it: coverage cones,
network edges and nodes, drone footprints, evidence discs, the forecast, and
every subject bracketed with an identity, its flags and its score.

Unlocking fills in the map the player already had. It does not hand them a
button. The story beat says so — `SAFEtrace VISION — SUBJECT LAYER ENABLED`,
with `COVERAGE AND SUBJECTS NOW IN PLAN VIEW` — and that line is now identical
on both devices, because it describes content rather than a control.

An architecture test asserts the separation structurally: the blend reads
`intent.planView` and nothing else, and no file in `src/core` mentions
`visionUnlocked` at all.

---

## Part 2 — The mobile control pass

### Thumb zones

Left thumb: the movement pad, planted wherever it lands, in the lower-left.
Right thumb: everything you press.

The pad's right edge used to be a fixed 55 % of the width, which is the wrong
tool — at 430 px it is nowhere near the buttons and at 320 px it runs straight
into one. It is now *derived*: whichever is smaller, its share of the width or
the clear air left to the leftmost button's touch target, with a floor so it
stays usable on any phone that exists. Move a button and the pad gets out of its
way on its own.

### The cluster

Three controls, on the arc a right thumb sweeps from the bottom-right corner:

| | Weight | Drawn | Target | Why there |
| --- | --- | --- | --- | --- |
| `SLING` | primary | r 34 | r 44 | The corner, under the resting thumb: it leads to a whole mode and should be findable without looking |
| `TRICK` | primary | r 34 | r 44 | Up-and-left along the sweep — a flick, not a stretch, and the vertical component is what buys clearance from the pad on a 320 px phone |
| `PLAN` | secondary | r 24 | r 34 | Further up the same column: a deliberate extension of the thumb, not somewhere a thumb lands on its way back from TRICK |

**The drawn circle and the touch target are separate numbers.** That is what
lets `PLAN` read as furniture — smaller, thinner rim, lower resting alpha — and
still take a 68 px-wide thumb. Apple's floor is 44 pt; the primaries are 88 px
across and the secondary 68.

The elliptical hit test is gone. It was a way of buying a big target out of a
small drawn button, and it made "can these two be pressed at once" a question
nobody could answer by looking. Targets are plain circles now, so separation is
one subtraction — and a test sweeps every phone in the matrix at 5 px and
asserts no point on the glass falls inside two of them.

### Hierarchy and state

Primaries: full size, brighter rim, higher resting alpha. Secondary: smaller,
thinner, quieter. What does *not* differ is how easy either is to hit.

`PLAN` is the one control that stays on while the thumb is down, so it is the
one that needed a *state* rather than a press flash — its rim and glyph go teal
while it is held. The only other tell was a border at the edge of the screen, a
long way from the finger holding it open.

All three now share one typographic system: a mark over its own name, same face,
same size relative to the button, same baseline.

### The slingshot, as a stick and a string

It was a machined fork with one wide rubber band folded through a point: two
straight lines, one thick V and a dot. That is a diagram of a catapult, and it
collapsed into a letter Y at every size it was drawn at.

What a fourteen-year-old actually has is a forked branch cut out of a hedge, and
the in-hand view now draws exactly that — limbs that taper from the grip to the
tips and bend rather than ruling straight, a stub where a twig was taken off,
whipping turns where the cord is bound to each prong, two separate cords, and a
scrap of leather between them holding the stone. Canvas has one line width per
path, so the taper is a run of short segments with round joins doing the
smoothing; that lives in `taperedStroke`, next to `roundRect`, because it is the
difference between an object and a letter.

Two things fell out of drawing it honestly:

- **String does not stretch the way rubber does**, so tension can no longer read
  from a band that thins. It reads from *sag* instead: the cords bow when the
  sling is slack and pull straight as the draw comes up.
- **Which cord goes to which end of the pouch** cannot be "whichever end is
  nearer". At a long draw the pouch is nearly edge-on, the two distances differ
  by a couple of pixels out of three hundred, and the answer flips — which draws
  the cords crossing in mid-air. Of the two possible pairings the shorter
  *total* is always the one that does not cross, for any geometry the player can
  produce, including drawing back past the fork.

The drawing hand is also seated back along the draw axis and behind the pouch
now, rather than at a fixed offset that covered the stone at long draws. The
stone is the thing being aimed; it stays visible.

The button glyph is the same object, but it is **not** the same drawing. Pulling
the pouch back below the crotch — correct in the aiming view, which has a whole
screen — put the cords, the pouch and the handle inside the same forty pixels
and fused them. What reads at button size is the object *at rest*: the string
spans the two tips and dips into the mouth of the fork, which is the one piece
of clear space the mark has, with the pouch and its stone at the bottom of the
dip. The limbs still taper and still bend.

### The bug this pass actually found

`html.touch #inspect { pointer-events: auto }` gave the node panel a touch
surface across its whole area. On a 375×629 phone the panel sits exactly where
the `PLAN` button is, so **every press of PLAN was silently swallowed by a
translucent box of text.** Invisible on a desktop viewport; total on a phone.
Three of five test viewports failed and two passed, which is what a layout
collision looks like from the outside.

Two fixes, both structural:

1. The panel is a readout; only its chips are controls. `#inspect` takes no
   pointer events, `.verb` does. An architecture test now scans both stylesheets
   and fails on any `pointer-events: auto` outside the full-screen modals and
   the chips.

2. The touch layer publishes its cluster's bounding box as CSS custom
   properties — `--control-right`, `--control-top`, `--pad-right` — at every
   viewport change, and the stylesheet positions the panels against them. The
   touch layout is now the single source of truth for both layers: move a button
   in `TOUCH_TUNING` and the DOM panels move out of its way by themselves. In
   portrait the node panel sits above the cluster; in landscape, where there is
   no vertical room and plenty of horizontal, it sits beside it.

The prompt pill also stops at the cluster and wraps instead of running its last
words underneath the SLING button and clipping them.

### Safe areas

Every drawn circle sits 28 px inside the safe area, and the test asserts the
*touch target* — not the drawn circle — clears the home indicator, the notch and
the edges on every viewport in the matrix. The plan-view frame is inset by the
safe area too, so it is a frame rather than something half-swallowed by a notch.

### Slingshot

Unchanged in substance, and re-verified against the specific complaint:
"releasing one finger causes the aimer to jump toward the finger that remains".
Measured in a browser on a 390×664 phone — left thumb drags 90 px, right thumb
draws to full, **left thumb released with the right still down: aim moves
0.00000 rad**; right thumb keeps moving afterwards: 0.00000. Both directions are
now unit tests as well.

One presentational change: the drawing hand is drawn from the first frame rather
than appearing once the right thumb is already down, and the sling rests in the
middle of the half of the glass that holds it. A player entering the mode sees a
slingshot held in two hands, one at each thumb's home — the object is the
instruction, with no hint text, no ring and no label.

---

## What was tested

Unit: 352 tests, including a nine-viewport ergonomics matrix — iPhone SE (1st
and 3rd gen), 13 mini, 13/15, 15 Pro, 15 Pro Max, full-screen and
browser-chrome heights, plus two landscape sizes — asserting target size,
separation, safe-area clearance, pad clearance, thumb-side placement, screen
coverage and the aim-mode split on each.

Browser: five viewports driven through Chromium with real multi-touch, checking
the layout numbers, the plan view held with VISION locked and unlocked, the
button list before and after the unlock, and the two-thumb sling end to end.
Plus desktop `Q` in both states.

## Remaining concerns

- **Emulated insets.** Chromium's device emulation does not apply
  `env(safe-area-inset-*)`, so the browser checks ran with zero insets and the
  inset cases are covered arithmetically by the unit matrix rather than visually.
  Worth one pass on real hardware.
- **Coverage on a 320 px screen.** The controls deliberately do not shrink on
  the smallest phone — that is the screen where a thumb needs them most — so
  they cover 6.2 % of an original SE's glass against ~3 % on a Pro Max. That is
  the right trade, but it is the tightest the layout gets.
- **Landscape verticals.** The cluster is a fixed 254 px tall from the bottom
  edge. On a 390 px-tall landscape viewport that is most of the right-hand
  height, which is why the panels move *beside* it there rather than above it. A
  shorter landscape viewport than that is not something an iPhone produces, but
  it is the first thing that would break.
