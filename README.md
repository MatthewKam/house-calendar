# Wall Calendar

A touch-screen family calendar that runs on your own hardware. No accounts, no subscription.

**Status:** shows and edits iCloud calendars next to events added on the display, with Reminders lists, kids'
tasks and reward jars, a photo album and screen saver. Everything lives in a SQLite file on this machine. Google
sync and the Raspberry Pi setup come next (see "What's next").

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

Tap an iCloud event to see it, edit it or delete it (see "Using it"). In that view you can also pick **who it's for**. The pick is kept on this display, covers every repeat of the event, and
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

## On phones (home-screen app)

The app installs on iPhones and Android phones as a home-screen app: full screen, with its own icon, and it opens even
without a connection (showing what it last loaded). Data always comes from the wall's server.

1. The phone has to reach the server. At home, put `HOST=0.0.0.0` in `.env` on the machine running it and restart.
   Away from home, use [Tailscale](https://tailscale.com) (free for a family): install it on the server machine and
   each phone, and the phones can reach it from anywhere, privately.
2. On the phone, open the server's address in Safari and tap **Share → Add to Home Screen**. While developing on
   the Mac (`npm run dev`) that's `http://<mac's address>:5173` (the page server follows `HOST` too); on the Pi
   (`npm start`), `http://<pi's address>:3000`.

Set a **family PIN** first (Settings → Family PIN): after that, every device (phones and the wall) signs in with it
once and stays signed in for a year. Settings lists the devices signed in, with **Sign out** for each, and **Change
the PIN** (optionally signing out every other device). Five wrong PINs lock that device out for 15 minutes. A **master PIN** (set
for you) is the one that can change the family PIN, so knowing the family PIN isn't enough; it also signs in. The
master PIN can't be changed from the app. The
phones' Reminders Shortcut keeps using `REMINDERS_TOKEN`.
For the offline start (and phone notifications, later), iPhones need the address to be HTTPS. With MagicDNS and HTTPS
certificates turned on in the Tailscale admin, run `tailscale serve --bg 5173` on the Mac while developing (`--bg 3000`
on the Pi): the app is then at `https://<machine>.<tailnet>.ts.net`, for your Tailscale devices only. Add it to the
home screen from that address; it works at home and away.

## Using it

- **Month / Week:** switch views at the top left. ‹ › move by a month or a week.
- **Lists:** the **Lists** page in the left bar (address ends in `#lists`) shows your iCloud Reminders (see "Connect Reminders").
  Each list's items are shown in its color; tap the dot by a list's name to pick another. Drag an item by its ⋮⋮ to
  put it in order of importance (the color and order are kept on the wall; Reminders on the phones keeps its own order).
  Tap the spot before an item to give it an icon (search or **Show more** for every icon); it's added to the start of
  the item's name in Reminders, so phones show it too. Common groceries get a suggested icon (shown lighter until
  picked), and items added on the wall get theirs straight away. Renaming needs the Mac sync (`REMINDERS_MAC=1`); the
  phone Shortcut doesn't rename yet.
- **Time and weather:** under the month: the clock, the sky, the temperature now, and today's high and low, for the home address in Settings. Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key); the address is found on a map once, through the US Census geocoder.
- **Daily cards:** in Week view, beside the weather: a **dad joke** (tap for the answer, from icanhazdadjoke.com) and
  a **quote of the day** (ZenQuotes). They're fetched once a day and kept; grim jokes are skipped (it's a family wall).
- **Day:** tap any day to see it in a panel on the right. Close it with ×.
- **Round + buttons:** Calendar, Tasks, Rewards and Photos each have one at the bottom right (add an event, a task, a
  reward jar, or upload photos). A task or jar started there has no one picked yet; each kid's task card has its own
  **+ Add a task**.
- **Add:** the round **+** at the bottom right of the calendar (it starts on the day open in the day panel, else today),
  or tap a day, then **+ Add event** in the day panel.
- **Who:** an event can be for any number of people: tap each person in **Who** (tap again to remove), or
  **Everyone** for no one in particular. Shared events get a bar split into each person's color.
- **People:** tap a name at the top to show only their events (including ones they share) (or **Everyone** for events not for anyone in
  particular). Tap it again to show all. Each name fills with that person's color as they finish today's tasks.
- **Tasks:** the **Tasks** page (left bar; **Calendar** goes back; its address ends in `#tasks`, so a refresh or a
  bookmark opens it) shows a card for each kid with today's tasks, each with an optional icon,
  grouped into Morning, Anytime and Evening. Categories: **Daily** (always required, the default), **Chores**
  (required or an extra, your choice) and **Bonus** (always an extra). Required tasks fill the kid's bar and name
  button; extras earn the ★ stars you set, which go in the kid's bucket (the card shows **stars to spend**; they're
  spent on the Rewards page). Tap the square left of a task's name to give it an icon. **Days**: every day, weekdays,
  weekends, chosen weekdays, or **One time**: due by a date (Today, Tomorrow, End of week, or any day), it's on the
  list every day until it's done (shown ticked that day) or its date ends, then it's gone; it's tagged **Today only**
  or **By Sat**. **History** on a card shows a week of ticks per task or a month calendar (tap a day to see and fix
  it). **Edit tasks**: drag ⋮⋮ to reorder within a part of the day, ✎ to change a task, 🗑 to delete (it asks to
  confirm first). An extra's stars can't be un-ticked once they're in a jar.
- **Hooray!** When a kid ticks the last of *every* task due today (extras too), or fills a reward jar, the screen
  fills with confetti and a big "Hooray, Sam!" (with what it's for) for a few seconds (tap to close); Android phones
  buzz too.
- **Rewards:** the **Rewards** page (gift in the left bar, `#rewards`) is where kids spend their stars on **reward
  jars** that parents set up (the round +; ✎ beside a jar's name changes it). Each kid has a card with their
  **bucket** (stars earned from extras, not yet spent) and their jars.
  - **Use stars:** tap a jar to place a star by it (a star flies from the bucket into the jar), − to take one back,
    then **Done** asks to confirm. Once in a jar, stars can't come out. Kids can't spend more than they have.
  - **Jars** can be for several kids: their stars **filled together**, or **each** putting in the full amount. With no
    deadline, a jar empties after it's redeemed and fills again. With a **deadline**, it's one time only.
  - **Earned:** a full jar moves here (with a Hooray), tagged with who earned it, until a parent taps **Redeem**.
  - **Redeemed:** everything redeemed, by month, with the date and time; **Undo** takes back a tap made by mistake.
  - **Missed:** a jar not redeemed by its deadline. Each kid moves their stars back to their bucket or into another
    jar; once it's empty, a parent **Adds it back** (with a new deadline or none) or **Removes** it.
  - Stars not yet redeemed go back to the kids when a jar is deleted, made smaller, or a kid is taken off it.
    **Take back** (parents only: it asks for the master PIN) moves some of a kid's stars out of a jar into their
    bucket.
- **Photos:** the **Photos** page (left bar, `#photos`) is the family album. **Upload photos** takes several at
  once (drag them in, or choose them in Finder; you can also drop photos anywhere on the page); each is shrunk to wall size in the browser first (iPhone photos included).
  **Videos** upload the same way (iPhone .mov or .mp4). The server converts each to a 1080p H.264 .mp4 with no
  sound, keeping the first 45 seconds (it shows "Preparing video…" until then); in the album they have ▶ and their
  length. The screen saver and the photo card under the week play them muted, each for its full length. Converting
  uses ffmpeg from the `ffmpeg-static` package (nothing to install on the machine); if `npm install` says its
  install script wasn't run, allow it once with `npm install-scripts approve ffmpeg-static`. Photos in the screen
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
your Wi-Fi; set the family PIN first.

## What's next

1. ~~iCloud sync over CalDAV~~ (read-only, done).
2. ~~Map each synced calendar to a person~~ (done, plus per-event picks and Claude sorting by title).
3. ~~Edit iCloud events from the wall: outbox for offline edits, conflict notices~~ (done).
4. Google Calendar sync (OAuth).
5. Raspberry Pi kiosk setup: autostart, night dimming.
