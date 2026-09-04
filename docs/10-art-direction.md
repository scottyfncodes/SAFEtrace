# 10 — Art Direction

## 1. The problem the art must solve

Two truths on screen at once: *this is a lovely place to be a kid* and *this is
an instrument*. If the town looks sinister, the game has no story. If the
machine looks like a HUD, the reveal has no weight.

## 2. The style: illustrated vector, oblique top-down

**Not pixel art. Not cyberpunk. Not photoreal.**

The reference space is contemporary editorial illustration and architectural
site drawings: flat, confident colour fields, clean geometry, one committed
light direction, long soft shadows. Think of a beautifully drawn plan of a
neighbourhood at four in the afternoon in late September.

Camera: top-down at a slight oblique, so buildings extrude visibly toward the
lower-right and you can read height and mass. This gives:

- Total legibility of coverage, cones, routes, and lines — essential.
- Real architectural character without a 3D pipeline.
- A silhouette-first world, which is what the machine mode needs to eat.

Every object in the world is authored as vector geometry with a semantic type.
There are no bitmaps. This is not a limitation; it is the core enabling decision
of the whole project, because it means the machine-vision renderer can draw
*the same data* differently rather than faking a filter.

## 3. Light

One sun, fixed at roughly 4pm, throwing long shadows to the north-east. Warmth
comes from the shadow colour being a saturated blue-violet against warm ground
tones, not from an orange filter. Trees dapple. Windows catch. Car roofs and
pool water are the only specular things in town and they read as jewels.

Time of day shifts across acts: Act I golden afternoon, Act II dusk, Act III
night with sodium and LED. Coverage quality is affected by light, so the visual
progression and the mechanical progression are the same axis.

## 4. Palette

### VENEER (state 1)
```
Ground / asphalt    #6E7A85   Sidewalk       #C9C4B8
Grass               #8FB369   Grass shadow   #5E8A54
Stucco warm         #F0E3D0   Stucco cool    #DCE4E8
Roof terracotta     #C4714E   Roof slate     #56626E
Sky/void            #DCE9F2   Shadow         #3A4C6B at 26% multiply
Accent (SAFEtrace)  #2C8C8C   Warning        #E8A33D
```
Nothing is grey-brown. Nothing is desaturated. It is a *nice place*.

### CRACKS (state 2)
The veneer palette, unchanged, with intrusions: a cone edge flickering in
`#2C8C8C`, a data tag ghosting for four frames, a subject bracket resolving on
someone and vanishing. **The palette does not darken.** The cracks are not
"things getting worse", they are "things becoming visible".

### MACHINE (state 3)
```
Void                #060B12   Structure line  #2A5D6E
Surface fill        #0B1620   Active data     #4FE0C4
Coverage            #2C8C8C at 12–22%   Identity      #F2F5F7
Risk low            #4FE0C4   Risk mid       #E8C33D   Risk high  #FF5C47
Prediction          #7B6BFF
```
Cold, architectural, luminous. Deliberately *beautiful*, not ugly — the machine
is not presented as evil, it is presented as elegant, which is worse.

## 5. The transition — "the peel"

This is the single most important piece of visual authorship in the game and it
must never be a colour-grade toggle.

Over ~500 ms, per-object, radiating outward from the player:

1. **Texture dissolve.** Fills drop out. Objects become their own outlines.
2. **Structure resolve.** Outlines snap from illustrated linework to precise
   architectural line: corners extend past intersections, dimension ticks
   appear. Buildings become *drawings of themselves*.
3. **Substrate reveal.** Underneath, the things that were always there fade up:
   conduit runs in walls, network edges between nodes, camera cones as volumes
   of light, plate readers glowing at intersections.
4. **Population.** People acquire brackets, IDs, classifications, risk numbers.
   Your own predicted path unrolls ahead of you along the road.

The radiating wavefront matters: the player sees the world *become* data
outward from themselves, which is the correct emotional reading — this is
happening in their head, not to the town.

Coming back out reverses it but 200 ms faster, and leaves a two-second residual:
a few cones still faintly visible on the beautiful world. That residual is the
whole game in one image.

Accessibility: a reduced-intensity variant does the same steps with no flashing,
no chromatic separation, and a 900 ms cross-fade.

## 6. Characters

Strong, simple silhouettes read from directly above at a slight angle: hair,
shoulders, board. The player is identifiable at any zoom by a single accent
colour on their board deck. NPCs use a small kit of shapes and a broad palette
so a plaza reads as *people*, not as instances.

In MACHINE mode a person becomes a bracket, a name, a classification, and a
number. The dissonance between the two representations of the same character is
the game's whole argument, and it should be shown, never stated.

## 7. Surveillance hardware

Every sensor type has an unmistakable silhouette, and they are *nice-looking
consumer products* — rounded, white, friendly, Braun-ish. A SAFEtrace HOME porch
camera looks like something you would be glad to own. That is why nobody in
Bellhaven objects to them, and it is why the player does not notice them for the
first ten minutes.
