# 06 — Skating Specification

## 1. Requirement

Skating is not faster walking. It is the game's primary expressive instrument.
The success test: **a good player should be legible to a spectator as good**,
purely from how they move through a street.

## 2. States

```
FOOT      2.6 m/s. Can enter anywhere. Board carried. Used for tight interiors,
          stairs, ladders, and picking the board back up.
PUSH      Transient. Adds impulse along heading.
ROLL      The default. Momentum-driven.
AIR       After an ollie or a drop. No steering authority beyond a small nudge.
SLIDE     Powerslide. High steering authority, heavy speed bleed.
BAIL      Failure state on a bad landing. 1.1 s recovery, board rolls away.
```

Transitions are instantaneous where possible. There is no animation lock longer
than 250 ms anywhere in this list except BAIL, which is a punishment.

## 3. Physics model

Simulated at 60 Hz, in metres.

```
maxSpeed        11.0 m/s base, 13.5 with full flow
pushImpulse     3.1 m/s, decaying to 0 at maxSpeed (cannot push past the cap)
pushCooldown    0.42 s (rhythm is deliberate; mashing does nothing)
rollFriction    surface-dependent, see table
carveRate       3.4 rad/s at low speed, falling to 1.1 rad/s at maxSpeed
                (turning radius grows with speed — this is the whole feel)
lateralGrip     0.86; excess lateral velocity is shed, not clamped, so hard
                carves *drift* slightly
ollieImpulse    3.6 m/s vertical, 0.52 s airtime, preserves horizontal velocity
slideFriction   6.5 m/s², steering authority 4.6 rad/s
gravity         21 m/s² (heightened; suburban skating is not a physics paper)
```

### Surfaces

| Surface | Roll friction | Notes |
|---|---|---|
| Asphalt | 0.55 m/s² | The road. Fast, smooth, watched. |
| Smooth concrete | 0.38 | The Channel and the plaza. Fastest in town. |
| Rough concrete | 0.95 | Sidewalks with joints. Slight vibration in feel and sound. |
| Grass | 6.2 | Effectively a wall at speed. Kills lines. |
| Gravel | 4.0 | Bail chance scales with speed. |
| Dirt | 2.6 | Passable, slow, the construction site. |

Surface is queried from world polygons, not tiles, so a driveway apron can be a
one-metre strip of smooth concrete inside grass, and that matters.

### Terrain features

- **Bank / transition**: converts vertical drop into horizontal speed at 0.78
  efficiency, and gives an airtime bonus off the lip.
- **Ledge / rail**: not grindable in the slice. Deliberate cut — see §7.
- **Kicker / ramp**: authored impulse vector; the loading dock, the plaza
  planters, and the Channel's inlet aprons are all kickers.
- **Drop**: any height change. Landing within 12° of the surface direction is
  clean; outside that, BAIL.
- **Curb**: 0.15 m. Ollie clears it. Hitting it at >6 m/s without an ollie is a
  BAIL. Curbs are therefore real, and streets have texture.

## 4. Flow

`flow` ∈ [0,1]. Rises while: speed > 60% of cap, no bail, no full stop, and the
player is changing direction or clearing features. Falls while stationary or
grinding along a straight at constant heading.

Flow gives: +2.5 m/s to the speed cap, a tighter camera, a warmer audio bed, and
— **critically** — a direct multiplier on the player's `predictionError` term.

This is the design's best single idea and it must survive to ship: *flowing is
literally how you become unpredictable*. The skill mechanic and the theme are
the same mechanic.

## 5. Controls

```
Move / carve      A D  (or left stick X)
Push              W    (or A button) — tap rhythmically
Brake / slide     S    (or B held)
Ollie             Space (or A) — hold to load, release to pop, 0.25 s max load
Foot / board      Shift
Aim slingshot     Right mouse / Left trigger (hold or toggle, configurable)
Fire              Left mouse / Right trigger
SAFEtrace VISION  Q (hold or toggle)
Phone / inspect   E on a highlighted node
```

Eight verbs. That is the whole game. Nothing is added later; things become
*combinable* later.

## 6. Feel checklist (subjective, tested by playing)

- Pushing feels like pushing: there is a shoulder-and-leg rhythm to it.
- Carving at speed feels heavy and committed; carving slow feels flickable.
- Landing a drop cleanly produces an audible, tactile *thunk* and no speed loss.
- Grass is genuinely upsetting to hit.
- The camera pulls back and looks ahead as you go faster, so speed reads.
- You can cross Maple Court in one push if you pick the right line.

## 7. Deliberate cuts

- **Grinds and manuals are cut from the slice.** They are the natural next
  addition, but a half-implemented grind system would immediately make this feel
  like a worse skateboarding game rather than a good SAFETRACE. Basic movement
  is proven first, per the brief's own instruction.
- **Trick scoring is cut permanently.** A score popup would tell the player this
  is a skateboarding game about points. It is not. Flow replaces it, and flow
  feeds surveillance rather than a scoreboard.
