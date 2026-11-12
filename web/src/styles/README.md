# Styles

How Sprig's CSS is put together, and which shared names to use. The names all live in `app.css` (this folder), each with a comment saying what it's for.

**The rule:** if a shared name fits, use it instead of a number or colour of your own. A one-off value is fine when it's part of a drawn thing (a picture made in CSS, a game piece), and then a comment says why. For corners and plain drop shadows, `scale.test.ts` checks this: a value of your own needs `/* own: why */` on its line or the line before, like the shadow that stands out on any photo.

## Where styles go

- Each component's CSS module sits beside it, in its feature's folder: `components/tasks/TasksPage.tsx` uses `components/tasks/Tasks.module.css`. Components of one feature can share a module. Building blocks used everywhere (`Sheet`, `Toast`, `Switch`, and `Buttons.module.css` to `composes:` from) are in `components/ui/`.
- This folder holds only what's global: `app.css`, this guide, and `scale.test.ts`.
- `app.css` holds only what's global: the shared names below, the page's base (`button`, `input`, the body) and a few app-wide attributes (`[data-theme]`, `[data-busy]`).
- Animations (`@keyframes`) stay in the module that uses them. Modules keep their names to themselves, so two files can both have a `pop` without clashing.

## Colours

Use the colour names, never hex values, for anything on the page. Each one has a light and a dark value, so a component written with them works in dark mode without extra code.

| Name | For |
| --- | --- |
| `--bg`, `--surface` | the page behind everything; cards, sheets and bars |
| `--text`, `--muted`, `--line` | text, quieter text, borders and dividers |
| `--accent`, `--on-accent` | buttons and highlights, and the text on them (each device picks its accent: `lib/accent.ts`) |
| `--danger`, `--warn`, `--good`, `--soon` | something wrong, a heads-up, done, a due date. Each has `-bg` and `-line` for a box in that tone |
| `--info-bg`, `--today`, `--float` | a note to know, today's cell, dark pills over the page (toasts) |

**A person's colour** comes in as a variable set on the element (`style={{ '--c': member.color }}`) and is used as `var(--c)`, mixed with `color-mix()` for lighter or darker shades. Learn's games use `--pc` the same way for a game piece.

**Light and dark:** `lib/useTheme.ts` sets `data-theme` on the page, and `index.html` sets it before the first paint. Kid mode is always light (`data-theme="light"` on it), because its pictures and games are made bright. To test, use Settings › Light or dark.

## Corners

| Name | Size | For |
| --- | --- | --- |
| `--radius-xs` | 0.4rem | tags, small badges, a key on a keypad |
| `--radius-sm` | 0.6rem | buttons, inputs, chips, and a card's inner parts |
| `--radius` | 0.9rem | cards and panels (and every `button` by default) |
| `--radius-lg` | 1.2rem | sheets and dialogs, big tiles |
| `--radius-xl` | 1.5rem | kid mode's big cards, Learn's game boards |
| `--radius-round` | 999px | pills: fully round ends |

A circle is `50%`. A corner that should grow with its text uses `em`.

## Shadows

| Name | For |
| --- | --- |
| `--shadow-sm` | raised a little: the picked tab, chips |
| `--shadow-md` | cards on the page |
| `--shadow-lg` | floating over the page: menus, the + button, a dragged row |
| `--shadow-xl` | dialogs, alerts and cheers |

Three kinds are written where they're used, because their colour is set on the element and a shared name can't pick it up:

- **A tinted glow:** the `--shadow-md` shape with the person's colour, `0 0.3rem 1rem color-mix(in srgb, var(--c) 18%, transparent)`.
- **A ring round a picked thing:** `0 0 0 2px var(--accent)`. It can sit on top of a lift: `0 0 0 2px var(--accent), var(--shadow-md)`.
- **A kid button's pressed edge:** `0 0.3rem 0` plus a darker shade of its colour. On `:active` it drops to `0 0.1rem 0` as the button moves down.

## Layers

What sits over what is named by role, bottom to top: `--layer-panel`, `--layer-fab`, `--layer-nav`, `--layer-menu`, `--layer-sheet`, `--layer-saver`, `--layer-alert`, `--layer-toast`, `--layer-celebration`, `--layer-photo`. Use the role, not a number. Inside one component, small numbers (0 to 5) order its own parts.

## Screen sizes

The same five everywhere, listed at the top of `app.css` and named in code in `lib/useMediaQuery.ts`:

| Name | Query |
| --- | --- |
| Phone | `(max-width: 700px)` |
| Phone on its side | `(orientation: landscape) and (max-height: 500px)` |
| Narrow | `(max-width: 959.98px)` |
| Tablet | `(min-width: 744px) and (min-height: 600px)` |
| Wide | `(min-width: 1401px)` |

CSS can't use variables in a media query, so write the query out and keep it exactly as listed. In components, import the name (`useMediaQuery(PHONE)`) rather than writing the query again.

**Room for the phone's edges:** `--top-room` is the space under the clock and status bar; `--inset-left` and `--inset-right` are room for the notch on its side.

## Kids' screens

Kid mode and Learn are for ages 2 to 6: big touch targets (every `button` is at least 2.75rem), pictures over words, and nothing that looks like failing. Keep a new kid screen to the same sizes, and check it on a phone on its side as well as on a tablet.
