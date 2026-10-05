# 48 — Fourteen

The rider and Devon read as adults: a 0.98 frame, adult shoulders, a small
head, a fitted hoodie, skinny trousers and slim shoes. They are fourteen.

## Proportion first (`TEEN` in `src/render/characters.ts`)

On a figure twenty to eighty pixels tall, age is read from proportion before
anything else.

| | Adult | Teen | Child |
|---|---|---|---|
| Scale | 0.94–1.05 | 0.90 (Devon 0.89) | 0.64 |
| Head radius | 0.130 | 0.158 | 0.165 |
| Half shoulder | 0.20–0.25 | 0.185 | 0.21 |
| Limb | 0.145 | 0.115 | 0.15 |

A small slouch (`stoop`) puts the head a little ahead of the chest. The
skater rig in `perspective.ts` was built for a 0.98 adult; its hip height,
bones, torso, neck and shoulder width now scale from the look's body, so a
teenager stands shorter on the same board without the feet leaving the deck.

## Then the clothes (`fit: 'baggy'`, `fringe`)

- **Hoodie:** oversized, to below the hips, boxy, with dropped shoulders and
  wide sleeves; the hood down as a flat roll behind the neck; from the front,
  the pouch pocket and the cords.
- **Trousers:** wide all the way down. Devon's shorts finish below the knee.
- **Shoes:** chunky skate shoes, longer and wider, on a visible sole.
- **Beanie:** slouchy, worn back off the forehead with the slack folded down
  behind, and the rider's mid-brown hair pushing out under it in uneven points.
  Devon's hair shows under his bucket hat the same way.

Nothing about the amber read changed: the rider is still the only amber in
town, and from behind, which is how the chase camera sees them, it is most of
the figure. `tests/teen.test.ts` pins the proportions.
