# SAFETRACE™ — Pre-Production Set

This directory is the design and technical record for SAFETRACE™. It was written
before implementation and is the authority for what the game is trying to be.

| # | Document | Purpose |
|---|---|---|
| 01 | [Game Design Document](01-game-design-document.md) | What the game is, the arc, the fantasy |
| 02 | [Technical Architecture](02-technical-architecture.md) | Stack, layering, determinism, module map |
| 03 | [World Structure](03-world-structure.md) | Bellhaven: districts, routes, density |
| 04 | [Core Gameplay Loop](04-core-loop.md) | The verbs and how they chain |
| 05 | [Surveillance System Model](05-surveillance-model.md) | The simulation at the heart of the game |
| 06 | [Skating Specification](06-skating-spec.md) | Movement model and tuning |
| 07 | [Slingshot Specification](07-slingshot-spec.md) | Disruption, physics, and evidence |
| 08 | [Hacking System](08-hacking-system.md) | The network layer and its verbs |
| 09 | [Drone System](09-drone-system.md) | Aerial layer behaviour |
| 10 | [Art Direction](10-art-direction.md) | Visual identity and the three render states |
| 11 | [SAFEtrace Brand & UI](11-brand-and-ui.md) | The corporate design system |
| 12 | [Audio Direction](12-audio-direction.md) | The sound language and its corruption |
| 13 | [Vertical Slice Plan](13-vertical-slice.md) | What ships first and why |
| 14 | [Asset Strategy](14-asset-strategy.md) | Procedural-first content pipeline |
| 15 | [Testing Strategy](15-testing-strategy.md) | What is tested and how |
| 16 | [Production Roadmap](16-production-roadmap.md) | Phases from slice to ship |
| 17 | [Brief Contradictions & Resolutions](17-contradictions.md) | Conflicts found in the brief and how they were settled |
| 18 | [Phase 8 Readiness Gate](18-phase-8-readiness.md) | The audit, the risks, and the GO decision |
| 19 | [Phase 8 Slice 01: Northgate](19-northgate-slice-01.md) | The first production slice, and what it proved |
| 20 | [Phase 8 Slice 02: Relay 12](20-relay-12.md) | TX-2 as the shared file, and why it is not a target |
| 21 | [Relay 12 Playtest Protocol](21-relay-12-playtest-protocol.md) | The P0 human playtest, written before it was run |
| 22 | [Usability Pass 01](22-usability-pass-01.md) | Movement, aiming, score, notifications |
| 23 | [Usability Pass 02](23-usability-pass-02.md) | JX-M1, movement, and stationary aiming |
| 24 | [The Third-Person Skate Camera](24-third-person-camera.md) | A second camera over the same world |
| 25 | [Attention, Tricks, and Manual Aim](25-attention-tricks-and-manual-aim.md) | Nobody comes unless you gave them a reason |
| 26 | [A Smaller Town, Two Thumbs, and Rocks](26-miniature-scale-and-two-thumbs.md) | The miniature, a thumb each, and no ammunition |
| 27 | [Pursuit, Speed, and a Rider with Joints](27-pursuit-and-the-rig.md) | What was actually mobilising the police |
| 28 | [Gameplay Cleanup and Interaction Clarity](28-gameplay-cleanup-and-interaction-clarity.md) | The pursuit state machine, the two-thumb slingshot, and no haunted UI |
| 29 | [Mobile UX and the Plan View](29-mobile-ux-and-plan-view.md) | Plan view as a control, VISION as content, and a thumb-first HUD |
| 30 | [Telling People Apart](30-telling-people-apart.md) | The cop who was a neighbour, and the friend who was riding nothing |
| 31 | [Vertical Slice Feel and the Playtest Gate](31-vertical-slice-feel-and-the-playtest-gate.md) | The afternoon that started thirty-two seconds late, and what only a person can answer |
| 32 | [A Solo Start and the Slingshot Chord](32-solo-start-and-the-slingshot-chord.md) | Devon waits down the street, two ramps built into the road, and the mouse control nobody could have found |
| 33 | [A Fourth Button and a Lens That Went Too Far](33-a-fourth-button-and-a-lens-that-went-too-far.md) | GRAB joins the touch layer, the left-thumb toggle stops timing your aim, and the previous pass's own lens change gets partly undone |
| 34 | [The Slingshot That Was Never Actually Drawing](34-the-slingshot-that-was-never-actually-drawing.md) | An idle touch layer was overwriting the mouse's own charge every frame, found by finally driving both devices through a real browser instead of two engines in isolation |
| 35 | [The Prop That Followed the Wrong Hand](35-the-prop-that-followed-the-wrong-hand.md) | The slingshot's fork and pouch were drawn at the raw position of two thumbs instead of the aim and draw values those thumbs already produced, and jumped and crossed exactly as reported |
| 36 | [An Afternoon with an Ending](36-an-afternoon-with-an-ending.md) | The case, the people of Bellhaven, the choices the ending is read from, and four things that were broken on the way in |
| 37 | [The Feel Pass](37-the-feel-pass.md) | Three buttons instead of four, a camera with room to see, a plan you use to get somewhere, a score you find, and a slingshot with weight |
| 38 | [Stealth, Manipulation, and Escalation](38-stealth-manipulation-and-escalation.md) | A town that remembers where trouble happened, a board that makes noise, a plan that shows what a stone would turn, and sabotage that solves one problem by creating the next |
| 39 | [Controls, and the Held Sling](39-controls-and-the-held-sling.md) | The whole shot in one touch on the move, a plan you leave by doing the next thing, and a throw that says what the noise will turn |

## The one-sentence pitch

A teenage skater in a beautiful, already-completely-surveilled suburb slowly
learns to see the machine underneath the town, and discovers that the only way
to stay free of it is to become something it cannot predict.

## The north star, restated as a design test

Every feature must answer: **does this help the player learn how the machine
thinks?** If it does not, it is decoration and it is probably cut.
