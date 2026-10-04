# 41 — The Mood of the Town

The inked town ([40](40-the-inked-town.md)) was one afternoon, drawn once.
This pass makes the picture answer the game: **the more the surveillance
state has control, the darker and more sinister the town; every bit of
sabotage and uncovering brightens it.** It also adds a layer of drawn
detail the street was short of — porches, drainpipes, aerials, birds, chalk.

Nothing in the simulation changed. The mood is read from it, never written
to it, and a tested module says so.

![Lit, ordinary, owned: the same street at the three ends of the mood](art/41/mood-three.jpg)

## 1. The mood, as a number

`src/render/mood.ts` reads the simulation into two quantities pulled against
each other, and the art reads their difference:

| | What it is | Read from |
|---|---|---|
| **Grip** | the system's hold on the player *right now* | risk score (45%), escalation ladder (25%), scrutiny where they stand (20%), a lens on them now, units responding |
| **Cut** | what the player has taken from the system *over the afternoon* | nodes looped, tampered or down (the big lever, 55%, on a square root so the first one counts most), cameras noticed (20%), clues written (20%), VISION (12%) |

`control = grip − cut`, clamped to −1..1. Grip rises in a moment and falls
back as the town forgets; cut only grows. So an afternoon of sabotage keeps
the town lit even while the player is being chased through it, and a quiet
player who has done nothing sees the town exactly as [40](40-the-inked-town.md)
drew it.

The renderer eases toward the value over about a second and a half, so a
looped node *brightens* the street rather than switching it. Tests hold the
direction of every input, the bounds, that a fresh afternoon is ordinary,
and that reading the mood changes nothing in the simulation.

## 2. What darkens

Owned (control → +1). Structure first, wash second — the brief's warning
against "simply desaturated 3D" applies to this pass more than any other.

- **The page.** The paper goes down toward a cold slate; the ground past the
  modelled edge with it.
- **The sky.** More rules, closer together, heavier and darker: a low lid.
- **The system's own lines on the town.** A cyan wedge on the ground in
  front of **every** working camera — the plan's coverage cones, leaking
  into the street — orange for the one that has you. They come up past
  control 0.3 and vanish the moment the town is cut loose.
- **Every lens glows.** A soft cyan halo on each working camera: in the dark
  the cyan points are the first thing you see, and they are everywhere.
- **SAFEtrace's plates go up on the poles.** A white plate with the wordmark
  and one cyan band at head height, first on one pole in ten and then on
  most of them, chosen by hash so they come up in a stable order.
- **The lamps go out.** Windows that had somebody home go dark; curtains
  closed.
- **Hoods go up.** More residents walk with their hoods up and heads down.
- **Shadows lengthen** — the same sun, later in the day.
- **The birds leave.**
- **The tags are painted out.**
- **The tone goes denser:** a finer, heavier hatch on walls, shadows and
  trees past control 0.45.
- **Then the wash.** A multiply wash in a cool grey over the whole page, and
  ink closing in from the top and bottom edges. Never more than a tint; it
  agrees with the structure rather than carrying it. The rider is in the dark
  with everything else — that is what being owned looks like — and stays
  the warmest thing on the page.

## 3. What brightens

Lit (control → −1):

- **The page warms and lightens**, and a thin warm screen lifts every wash.
- **Fewer, fainter sky rules.**
- **More rooms have somebody home:** the dark panes that might have been
  lit, are.
- **The birds come back,** more of them, on every wire.
- **Chalk on the pavements:** hopscotch grids and suns with rays, in pale
  chalk on the footways, drawn only while the mood is on the kid's side.
- **The tags are louder.**
- **The edges open up:** the bottom vignette eases off.
- **Nothing of the system's is drawn** beyond its hardware: no cones, no
  plates, no halos. The kid's own amber pencil (evidence markers, ruled
  sightlines) is what is left on the street.

## 4. Detail, regardless of mood

Added to every building and street for character:

- **Porches:** a step up to each house's front door, and a canopy on two
  posts over it.
- **Drainpipes** down one end of most walls, inked.
- **TV aerials** lashed to a third of the chimneys.
- **Birds** on the wires (mood decides how many).
- **Chalk** sites authored into the street dressing (mood decides whether
  they are drawn).

## 5. Architecture

- `src/render/mood.ts` — `readMood(sim)` → inputs, `moodFrom(inputs)` →
  `{ grip, cut, control }`, both pure; `moodOf(sim)` is the pair. Tested in
  `tests/mood.test.ts`.
- `renderer.ts` — computes the mood each frame, eases it, hands it to the
  street view. `moodOverride` lets a harness pin it.
- `perspective.ts` — `pageFor(control)` turns the mood into the page (paper,
  rules, wash) once per frame; every cue above reads `this.page`. Window and
  tag decals carry flags (`lit`, `tag`) and are resolved at collect time.
  Street dressing gains `chalk`; buildings gain `porch` and `aerial`.
- `tone.ts` — a `dense` variant of each screentone, cached alongside.
- `scripts/shots.mjs` — `SHOT_MOOD=-1..1` pins the mood for a capture;
  `SHOT_ONLY=1` captures just the two most useful frames.
- No file in `src/sim` changed. No gameplay, simulation state, collision or
  camera change.

## 6. Results

Performance (median world-draw time, run alone, same session):

| | Phone | Phone 4× | Desktop | Desktop 4× | Faces |
|---|---|---|---|---|---|
| Base (40, merged) | 6.7–7.1 ms | 33–36 ms | 6.8 ms | 34–35 ms | 990–995 |
| Ordinary (0) | 7.1 ms | 35.8 ms | 7.3 ms | 36.1 ms | 1,071 |
| Owned (+1) | 6.9 ms | 35.6 ms | 7.9 ms | 36.6 ms | 1,106 |
| Lit (−1) | 7.4 ms | 37.7 ms | 8.9 ms | 39.1 ms | 1,170 |

The machine these were taken on ran about 50% slower than the one in
[40](40-the-inked-town.md)'s table all day, so only the rows against each
other mean anything; the base row is the merged branch measured the same
way, in the same session, minutes apart.

Against the base: about 5% more in the ordinary state (the porches,
drainpipes and aerials, and the per-frame page), the same when owned, and
5–10% more when lit (chalk and birds). Faces per frame rise by about 80 in
the ordinary state and 100–180 at either end of the mood.

## 7. Still to do

- **The wash is global.** A lamp-lit window in an owned town is a dark
  window; there is no local light. A later pass could let a few windows and
  the lenses *cast* light on the ground in an owned town — the one place a
  warm wash would mean something.
- **Sound** does not know the mood. The audio layer reads the same bus; a
  lower, emptier mix in an owned town is the obvious pair to this.
- **The plan view** is unchanged, and should probably not change: it is the
  system's register, and the system's picture of the town does not get
  darker when the system is winning.
- **People** could do more than put their hoods up: walk faster, stop
  talking, cross the road. That is simulation, and belongs to it.
