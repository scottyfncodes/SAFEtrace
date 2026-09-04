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

## The one-sentence pitch

A teenage skater in a beautiful, already-completely-surveilled suburb slowly
learns to see the machine underneath the town, and discovers that the only way
to stay free of it is to become something it cannot predict.

## The north star, restated as a design test

Every feature must answer: **does this help the player learn how the machine
thinks?** If it does not, it is decoration and it is probably cut.
