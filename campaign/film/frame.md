# frame.md - AI Hub film (design truth)

1920x1080, rendered at **30fps** (software GPU; 60 is supported by the contract), 55s, 9 scenes.
Light lavender paper, crisp white app panels, die-cut stickers of the student floating in a soft 3D space.

## Tokens (from `src/app/globals.css` - never invent colors)

| Role | Value |
|---|---|
| canvas / paper (ground) | `#f6f5fb` (`.kit-ground` = radial `#ffffff` -> `#f6f5fb` -> `#ede9fe`) |
| card / surface, well | `#ffffff`, `#f3f1fa`; border `#e7e4f2` |
| ink / ink-soft / subtle | `#17162a` / `#5d5a75` / `#8b88a3` (subtle never for film-level text) |
| accent (ONE accent) | `#7c3aed` (hi `#8b5cf6`, lo `#6d28d9`, soft `#ede9fe`) |
| success / danger / warning | `#16a34a` / `#dc2626` / `#d97706` (badges only) |
| spring ease (CSS) | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

Bans: emoji, neon glow, purple-to-blue gradient, colored left-border cards, circular spinners (use a shimmer sweep),
stock people, "John Doe", hard cuts, empty frames, the word "Matcha", the matcha cup. Data is fictional.

## Type

Geist only, weights 500/700/800, shipped at `assets/fonts/`. Every scene declares, inside its template:

```css
@font-face { font-family: 'Geist'; font-weight: 500; src: url('assets/fonts/geist-500.woff2') format('woff2'); }
@font-face { font-family: 'Geist'; font-weight: 700; src: url('assets/fonts/geist-700.woff2') format('woff2'); }
@font-face { font-family: 'Geist'; font-weight: 800; src: url('assets/fonts/geist-800.woff2') format('woff2'); }
```

Film labels (chips): 30px/700. Kinetic type `.kit-type` 110-150px/800, tracking -0.045em, accent words in `<em>`.
Never below 22px for film-level text. Text inside the app UI uses the app's real sizes, scaled with `.kit-zoom`.

## Shared kit - `assets/kit.css`

Base: `.kit-ground`, `.kit-grain`, `.kit-dots`, `.kit-zoom`, `.kit-chip`, `.kit-type`, `.kit-sticker`, `.kit-cursor`,
`.kit-ring`, `.kit-shimmer`. AI Hub UI (1x app px): `.kit-app`, `.kit-mark`, `.kit-word`, `.kit-card`, `.kit-panel`,
`.kit-well`, `.kit-badge(.brand|.bad|.warn|.ok|.solid)`, `.kit-btn(.primary|.gradient|.outline)`, `.kit-progress`,
`.kit-eyebrow`, `.kit-dot`.

## Assets (ROOT-RELATIVE `assets/...`)

| File | What | Native px |
|---|---|---|
| `brand/mark.svg` | AI Hub mark (graduation cap on brand gradient) | vector |
| `stickers/hero.webp` | hero, phone + laptop showing AI Hub; laptop screen at x 580-832, y 562-742 | 888x1700 |
| `stickers/{laptop-phone,arms-crossed,pack-bag,shout,shrug,sit-phone,trackpad,walk-phone,celebrate,facepalm,idea,wave}.webp` | sticker poses | 366-554 x 370-688 |
| `stickers/face-*.webp`, `pose-*.webp`, `item-*.webp` | reaction heads, extra poses, items | ~200-470 |

Stickers are shown at or below 1.0x their native size (they are already 2x upscales of the art).

## The camera (one rig per scene, same lens everywhere)

`#<id>-stage` (perspective 1866px) > `#<id>-drift` (constant breath) > `#<id>-cam` (authored legs) > world objects
(`position:absolute; left:50%; top:50%`, placed with `gsap.set(x,y,z)`). No opacity/filter/overflow/clip-path on
any ancestor that holds 3D children. DOF: far leaves get a static blur. Panels carry `box-shadow: var(--float)`.

## Smoothness law

Transform/opacity only (+ rare leaf `filter` blur, `clipPath` reveal). Springs `back.out(1.4-1.8)` for landings,
`expo.out`/`power3.out` for arrivals, `power2.inOut`/`expo.inOut`/`sine.inOut` for camera legs. No linear, steps,
snap, rounding. One paused timeline per scene registered last on `window.__timelines[id]`, `fromTo` with explicit
starts, `immediateRender:false` on later `fromTo`s of the same property, no random/clock/CSS transitions.
Hits land on the grid: 96 BPM, beat = **0.625s**, bar = 2.5s.

## Seams - the exact frames both neighbours render

| Seam | Time | Shared frame |
|---|---|---|
| s01 -> s02 | 7.5 | whip pan: ground only (`.kit-ground` + dots) |
| s02 -> s03 | 12.5 | full-frame solid `#7c3aed` |
| s03 -> s04 | 17.5 | card plate: white, 1440x810 at (240,135), radius 28, `var(--float)` shadow, over the ground |
| s04 -> s05, s05 -> s06, s06 -> s07, s07 -> s08 | 25 / 32.5 / 37.5 / 42.5 | whip pan: ground only |
| s08 -> s09 | 47.5 | full-frame solid `#7c3aed` |

The film opens on the ground (first ping lands at 0.05s) and ends on the held lockup; it is not a loop.
`.kit-grain` sits on top of every scene for its whole duration (static).
