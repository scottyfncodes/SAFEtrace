# 18 — Phase 8 Readiness Gate

**Audit date:** 2026-09-04
**Commit audited:** `2c090ac` (branch `claude/safetrace-game-foundation-0aksik`)
**Tests:** 119 passing, 7 files, ~5 s, headless
**Build:** clean — `tsc --noEmit` passes, `vite build` produces 153 kB JS (51 kB gzipped), 12 kB CSS
**Runtime:** 60–61 fps on desktop 1280×760 and on emulated iPhone 390/393/430 at DPR 3; console clean of errors and warnings

**Decision: GO**, conditional. See §8.

---
## 1. What is genuinely implemented

These are built, wired, exercised by tests, and verified in a browser.

| System | State |
|---|---|
| Deterministic fixed-step core, seeded RNG, typed event bus | Sound |
| Observation → fusion → behaviour → prediction → risk → dispatch | Sound; the whole pipeline runs every tick |
| Subject vs Track separation | Sound, and the false positive is a real outcome of the honest attribution rule |
| Skating: push, carve, ollie, slide, bail, flow, surfaces, features | Sound |
| Slingshot with real ballistics, and range reconstruction from impact geometry | Sound |
| Evidence, trajectory analysis, subject linking, `ORIGIN INDETERMINATE` | Sound |
| Hackable network graph: QUERY, TRACE, LOOP, SUPPRESS, REROUTE, MASK | Sound |
| Drones with cover counterplay; ground patrols routing to the forecast | Sound |
| Veneer renderer, machine renderer, the peel, the residual | Sound |
| Advertisement, false-positive beat, annotated reprise | Sound |
| Touch controls, safe areas, viewport handling | Sound |
| Content validation of the shipped town, in CI | Sound |

## 2. What was documented but not implemented

Found by reading the code against the docs rather than trusting either.

| Claim | Reality | Action |
|---|---|---|
| Sensor visibility is bounded by a spatial hash (`02` §7) | Sensors and subjects were never indexed; the loop is genuinely O(n×m) | Measured instead of built. See §6. Doc corrected. |
| Camera count constancy "verified by a content test" (`17` §1) | No such test existed | Test written. It plays 80 s of the real story and asserts nothing was ever added. |
| Aim sway proportional to speed, inverse to flow (`06` §7, `07` §2) | `aimSway` was computed and discarded; the reticle used an invented number | Wired to both the shot and the reticle. |
| A six-record investigation chain (`08` §5) | `SERVICE` nodes were unreachable by any means, so the chain could not be performed or even authored | Capability built. Authoring is Phase 8. |
| Uplink loss degrades a district (`05` §4, `08` §2) | `applyUplinkLoss` had no call site | Dead code removed; recorded here as Phase 8 work. |
| Streetlight darkness (`07` targets) | `Sensor.light` is read but never written | Left in place, documented as unbuilt. Belongs with the night pass. |
| Camera servo as a designed audio moment (`12` §4) | `dwell` was counted every tick for every sensor and never read | Wired to a `sensor:noticed` event and the servo sound. |
| Drone `RELAY` state (`09` §2) | Declared, never entered | Recorded as unbuilt. |

## 3. What was fragile

- **Story sequencing ran on `window.setTimeout`.** Ten callbacks. Not reproducible from a seed, drifts away from the world whenever a tab is throttled, and would have multiplied with every Phase 8 beat. This was the single worst thing in the codebase.
- **VISION's cost existed only in the touch layer.** On a keyboard the player could aim and fire freely while the world was peeled open — the game's central tradeoff simply was not there.
- **No input buffering.** An ollie asked for a few frames early was dropped silently, which reads as a broken control rather than an early player.
- **A bail removed steering entirely** for 1.1 s. A bail should cost speed and time, not agency.

## 4. Architecture violations found

One, in spirit rather than letter: `src/content/story.ts` reached for DOM timers. The architecture test only guards `src/sim`, so it passed. Content is imported *by* the simulation, so this mattered.

No violations in `src/sim`: no presentation imports, no DOM, no `Math.random`, no `Date.now`. Verified by test and by direct scan.

## 5. Thesis audit

The thesis holds, and is now enforced rather than asserted.

- Every sensor, drone and patrol is created once, from content, at construction. A test plays through the incident and the intervention and asserts none were added.
- No world datum is act-gated: a scan for `act` / `unlockedAt` / `phase` keys in the shipped town returns nothing.
- Escalation is score-driven and per-encounter. A player can reach `INTERVENTION` in the first minute by behaving outrageously.
- Prediction runs on the road graph; the Channel, the greenway paths and the backyards are deliberately off it, and `distanceOffModel` distinguishes modelled pedestrian space (a plaza is ordinary) from unmodelled space (a drainage channel is not).
- Flow feeds prediction error directly, so skating well *is* becoming unpredictable.

**No system was found that behaves like enemy spawning.** Assets are a fixed pool of three drones and two patrols, and moving one is the point.

## 6. Scalability

Measured, not guessed:

| Scale | Sensors | Subjects | ms/tick | Frame share |
|---|---|---|---|---|
| Shipped slice | 42 | 20 | 0.33 | 2.0% |
| 4× / 3× | 168 | 60 | 0.67 | 4.0% |
| 6× / 4× | 252 | 80 | 1.19 | 7.1% |

Six times the sensors and four times the residents costs a fifteenth of a frame. Indexing subjects today would be speculative optimisation; a regression test holds the line, and the fix is localised to one function if a future district ever crosses it.

**Content architecture:** the authoring DSL is the right shape — `house()`, `road()`, `camera()`, `ledge()`, `path()` each emit geometry, surfaces, occluders, network nodes and graph edges together, so a camera cannot exist off a segment. New districts are data.

**Story architecture:** beats are declarative (`when` / `run`), and now schedule on simulation ticks. Hints are device-neutral, so no beat names a key or a gesture.

**The real gap:** there is no objective model. Beats emit messages; nothing represents what the player is trying to do. Fine for one authored sequence, will not survive several.

## 7. Mobile

Audited and hardened in the previous pass. Portrait-first at the three iPhone sizes plus landscape, safe-area insets, no scroll or pinch, 60 fps, gestures unit-tested from synthetic traces, and the simulation still never learns that touch exists. **No mobile architecture traps remain open.** Untested on real iOS Safari.

## 8. Risks, ranked and not inflated

### P0 — The slice has never been played by a human
Every acceptance criterion in `13-vertical-slice.md` is a claim about a person: that they understand how to move within thirty seconds, enjoy skating within two minutes, and notice a camera unprompted. The roadmap calls the skating gate *absolute*. I cannot clear it, and no quantity of content compensates for failing it.

### P1 — The investigation act is one button press
Reach `CM-207`, press QUERY, read three notifications. This is the beat that carries the game's entire argument — that confidence is not truth — and it is currently the thinnest thing in the slice. The documented evasion (a covered route, a slingshot seam, a LOOP, a drone slipped under the parking decks) is not authored at all.

### P2 — No objective model
Deferred deliberately. Build it when the second authored sequence needs it, not before.

## 9. Fixes made in this pass

1. Story scheduling moved from wall-clock timers to simulation ticks (`StoryContext.after`).
2. VISION's cost moved from the touch adapter into the simulation, so it applies to every input device and cannot drift between them. Looking suppresses push, aim, fire, ollie and interference; steering and braking remain, because looking should not be a crash.
3. `SERVICE` nodes made reachable: traced services can be read from anywhere, since a record has no location. This unblocks the six-record chain.
4. Aim sway wired to both the projectile and the reticle, so the reticle cannot promise accuracy the shot does not have.
5. Input buffering for ollie and push; an ollie asked for mid-air is honoured the instant there is ground.
6. Steering restored during a bail.
7. Camera servo wired to the previously discarded `dwell` counter.
8. Dead code removed: `coverageAt`, `isTracked`, `estimateError`, `displacementOver`, `shadowPos`, `droneDir`, `applyUplinkLoss`, `travelAngle`, `TAU_CONST`.
9. Test harness corrected: `place()` now points the board along its velocity, which was silently causing bails in tests.
10. Four documentation claims corrected to match the code.

**Regression coverage added:** 20 tests across story determinism, the VISION tradeoff, service reachability, input buffering, bail steering, aim sway, surveillance-inventory constancy, and a simulation-cost ceiling.

## 10. Decision

**GO**, on two conditions:

1. **The first Phase 8 slice is capped** at the scope in §11. It exists to prove the architecture scales, not to build the rest of the game.
2. **Human playtesting runs in parallel with it, not after it.** The P0 risk is the only one that can invalidate the direction, and the capped slice is small enough that a bad playtest costs days rather than months.

The evidence for GO: every P0 found in this audit is fixed and covered; the thesis is test-enforced; the simulation has measured headroom for several times the current world; and content is genuinely data. The evidence against a blanket GO is entirely §8's P0, which is a question about people, not code.

## 11. First Phase 8 production target

> **Built.** See `19-northgate-slice-01.md`. Delivered to cap: 26 buildings,
> 8 new sensors, 6 records, 1 authored evasion, 0 new mechanics, and no
> simulation architecture changes.


**Northgate, and the walk back through the records.**

Northgate is already a stub — eight houses, `CM-207`, `JX-207`, a plate reader, and segment `S-N2` on uplink `TX-2`. The story already points the player at it, and it needs no new mechanics.

Scope cap: **~25 buildings, ~8 sensors, one new network segment, the six-record chain, one authored evasion.** No new systems.

The new emergent interaction comes free from the existing graph: **`TX-2` serves both Northgate and Relay 12.** Degrading the segment where the player is standing takes cameras offline somewhere they are not — a consequence at a distance that teaches network topology without a word of explanation.

And one thing falls out of the model with no code at all: the player's `districtPriors.northgate` is 0.2, so simply going to look at the scene reads as an unusual route. The system will find it interesting that they investigated. That is the game.

## 12. Explicitly not to be built yet

Relay 12 infiltration · additional acts · night · Priya Venn on screen · grinds and manuals · a second false positive · additional districts beyond Northgate · a mission or quest system · save profiles · new tools or weapons · progression, cosmetics, achievements, monetisation · any new surveillance subsystem.
