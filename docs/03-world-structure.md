# 03 — World Structure: Bellhaven

## 1. Principle

Dense, not large. Bellhaven is roughly **900 m × 700 m** of continuous,
hand-authored space. Every district is walkable-to in under a minute and
skateable-through in under fifteen seconds. There is no filler.

The design test for any square metre of Bellhaven: **does something happen here
that could not happen ten metres away?** If not, cut it and move the districts
closer together.

## 2. Districts

### Maple Court — residential (start)
Cul-de-sac, driveways, low walls, hedges, a half-built extension, an empty pool.
Porch cameras on most houses: individually harmless, collectively a mesh.
Teaches: coverage overlaps, low walls as occluders, driveways as ramps.

### Bellhaven Commons — retail
Strip of shops, a plaza with ledges and planters, a parking structure. Mara's
board shop. Heavy plate-reader and face-recognition coverage, justified by
"retail loss prevention". The parking structure's decks are overhead cover:
the single best drone-blind route in the slice.

### Ridgeline Secondary — school
Fenced field, bike racks, loading dock, and the best skateable bank in town on
the gym's back wall. SAFEtrace SCHOOL runs here, which means the density of
sensors is highest around children, presented entirely as care.

### The Channel — drainage infrastructure
Concrete flood channel cutting diagonally under three roads. The fastest route
in Bellhaven and almost uncovered — because it is not a place anyone is
*supposed* to be, so nobody specified cameras for it. Teaches the central
lesson: the machine's coverage follows its assumptions about where people go.

### Northgate — the incident site
Older, denser, further from the player. Referenced constantly before it is
visited.

### Relay 12 — SAFEtrace facility
A fenced utility yard with the district uplink. Not a fortress; a beige box with
a chain-link fence and one bored contractor. Its ordinariness is the point.

## 3. Connective tissue is the actual content

Districts are joined by more than roads:

- **Roads** — fast, smooth, and the most heavily covered. The predictable path.
- **Alleys and cut-throughs** — medium speed, patchy coverage, the everyday
  choice.
- **The Channel** — highest speed, near-zero coverage, but only enters and exits
  at four points, so committing to it is a real decision.
- **Rooftop and deck routes** — parking structure, school gym roof via the bank,
  low garage roofs on Maple Court. Slow, but overhead cover defeats drones.
- **Backyards and fence gaps** — skate-only, awkward, and crucially *not on the
  road graph*, which means SAFEtrace's prediction cannot forecast them.

That last point is the world design's most important idea. **Prediction runs on
the road graph. Freedom lives off it.** The town's layout is therefore a direct
expression of the theme: the spaces the system did not model are the spaces you
are free in.

## 4. Coverage design

Coverage is authored as a readable, learnable landscape, not scattered:

- **Saturated**: Commons plaza, school entrance, main intersections. Being here
  is fine — everyone is here. Cost is that behaviour is scored precisely.
- **Interstitial**: residential streets. Overlapping cones with real seams.
- **Sparse**: alleys, the utility yard's back fence, construction site.
- **Dark**: the Channel, backyards, under the parking decks, inside the culvert.

Blind spots are never labelled. They are *discoverable*, and once SAFEtrace
VISION exists they become legible all at once — which is the reward for the
Act II unlock.

## 5. Vertical and skate authoring

Every district contains at least: one bank or ramp that converts a drop into
speed, one gap that requires an ollie at speed, one line that chains three
features without a push, and one route only reachable with maintained momentum.

Skate features are authored as gameplay geometry first and set dressing second.
A loading dock exists because it is a four-foot drop into a run-out, and it
happens to also be a loading dock.

## 6. Density targets (slice)

| Element | Count |
|---|---|
| Buildings | ~70 |
| Cameras | ~34 |
| Network segments | 6 |
| Uplinks | 2 |
| Drones | 3 on route |
| Ground patrols | 2 |
| Ambient residents | ~18 |
| Authored skate features | ~30 |
| Distinct blind-spot routes between any two districts | ≥ 2 |
