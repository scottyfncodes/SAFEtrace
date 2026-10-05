# 46 — The Observation System

A visual identity pass over the interface: nothing in the game changes, and
everything on top of it now belongs to one instrument. The player is
operating an observation system built for a real organisation, and the
system is looking back.

## What it is not

Not cyberpunk, not a hacker terminal, not a spaceship HUD. No neon, no
permanent glitch, no black-and-green. The town underneath is still the inked
town of [40](40-the-inked-town.md), untouched. The interface is quiet by
default; it is what changes when you are seen.

## One visual language (`src/ui/styles.css`)

- **Geometry.** Every panel is squared with one clipped corner and hairline
  bracket marks at its corners (`--brackets`, `--clip-panel`). Buttons are
  squared with a clipped corner (`--clip-btn`). No pills, no rounded cards:
  the only rounding left is the width of a hairline.
- **Type.** A technical mono hand for identifiers, stamps, readouts, tags and
  section labels; a plain sans for objectives, instructions, speech and
  anything read at speed. Not everything is monospace.
- **Colour.** A dark neutral ground. Cyan is the system at work, acid green
  the system being sure, orange attention, red a hold — and each appears
  only where it means something. The player's own things keep paper, pencil
  and amber, as before.
- **States.** Hover lifts a border, pressed drops a pixel, selected fills,
  disabled fades, restricted is hatched. A locked job is `RESTRICTED` with a
  redacted title, not a greyed row; a finished one is `ARCHIVED`.
- **Icons** (`src/ui/icons.ts`). One grid, one stroke, one organisation.
  No emoji, no borrowed libraries.

## The frame (`src/ui/frame.ts`)

Four corner marks at the edge of the glass and one line of the system's
bookkeeping along the bottom:

```
● REC   ▣ CM-017   16:04:12   ▮▮▮▯   TRACKING
```

Every value is read off the simulation. REC lights only while a sensor has
the rider in its picture (`Sim.playerSightings`); the camera id is the
sensor's own; the bars are the picture's quality; the clock is the
afternoon's; the state is the exposure level in a job, or the pursuit
machine in the story. The corners take the state's colour and tighten four
pixels when something has you; a single gradient layer of scanlines fades in
with the state and is not painted at all while unseen. When the state
changes, or a node's record opens, one line passes down the glass, once.
Nothing loops except the REC light, and only while it is on.

## Cards and callouts

- Notifications are intercepts: a stamp with the afternoon's time, a source,
  the lines, on dark glass with the source's colour down the left. CITY is
  cyan and mono; CARE is the consumer face of the same company, softer and
  in a person's type; a critical card is red with an alert mark.
- A node's record keeps its scan line and gains the frame's single pass.
- A job callout (`SIGNAL LOST`, `WANTED — RUN`) is a stamp with brackets
  that come in from either side and lock on the words.
- The run strip's exposure bar is ticked, so a reading is a measurement.
- A result's grade arrives in a bracket that locks on.

## Restraint

Removed before shipping: a `SECTOR` readout (the sim knows it, nobody needs
it), a second clock on the cards, and continuous pulsing anywhere but the REC
light. A frame that is not changing writes nothing to the DOM; on a phone
viewport the pass costs nothing measurable per frame in either the quiet or
the tracked state. `tests/identity.test.ts` holds the rules.
