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
```

GitHub runs all three on every push and pull request (`.github/workflows/checks.yml`).

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
| Shared | `shared/`: shapes and lists the server and web app both import |
| Web app | `web/src/`. React 19 and Vite. `App.tsx` is the shell; screens are in `components/` (Learn's games in `components/learn/`, Settings in `components/settings/`) |
| Server data in the web app | `web/src/lib/queries.ts` (TanStack Query hooks), `api.ts` (the calls), `types.ts`. An edit shows on screen straight away and is put back if the save fails |
| Styles | `web/src/styles/`: a CSS module per component, plus the shared names in `app.css`. See `web/src/styles/README.md` |
| Tests | `server/*.test.ts` (routes, through the app; `server/testing.ts` has `household()` to set one up) and `web/src/**/*.test.ts` (logic, not rendering) |

## Conventions

- **Comments say why,** in plain words, and name things as the family would ("the wall", "a kid's device", "the parent unlock"). Match the comments around you.
- **Dates:** a day is `YYYY-MM-DD` in home's time zone, not UTC. Use the helpers in `web/src/lib/dates.ts` and `server/schemas.ts` (`DAY`, `isDay`).
- **Requests are checked** with a JSON schema on each route; `server/schemas.ts` has the shared pieces (`DAY_VALUE`, `COLOR`, `memberExists`...).
- **Styles use the shared names** for colours, corners, shadows, layers and screen sizes (`web/src/styles/README.md`). Check a change in light and dark, on a phone (upright and sideways) and on a tablet, and kid mode on both.
- **Work in phases:** one focused branch per change, so each can be reviewed and merged on its own. Commit messages start with the area: `Kid Today: ...`, `Styles: ...`.
- **Never commit** `.env`, `data/`, or anything with a key or password in it.
