# 17 — Contradictions in the Brief, and How They Were Resolved

The brief asks for these to be found and settled in favour of the core fantasy
and the player experience. Ten real conflicts were identified.

---

### 1. "Surveillance does not escalate" vs. an escalation ladder

**Conflict.** §11 forbids escalation by inventory. §23 and the cat-and-mouse
loop require the system to respond more aggressively over time.

**Resolution.** Escalation is *per-encounter and score-driven*, never
per-act and never by adding hardware. The dispatch ladder is fully present in
minute one; a player who behaves outrageously in Act I can reach INTERVENTION
immediately. What changes across acts is the player's comprehension and the
system's accumulated history of *them*. The camera count is constant from the
first frame to the last, and this is verified by a content test.

---

### 2. "Do not begin with a title screen" vs. players needing settings

**Conflict.** §2 forbids a conventional title screen. Accessibility settings
must be reachable before play, especially the flash/glitch intensity option
which exists precisely for the sequence about to run.

**Resolution.** The advertisement *is* the front end. Before it plays, a single
unbranded line offers reduced-motion and text-size options, styled as a
device-level accessibility prompt rather than a game menu, and it is dismissed
in one keypress. Everything else lives in the in-fiction phone settings. The
advertisement remains the first thing that looks like the game.

---

### 3. "The player enters the exact world from the advertisement" vs. a pre-rendered ad

**Conflict.** §2 demands the ad be a polished piece of corporate film. It also
demands the playable world be that same world.

**Resolution.** The advertisement is rendered by the game's own renderer, in the
real Bellhaven geometry, with a scripted camera. It is the game engine
performing an advertisement. The final shot of the ad is the first frame of
play, with a continuous camera move between them and no cut. This is only
possible because of the procedural asset strategy, and it turns a contradiction
into the strongest moment in the opening.

---

### 4. Machine vision "should be spectacular" vs. "do not slap a red HUD on the screen"

**Conflict.** §12 wants a Terminator-grade transformation and explicitly forbids
the standard implementation of one.

**Resolution.** The transformation is **subtractive and structural**, not
additive. Nothing is overlaid; the veneer is *removed* to expose geometry that
the simulation was already using. Annotations are drawn in world space at world
scale with leader lines, so they read as properties of objects rather than
screen furniture. The palette is cold teal and violet, never red — red appears
only as a risk value, and only on numbers.

---

### 5. The slingshot as "signature mechanic" vs. "not a weapon" vs. avoiding combat

**Conflict.** A projectile device used constantly, in a game with pursuers, that
must never become combat.

**Resolution.** The slingshot cannot target people at all — the input is
declined silently. Every effect is on *infrastructure and attention*. Drones can
be destabilised, never destroyed. The highest-skill use of the weapon is
knocking over a bin somewhere you are not, which is the clearest possible
statement that this is a game about misdirection rather than force.

---

### 6. "The player should learn the system" vs. "avoid exposition"

**Conflict.** §24 requires legible rules; §16 forbids telling the player things.

**Resolution.** The system explains itself *to itself*, in front of the player.
Every SAFEtrace notification is an internal state change narrated in its own
corporate voice — `UNUSUAL ROUTE DETECTED`, `ORIGIN ESTIMATED — 41 M SOUTHWEST`.
No character ever explains a mechanic. The tutorial and the antagonist are the
same voice, and that voice never breaks character. VISION then makes the same
information spatial. Nobody in the story ever says the word "surveillance".

---

### 7. "Do not overbuild" vs. sixteen pre-production documents and a full simulation

**Conflict.** §19 and §22 warn against over-engineering; §23 and §30 demand a
deep emergent model and a large design record.

**Resolution.** Depth is spent entirely on the surveillance simulation, because
that is the game. Every other system is deliberately shallow: no crafting, no
economy, no skill tree, no combat, no inventory beyond twelve ball bearings, no
grinds in the slice. The simulation is complex; the *game* is eight verbs.

---

### 8. Dense hand-authored world vs. a world large enough to escape into

**Conflict.** §4 forbids a large empty map; evasion needs somewhere to go.

**Resolution.** Escape is vertical and topological rather than horizontal. The
town is small, but coverage is layered, and the answer to pursuit is cover,
seams, and off-graph routes rather than distance. A 900 × 700 m town with four
routes between every pair of districts produces more evasion gameplay than four
square kilometres of streets would.

---

### 9. "It is not an evil corporation story" vs. the system ruining a child's life

**Conflict.** §3 forbids a simplistic villain; the plot requires real harm.

**Resolution.** Every harmful outcome is traceable to a defensible decision made
by a reasonable component. The gallery included Devon because a parent consented
to SAFEtrace SCHOOL. The prior was high because Devon's cousin lives in
Northgate. The threshold was 97% because lowering it once reduced a real harm.
The player can read each of these and disagree with none of them individually.
The one human employee in the story is sympathetic and overworked. The system is
never given a motive, and it is never shown to be lying.

---

### 10. Flow as a skill mechanic vs. no scores and no arbitrary meters

**Conflict.** §19 rejects arbitrary progression furniture; skating needs a
mastery expression.

**Resolution.** Flow is not scored and is never displayed as a number. It
manifests as speed, camera behaviour, audio warmth, and — decisively — as a
direct multiplier on the player's prediction error. It is therefore not a game
meter bolted onto a skateboard; it is the mechanical statement of the game's
thesis. Skating well is *how you become unpredictable*.

---

## Standing principle used for all ten

Where a requirement about implementation collided with a requirement about
experience, the experience won. Where two experience requirements collided, the
one closer to *"the machine was always there and I have only just learned to see
it"* won.
