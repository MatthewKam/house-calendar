-- A household's database (server/db.ts), at version 53. Written by server/schema.test.ts; don't edit by hand.

CREATE TABLE auth (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash  TEXT NOT NULL,
    set_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , master_hash TEXT);

CREATE TABLE calendars (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('local','google','icloud')),
    remote_id   TEXT,
    name        TEXT NOT NULL,
    member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
    sync_token  TEXT
  , hidden INTEGER NOT NULL DEFAULT 0, color TEXT, writable INTEGER NOT NULL DEFAULT 1, source TEXT, visibility TEXT NOT NULL DEFAULT 'everyone'
    CHECK (visibility IN ('everyone','busy','private')));

CREATE UNIQUE INDEX calendars_remote ON calendars(provider, remote_id) WHERE remote_id IS NOT NULL;

CREATE TABLE color_requests (
    member_id  TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    color      TEXT NOT NULL,
    asked_by   TEXT,
    asked_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE "connections" (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('google','icloud')),
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    account     TEXT NOT NULL,
    token       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (provider, account)
  );

CREATE TABLE daily_items (
    day   TEXT NOT NULL,
    kind  TEXT NOT NULL,
    data  TEXT NOT NULL,
    PRIMARY KEY (day, kind)
  );

CREATE TABLE event_checklist (
    id          TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    series_key  TEXT NOT NULL,
    title       TEXT NOT NULL,
    picture     TEXT,
    sort_order  INTEGER NOT NULL
  );

CREATE INDEX event_checklist_series ON event_checklist(calendar_id, series_key);

CREATE TABLE event_checklist_ticks (
    item_id    TEXT NOT NULL REFERENCES event_checklist(id) ON DELETE CASCADE,
    occurrence TEXT NOT NULL,
    PRIMARY KEY (item_id, occurrence)
  );

CREATE TABLE event_flyers (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    series_key  TEXT NOT NULL,
    photo_id    TEXT NOT NULL,
    PRIMARY KEY (calendar_id, series_key)
  );

CREATE TABLE event_members (
    event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, member_id)
  );

CREATE INDEX event_members_member ON event_members(member_id);

CREATE TABLE "event_outbox" (
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

CREATE TABLE "event_people" (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    series_id   TEXT NOT NULL,
    member_ids  TEXT NOT NULL DEFAULT '[]',
    source      TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
    basis       TEXT,
    PRIMARY KEY (calendar_id, series_id)
  );

CREATE TABLE event_privacy (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    -- The series (every repeat), or the event's own id when it doesn't repeat.
    series_key  TEXT NOT NULL,
    visibility  TEXT NOT NULL CHECK (visibility IN ('everyone','busy','private')),
    PRIMARY KEY (calendar_id, series_key)
  );

CREATE TABLE event_special (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    -- The series (every repeat), or the event's own id when it doesn't repeat.
    series_key  TEXT NOT NULL,
    PRIMARY KEY (calendar_id, series_key)
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
  , series_id TEXT, location TEXT, notes TEXT, photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL);

CREATE INDEX events_calendar ON events(calendar_id);

CREATE INDEX events_range ON events(start, end);

CREATE TABLE "goals" (
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

CREATE INDEX goals_member ON goals(member_id);

CREATE TABLE hidden_goals (library_key TEXT PRIMARY KEY);

CREATE TABLE jar_stars (
    id          TEXT PRIMARY KEY,
    reward_id   TEXT NOT NULL,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    stars       INTEGER NOT NULL CHECK (stars > 0),
    win_id      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE INDEX jar_stars_member ON jar_stars (member_id);

CREATE INDEX jar_stars_reward ON jar_stars (reward_id);

CREATE TABLE learn_days (
    member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    day           TEXT NOT NULL,
    extra_games   INTEGER NOT NULL DEFAULT 0,
    extra_minutes INTEGER NOT NULL DEFAULT 0,
    -- 1: a grown-up unlocked it today, 0: locked it, NULL: it opens once the Daily tasks are done.
    open          INTEGER,
    seconds       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (member_id, day)
  );

CREATE TABLE learn_kids (
    member_id  TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    enabled    INTEGER NOT NULL DEFAULT 0,
    level_up   INTEGER NOT NULL DEFAULT 0
  , games_a_day INTEGER NOT NULL DEFAULT 2, minutes_a_day INTEGER);

CREATE TABLE learn_levels (
    member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    skill      TEXT NOT NULL,
    level      INTEGER NOT NULL, since_play INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (member_id, skill)
  );

CREATE TABLE learn_sessions (
    id         TEXT PRIMARY KEY,
    member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    skill      TEXT NOT NULL,
    level      INTEGER NOT NULL,
    rounds     INTEGER NOT NULL,
    first_try  INTEGER NOT NULL,
    stars      INTEGER NOT NULL DEFAULT 0,
    done_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE UNIQUE INDEX learn_star_a_day ON learn_sessions(member_id, day) WHERE stars > 0;

CREATE TABLE learn_sounds (
    animal     TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    audio      BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

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

CREATE TABLE lists (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE members (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , birthdate TEXT, stage TEXT CHECK (stage IN ('little','early','middle','tween','teen','adult')));

CREATE TABLE "moments" (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('helpful','attitude','bravery','cleanliness','problem_solving','self_care')),
    note        TEXT,
    stars       INTEGER NOT NULL DEFAULT 0,
    day         TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE INDEX moments_day ON moments(day);

CREATE TABLE outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL,
    op          TEXT NOT NULL CHECK (op IN ('create','update','delete')),
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE own_goals (
    key         TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('helpful','attitude','bravery','cleanliness','problem_solving','self_care')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

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
  , kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'video')), seconds REAL, ready INTEGER NOT NULL DEFAULT 1, flyer INTEGER NOT NULL DEFAULT 0);

CREATE TABLE potty_cards (
    id          TEXT PRIMARY KEY,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    finished_at TEXT
  );

CREATE INDEX potty_cards_member ON potty_cards(member_id);

CREATE TABLE potty_kids (
    member_id   TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE "potty_punches" (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES potty_cards(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    step        TEXT NOT NULL CHECK (step IN ('ask','sit','go','wipe','wash')),
    kind        TEXT CHECK (kind IN ('pee','poo','both')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE INDEX potty_punches_card ON potty_punches(card_id);

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

CREATE TABLE recipe_images (
    id          TEXT PRIMARY KEY,
    recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL
  , step INTEGER);

CREATE INDEX recipe_images_recipe ON recipe_images(recipe_id, sort_order);

CREATE TABLE recipes (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    cover_id    TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE reminder_devices (
    device      TEXT NOT NULL,
    list        TEXT NOT NULL,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (device, list)
  );

CREATE TABLE reminder_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list        TEXT NOT NULL,
    title       TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    -- YYYY-MM-DD or an ISO instant, as the phone sent it.
    due         TEXT
  );

CREATE INDEX reminder_items_list ON reminder_items(list);

CREATE TABLE "reminder_outbox" (
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

CREATE TABLE reward_members (
    reward_id   TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (reward_id, member_id)
  );

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
    given_at    TEXT, missed_on TEXT,
    UNIQUE (reward_id, period)
  );

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
  , team_mode TEXT NOT NULL DEFAULT 'pooled' CHECK (team_mode IN ('pooled', 'each')), repeats INTEGER NOT NULL DEFAULT 0, deadline TEXT, missed_at TEXT);

CREATE TABLE sessions (
    -- SHA-256 of the cookie's token, so the database alone can't sign anyone in.
    token_hash  TEXT PRIMARY KEY,
    -- What the device said it is (browser and system), to tell devices apart in Settings.
    label       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , parent_until TEXT);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

CREATE TABLE "task_done" (
    task_id    TEXT NOT NULL REFERENCES "tasks"(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    done_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, member_id, day)
  );

CREATE TABLE "tasks" (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    -- NULL means everyone in the family does it.
    member_id   TEXT REFERENCES members(id) ON DELETE CASCADE,
    days        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , time TEXT CHECK (time IN ('morning', 'evening')), category TEXT NOT NULL DEFAULT 'everyday'
    CHECK (category IN ('non_negotiable', 'chores', 'everyday', 'bonus')), required INTEGER NOT NULL DEFAULT 1, points INTEGER NOT NULL DEFAULT 0, icon TEXT, due_by TEXT);
