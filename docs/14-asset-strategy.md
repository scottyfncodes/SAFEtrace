# 14 — Asset Strategy

## 1. Procedural-first, and it is a design decision

There are **no bitmap textures, no meshes, no audio files, and no font files**
in this project. Every visual is vector geometry generated from typed data;
every sound is synthesised at runtime.

This is not a cost-saving measure that the art direction has to survive. It is
the reason the art direction is possible:

> The machine-vision mode is not a filter over a picture of a town. It is a
> second reading of the same records the simulation uses. When the veneer peels
> and a house becomes `RES-114 · 4 OCCUPANTS · NODE CM-114 · SEG S-M1`, those
> are not decorative strings. They are the object's actual fields.

An asset pipeline would have severed that link. Keeping the world as data keeps
the game's central metaphor literally true.

## 2. Consequences

- Build output is small and loads instantly.
- Any designer can change the town by editing a typed object and hot-reloading.
- Content is diffable and reviewable in a pull request.
- Rendering resolution is unbounded; the game is crisp at any scale.
- Validation is possible: `validateWorld()` can assert things no texture pack
  could ever assert.

## 3. Authoring

The town is built through a small DSL in `src/content/`:

```ts
house({ at: [42, 118], w: 11, d: 9, roof: 'terracotta', occupants: 4,
        camera: { facing: 210, fov: 74, range: 22 } })
road({ from: [0, 40], to: [180, 40], width: 7, surface: 'asphalt' })
bank({ at: [210, 96], w: 12, h: 2.4, facing: 90 })
```

Each helper emits the geometry, the surface record, the occluders, the network
nodes, and the road-graph edges together, so it is impossible to author a house
with a camera that is not on a segment. Structural correctness comes from the
authoring layer rather than from discipline.

## 4. If real assets are ever added

They would be additive and optional: an SVG import path for hero props, and a
sample-based layer for the advertisement's voiceover (which is the one place a
human performance beats synthesis, and the slice ships with a text-only
treatment until a performer is recorded).

Nothing in the architecture would change. `render/veneer.ts` is the only file
that would need to learn about images, and `render/machine.ts` would remain
untouched — which is exactly the right shape for this project.

## 5. Directory conventions

```
src/content/bellhaven.ts   the town
src/content/copy.ts        every player-visible string, in one file
src/content/story.ts       beats
```

All player-facing text lives in `copy.ts`. Not for localisation convenience —
for *tone control*. SAFEtrace's voice must be edited as a single document, or it
will drift, and its consistency is the whole characterisation.
