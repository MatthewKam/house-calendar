import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

// Each entry runs once, in order. Never edit a shipped migration; add a new one.
const migrations: string[] = [
  `
  CREATE TABLE members (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- A source calendar (local, Google or iCloud) mapped to one member, or to nobody ("Family").
  CREATE TABLE calendars (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('local','google','icloud')),
    remote_id   TEXT,
    name        TEXT NOT NULL,
    member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
    sync_token  TEXT
  );

  CREATE TABLE events (
    id          TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    -- Timed events: ISO-8601 UTC instants. All-day events: YYYY-MM-DD, end exclusive.
    start       TEXT NOT NULL,
    end         TEXT NOT NULL,
    remote_id   TEXT,
    etag        TEXT,
    sync_state  TEXT NOT NULL DEFAULT 'synced'
                CHECK (sync_state IN ('synced','pending_create','pending_update','pending_delete')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX events_range ON events(start, end);

  -- Changes made on the wall that still need to reach Google or iCloud.
  CREATE TABLE outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL,
    op          TEXT NOT NULL CHECK (op IN ('create','update','delete')),
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT INTO calendars (id, provider, name) VALUES ('local', 'local', 'On this display');
  `,
  // Synced calendars are matched by their remote id; sync replaces a calendar's events at once.
  `
  CREATE UNIQUE INDEX calendars_remote ON calendars(provider, remote_id) WHERE remote_id IS NOT NULL;
  CREATE INDEX events_calendar ON events(calendar_id);
  `,
  // Who a synced event is for. Kept per series (one iCloud resource, every repeat of it) and
  // outside the events table, which each sync replaces.
  `
  ALTER TABLE events ADD COLUMN series_id TEXT;

  CREATE TABLE event_people (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    series_id   TEXT NOT NULL,
    -- NULL means everyone / no one in particular.
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    source      TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
    -- For AI picks: the family list it chose from. A different list means ask again.
    basis       TEXT,
    PRIMARY KEY (calendar_id, series_id)
  );
  `,
  // Per synced calendar: hide it from the wall, and its color in Apple Calendar (to tell
  // same-named calendars apart). calendars.member_id already links a calendar to a person.
  `
  ALTER TABLE calendars ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE calendars ADD COLUMN color TEXT;
  `,
  // Chores: who does each one and on which weekdays, plus a row per day it was done.
  `
  CREATE TABLE chores (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    -- Weekdays it's due, as digits 0 (Sunday) to 6, e.g. '135' for Mon/Wed/Fri.
    days        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE chore_done (
    chore_id    TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    -- YYYY-MM-DD in the display's local time zone.
    day         TEXT NOT NULL,
    done_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (chore_id, day)
  );
  `,
  // Chores for everyone (member_id NULL), so each tick now records who did it. SQLite can't relax
  // NOT NULL in place, so both tables are rebuilt. Order matters: the new tick table points at the
  // new chores table before the old ones are dropped, so no delete cascades into the copied rows.
  `
  CREATE TABLE chores_new (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    -- NULL means everyone in the family does it.
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    days        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO chores_new (id, title, member_id, days, sort_order, created_at)
    SELECT id, title, member_id, days, sort_order, created_at FROM chores;

  CREATE TABLE chore_done_new (
    chore_id    TEXT NOT NULL REFERENCES chores_new(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    done_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (chore_id, member_id, day)
  );
  INSERT INTO chore_done_new (chore_id, member_id, day, done_at)
    SELECT d.chore_id, c.member_id, d.day, d.done_at FROM chore_done d JOIN chores c ON c.id = d.chore_id;

  DROP TABLE chore_done;
  DROP TABLE chores;
  ALTER TABLE chores_new RENAME TO chores;
  ALTER TABLE chore_done_new RENAME TO chore_done;
  `,
  // Events can be for several people. events.member_id is superseded by event_members (cleared
  // here, kept only because SQLite can't drop a foreign-key column in place), and a series' pick
  // becomes a JSON list of member ids, where [] means everyone / no one in particular.
  `
  CREATE TABLE event_members (
    event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, member_id)
  );
  CREATE INDEX event_members_member ON event_members(member_id);
  INSERT INTO event_members (event_id, member_id) SELECT id, member_id FROM events WHERE member_id IS NOT NULL;
  UPDATE events SET member_id = NULL;

  CREATE TABLE event_people_new (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    series_id   TEXT NOT NULL,
    member_ids  TEXT NOT NULL DEFAULT '[]',
    source      TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
    basis       TEXT,
    PRIMARY KEY (calendar_id, series_id)
  );
  INSERT INTO event_people_new (calendar_id, series_id, member_ids, source, basis)
    SELECT calendar_id, series_id, CASE WHEN member_id IS NULL THEN '[]' ELSE json_array(member_id) END, source, basis
    FROM event_people;
  DROP TABLE event_people;
  ALTER TABLE event_people_new RENAME TO event_people;
  `,
  // iCloud Reminders, synced by an iPhone Shortcut (Apple offers no API a Raspberry Pi can use).
  // Each phone sends a snapshot of its lists; changes made on the wall wait in reminder_outbox
  // until a phone that has that list applies them. Lists and items are matched by name, because
  // Shortcuts doesn't expose Reminders' internal ids.
  `
  CREATE TABLE reminder_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list        TEXT NOT NULL,
    title       TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    -- YYYY-MM-DD or an ISO instant, as the phone sent it.
    due         TEXT
  );
  CREATE INDEX reminder_items_list ON reminder_items(list);

  -- Which phone last reported which list, so changes go to a phone that has it.
  CREATE TABLE reminder_devices (
    device      TEXT NOT NULL,
    list        TEXT NOT NULL,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (device, list)
  );

  CREATE TABLE reminder_outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    op          TEXT NOT NULL CHECK (op IN ('add', 'complete', 'uncomplete')),
    list        TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    -- Handed to this phone; if it doesn't confirm in time, another run can take it.
    claimed_by  TEXT,
    claimed_at  TEXT
  );
  `,
  // "Chores" became "Tasks". Renaming keeps every task and its tick history; foreign keys follow.
  `
  ALTER TABLE chores RENAME TO tasks;
  ALTER TABLE chore_done RENAME TO task_done;
  ALTER TABLE task_done RENAME COLUMN chore_id TO task_id;
  `,
  // Tasks get a time of day, a category, and required-or-extra. Required tasks fill the day's bar;
  // extras earn points, recorded on each tick so later changes to a task don't rewrite history.
  // Existing tasks become everyday, required, any time: the bar works as it did.
  `
  ALTER TABLE tasks ADD COLUMN time TEXT CHECK (time IN ('morning', 'evening'));
  ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'everyday'
    CHECK (category IN ('non_negotiable', 'chores', 'everyday', 'bonus'));
  ALTER TABLE tasks ADD COLUMN required INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE tasks ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE task_done ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
  `,
  // "Everyday" is gone: required ones become Daily (also always required), extras become Chores.
  // Each person can have a reward for reaching a number of stars in a month.
  `
  UPDATE tasks SET category = 'non_negotiable' WHERE category = 'everyday' AND required = 1;
  UPDATE tasks SET category = 'chores' WHERE category = 'everyday';
  ALTER TABLE members ADD COLUMN reward_title TEXT;
  ALTER TABLE members ADD COLUMN reward_goal INTEGER;
  `,
  // Rewards get their own table: several per person, each either resetting monthly or counting
  // stars from when it was set until it's earned (then marked as given). The one-per-person
  // reward on members moves here as a monthly reward.
  `
  CREATE TABLE rewards (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    goal        INTEGER NOT NULL CHECK (goal > 0),
    mode        TEXT NOT NULL DEFAULT 'monthly' CHECK (mode IN ('monthly', 'until_reached')),
    -- Local day stars start counting from (for until_reached).
    start_day   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    -- Set when an earned reward has been handed over; it then drops off the card.
    claimed_at  TEXT
  );
  INSERT INTO rewards (id, member_id, title, goal, mode, start_day)
    SELECT lower(hex(randomblob(16))), id, reward_title, reward_goal, 'monthly', strftime('%Y-%m-01', 'now', 'localtime')
    FROM members WHERE reward_title IS NOT NULL AND reward_goal IS NOT NULL;
  ALTER TABLE members DROP COLUMN reward_title;
  ALTER TABLE members DROP COLUMN reward_goal;
  `,
  // An optional icon (an emoji) shown before a task's name.
  `
  ALTER TABLE tasks ADD COLUMN icon TEXT;
  `,
  // Where an event is (from iCloud's LOCATION, or typed on the wall), for travel times.
  `
  ALTER TABLE events ADD COLUMN location TEXT;
  `,
  // "Time to leave" alerts. Not tied to events by a foreign key: synced events are replaced on
  // every sync (same ids), which would delete the alerts with them.
  `
  CREATE TABLE leave_alerts (
    id            TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    destination   TEXT NOT NULL,
    arrive_by     TEXT NOT NULL,
    minutes_before INTEGER NOT NULL DEFAULT 0,
    drive_minutes INTEGER NOT NULL,
    leave_at      TEXT NOT NULL,
    -- When the wall shows the alert: leave_at minus minutes_before.
    remind_at     TEXT NOT NULL,
    -- Traffic is re-checked once, shortly before leaving.
    refreshed_at  TEXT,
    dismissed_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX leave_alerts_remind ON leave_alerts(remind_at);
  `,
  // Edits to iCloud events made on the wall, waiting to be sent. One row per occurrence: a second
  // edit before sending merges into the first. The wall shows these on top of each sync's snapshot.
  `
  CREATE TABLE event_outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id TEXT NOT NULL,
    -- The occurrence: resource URL, plus "#<recurrence id>" for one day of a repeating event.
    remote_id   TEXT NOT NULL,
    op          TEXT NOT NULL CHECK (op IN ('update','delete')),
    -- JSON: the new title / allDay / start / end / location (only what changed).
    changes     TEXT NOT NULL DEFAULT '{}',
    -- JSON: those details as they were when edited here, to spot edits made elsewhere meanwhile.
    before      TEXT NOT NULL,
    -- pending: waiting to send; conflict: changed elsewhere too, waiting for someone to choose.
    state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','conflict')),
    -- JSON: iCloud's details when a conflict was found; null if it was deleted there.
    theirs      TEXT,
    error       TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    -- Not sent before this (the wall's Undo window).
    send_after  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (calendar_id, remote_id)
  );
  `,
  // New events made on the wall can go to iCloud too ('create'), into calendars that take changes.
  `
  ALTER TABLE calendars ADD COLUMN writable INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE event_outbox_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id TEXT NOT NULL,
    remote_id   TEXT NOT NULL,
    op          TEXT NOT NULL CHECK (op IN ('create','update','delete')),
    changes     TEXT NOT NULL DEFAULT '{}',
    -- For a new event, null: there's no iCloud version to compare with.
    before      TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','conflict')),
    theirs      TEXT,
    error       TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    send_after  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (calendar_id, remote_id)
  );
  INSERT INTO event_outbox_new SELECT * FROM event_outbox;
  DROP TABLE event_outbox;
  ALTER TABLE event_outbox_new RENAME TO event_outbox;
  `,
  // Reminders can be renamed from the wall (to put an icon at the start of an item's name).
  `
  CREATE TABLE reminder_outbox_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    op          TEXT NOT NULL CHECK (op IN ('add', 'complete', 'uncomplete', 'rename')),
    list        TEXT NOT NULL,
    title       TEXT NOT NULL,
    -- rename only: the name it gets.
    new_title   TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    claimed_by  TEXT,
    claimed_at  TEXT
  );
  INSERT INTO reminder_outbox_new (id, op, list, title, created_at, claimed_by, claimed_at)
    SELECT id, op, list, title, created_at, claimed_by, claimed_at FROM reminder_outbox;
  DROP TABLE reminder_outbox;
  ALTER TABLE reminder_outbox_new RENAME TO reminder_outbox;
  `,
  // Rewards for several kids together (their stars pooled, or each reaching the goal), ones that
  // start again once given, and a history of every reward earned. rewards.member_id stays as the
  // first kid; reward_members says who it's for.
  `
  CREATE TABLE reward_members (
    reward_id   TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (reward_id, member_id)
  );
  INSERT INTO reward_members (reward_id, member_id) SELECT id, member_id FROM rewards;
  ALTER TABLE rewards ADD COLUMN team_mode TEXT NOT NULL DEFAULT 'pooled' CHECK (team_mode IN ('pooled', 'each'));
  -- Until-earned rewards that start counting again after they're given.
  ALTER TABLE rewards ADD COLUMN repeats INTEGER NOT NULL DEFAULT 0;
  -- Each time a reward was earned: kept even if the reward is later renamed or deleted.
  CREATE TABLE reward_wins (
    id          TEXT PRIMARY KEY,
    reward_id   TEXT NOT NULL,
    -- Monthly: YYYY-MM. Until earned: the day it started counting.
    period      TEXT NOT NULL,
    title       TEXT NOT NULL,
    -- JSON array of who earned it.
    member_ids  TEXT NOT NULL,
    goal        INTEGER NOT NULL,
    stars       INTEGER NOT NULL,
    -- Local day the goal was reached.
    earned_day  TEXT NOT NULL,
    given_at    TEXT,
    UNIQUE (reward_id, period)
  );
  -- Until-earned rewards already handed over become history.
  INSERT INTO reward_wins (id, reward_id, period, title, member_ids, goal, stars, earned_day, given_at)
    SELECT lower(hex(randomblob(16))), id, start_day, title, json_array(member_id), goal, goal,
      substr(claimed_at, 1, 10), claimed_at FROM rewards WHERE claimed_at IS NOT NULL;
  `,
  // The photo album (and screen saver). Files live in data/photos: <id>.jpg and <id>.thumb.jpg.
  `
  CREATE TABLE photos (
    id            TEXT PRIMARY KEY,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    -- When it was taken (or the file's date), as an ISO instant; null if unknown.
    taken_at      TEXT,
    -- Who added it; null once that person is removed.
    member_id     TEXT REFERENCES members(id) ON DELETE SET NULL,
    source        TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'google')),
    in_slideshow  INTEGER NOT NULL DEFAULT 1,
    has_thumb     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
  // The day's joke, quote and "on this day" events, fetched once a day and kept, so they stay the
  // same all day (and still show if the internet drops).
  `
  CREATE TABLE daily_items (
    day   TEXT NOT NULL,
    kind  TEXT NOT NULL,
    data  TEXT NOT NULL,
    PRIMARY KEY (day, kind)
  );
  `,
  // The family PIN (hashed) and the devices signed in with it.
  `
  CREATE TABLE auth (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash  TEXT NOT NULL,
    set_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE sessions (
    -- SHA-256 of the cookie's token, so the database alone can't sign anyone in.
    token_hash  TEXT PRIMARY KEY,
    -- What the device said it is (browser and system), to tell devices apart in Settings.
    label       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
  // A master PIN (hashed): the one that can change the family PIN, and always signs in.
  `
  ALTER TABLE auth ADD COLUMN master_hash TEXT;
  `,
  // Rewards become jars: each kid's stars sit in their bucket until they put them in a jar.
  // Monthly rewards become ordinary jars; every jar starts empty (stars already earned stay in the
  // buckets). A jar can have a deadline; missed ones wait for the kids to move their stars out.
  `
  UPDATE rewards SET mode = 'until_reached';
  ALTER TABLE rewards ADD COLUMN deadline TEXT;
  ALTER TABLE rewards ADD COLUMN missed_at TEXT;
  -- A jar whose deadline passed before it was redeemed: the deadline, kept in its history.
  ALTER TABLE reward_wins ADD COLUMN missed_on TEXT;
  -- Stars a kid put in a jar. win_id is set once the jar fills (they're spent when it's redeemed).
  -- No link to rewards: the rows of redeemed jars stay as history when the jar is deleted.
  CREATE TABLE jar_stars (
    id          TEXT PRIMARY KEY,
    reward_id   TEXT NOT NULL,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    stars       INTEGER NOT NULL CHECK (stars > 0),
    win_id      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX jar_stars_reward ON jar_stars (reward_id);
  CREATE INDEX jar_stars_member ON jar_stars (member_id);
  `,
  // One-time tasks: due by this day (on the list from when they're added until they're done, or
  // until this day ends). Null for tasks that repeat on their weekdays.
  `
  ALTER TABLE tasks ADD COLUMN due_by TEXT;
  `,
  // Videos in the album: converted on the server (ready = 0 until then), with their length.
  `
  ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'video'));
  ALTER TABLE photos ADD COLUMN seconds REAL;
  ALTER TABLE photos ADD COLUMN ready INTEGER NOT NULL DEFAULT 1;
  `,
  // The parent lock: a device unlocked with the master PIN can change things (until this instant,
  // or 'always' for a parent's own phone).
  `
  ALTER TABLE sessions ADD COLUMN parent_until TEXT;
  `,
  // Google Calendar, connected by each person with their own Google account. A calendar now notes
  // which account it comes from (source: 'icloud', or 'google:<connection id>'), so several
  // accounts sync side by side; a calendar two accounts both see comes from the first.
  `
  CREATE TABLE connections (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('google')),
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    -- The account's email, to tell connections apart.
    account     TEXT NOT NULL,
    -- The refresh token, encrypted (secrets.ts).
    token       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (provider, account)
  );
  ALTER TABLE calendars ADD COLUMN source TEXT;
  UPDATE calendars SET source = provider;
  `,
  // iCloud, connected in the app: the Apple ID is the account, and its app-specific password the
  // token (encrypted). Calendars from it are 'icloud:<connection id>'; the .env one stays 'icloud'.
  `
  CREATE TABLE connections_new (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('google','icloud')),
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    account     TEXT NOT NULL,
    token       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (provider, account)
  );
  INSERT INTO connections_new SELECT * FROM connections;
  DROP TABLE connections;
  ALTER TABLE connections_new RENAME TO connections;
  `,
  // Stages (stages.ts): a birthdate (YYYY-MM-DD) gives each person a stage; a guardian can choose
  // a different one (null: from the birthdate).
  `
  ALTER TABLE members ADD COLUMN birthdate TEXT;
  ALTER TABLE members ADD COLUMN stage TEXT CHECK (stage IN ('little','early','middle','tween','teen','adult'));
  `,
  // Moments (moments.ts): something good a parent caught, on a local day. `stars`: what it earned
  // (0 for a Little kid's sticker), kept so later stage changes don't change past stars.
  `
  CREATE TABLE moments (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('body','feelings','thinking','helping','myself')),
    note        TEXT,
    stars       INTEGER NOT NULL DEFAULT 0,
    day         TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX moments_day ON moments(day);
  `,
  // Goals (goals.ts): worked on from `started_day`, done when a parent confirms (`done_day`).
  // `library_key`: the starter goal it came from (goalLibrary.ts), null for a parent's own.
  `
  CREATE TABLE goals (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    library_key TEXT,
    title       TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('body','feelings','thinking','helping','myself')),
    started_day TEXT NOT NULL,
    done_day    TEXT,
    note        TEXT,
    stars       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX goals_member ON goals(member_id);
  `,
  // Moments and goals share six activities now (helpful, attitude, bravery, cleanliness, problem
  // solving, self care), each moved to the closest. A parent picks the points: a moment's when it's
  // caught, a goal's (`points`) when it's added, earned as `stars` when it's done. Starter goals a
  // family never uses can be hidden from the library (`hidden_goals`).
  `
  CREATE TABLE moments_new (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('helpful','attitude','bravery','cleanliness','problem_solving','self_care')),
    note        TEXT,
    stars       INTEGER NOT NULL DEFAULT 0,
    day         TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO moments_new SELECT id, member_id,
    CASE kind WHEN 'helping' THEN 'helpful' WHEN 'feelings' THEN 'attitude' WHEN 'body' THEN 'bravery'
      WHEN 'thinking' THEN 'problem_solving' ELSE 'self_care' END,
    note, stars, day, created_at FROM moments;
  DROP TABLE moments;
  ALTER TABLE moments_new RENAME TO moments;
  CREATE INDEX moments_day ON moments(day);

  CREATE TABLE goals_new (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    library_key TEXT,
    title       TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('helpful','attitude','bravery','cleanliness','problem_solving','self_care')),
    started_day TEXT NOT NULL,
    done_day    TEXT,
    note        TEXT,
    points      INTEGER NOT NULL DEFAULT 5,
    stars       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO goals_new SELECT id, member_id, library_key, title, emoji,
    CASE kind WHEN 'helping' THEN 'helpful' WHEN 'feelings' THEN 'attitude' WHEN 'body' THEN 'bravery'
      WHEN 'thinking' THEN 'problem_solving' ELSE 'self_care' END,
    started_day, done_day, note, CASE WHEN done_day IS NULL THEN 5 ELSE stars END, stars, created_at FROM goals;
  DROP TABLE goals;
  ALTER TABLE goals_new RENAME TO goals;
  CREATE INDEX goals_member ON goals(member_id);

  CREATE TABLE hidden_goals (library_key TEXT PRIMARY KEY);
  `,
  // A parent's own goals join the family's library (key 'own:<id>'), for any kid, until hidden.
  // Own goals made before this are added, one per name.
  `
  CREATE TABLE own_goals (
    key         TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('helpful','attitude','bravery','cleanliness','problem_solving','self_care')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO own_goals (key, title, emoji, kind)
    SELECT 'own:' || MIN(id), title, emoji, kind FROM goals WHERE library_key IS NULL GROUP BY title;
  UPDATE goals SET library_key = (SELECT key FROM own_goals o WHERE o.title = goals.title) WHERE library_key IS NULL;
  `,
  // Goals are ticked each day now, for their points: what bonus tasks were. Tasks are the required
  // ones, so extras of any kind become goals (category 'bonus'), and goals being worked on become
  // goals on the list every day. Goals already done keep their stars in \`goals\`.
  `
  UPDATE tasks SET category = 'bonus' WHERE required = 0;
  INSERT INTO tasks (id, title, member_id, days, sort_order, time, category, required, points, icon, due_by)
    SELECT id, title, member_id, '0123456', (SELECT COALESCE(MAX(sort_order), -1) FROM tasks) + ROW_NUMBER() OVER (ORDER BY created_at),
      NULL, 'bonus', 0, points, emoji, NULL
    FROM goals WHERE done_day IS NULL;
  DELETE FROM goals WHERE done_day IS NULL;
  `,
  // Potty charts: for each kid on one, a card with a row of punches per step (said I need to go,
  // sat on the potty, went, wiped and flushed, washed hands). A full row is a star; a full card
  // starts the next one.
  `
  CREATE TABLE potty_kids (
    member_id   TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE potty_cards (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    finished_at TEXT
  );
  CREATE INDEX potty_cards_member ON potty_cards(member_id);
  CREATE TABLE potty_punches (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES potty_cards(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    step        TEXT NOT NULL CHECK (step IN ('ask','sit','go','wipe','wash')),
    -- The go row: which it was.
    kind        TEXT CHECK (kind IN ('pee','poo')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX potty_punches_card ON potty_punches(card_id);
  `,
  // The go row can be both, too.
  `
  CREATE TABLE potty_punches_new (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES potty_cards(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    step        TEXT NOT NULL CHECK (step IN ('ask','sit','go','wipe','wash')),
    kind        TEXT CHECK (kind IN ('pee','poo','both')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO potty_punches_new (rowid, id, card_id, member_id, step, kind, created_at)
    SELECT rowid, id, card_id, member_id, step, kind, created_at FROM potty_punches;
  DROP TABLE potty_punches;
  ALTER TABLE potty_punches_new RENAME TO potty_punches;
  CREATE INDEX potty_punches_card ON potty_punches(card_id);
  `,
  // Privacy: who sees an event. everyone; busy (others see "Busy" at that time); private (others
  // don't see it). Each calendar has a default; an event (every repeat of it) can have its own.
  `
  ALTER TABLE calendars ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone'
    CHECK (visibility IN ('everyone','busy','private'));
  CREATE TABLE event_privacy (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    -- The series (every repeat), or the event's own id when it doesn't repeat.
    series_key  TEXT NOT NULL,
    visibility  TEXT NOT NULL CHECK (visibility IN ('everyone','busy','private')),
    PRIMARY KEY (calendar_id, series_key)
  );
  `,
  // Lists kept in Sprig itself (no Reminders Shortcut needed). An item can say when (a reminder)
  // and who it's for.
  `
  CREATE TABLE lists (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE list_items (
    id          TEXT PRIMARY KEY,
    list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    -- When: an instant (a time that day), or YYYY-MM-DD (any time that day). NULL: whenever.
    due         TEXT,
    member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    done_at     TEXT
  );
  CREATE INDEX list_items_list ON list_items(list_id);
  `,
  // Phones and browsers that turned alerts on (push.ts), and which alerts each has had, so none
  // comes twice. The time zone says when "8 AM" is for a reminder that has a day but no time.
  `
  CREATE TABLE push_devices (
    id            TEXT PRIMARY KEY,
    endpoint      TEXT NOT NULL UNIQUE,
    subscription  TEXT NOT NULL,
    member_id     TEXT REFERENCES members(id) ON DELETE CASCADE,
    time_zone     TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE push_sent (
    device_id  TEXT NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (device_id, key)
  );
  `,
];

/** `upTo` stops after that many migrations; tests use it to build an older database. */
export function openDb(file: string, upTo = migrations.length): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db, upTo);
  return db;
}

function migrate(db: DB, upTo: number) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < upTo; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
