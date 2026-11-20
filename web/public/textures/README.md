# Textures

Tiling background textures: grey grain on a see-through background (5 to 25% showing), laid over a plain
colour, so one file works on any colour, light or dark.

| File | Size | Looks like |
| --- | --- | --- |
| `bark.png` | 128 | dense sideways grain |
| `brushed.png` | 128 | soft sideways streaks |
| `canvas.png` | 128 | an even grid of fine dots |
| `cloud.png` | 512 | big soft clouds |
| `flecks.png` | 128 | scattered short flecks |
| `linen.png` | 128 | sideways streaks, like linen |
| `paper.png` | 128 | fine speckle, like paper |
| `stone.png` | 128 | scratchy speckle, like stone |
| `canvas-soft.png`, `linen-soft.png`, `paper-soft.png` | 128 | fainter versions of those three |

Use: `background: var(--surface) url('/textures/paper.png') repeat;`

Not used on any screen yet; a later feature will let people pick one. All of them show on the design page
(`/design` while developing).
