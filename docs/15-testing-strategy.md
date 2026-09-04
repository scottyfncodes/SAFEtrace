# 15 — Testing Strategy

## 1. What is worth testing

Not the rendering. Not the feel. **The simulation**, because it is emergent, and
emergent systems fail in ways that playtesting discovers late and expensively.

## 2. Layers

### Unit — the surveillance pipeline
Vitest, no DOM. The sim is pure and steppable, so tests read as scenarios:

- A subject inside a cone with clear line of sight produces an observation.
- The same subject behind a building produces none.
- Track confidence decays to below threshold after N unobserved seconds.
- Behaviour classification flags LOITERING at the authored thresholds.
- Prediction follows the road graph and its error rises when the subject leaves it.
- Risk decomposition sums to the reported score (no hidden terms — a real bug
  class in a system the player is meant to audit).
- Dispatch escalates and de-escalates at the documented thresholds.
- Trajectory analysis links the correct subject when one candidate is in the
  uncertainty disc, and reports INDETERMINATE when zero or several are.
- **The false positive is reachable from the honest rules**, with a regression
  test that asserts fusion misattributes under the documented conditions. If a
  refactor ever makes the false positive impossible, the game's premise breaks
  silently. This test protects the story.

### Property / fuzz
Step the sim for 30 simulated minutes with a seeded random-input agent and
assert invariants:

- risk ∈ [0,100] always
- no NaN in any position, velocity, or score
- assets never exceed the pool size
- every task references a live entity
- tracks never reference deleted subjects

### Determinism
Two runs with the same seed and the same recorded input produce byte-identical
state hashes at every 600th tick. This catches accidental `Math.random`,
`Date.now`, and iteration-order dependencies, all of which are easy to introduce
and nearly impossible to debug later.

### Architecture tests
- No file in `src/sim` imports from `render`, `ui`, `audio`, or touches `window`.
- No `Math.random` or `Date.now` in `src/sim`.
These are cheap and they protect the property that makes everything else
testable.

### Content validation
`validateWorld()` runs in CI over the shipped town:
- every sensor has a segment, every segment an uplink
- the road graph is connected
- no camera's cone origin is inside a building
- every district is reachable from every other by at least two routes, one of
  which has coverage below a threshold (this asserts the *design* of §3 of the
  world doc, which is a genuinely useful thing to have a computer check)

## 3. What is tested by humans

Feel, pacing, comprehension. Structured playtests with one question each:

- Session A: can they skate? (no instruction, four minutes)
- Session B: do they notice the cameras? (record the minute at which they first
  look at one)
- Session C: does the false positive land? (record what they say)
- Session D: can they explain how SAFEtrace decided? (the real success metric)

Session D is the one that matters. If a player cannot explain the system after
the slice, the systems are opaque and the game has failed, regardless of how
good it feels.

## 4. CI

Typecheck, lint, unit, determinism, and content validation on every push.
Fast — under a minute — because nothing in it needs a browser.
