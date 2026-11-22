# Styles

How Sprig's CSS is put together, and which shared names to use. The names all live in `app.css` (this folder), each with a comment saying what it's for.

**The rule:** if a shared name fits, use it instead of a number or colour of your own. A one-off value is fine when it's part of a drawn thing (a picture made in CSS, a game piece), and then a comment says why: `/* own: why */` on its line or the line before, like the shadow that stands out on any photo. `scale.test.ts` checks this:

- **Corners and plain drop shadows:** none of their own anywhere, unless marked `own:`.
- **Text sizes, weights, spacing and colours:** older stylesheets still have values of their own, counted per file in `scale-baseline.json`. A file may only ever have fewer, and a new file starts at none. After moving a file to the shared names, lower its numbers with `UPDATE_SCALE=1 npx vitest run web/src/styles/scale.test.ts` (and check the diff only went down).

## Where styles go

- Each component's CSS module sits beside it, in its feature's folder: `components/tasks/TasksPage.tsx` uses `components/tasks/Tasks.module.css`. Components of one feature can share a module. Building blocks used everywhere (`Sheet`, `Toast`, `Switch`, and `Buttons.module.css` to `composes:` from) are in `components/ui/`.
- A button with an icon before its words: `<Button icon="📅">Pick a cook day</Button>` (the icon and words 4px apart). Older code composes `withIcon` from `Buttons.module.css` with `buttons.buttonIcon` and `buttons.buttonText` spans; use `Button` for anything new.
- This folder holds only what's global: `app.css`, this guide, and `scale.test.ts`.
- `app.css` holds only what's global: the shared names below, the page's base (`button`, `input`, the body) and a few app-wide attributes (`[data-theme]`, `[data-busy]`).
- Animations (`@keyframes`) stay in the module that uses them. Modules keep their names to themselves, so two files can both have a `pop` without clashing.

## Components

Before styling a button, card, field, chip or row of your own, use the shared one in `components/ui/`. Each is built only from the names below, so it fits light and dark, every screen size and the UI scale. Pass `className` to place it (margins, grid spots), not to change its look: a new look is a new variant here, so every screen gets it.

| Component | For |
| --- | --- |
| `Button` (`Button.tsx`) | words you press. `variant`: `primary` (the one main action), `secondary` (the default), `destructive` (Delete, filled red), `danger` (red words), `link` (accent words: Show all, Use a different email), `quiet` (grey words beside another button: Cancel beside Done, Undo, Take back). `size`: `sm` in dense rows, `md`, `lg` for a page's main action and kid mode. `icon` puts a picture before the words. Never submits a form unless `type="submit"`. |
| `IconButton` (`Button.tsx`) | a picture only (×, ⋯, ✏️), square, named by `label` |
| `BackButton` (`BackButton.tsx`) | "‹ Today": back to the page a link came from. App shows it by itself (`usePage`'s `follow` and `from`); a link to another page calls `follow`, the nav bar `go`. |
| `Card`, `SectionHead` (`Card.tsx`) | a box of one thing, with its small capitals `title` and an `action` on the right; `tone` for a note (`info`, `warn`, `good`, `danger`). `SectionHead` heads part of a page or sheet (`level` 2 or 3). |
| `Field`, `Input`, `TextArea`, `Select` (`Field.tsx`) | a labelled box with a `hint` or an `error` under it; the box inside is tied to them for screen readers by itself |
| `Fieldset` (`Field.tsx`) | a labelled group of choices (Chips, a person's chips) with a `labelHint` beside the label and a `hint` under them; read out as one group. A `DateInput` inside a `Field` takes its label too. |
| `Chip`, `Tag` (`Chip.tsx`) | a pill to tap, a filter or choice (`pressed` fills it); a small label that isn't pressed (`tone`) |
| `Segmented` (`Segmented.tsx`) | two to four choices in one bar, one picked (Task \| Goal, Week \| Month); `tabs` when it switches what's shown under it |
| `List`, `ListRow` (`ListRow.tsx`) | rows with something on the left (`leading`), a `title` and `detail`, and something on the right (`trailing`: a Switch, a button). `onClick` makes the row tappable; `divided` lines them up with rules between. |
| `Notice` (`Notice.tsx`) | a one-line note across the top of a page (sync failed, changes waiting) in a `tone` (`info`, `warn`, `danger`), small; `details` opens on a tap with the reason and what to do |
| `Sheet`, `ConfirmDialog`, `Switch`, `Toast` | dialogs, a question before something can't be undone, on/off, a short note at the bottom |

**See them all:** while developing (`npm run dev`), open `/design`: every shared name and component, live in light or dark and each accent. It reads the names from `app.css` itself, so it never falls behind. The built app doesn't have it.

Every screen but the calendar uses these now. The calendar (`components/calendar/`) still has its own versions (`.primary` and friends in `Sheet.module.css` are only for it) until its rework; then those go.

**Checked:** `usage.test.ts` (this folder) counts, per file, what should be a shared component: a raw `<input>` to type in (not a checkbox, radio, file, colour or range), `<select>` or `<textarea>`; a `Sheet`'s own button looks (`sheet.primary` and friends); and the old text buttons and icon spans from `Buttons.module.css`. Like the scale, a file may only ever have fewer (`usage-baseline.json`), and a new file starts at none. Moving one over, lower its numbers with `UPDATE_USAGE=1 npx vitest run web/src/styles/usage.test.ts`. What's left is the calendar, a chip that opens the browser's own date picker (Recipes' Other day and Pick a time), the demo bar and a planned meal's chip.

## Building a screen

1. **Lay it out from the components first.** A page is cards (`Card`) or sections (`SectionHead`) of rows (`List`, `ListRow`); a sheet is a `Sheet` with its heading, `Field`s and `Fieldset`s, and `Button`s in `sheet.actions` (`secondary` Cancel, `primary` Save, `danger` Delete on the left).
2. **Then the screen's own module**, for what's only its own: where things sit (grids, columns, gaps between the parts) and the drawn things (a jar's bar, a kid's tile). Use the shared names for every size, weight, space and colour; mark anything else `own:` with why.
3. **A look the components don't have** (a new kind of button, a box in a new tone): add it as a variant in `components/ui/`, with a line in the table above and a spot on `/design`, rather than styling it in the screen. Then every screen can use it.
4. **Check it** in light and dark, on a phone (upright and on its side) and a tablet, and with Settings › Appearance › Text size up. `npm test` runs `scale.test.ts` and `usage.test.ts`.

## Colours

Use the colour names, never hex values, for anything on the page. Each one has a light and a dark value, so a component written with them works in dark mode without extra code.

| Name | For |
| --- | --- |
| `--bg`, `--surface` | the page behind everything; cards, sheets and bars |
| `--text`, `--muted`, `--line` | text, quieter text, borders and dividers |
| `--accent`, `--on-accent` | buttons and highlights, and the text on them (each device picks its accent: `lib/accent.ts`) |
| `--danger-solid`, `--on-danger` | a filled button for something that can't be undone (Delete), and the text on it |
| `--danger`, `--warn`, `--good`, `--soon` | something wrong, a heads-up, done, a due date. Each has `-bg` and `-line` for a box in that tone |
| `--info-bg`, `--today`, `--float` | a note to know, today's cell, dark pills over the page (toasts) |
| `--star` | a star's gold: stars earned, reward jars |
| `--now` | the time now on a timeline (the day panel, the week): its red line, dot and pill |
| `--past-tint` | a day that's over on the calendar: a see-through grey laid over the day (the month, and the week's columns and list) |

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

## Space

For gaps, padding and margins. Each step is a little more than the last, so things that belong together sit closer than things that don't.

| Name | Size | For |
| --- | --- | --- |
| `--space-1` | 0.2rem | an icon and its words, a badge's padding |
| `--space-2` | 0.4rem | inside a row: chips side by side, a label and its field |
| `--space-3` | 0.6rem | between rows in a list, a button's padding |
| `--space-4` | 0.8rem | inside a card: its padding, between its parts |
| `--space-5` | 1rem | between cards; a page's side margin on a phone |
| `--space-6` | 1.4rem | inside a sheet; between sections of a page |
| `--space-7` | 2rem | a page's margins on a big screen |
| `--space-8` | 3rem | room at the end of a page, a big empty state |

`0`, `auto` and a hairline that's part of a drawn thing need no name.

## Text

| Name | Size | For |
| --- | --- | --- |
| `--text-xs` | 0.75rem | tiny labels: a day's letter, a count on a badge |
| `--text-sm` | 0.9rem | quieter text: hints, times, a card's second line |
| `--text-md` | 1rem | body text, buttons, fields |
| `--text-lg` | 1.15rem | a card's title, a row that matters |
| `--text-xl` | 1.4rem | a sheet's or section's heading |
| `--text-2xl` | 1.8rem | a page's title |
| `--text-3xl` | 2.4rem | big numbers: the temperature, a clock |
| `--text-4xl` | 3.2rem | the wall's clock, a kid's star count |

1rem is whatever the UI scale setting makes it, so everything grows together. Pictures and games drawn bigger (an emoji on a kid's card, a Learn tile) say their own size; text that sizes with its parent uses `em`.

**Weights** (Aleo): `--weight-regular` (400) for body text, `--weight-semibold` (600) for labels, buttons and names, `--weight-bold` (700) for titles and headings, `--weight-heavy` (800) for kid mode and big numbers. Not the steps in between.

**Line heights:** `--leading-tight` (1.2) for headings and one-line things, `--leading-relaxed` (1.4) for paragraphs. An icon or emoji box can use `1`.

## Touch sizes

How big a thing you press is, at least: its height, and its width when it's square.

| Name | Size | For |
| --- | --- | --- |
| `--tap-sm` | 2.4rem | dense rows: chips, small pills, a row's own buttons |
| `--tap` | 2.75rem | every button, by default (app.css) |
| `--tap-lg` | 3.2rem | a page's main action, and kid mode's buttons |

## Layers

What sits over what is named by role, bottom to top: `--layer-fab`, `--layer-nav`, `--layer-panel`, `--layer-menu`, `--layer-sheet`, `--layer-saver`, `--layer-alert`, `--layer-toast`, `--layer-celebration`, `--layer-photo`. Use the role, not a number. Inside one component, small numbers (0 to 5) order its own parts.

## Screen sizes

The same seven everywhere, listed at the top of `app.css` and named in code in `lib/useMediaQuery.ts`:

| Name | Query |
| --- | --- |
| Phone | `(max-width: 700px)` |
| Phone on its side | `(orientation: landscape) and (max-height: 500px)` |
| Narrow | `(max-width: 959.98px)` |
| Compact calendar (the condensed month, the week's days side by side) | `(max-width: 1039.98px)` |
| Tablet | `(min-width: 744px) and (min-height: 600px)` |
| Wide | `(min-width: 1401px)` |
| Touch (phones and tablets, any size) | `(pointer: coarse)` |

CSS can't use variables in a media query, so write the query out and keep it exactly as listed. In components, import the name (`useMediaQuery(PHONE)`) rather than writing the query again.

**Room for the phone's edges:** `--top-room` is the space under the clock and status bar; `--inset-left` and `--inset-right` are room for the notch on its side.

## Textures

Tiling background textures live in `web/public/textures/` (its README lists each). They're see-through grey grain, so lay one over a shared colour and it works in light and dark: `background: var(--surface) url('/textures/paper.png') repeat;`. No screen uses them yet.

## Kids' screens

Kid mode and Learn are for ages 2 to 6: big touch targets (every `button` is at least `--tap`, and kid buttons `--tap-lg`), pictures over words, and nothing that looks like failing. Keep a new kid screen to the same sizes, and check it on a phone on its side as well as on a tablet.
