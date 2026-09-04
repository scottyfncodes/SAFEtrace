# 19 — Phase 8, Slice 01: Northgate

**Built on:** `7044449`
**Purpose:** prove SAFETRACE can grow through authored content without new architecture.
**Scope:** capped by `18-phase-8-readiness.md` §11 and held to it.

---
## Scope, as delivered

| Target | Cap | Delivered |
|---|---|---|
| Buildings in Northgate | ~25 | **26** (was 14) |
| New sensors | 8 | **8** (district total 20) |
| Investigation records | 6 | **6** |
| Authored evasion sequences | 1 | **1** |
| New mechanics | 0 | **0** |
| New sensor types | 0 | **0** |
| New surveillance categories | 0 | **0** |

## Implementation approach

Northgate is authored in its own module, `src/content/northgate.ts`, against the
same builder the rest of the town uses. `bellhaven.ts` calls `authorNorthgate(b)`
where the old stub used to sit. That is the whole integration.

The district is *older* than Maple Court, and the geometry follows from that:
terraces backing onto a service alley, detached garages, a shop parade rather
than a plaza, a substation. Nothing was invented to make it interesting — the
interest comes from what an older street layout does to sightlines.

### What is there

- **8 houses** on Northgate Lane, **6 terraces** on the avenue side (moved here
  from `bellhaven.ts`, where they had been authored as "avenue infill").
- **5 garages** and **2 lock-up rows** backing onto the alley.
- **A parade** — grocer and launderette — with a service yard and an awning.
- **A substation** carrying the rear-service segment.
- **A bus shelter** on Vine Street, and the old telephone exchange on the corner.
- **Sable Lane**: a paved rear alley, off the road graph, with two carports over
  it and one break in the garage row.

### The 8 sensors

All existing kinds, all on existing infrastructure:

| Sensor | Kind | Purpose |
|---|---|---|
| `NORTHGATE LN — WEST` | street | Half of a travelling seam |
| `NORTHGATE LN — EAST` | street | The other half, half a cycle out of phase |
| `NORTHGATE PARADE — SHOPFRONT` | street | Retail frontage |
| `NORTHGATE PARADE — SERVICE DOOR` | doorbell | Low-bias, short range |
| `SUBSTATION — PERIMETER` | facility | Sweeping, on the yard corner |
| `VINE ST — SHELTER` | street | Watches where the alley crosses the street |
| `SABLE LANE — MID` | facility | Makes the alley cost something |
| `SABLE LANE — EAST ACCESS` | facility | Sweeps across the mouth and down the run |

A new segment, **`S-N3`**, carries the rear-service cameras. It hangs off the
same uplink (`TX-2`) as the street segment `S-N2`. This is the district's one
topology lesson: **the street and the alley do not fail together.** Knocking out
`JX-207` darkens the lane and leaves the alley watching; knocking out `JX-N3`
does the reverse. Knowing which junction serves which is worth more than
knocking either one down.

## The authored evasion

CM-207 faces the street. Everything else follows from that.

**Approach A — Northgate Lane.** Fast, direct, and straight into the cone of the
camera you came to read, plus two sweeping street cameras and a row of porch
cameras. Entirely viable if you are quick or willing to spend the risk.

**Approach B — Sable Lane.** The rear alley is off the road graph, so no
forecast runs along it: assets get dispatched to where the *street* says you are
going. The garage row breaks once, and the break comes out 12 m behind CM-207.
Two carports give overhead cover, so a drone that does come loses you.

It costs something. Off-graph movement reads as `UNUSUAL ROUTE` and drives
prediction error to 100%, so the system knows *something* is wrong while holding
no track at all. That is the intended feeling: **not "I found the stealth
corridor" but "I know where it thinks I'm going."**

Three ways in, each with a price — the west end past `SABLE LANE — MID`, the
Vine crossing past the shelter camera, the east mouth past a sweeping camera —
and one stretch in the middle that nothing covers.

And one thing that needed no code at all: the player's `districtPriors.northgate`
is 0.2. Going to look at the scene of the incident is itself anomalous. The
system finds it interesting that you investigated.

## The six-record chain

| # | Node | What it establishes |
|---|---|---|
| 1 | `CM-207` | The camera worked. No fault in 411 days. |
| 2 | `JX-207` | The frame arrived intact, in 240 ms, no retransmission. |
| 3 | `SVC-VISION` | It was matched against a gallery of enrolled schoolchildren. |
| 4 | `SVC-REVIEW` | At a threshold lowered from 99.0% to 97.0% — petitioned by 214 parents, two harms prevented, false positives up 340%, "WITHIN TOLERANCE", approved by Venn, P. |
| 5 | `SVC-PREDICT` | Against a boy the model associates with Northgate: 41 prior visits, nearest relative on that street. |
| 6 | `SVC-RECORD` | Contact logged, no further action, entry retained, retention indefinite, amendment not available. |

Nobody in that chain did anything wrong. That is the argument, and it is made
entirely by records the player chooses to open.

Two of the six are *places* — `CM-207` and `JX-207` are physical nodes you have
to stand at — so the investigation has a leg you actually skate. The four
services are records, and a record has no location: once traced, it reads from
anywhere.

## Changes outside content

Four, all small, all required by the slice rather than speculative:

1. **`builder.camera({ records })` and `builder.junction(…, records)`** — content
   may now author what a node says. Additive; defaults unchanged.
2. **`Sim.readNodes`** — a set of nodes whose records the player has actually had
   in front of them, distinct from `discoveredNodes` (which only means an edge
   named it). An investigation is a sequence of things read, not things pointed
   at, and the chain cannot be tracked without the distinction.
3. **Traced-record chips in the inspect panel**, with keyboard digits continuing
   past the verbs. Without this the chain existed in the simulation and was
   unreachable by a person, which is the same as not existing.
4. **`RECORD_CHAIN`** exported from story content, and the `understood` beat now
   requires all six records rather than two.

**No simulation architecture was changed to add a district.** Northgate needed
the builder, the existing sensor types, the existing network model, and nothing
else.

## Content bugs the tooling caught

Worth recording, because this is what the validator is for:

- **Three cameras placed inside buildings** — the substation perimeter camera in
  the plant room, the Sable Lane camera inside the lock-ups, the shelter camera
  inside the shelter. All three now sit on the facade.
- **A duplicated terrace row.** Moving the terraces into `northgate.ts` without
  removing them from `bellhaven.ts` produced 32 buildings and 23 sensors.
  Caught by the authored-count test on the first run.
- **A camera called `EAST ACCESS` that could not see the east access.** It faced
  straight down the alley; the mouth was outside its cone. Re-aimed across the
  mouth so its sweep now travels between the two.
- **A brittle test.** `tests/loop.test.ts` shot "the first bin in Northgate",
  which after this slice was one wedged between two shopfronts. It now picks a
  bin with clear ground behind it.

## Test coverage

`tests/northgate.test.ts` — 19 tests:

- authored building and sensor counts, and that no new sensor kind appeared
- the district passes the same structural validation as the rest of the town
- every camera is on a facade
- every sensor reaches an uplink through a valid segment
- street and rear service are on separate segments, both on `TX-2`
- Northgate is reachable through the road graph from the spawn
- Sable Lane is paved end to end and genuinely skateable
- Sable Lane is off the road graph
- the garage row breaks exactly once, and the break is within reach of CM-207
- both alley entrances are watched and the middle is not — asserted by sweeping
  each camera through its full cycle and checking what it can ever see
- overhead cover exists on the alley and not in the break
- taking the alley flags `UNUSUAL_ROUTE` but stays under the dispatch threshold
- the street approach still works, and CM-207 sees you on it
- six distinct records, each saying something the others do not
- the causal chain reads correctly end to end
- every record is reachable by following edges from CM-207
- a record counts as read only once the player has held it
- the whole chain is walkable from the alley with no new mechanics

**Totals: 119 → 138 tests, 8 files.**

## Remaining limitations

- **Northgate has no interiors and no NPC schedules.** Residents walk the same
  ambient routes as everywhere else; nobody lives in these houses in any way the
  simulation models.
- **The alley is authored, not procedural.** A second district will need the same
  hand placement. That is the intended trade for now.
- **`SVC-REVIEW` names Venn, P. as an approver.** That is a signature on a
  record, not a character appearance; she remains unseen per the gate document.
- **The cross-district uplink consequence is still latent.** `TX-2` serves both
  Northgate and Relay 12, but uplinks are not ballistic targets and
  `applyUplinkLoss` was removed as dead code. Making that reachable is Relay 12
  work, and Relay 12 is out of scope.
- **Still unresolved: the human playtest criterion** from
  `18-phase-8-readiness.md` §8. Nothing in this slice bears on it, and nothing
  here should be read as evidence for it.

---

# Integration Gate

Run after Northgate was built, to check that the district is production-safe
before any further content is considered.

## What the re-audit found

Four issues, all in the district rather than the engine, and all now fixed.

**Three cameras did not observe what they were named after.**

| Camera | Fault | Fix |
|---|---|---|
| `NORTHGATE LN — WEST` | Faced across the lane rather than along it; covered a narrow band at its own x and nothing else | Moved west and re-aimed east along the street |
| `SUBSTATION — PERIMETER` | Aimed south-west, away from the yard it perimeters | Re-aimed south-east, into the yard |
| `VINE ST — SHELTER` | Mounted behind its own bus shelter, which blocked every sightline it had | Moved to the shelter's south-west corner |

The first two are naming-plausibility faults: the geometry was legal and the
camera saw *something*, just not the thing on its label. No engine check can
know what `SUBSTATION — PERIMETER` means, so this class belongs in a content
test, and there is now one that asserts each named camera can see its named
place at some point in its sweep.

**A player-facing dead end in the record chain.** `QUERY` names a node's edges;
only `TRACE` reveals what is on the other end. The traced-record list was built
from *named* nodes, so after a `QUERY` a player could jump to a record and find
an empty panel. The list now offers only records that have actually been traced,
which restores the documented distinction between the two verbs.

**One camera promised coverage it did not have.** `SABLE LANE — MID` was
authored with a 20 m range while watching a 6 m-deep alley across its width; the
cone drew a long wedge into the back of a garage. Range reduced to 12 m so the
machine-vision cone tells the truth.

## Guardrails made general

The Northgate slice caught four authoring failures by hand. Three of those
classes are now checked for every district, forever:

| Guardrail | Failure it would have caught |
|---|---|
| **Blind sensor** — every non-interior camera must see open ground somewhere in its sweep, traced from just in front of the housing so a wall mount is not mistaken for a blockage | The bus-shelter camera boxed in by its own shelter |
| **Duplicated geometry** — no two buildings may occupy substantially the same ground | The terrace row authored twice when it moved between modules |
| **Stable identifiers** — everything the story or the tests name must be authored with an explicit id, never a generated one | Generated ids shifting when content is reordered |
| **District coverage** *(warning)* — a district with buildings and no sensors is half-authored | — |

`tests/guardrails.test.ts` breaks the shipped town in each of those exact ways
and asserts the validator notices. A guardrail that only ever passes proves
nothing.

**One guardrail was deliberately not built.** A per-district road-reachability
check sounds obvious and is unsound: the Channel has no roads *on purpose*, so
the rule would only encode an exception. Global road-graph connectivity is
already checked, which is the property that actually matters.

**Naming plausibility stays a content test.** The engine cannot know what a
label means. The convention for future districts is the one Northgate now
follows: assert that each named camera sees its named place.

## Architecture

Reusable, and reused: the district interface, the builder, all seven sensor
kinds, the network model, the road graph, `distanceOffModel`, prediction, risk,
dispatch, both renderers, the inspect panel.

Bespoke to Northgate: **nothing in the simulation.** No Northgate-only rule, no
duplicated surveillance logic, no special-case rendering, no hard-coded district
assumption in a global system. `Sim.readNodes` and the traced-record chips are
general mechanisms that Northgate happens to be the first to use; a second
district authoring a chain needs no further code.

Other districts were verified unchanged: commons 14, maple 26, ridgeline 6,
channel 58, relay 1 — identical to their pre-slice counts.

## Known limitations

- The inspect panel shows `SEGMENT SVC` for a service record. A record is not on
  a segment; the label is cosmetically wrong and left alone rather than polished.
- The parade service yard is the tightest space in the district — escapable in
  4 of 12 directions at speed. It is a yard between two shops, so this is
  intended, but it is the closest thing to a pocket in Northgate.
- Northgate still has no interiors and no NPC schedules.
- `TX-2` still serves both Northgate and Relay 12, and that consequence is still
  latent: uplinks are not ballistic targets. Relay 12 work, out of scope.
  *Resolved in `20-relay-12.md`: TX-2 became the shared file rather than a
  target, and stays non-degradable.*

## Gate results

| | |
|---|---|
| Tests | **146** passing, 9 files |
| Typecheck | clean |
| Production build | clean, 159 kB JS (53 kB gzipped) |
| Console | no errors, no warnings, desktop and mobile |
| Determinism | unchanged; seeded replay still hashes identically |
| Performance | 60 fps desktop 1280×760, 60 fps iPhone 15 viewport at DPR 3 |
| Dev hooks | absent from the production bundle |
| Navigability | no movement traps at nine sampled points |
| Vertical slice | false positive intact at 98.7% with Devon 5.1 m away; VISION still suppresses aim and fire; skating untouched |

**P0 — HUMAN PLAYTEST REQUIRED. Still unresolved.** Nothing in this gate bears
on it. No automated check, frame-rate reading or developer playthrough can
answer whether a cold player begins enjoying the skating without being told how
the game works.
