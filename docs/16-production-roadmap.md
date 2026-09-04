# 16 — Production Roadmap

Phases, not dates. Each phase ends with a playable build and an explicit
go/no-go.

## Phase 0 — Pre-production ✔
This document set. Architecture chosen, contradictions resolved.

## Phase 1 — Foundation
Core loop harness, deterministic tick, input intent layer, world data model and
authoring DSL, the oblique vector renderer, and a single street.
**Gate:** a box moves on a street at 60 fps and the frame time is boring.

## Phase 2 — Skating
The full movement model, surfaces, features, flow, camera, and skating audio.
**Gate:** it is fun with nothing else in the game. If it is not, stop here.
This gate is absolute; every other system in SAFETRACE assumes the player enjoys
simply moving.

## Phase 3 — The town
Maple Court, Bellhaven Commons, Ridgeline, the Channel. Density, routes, cover,
skate features, ambient residents.
**Gate:** a tester finds a shortcut the designer did not intend.

## Phase 4 — Surveillance
Sensors, observation, fusion, tracks, behaviour, prediction, risk, dispatch,
drones, patrols. Full pipeline, no UI beyond notifications.
**Gate:** the sim produces an unscripted chase that reads as intelligent.

## Phase 5 — Tools
Slingshot, ballistics, targets, noise events, evidence, trajectory analysis.
The phone, the network graph, QUERY/TRACE/LOOP/REROUTE.
**Gate:** the skate-aim-fire-continue move feels superb, and a player beats
trajectory analysis on purpose.

## Phase 6 — The veneer
VISION, the peel, machine-mode rendering and audio, world-space annotation.
**Gate:** it makes people stop talking.

## Phase 7 — The slice
The advertisement, the Devon beat, the investigation, the reprise. Tuning,
onboarding, accessibility, settings.
**Gate:** the six success criteria in `13-vertical-slice.md`.

## Phase 8 — Content production
Only now. Northgate, Relay 12, the remaining acts, night, the full cast, the
second and third false positives (one of which is the player's).
This phase is deliberately last, and it is the phase the brief's §26 exists to
protect.

## Phase 9 — Ship
Performance, save, settings, localisation, platform, and a long tail of feel.

## Standing risks

| Risk | Response |
|---|---|
| Skating is merely fine | Phase 2 gate is absolute. Do not proceed on hope. |
| The surveillance sim is legible to its authors only | Session D playtests from Phase 4 onward, not at the end. |
| The peel is a gimmick that gets old | It is a held button with a cost (you cannot aim in VISION), not a permanent mode. |
| Tone drifts into preachy | All copy in one file, reviewed as a document. |
| Scope creep into open world | The world doc's density targets are a contract. |
