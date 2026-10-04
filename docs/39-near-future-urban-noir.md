# 39 — Near-Future Urban Noir

> **Superseded in part by [40 — The Inked Town](40-the-inked-town.md)** for
> the street view: the palette and noir correction (§3, §4), and characters
> (§6). The rules for UNDERWATCH hardware, the record UI and where dressing may
> stand are unchanged.

The visual identity, restated. This supersedes the palette and mood sections of
[10 — Art Direction](10-art-direction.md) (§3 light, §4 palette, §6
characters) and the accent colour in [11 — Brand & UI](11-brand-and-ui.md) §1.
Everything else in those two documents stands: the peel, the diegetic UI rule,
the message grammar, the motion curve, and the rule that UNDERWATCH hardware is
a nice consumer product.

## 1. The direction in one line

**A believable contemporary town that has quietly come to depend on a very
good surveillance system.** Not cyberpunk, not grimdark, not a generic
detective game. A beautiful, lived-in city; a skateboard moving through it; a
system quietly watching everything; a kid looking into what the system thinks
it already knows.

## 2. The contrast is the identity

| | The town | UNDERWATCH |
|---|---|---|
| Reads as | messy, human, ambiguous | clean, precise, authoritative, trustworthy |
| Colour | muted: concrete, asphalt, faded paint, worn brick, overcast sky | three saturated accents and nothing else |
| Edges | weathered, stained, tagged, patched | square, hairline, exact |
| Motion | wind, people, a board | sparse; one scan line, one ease curve |

This contrast *is* the premise. The system can be extremely confident and still
be wrong, and the picture says so before any text does: an exact, beautiful
`MATCH 98.7%` sitting on top of a world that is obviously more complicated than
that.

**The tonal rule: UNDERWATCH looks good.** Its hardware is the best-made thing
on the street. Its interface is calm and well-set. Nothing it makes is red,
jittery or sinister. The unsettling part is that it looks trustworthy, so the
player's first thought is *"it says 98.7%, why wouldn't I believe it?"* and
only later *"what if it's wrong?"*

## 3. Palette

All of it is in `src/render/palette.ts`. A hard-coded colour elsewhere is a bug.

### The town (`VENEER`, `SKY`, `CITY_INK`)
```
Asphalt        #30353A   Footway          #6F706B   Forecourt      #67645D
Verge / lawn   #474A3D   Dirt             #5C5042   Water          #3D545B
Wall warm      #7A7064   Wall cool        #666D71   Roof           #5A3F36 / #2C3136
Tree           #323D30   Cast shadow      #0A0D12 at 40%
Sky            slate #2C333A → #565F66 → dirty light #8C8676 at the horizon
City ink       #0E1114   building edges, kerbs, slab joints
```
Every surface of the town is below 30% HSL saturation and in the low-to-mid
values (HSL lightness at most 45%), and tests hold both
(`tests/art-direction.test.ts`). The people are the brightest saturated
things in the frame, by construction.

Buildings keep the paint they were authored with, but `weather()` wears it down
on the way to the glass and it is laid over a material — brick, block, render,
siding — chosen per building. Neighbours still differ; nothing looks new.

### UNDERWATCH (`TECH`, used by `MACHINE` and the UI tokens)
```
Electric cyan   #2FE3F2   the system at rest and working
Cyan ink        #0B7F8E   the same, printed on a white sign or a pale wall
Acid green      #B6F23A   the system being sure: MATCH, CONFIDENCE, the forecast
Warning orange  #FF8B2B   attention — never alarm
Hardware white  #EEF2F3   every housing UNDERWATCH installs
```
Nothing in the physical town or the player's own things uses any of these
(tested). The town's and the player's amber (`VENEER.warning`, `#E8A33D` — the
flow ring, a stone's ripple, the ammo cache) and the player's thumb control
(`#F2C86B`) are deliberately not warning orange or cyan. A traffic cone is a
weathered orange, and graffiti avoids the accent hues. The plan view and its
button use cyan because the plan is drawn in the system's register; a
camera turned toward a noise still shows the older amber status light, part
of the gameplay vocabulary in [37](37-the-feel-pass.md). Risk-high stays a red
(`#FF4A3D`) because a colour-blind-safe ramp needs a third step, but it is the
only colour the machine has that is not one of the three.

### People are the exception
The rider's red, Devon's green, the uniform's blue and the officer's
amber/red shoulder light keep their full colour. Telling them apart is
gameplay ([30](30-telling-people-apart.md), `tests/legibility.test.ts`), and in
a grey town a person is the warmest thing in the frame — which is right.

## 4. The town

What was added is all **presentation only**: none of it is in the world data,
so no collision, sightline, forecast or test result moves.

- **Overhead wire.** Timber poles on the verge outside the footway, about every
  thirty metres, with two sagging wires between them and a transformer can on
  some. They nudge round driveways and bins, cross to the far verge rather than
  stand in anyone's way, and never stand on a carriageway, on any modelled
  surface (footway, plaza, forecourt), in a building or on a skate feature.
  Where the only verge is a forecourt — the Northgate parade — there are none.
- **Street-name blades** on the verge at the corners where one named street
  meets another, past both footways. A corner with no clear verge gets no sign.
- **Road wear.** Irregular tar patches and oil stains, and a dashed centre line
  worn half away — only where asphalt is the top surface.
- **Wall wear.** A splash band along the base of every wall, rain streaks from
  the eave, warm lit windows here and there, rooftop plant on flat roofs.
- **Tags.** Kids' tags — names and crews, never slogans about the system;
  nobody in Bellhaven is protesting anything — on the sides and backs of shops,
  garages, the depot, sheds, and the odd house. Never on a front, a window or a
  sign.
- **Fences as what they are.** Fences were always real (they block the rider
  and the cameras) but were drawn as a half-metre tile. A tall one is chain-link
  — posts, top rail, a see-through mesh — and a low one is a block wall.

### The noir correction

The first pass was right in hue and wrong in value: on a phone the frame was
still mostly pale footway, green lawn and light sky, which reads as a muted
suburb. The correction moved the town down the value scale and gave it
graphic weight, without touching the camera, the people or any colour that
means something in play:

- **Value.** Asphalt near-black, footways and forecourts mid-grey, verges a
  dead olive, the sky a dark slate lid with dirty light only at the horizon.
  Building materials and `weather()` both run darker.
- **Light and shade.** The shaded wall of every building drops much further
  than the lit one, and cast shadows are twice as dense, so form reads from
  value and silhouette rather than from colour or fog. The far-field haze
  was cut back for the same reason.
- **Ink.** Buildings are drawn with a firm city-ink outline, and street
  furniture with a lighter one. Both stay thinner and fainter than the ink on
  people, so a person is always the strongest edge. Wires are not inked.
- **Infrastructure on the ground.** An inked kerb wherever carriageway meets
  footway; slab joints across every footway and over open forecourts; old
  stains on forecourts, trodden and bare patches on verges; lane markings
  worn further back.

All of it lives in `palette.ts` and the environment paths of
`perspective.ts`. Nothing reads it but the renderer.

## 5. UNDERWATCH in the street

- **Cameras** are hardware white with a thin cyan line under the housing while
  they are working. The lens still goes the rider's red when it has them and
  amber when it is turned toward a noise; that vocabulary is unchanged.
- **Street cabinets.** A street junction is drawn as a white cabinet on the
  verge: a dark glass face, the wordmark, and one band of cyan. The band goes
  orange when the node has been looped or tampered with and dark when it is
  down. It stands within 12 m of the node (reach is 16 m) and under the same
  placement rules as the poles; a junction with no clear verge is not drawn,
  as before. Services and uplinks are never drawn: they are records and
  relays, and a record has no place to stand next to.
- **Drones** are the same white with a cyan line.

## 6. Characters

Stylised, graphic-novel figures against a painted city:

- **Ink.** Every person and the rider is drawn with an ink outline that thins
  with distance, so the silhouette is the strongest edge in the frame and a far
  figure stays a figure rather than a black dot. The town is not inked; that
  difference is what makes people pop.
- **Hair** is a shape: residents get one of six, stable per person, which
  breaks the head silhouette the way a cap or hood already did.
- Proportions and posing are unchanged. Avoid anime, photorealism and AAA
  military design; push toward strong silhouettes and expressive posing.

## 7. Interface

The interface reads as an institutional system, not a game HUD.

- The UI tokens moved to the new accents (`--st-teal-bright` is the cyan; the
  token names keep "teal" for history), with `--st-acid` and `--st-orange`
  added. `tests/art-direction.test.ts` keeps CSS and canvas on the same values.
- **Records.** In a node's record, any percentage is set in acid green: 98.7%
  should look like a fact. A single scan line passes down the record as it
  opens — once, never looped, and removed entirely (not merely shortened) with
  reduced motion, whether that comes from the OS or the in-game setting.
- **World-space labels** in VISION and on the plan sit on a quiet dark plate
  with a short hairline in the label's colour, and `MATCH` and `CONFIDENCE`
  lines are acid green. A plate is what makes text read as a record rather
  than floating game text.
- Avoid: holograms, floating windows, neon everywhere, "hacker movie" anything.

## 8. Camera and skating

The brief asks for skate-level framing and low angles. The chase camera was
deliberately tuned higher in [26](26-miniature-scale-and-two-thumbs.md) and
[37](37-the-feel-pass.md) for readability on a phone, and this pass does **not**
change it. The things that sell scale from the board — overhead wire, poles,
street signs, wall height — are now in the frame. A lower camera on grinds,
lines and slow approaches is the obvious next step and should be playtested
against the readability gate in [31](31-vertical-slice-feel-and-the-playtest-gate.md)
before it ships.

## 9. Not done yet

- A low-angle camera mode (§8).
- Traffic signals and storefront dressing beyond signs. Bellhaven's layout is
  residential; a denser commercial block is where those belong.
- Occasional digital glitches on UNDERWATCH surfaces. The peel residual
  ([10](10-art-direction.md) §5) is the right place to start.
- The app icons still use the old teal. They are rendered PNGs and should be
  re-exported together with the SVG.

## 10. The screenshot test

A frame from UNDERWATCH should be recognisable as UNDERWATCH from three things:
a muted, worn street seen from a board; one or two exact, beautiful things in
cyan within it; and a person, inked, in a colour nothing else in the frame has.
