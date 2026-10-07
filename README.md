# Wall Calendar

A touch-screen family calendar that runs on your own hardware. No accounts, no subscription.

**Status:** shows iCloud calendars (read-only) next to events added on the display, which live in a
SQLite file on this machine. Google sync and editing iCloud events come next (see "What's next").

## Run it on your computer

Needs [Node.js 22 or newer](https://nodejs.org).

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3000; the page reloads as you edit code.

To run it the way the wall display will (one process, built UI):

```sh
npm run build
npm start          # http://localhost:3000
```

Data lives in `data/calendar.db`. Delete that file to start over.

## Connect iCloud

1. At [account.apple.com](https://account.apple.com) → Sign-In and Security → **App-Specific Passwords**,
   create one called "Wall calendar". Your normal Apple password is never used, and you can revoke this one anytime.
2. Copy `.env.example` to `.env` and fill in your Apple ID and that password. `.env` is git-ignored; keep it that way.
3. Restart the server. It syncs on start and every 5 minutes, from 3 months back to 13 months ahead.

iCloud events show on the wall but can't be edited there yet; tap one to see it, and change it on your iPhone or Mac.
In that view you can pick **who it's for**. The pick is kept on this display, covers every repeat of the event, and
survives future syncs.

**Calendars:** in Settings, link each iCloud calendar to a person (all its events become theirs) or leave it on
**By event**, and untick **Show** to keep a calendar off the wall. Who an event is for is decided in this order:
your pick on the event, then the calendar's person, then Claude's pick from the title.

**Sort by person automatically (optional):** add `ANTHROPIC_API_KEY` to `.env` and restart. After each sync, Claude
reads the titles of events nobody has assigned yet (and your family's names) and picks who each is for, e.g.
"Sam - swim class" goes to Sam and "Riley & Sam dentist" to both. Your own picks always win. Event titles and family names are sent to the
Anthropic API.
If syncing fails (wrong password, no internet), a banner says so and the last synced copy stays on screen.

## Connect Reminders

iCloud Reminders have no API a Raspberry Pi can use (Apple moved them off CalDAV in iOS 13), so each iPhone syncs them with a Shortcut. Each phone sends its lists to the wall; items added or ticked off on the wall wait (marked ↻) until a phone that has that list runs the Shortcut and applies them. Lists shared between you show up from either phone; private lists come from their owner's phone only.

1. `.env` needs `REMINDERS_TOKEN` (any long random text) and the server must be reachable on your Wi-Fi:`HOST=0.0.0.0`. Restart after changing either.
2. On each iPhone, make a Shortcut called "Sync wall lists". Use the Pi's address, the token, and a name
   for the phone (e.g. `Alex`):
   1. **Get Contents of URL** `http://<pi-address>:3000/api/reminders/phone/pending?device=Alex`,
      header `Authorization` = `Bearer <token>`. Get the dictionary value `changes`.
   2. **Repeat with Each** change: if `op` is `add`, add a reminder titled `title` to the list named `list`;
      if `complete` or `uncomplete`, find the reminder in `list` with that `title` and set it completed or not.
      Add each change's `id` to a list variable `applied`.
   3. **Find Reminders** that are not completed, plus ones completed in the last day. For each, make a
      dictionary `{ list: <List name>, title: <Title>, done: <Is Completed>, due: <Due Date> }` and add it to
      a list variable `items`.
   4. **Get Contents of URL** `http://<pi-address>:3000/api/reminders/phone/sync`, method POST, same
      header, JSON body `{ device: "Alex", items: <items>, applied: <applied> }`.
3. Automations (Shortcuts > Automation, set to run immediately): **App > Reminders > Is Closed**, so changes
   reach the wall as soon as you leave Reminders, plus a few **Time of Day** runs so wall changes reach your
   phone even when you don't open Reminders.

The Shortcut only works while the phone is on your home Wi-Fi; runs elsewhere just fail quietly.

**On a Mac (before the Pi):** the server can sync this Mac's Reminders itself, with no Shortcut. Put
`REMINDERS_MAC=1` in `.env` (plus `REMINDERS_TOKEN`) and restart. It reads every list, empty and shared ones
included, every `REMINDERS_MINUTES` (default 5), and sends wall changes to Reminders a few seconds after
they're made. The first run, macOS asks to let the app running the server control Reminders; allow it.
Lists can be hidden from the wall with **Choose lists** on the Lists page.

## Travel times

Events with an address (iCloud's location, or the **Address** field on events added here) get a **Travel time**
button: the drive from home with predicted traffic, and when to leave to arrive on time. From there,
**Remind me** sets a "time to leave" alert on the wall (at leave time, or 10 or 15 minutes before), with a chime.
Traffic is checked again about 30 minutes before leaving, and the alert moves if the drive got longer.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project, enable the **Routes API**, and
   turn on billing (Google's monthly free credit covers a family's use many times over).
2. Create an API key under **APIs & Services → Credentials** and restrict it to the Routes API.
3. Put it after `GOOGLE_MAPS_API_KEY=` in `.env` and restart. Set your home address in **Settings**.

Each tap asks Google twice (to match traffic to when you'd leave); answers are reused for 10 minutes. Alerts show on
the wall, not on phones.

## Using it

- **Month / Week:** switch views at the top left. ‹ › move by a month or a week.
- **Lists:** the **Lists** page in the left bar (address ends in `#lists`) shows your iCloud Reminders (see "Connect Reminders").
  Tap the spot before an item to give it an icon (search or **Show more** for every icon); it's added to the start of
  the item's name in Reminders, so phones show it too. Common groceries get a suggested icon (shown lighter until
  picked), and items added on the wall get theirs straight away. Renaming needs the Mac sync (`REMINDERS_MAC=1`); the
  phone Shortcut doesn't rename yet.
- **Time and weather:** under the month: the clock, the sky, the temperature now, and today's high and low, for the home address in Settings. Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key); the address is found on a map once, through the US Census geocoder.
- **Day:** tap any day to see it in a panel on the right. Close it with ×.
- **Add:** tap a day, then **+ Add event** in the day panel.
- **Who:** an event can be for any number of people: tap each person in **Who** (tap again to remove), or
  **Everyone** for no one in particular. Shared events get a bar split into each person's color.
- **People:** tap a name at the top to show only their events (including ones they share) (or **Everyone** for events not for anyone in
  particular). Tap it again to show all. Each name fills with that person's color as they finish today's tasks.
- **Tasks:** the **Tasks** page (left bar; **Calendar** goes back; its address ends in `#tasks`, so a refresh or a
  bookmark opens it) shows a card for each kid with today's tasks, each with an optional icon,
  grouped into Morning, Anytime and Evening. Categories: **Daily** (always required, the default), **Chores**
  (required or an extra, your choice) and **Bonus** (always an extra). Required tasks fill the kid's bar and name
  button; extras earn the ★ stars you set. Each card shows this month's stars and the kid's **rewards** (as many as
  you like; tap one to change it). A reward either **resets each month** (counts that month's stars) or counts
  **until earned** (from when it was set, however long it takes; once reached, **Mark as given** clears it). **History** on a card shows a week of ticks
  per task or a month calendar (tap a day to see and fix it). **Edit tasks**: drag ⋮⋮ to reorder within a part of
  the day, ✎ to change a task, 🗑 to delete (it asks to confirm first).
- **Rewards:** the **Rewards** page (gift in the left bar, `#rewards`) shows rewards ready to hand over, rewards in
  progress, and everything given, by month, with each kid's tally for the year. A reward can be for several kids
  together: their stars **added together** toward one goal, or **each** reaching it. Until-earned rewards can **start
  again after they're given**. Every time a goal is reached it's kept in the history (even if the reward is renamed or
  deleted later); **Undo** takes back a hand-over tapped by mistake.
- **Photos:** the **Photos** page (left bar, `#photos`) is the family album. **Upload photos** takes several at
  once (drag them in, or choose them in Finder; you can also drop photos anywhere on the page); each is shrunk to wall size in the browser first (iPhone photos included). Photos in the screen
  saver have a ✓. **Select** starts with those selected; tap photos to change it, then **Save selection**. Tap a photo
  to see it full size (or delete it). Photos are stored in `data/photos` (not in git). To upload from phones, the server has to be
  reachable on your Wi-Fi (`HOST=0.0.0.0`). Untick **Add them to the screen saver** in the upload pop-up to keep a
  batch out of it.
- **Screen saver:** after 15 minutes without a touch, the wall shows the album full screen, shuffled, with the time
  and weather in a corner (not while a pop-up is open; "time to leave" alerts still show on top). Swipe for the
  next or previous photo; the small pause icon (top right) holds the current one and shows ‹ › to step through
  (arrow keys and Space on a keyboard). Tap anywhere else to close.
  In **Settings**: on or off, how long before it starts, how long each photo stays up (20 seconds by default),
  the transition (a mix, crossfade, slow zoom and pan, slide, zoom, blur or flip), and night hours when the photos
  are dimmed and change more slowly (10 PM to 6 AM by default); the same settings open from
  **Screen saver settings** on the Photos page, with **Play it now**.
- **Edit or delete:** tap an event. Delete asks twice, and you get 10 seconds to undo.
- **iCloud events:** tap one, then **Edit event** to change its title, time or address, or delete it. The change
  shows at once (marked ↻ until it's sent) and goes to iCloud after the 10-second Undo, then to your phones. For a
  repeating event, Save and Delete ask whether it's **this day only** or **every day** (every day can rename it, change
  its address, or move every day's time; all-day changes to a whole series are made on the phone). An event that's in
  two calendars (shown once) is changed or deleted in both. If iCloud can't be reached, changes wait and are
  retried with every sync. If the same detail was changed on another device meanwhile, the wall asks which version
  to keep (**Keep mine** or **Use iCloud's**); changes to other details on the phone are kept either way.
- **Family:** in **Settings** (the gear at the bottom of the left bar), rename people and change their color at any time. Adding and removing people is hidden for now (`CAN_ADD_OR_REMOVE` in `web/src/components/MembersPanel.tsx`). Colors only change this display.
  Removing a person keeps their events, shown in gray.
- **Text size:** in Settings, adjust for the screen (15.6" vs 21.5").

## How it's built

| Part          | Where                                 | Notes                                                                                                                                                          |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API + storage | `server/`                             | Fastify, better-sqlite3. Schema and migrations in `server/db.ts`.                                                                                              |
| People        | `server/people.ts`                    | Who each synced event series is for: manual picks, then Claude (`claude-opus-5-5`, structured output) for the rest.                                            |
| Sync          | `server/sync.ts`, `server/providers/` | Pulls each calendar's events in a date window and replaces the stored copy. iCloud over CalDAV (`caldav.ts`); `ical.ts` expands repeating events with ical.js. |
| UI            | `web/src/`                            | React 19 + Vite, CSS modules. `App.tsx` is the shell; screens live in `components/`.                                                                           |
| Server data   | `web/src/lib/queries.ts`              | TanStack Query hooks: fetching, 60 s refresh, and cache updates after edits. No Redux; add it only if client-only state grows.                                 |
| Tests         | `server/*.test.ts`                    | `npm test`                                                                                                                                                     |

Checks: `npm test` and `npm run check` (TypeScript for server and UI).

The server listens on localhost only. `HOST=0.0.0.0 npm start` makes it reachable from phones on
your Wi-Fi, but there's no login yet, so only do that on a network you trust.

## What's next

1. ~~iCloud sync over CalDAV~~ (read-only, done).
2. ~~Map each synced calendar to a person~~ (done, plus per-event picks and Claude sorting by title).
3. Edit iCloud events from the wall: outbox for offline edits, conflict notices.
4. Google Calendar sync (OAuth).
5. Raspberry Pi kiosk setup: autostart, night dimming.
