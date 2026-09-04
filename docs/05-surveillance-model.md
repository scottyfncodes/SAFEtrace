# 05 — Surveillance System Model

This is the most important document in the set. SAFEtrace must be a *simulation*
that produces situations nobody scripted.

## 1. Entities

```ts
Subject      identity, kind (resident | player | unknown), position, history
Sensor       camera: pos, height, facing, fov, range, sweep, state, nodeId
Observation  { sensorId, subjectId, pos, tick, quality, identityConfidence }
Track        the system's *belief* about a subject: estimate, confidence, staleness,
             attributedIdentity, predicted path, behaviour flags
Incident     a reported event: kind, position, tick, subjectsOfInterest
Evidence     a physical trace: impact, offline node, anomaly; may carry an
             estimated origin and a linked subject
NetworkNode  a hackable thing: camera, junction, uplink, reader, sign, service
Asset        a drone or ground patrol that can be tasked
RiskModel    per-subject score with decomposed, inspectable contributions
```

Note the separation of **Subject** (the truth) from **Track** (the belief). The
entire game lives in the gap between those two objects.

## 2. The pipeline

```
sensors -> observations -> fusion -> tracks
                                      |-> behaviour classification
                                      |-> prediction
                                      '-> risk scoring -> dispatch -> assets
evidence ---------------------------------------------^
```

### 2.1 Observation
For each sensor, query the spatial hash for subjects inside `range`. Test the
cone (`|angleTo - facing| < fov/2`), then test occlusion against building and
fence segments. Compute `quality` from distance, angle off-axis, subject speed,
and lighting. `identityConfidence` derives from quality with a per-sensor
`recognitionBias`.

Sweeping cameras have a period and an arc. **The seam between two sweeping
cameras' coverage is authored, learnable content.**

### 2.2 Fusion — where the false positive lives
Observations update the matching track's estimate and raise confidence.
Confidence decays exponentially with time since last observation.

Identity attribution is the dangerous step. An observation with high `quality`
but genuinely ambiguous features can attribute to the *wrong* subject when:

- the correct subject has no active track nearby, and
- a candidate identity has high prior association with the location or incident
  type, and
- `identityConfidence` clears the acceptance threshold.

The system then reports a number — 98.7% — that describes its internal
agreement, not its correctness. Nothing in the code lies. That is the point, and
it is implemented honestly: the misattribution is a real outcome of the real
fusion rule, not a scripted flag.

### 2.3 Behaviour classification
From track history over a rolling window:

| Flag | Trigger |
|---|---|
| `NORMAL_TRANSIT` | On road graph, consistent heading, typical speed |
| `LOITERING` | Low displacement over a long window |
| `UNUSUAL_ROUTE` | Off road graph, or graph edge with low prior usage |
| `EVASIVE` | Repeated entries into low-coverage cells shortly after observation |
| `RECKLESS_VELOCITY` | Sustained speed above pedestrian norms in pedestrian zones |
| `PROXIMITY_TO_EVIDENCE` | Near an evidence event within its time window |

These are shown to the player verbatim. Learning them is learning the game.

### 2.4 Prediction
A track's forecast is a weighted walk over the road graph from its current
estimate, biased by heading, historical route priors for that identity, and
destination priors (home, school, commons). Output: a polyline with per-node
probability, 15 seconds ahead.

Prediction error is measured continuously. Two consequences:

- **High error → dispatch misses you.** Assets are sent to the forecast, not to
  your position.
- **High error → `BEHAVIORAL ANOMALY`.** Being unpredictable is itself scored.

This is the game's core tension expressed as one number.

### 2.5 Risk
```
risk = clamp( w_behaviour · Σ(flags)
            + w_evidence  · Σ(linked evidence, time-decayed)
            + w_incident  · proximityToOpenIncidents
            + w_anomaly   · predictionError
            + w_history   · priorContacts
            - decay(timeSinceLastObservation, behavingNormally) )
```

Every term is inspectable in VISION. The player can see *why* they are at 62%.
A system the player cannot audit is a random number generator with a UI.

### 2.6 Dispatch ladder
```
< 25   PASSIVE          nothing
25-45  MONITORING       nearby cameras prioritise this track; notification
45-65  DRONE_DISPATCH   nearest available drone -> INVESTIGATE at predicted pos
65-85  PATROL_DISPATCH  ground unit routed along road graph to intercept forecast
> 85   INTERVENTION     units converge; contact if reached
```

Assets are a finite pool. Three drones and two patrols for the whole district
means a decoy in Northgate genuinely empties the south side. **Attention is a
resource the player can move.**

## 3. Evidence and trajectory analysis

Physical interference creates `Evidence`. If the impact was observed, or the
impact geometry allows reconstruction, SAFEtrace estimates an origin:

```
originEstimate = impactPoint - normalize(projectileVelocity) * estimatedRange
originUncertainty = f(observationQuality, impactAngleAmbiguity, range)
```

It then searches for tracks that were inside the uncertainty disc at the impact
tick. If exactly one is found with sufficient confidence, evidence links to that
subject and their risk jumps. If several or none are found: `ORIGIN
INDETERMINATE`.

The player learns to shoot from cover, at oblique angles, from crowds, or from
positions that place the estimate somewhere they are not. **Framing the geometry
is a skill.**

## 4. Network graph

Nodes have `segment`, and segments have an `uplink`. Effects propagate:

- Disable a camera → one blind cone, small evidence.
- Disable a junction → its segment degrades, medium evidence, self-heals in ~90 s.
- Disable an uplink → a whole district's cameras go to cached mode, very large
  evidence, dispatches an engineer. Rarely correct, always available.

Integrity checks run on tampered nodes; a looped feed is discovered after a
window, retroactively creating evidence at the loop's location. Cheating is
possible but not free.

## 5. Emergence requirements

The design is only successful if these are all possible without scripting:

- Shooting a trash can to pull a drone off a route, then taking the route.
- Looping a camera that watches the seam another camera sweeps into.
- Being wrongly linked to evidence because you happened to skate past it.
- Deliberately establishing a predictable route for ten minutes so that a
  forecast can be broken at a chosen moment.
- Two dispatched assets converging on a forecast you abandoned, leaving the
  Commons uncovered.

Each is a consequence of the rules above, not a special case.
