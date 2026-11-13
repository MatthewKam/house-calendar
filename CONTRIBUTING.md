# Working on Sprig

Sprig is a family app: kids' tasks, stars, reward jars and daily learning games first, with a shared family calendar that supports them. It runs as a web app on phones, tablets and a wall screen, and later as an Apple and Android app. This guide is for developers. The README is the family's guide to using it.

## Start

Needs Node.js 22 or newer.

```sh
npm install
cp .env.example .env   # every setting is optional for a first run; each one says what it turns on
npm run dev            # http://localhost:5173 (the API is on 3000)
```

Without an email service, sign-in codes are printed in the server's log. Data goes in `data/`. Delete it to start over.

Before calling something done:

```sh
npm test          # server and web logic (vitest)
npm run check     # TypeScript, server and web
npm run lint      # likely mistakes (ESLint): unused code, hooks used wrongly
npm run format    # Prettier: tabs, single quotes, lines up to 120 (your editor can run it on save)
```

GitHub runs these on every push and pull request, formatting included (`.github/workflows/checks.yml`). The commit that first formatted everything is in `.git-blame-ignore-revs`, so `git blame` looks past it once you run `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Who it's for

Most of the app is used by kids aged 2 to 6, often before they can read. Every screen follows these rules:

- **Pictures over words.** A kid screen should work for a child who can't read: big emoji or drawings, with words as a label for grown-ups.
- **Big touch targets.** Every button is at least 2.75rem; kid buttons are much bigger.
- **No fail states.** Nothing a kid does is "wrong": no red crosses, no lost stars, no "try again" buzzers.
- **Grown-ups decide.** Changing tasks, rewards, events and settings needs a guardian. On a shared device (the wall, a kid's tablet), that's a PIN.
- **No ads, ever.**

Learn's games are for learning, not passing time: a few games a day (a guardian sets how many), and no speech except animal noises and counting.

## Where things live

| Part | Where |
| --- | --- |
| Server | `server/`. Fastify and SQLite (better-sqlite3), one module per feature (`tasks.ts`, `rewards.ts`, `learn.ts`...), each with a `register...(app, db)` that `app.ts` calls, and its test beside it |
| Accounts | `server/hosted.ts` and `server/hosted/`: the front server. Sign-in, households, invites, the wall and the PIN unlock. It passes each request to that household's own app (`app.ts`), saying who's asking |
| Who may change what | `server/auth.ts`. One list (`PARENT_ONLY`) of the routes a kid or the wall can't use without a PIN. A new route that changes things a grown-up should decide goes on it |
| Database | `server/db.ts` (a household's) and `server/accounts.ts`. Both are an ordered list of migrations: only ever add to the end. The tables as they stand are in `server/schema/`. After adding a migration, run `npx vitest run server/schema.test.ts -u` to rewrite them |
| Calendar sync | `server/sync.ts`, `googleSync.ts`, `icloudSync.ts`, `outbox.ts` (changes on their way to iCloud or Google), and `server/providers/` |
| Shared | `shared/`: shapes and lists the server and web app both import, including the request and reply shapes (zod) |
| Web app | `web/src/`. React 19 and Vite. `App.tsx` is the shell. Components are in a folder per feature under `components/`, each with its stylesheets beside it: `calendar/`, `today/`, `tasks/`, `rewards/`, `kid/` (kid mode), `learn/` (its games), `lists/`, `photos/`, `capture/` (Snap a flyer, Say it), `account/` (signing in, PINs), `nav/`, `settings/`, and `ui/` for the building blocks every feature uses (`Sheet`, `Toast`, `Switch`...) |
| Server data in the web app | `web/src/lib/queries/`: TanStack Query hooks, a file per feature, all imported from `lib/queries`. `api.ts` has the calls and `types.ts` the shapes. An edit shows on screen straight away and is put back if the save fails (`queries/shared.ts`) |
| Styles | A CSS module beside each component, and the shared names in `web/src/styles/app.css`. See `web/src/styles/README.md` |
| Tests | `server/*.test.ts` (routes, through the app; `server/testing.ts` has `household()` to set one up) and `web/src/**/*.test.ts` (logic, not rendering) |

## Conventions

- **Comments say why,** in plain words, and name things as the family would ("the wall", "a kid's device", "the parent unlock"). Match the comments around you.
- **Dates:** a day is `YYYY-MM-DD` in home's time zone, not UTC. Use the helpers in `web/src/lib/dates.ts` and `server/schemas.ts` (`DAY`, `isDay`).
- **Each request and reply shape is written once,** as a zod schema in `shared/` (`shared/tasks.ts` is the example to follow). The route checks requests with `schemaOf(...)` from `server/schemas.ts`, which also fills in defaults, and takes its TypeScript types from the same schema. The web app re-exports the types from `lib/types.ts` (`import type` only, so zod stays out of the web bundle). An edit (PATCH) gets a shape without defaults, so it changes only what it sends. Routes not moved over yet still have their JSON schema written by hand; move a feature's routes when you next work on it.
- **Styles use the shared names** for colours, corners, shadows, layers and screen sizes (`web/src/styles/README.md`). Check a change in light and dark, on a phone (upright and sideways) and on a tablet, and kid mode on both.
- **Work in phases:** one focused branch per change, so each can be reviewed and merged on its own. Commit messages start with the area: `Kid Today: ...`, `Styles: ...`.
- **Never commit** `.env`, `data/`, or anything with a key or password in it.
