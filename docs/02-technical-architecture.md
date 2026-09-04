# 02 — Technical Architecture

## 1. Stack decision

**TypeScript + Vite + Canvas2D, no engine.**

Rationale, in order of weight:

1. **The veneer coming off is a data problem, not a shader problem.** Because the
   entire town is authored as vector geometry and typed records, "machine
   vision" is not an effect painted over a screenshot. It is a second renderer
   drawing the *same data structures* the simulation actually uses. The
   thematic promise ("you are finally seeing what was underneath") becomes
   literally true. An engine with baked meshes and textures would make this
   harder, not easier.
2. Zero asset pipeline means zero asset bottleneck. See `14-asset-strategy.md`.
3. Instant iteration and trivially testable simulation code.
4. Runs anywhere, including in a reviewer's browser.

Canvas2D over WebGL: the art direction (flat vector shapes, long soft shadows,
crisp lines) is exactly what Canvas2D is good at, and the world is small enough
that draw-call count is not the constraint. Static geometry is pre-composited to
offscreen layers; only dynamics redraw per frame. If profiling later demands it,
the renderer is behind an interface and can be swapped without touching the
simulation.

## 2. Hard architectural rule: simulation never touches presentation

```
src/sim/**      pure, deterministic, no DOM, no canvas, no Date.now, no Math.random
src/render/**   reads sim state, writes pixels, owns no gameplay truth
src/ui/**       reads sim state + event bus, writes DOM
src/audio/**    reads event bus only
```

`src/sim` imports nothing from `render`, `ui`, or `audio`. This is enforced by a
lint rule and by a test. It exists so that:

- surveillance logic is unit-testable without a canvas,
- the game can be stepped headlessly for balance runs,
- replays and determinism are achievable.

## 3. Determinism

- Fixed simulation timestep of **1/60 s**, accumulator-driven, max 5 catch-up
  steps per frame. Rendering interpolates between the last two sim states.
- All randomness flows through a seeded `Rng` (mulberry32) owned by the sim.
  `Math.random` is banned in `src/sim` by lint.
- All time is `sim.tick` (integer) or `sim.time` (derived seconds). `Date.now()`
  is banned in `src/sim`.

Determinism is not a feature for players. It is a tool: it makes surveillance
bugs reproducible, which matters enormously for a system this emergent.

## 4. Module map

```
src/core/        engine primitives, no game knowledge
  math.ts        vec2, geometry, easing, angle helpers
  rng.ts         seeded deterministic RNG
  loop.ts        fixed-timestep game loop
  events.ts      typed pub/sub bus
  input.ts       keyboard/mouse/gamepad -> intent struct
  settings.ts    persisted accessibility + tuning config

src/sim/         the game, as pure logic
  world.ts       geometry queries: surfaces, occluders, cover, road graph, spatial hash
  player.ts      skating model
  slingshot.ts   projectile physics + impact resolution
  npc.ts         ambient residents
  drone.ts       aerial units
  patrol.ts      ground units
  surveillance/
    types.ts     Subject, Track, Observation, Incident, Evidence, Node
    sensors.ts   camera visibility + observation generation
    fusion.ts    observations -> tracks, identity attribution (and misattribution)
    behavior.ts  track history -> behaviour classification
    prediction.ts road-graph forecast of a track
    risk.ts      scoring model
    evidence.ts  impacts, trajectory analysis, origin estimation, subject linking
    network.ts   the hackable graph: nodes, segments, uplinks, actions
    dispatch.ts  escalation ladder and asset tasking
  sim.ts         orchestrator; owns tick order

src/content/     data, not code
  bellhaven.ts   the town
  copy.ts        every string SAFEtrace says
  story.ts       beat definitions and triggers

src/render/      presentation
  palette.ts     the three colour systems
  camera.ts      view transform, follow, lookahead, shake
  veneer.ts      the beautiful world
  machine.ts     the world as data
  effects.ts     particles, transitions, the peel
  renderer.ts    orchestration + layer compositing

src/ui/          DOM
  ad.ts          the opening advertisement
  hud.ts         diegetic phone HUD
  notifications.ts SAFEtrace message stack
  phone.ts       inspect/hack interface

src/audio/       WebAudio, fully synthesised
```

## 5. Tick order (this order is load-bearing)

```
1  input        -> intent
2  player       -> movement, board physics
3  projectiles  -> flight, impacts, evidence creation
4  npcs         -> ambient movement
5  sensors      -> observations (cone + occlusion)
6  fusion       -> tracks updated, identity attributed
7  behavior     -> classification flags
8  prediction   -> forecast paths
9  risk         -> scores
10 evidence     -> trajectory analysis, subject linking
11 dispatch     -> escalation, asset tasking
12 drones/patrols -> act on their orders
13 story        -> beat triggers evaluated
14 events       -> flush bus to ui/audio
```

Sensors run *after* movement so the system always reacts to the present frame,
never a stale one. Dispatch runs *after* prediction so patrols route to where
the model thinks you are going, which is the entire point.

## 6. Data-driven content

The town is a plain object graph in `src/content/bellhaven.ts`, built through a
small authoring DSL (`road()`, `house()`, `camera()`, `ramp()`...). No parser, no
custom file format, no editor to build. It is typed, it is diffable, and
changing a camera's field of view is a one-line edit that the test suite
validates.

A `validateWorld()` pass runs at boot in dev and in CI: every sensor must belong
to a network segment, every segment to an uplink, every road node must be
reachable, no building may overlap a road centreline.

## 7. Performance posture

- Static veneer geometry composites once into tiled offscreen canvases.
- Spatial hash (8 m cells) for sensor/subject/occluder queries.
- Sensor visibility is the only O(n·m) risk; it is bounded by querying the hash
  for subjects within sensor range first, typically 0–3 candidates.
- Target 60 fps at 1080p on integrated graphics. Measured, not assumed.

No optimisation beyond this until a profile says otherwise.

## 8. Accessibility as architecture, not a menu

Input goes through an intent layer, so remapping and hold-vs-toggle are free.
`settings.ts` carries: hold/toggle for VISION and aim, camera shake scale,
flash/glitch intensity (the machine-vision transition can be reduced to a soft
cross-fade), text size, colour-blind-safe machine palette, and a movement
assist that widens carve tolerance. None of these are afterthoughts; the
transition effects in particular are authored with a low-intensity variant.
