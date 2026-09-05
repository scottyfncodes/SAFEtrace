# 30 — Telling people apart

Tenth pass. One report, for the third time in a row:

> The cop is still hunting me immediately.

The two previous passes answered this by working on the pursuit machinery —
first removing the scripted anomaly that mobilised a unit twenty seconds in,
then replacing implicit "wanted" arithmetic with an explicit state machine that
starts every session `NOT_PURSUING` and can only be started by a reported
offence. Both were real fixes. Neither was the answer, because **the complaint
was never about the simulation.**

## What the measurement said

Two probes settled it.

First, the same probe run against this branch and against the build the live
site was serving — the state before any of this session's work:

| | This branch | The deployed build |
| --- | --- | --- |
| Three minutes of skating | never pursued, closest officer 90 m | never pursued, closest officer 90 m |
| Shooting the nearest bin | a *drone* investigates the bin | a *drone* investigates the bin |
| Standing still two minutes | never pursued, closest officer 64 m | never pursued, closest officer 64 m |

Identical. So "you are playing an old build" was wrong, and so was every theory
that lived in `dispatch.ts`.

Second, a probe that asked what is actually *on screen* during ordinary play,
sampling what falls inside the camera's frustum:

```
officer in frame:   0%
resident in frame:  31%
residents in the town: 19        officers: 2
```

An officer is essentially never in shot. A resident is in shot a third of the
time. Whatever the player has been calling a cop for three passes, it is
overwhelmingly likely to have been somebody walking to the shops.

## Why that was inevitable

```
for (const n of sim.npcs)     this.person(cam, n.pos, '#6D7A88');
for (const p of sim.patrols)  this.person(cam, p.pos,
  p.state === 'INTERVENING' ? VENEER.warning : '#5A6470');
```

A resident was one desaturated blue-grey. An officer was a slightly darker
desaturated blue-grey, on an identical silhouette, at the size a person subtends
on a phone through a 40° lens from twenty-five metres back. They are the same
figure.

And the officer only changed colour at `INTERVENING` — the *last* state, the one
where he is already standing next to you. Through `ALERT`, `PURSUING`, `LOST` and
`SEARCHING` — the entire pursuit — he looked exactly like a neighbour.

So the game was simultaneously telling the player that nineteen pedestrians
might be police and that an actual pursuing officer might be a pedestrian. There
is no state machine that fixes that.

## Three changes, all in the renderer

**Residents wear their own clothes.** Each takes a stable colour from an
eight-entry civilian palette, hashed from its own id, so the same neighbour is
the same colour every time you pass them and nineteen people stop reading as a
squad. Uniformity was itself the tell: identical figures read as personnel.

**An officer looks like an officer.** A uniform darker and bluer than anything a
resident wears, and a cap. The cap matters more than the colour — the eye reads
an outline long before it reads a hue, and at a hundred metres the broken
silhouette is the whole signal.

**An officer's interest in you is legible before he arrives.** A shoulder light,
dark on a routine beat, amber when responding, red when he is coming for you.
That maps onto `PatrolState`, which maps onto the pursuit machine from pass 28:
routine is nobody's business, amber is somebody going somewhere, red is you.

## And Devon was riding nothing

`Devon` — who skates with the player, follows at five and a half metres, and
matches their speed — was drawn with `person()`. Bolt upright, no board, gliding
along behind you at your exact speed, in blue, from the first second of the
session.

A figure that holds station behind you at your own speed and never gets on
anything is not a friend skating along. It is a tail. Of everything in frame it
is the single best match for "hunting me *immediately*", because it is the only
thing that is there immediately and stays.

Devon gets a board, and a lower riding stance to go with it.

## The lesson worth keeping

Three passes were spent making the simulation behave, and the simulation was
already behaving in every one of them. The bug was that the player could not
read the screen, and no amount of correctness in `sim/` is visible through a
renderer that draws the constable and the neighbour as the same grey lozenge.

When a report survives a fix that the tests say worked, the next question is not
"what else is wrong with the mechanism" — it is "what is the player actually
looking at".
