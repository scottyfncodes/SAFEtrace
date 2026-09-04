# 12 — Audio Direction

## 1. The strategy in one line

Establish a warm, trustworthy sound language in the first ninety seconds, then
never change it, and let context do all the work.

## 2. Fully synthesised

All audio is generated at runtime with WebAudio: oscillators, noise shaping,
convolution-free reverb via feedback delay, and short procedural transients.
Reasons: no asset pipeline, no licensing, tiny build, and — the important one —
**motifs can be recontextualised parametrically**. The same synthesis call with
a different reverb tail and a slower envelope is the same sound, aged.

## 3. The SAFEtrace motif

A three-note rising figure (a fifth then a major third, on a soft triangle wave
with a sine sub) with a gentle bell attack. It plays:

- in the opening advertisement, over the wordmark,
- on your phone whenever SAFEtrace tells you something,
- from public speakers in the Commons and at Ridgeline,
- at the end of the game.

It is never altered. By hour three it is the most stressful sound in the game,
and a player who notices that this is happening has understood the whole design.

## 4. Layers

**World bed.** Suburban afternoon: cicadas, a distant mower, wind in leaves, a
dog, a car three streets over. Warm, quiet, unhurried. It is the sound of a
place worth protecting, which is the argument the game is arguing against.

**Skating.** The most important sound in the game. Urethane on surface, pitched
and filtered by speed and material: asphalt is a broadband rumble, smooth
concrete is a clean hum, sidewalk joints are a rhythmic tick whose tempo *is*
your speed, grass is a horrible dead thud. Pushes are a scuff and a shoulder of
low end. The ollie pop is a sharp woody crack; the landing is a satisfying
double-thunk. Players should be able to close their eyes and know their speed.

**Surveillance.** Almost silent, which is correct. Cameras have a barely-audible
servo when they sweep; you only hear it if you are close and moving slowly, so
the first time a player *hears* a camera track them is a designed moment. Plate
readers tick. Drones have a soft, pleasant rotor hum — deliberately pleasant.

**Machine mode.** Entering VISION ducks the world bed by 18 dB and replaces it
with a low harmonic drone tuned to the same root as the SAFEtrace motif, plus
sparse data ticks spatialised to actual nodes. You can *hear* how many cameras
are near you. Leaving VISION brings the world back with a slight overshoot in
brightness, so the real world sounds momentarily too loud and too alive.

## 5. The voice

A single warm female voiceover in the advertisement, and nowhere else until the
final act, where the identical lines are heard again over the identical
pictures. The voice never becomes menacing, never distorts, never speaks in the
gameplay. Its absence for hours is what makes its return land.

## 6. Dynamic rules

- Risk does **not** trigger stinger music. Instead, the world bed thins: birds
  stop, the mower stops, the wind drops. Silence is the tension system.
- Flow adds a warm low harmonic and lifts the skating layer. Being good feels
  good.
- INTERVENTION is scored with nothing at all except the SAFEtrace motif and
  footsteps.

## 7. Accessibility

Every audio-only tell has a visual equivalent: camera servo (a small housing
rotation), drone rotor (its shadow), noise events (a soft ripple ring). No
information is exclusively auditory. Separate sliders for world, skating,
interface, and machine layers.
