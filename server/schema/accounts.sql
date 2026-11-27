-- The accounts database (server/accounts.ts), at version 13. Written by server/schema.test.ts; don't edit by hand.

CREATE TABLE child_consent_log (
    household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    action        TEXT NOT NULL CHECK (action IN ('given', 'taken back')),
    email         TEXT,
    at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE consent_codes (
    membership_id TEXT PRIMARY KEY REFERENCES memberships(id) ON DELETE CASCADE,
    code_hash     TEXT NOT NULL,
    sent_at       TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    tries         INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE crash_households (
    fingerprint  TEXT NOT NULL REFERENCES crashes(fingerprint) ON DELETE CASCADE,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    count        INTEGER NOT NULL DEFAULT 1,
    last_at      TEXT NOT NULL,
    PRIMARY KEY (fingerprint, household_id)
  );

CREATE TABLE crashes (
    fingerprint TEXT PRIMARY KEY,
    source      TEXT NOT NULL CHECK (source IN ('app', 'server')),
    message     TEXT NOT NULL,
    stack       TEXT,
    place       TEXT,
    platform    TEXT,
    version     TEXT,
    device      TEXT,
    count       INTEGER NOT NULL DEFAULT 1,
    first_at    TEXT NOT NULL,
    last_at     TEXT NOT NULL
  );

CREATE INDEX crashes_last ON crashes(last_at);

CREATE TABLE email_codes (
    email       TEXT PRIMARY KEY,
    code_hash   TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    tries       INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE gone_backups (
    db_file  TEXT PRIMARY KEY,
    gone_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE households (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    db_file     TEXT NOT NULL,
    photos_dir  TEXT NOT NULL,
    -- The household that was here before accounts: it keeps the .env integrations (iCloud, Reminders).
    legacy      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , holder_id TEXT REFERENCES memberships(id) ON DELETE SET NULL, child_consent_at TEXT, child_consent_email TEXT);

CREATE TABLE identities (
    provider    TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'email')),
    subject     TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT,
    PRIMARY KEY (provider, subject)
  );

CREATE INDEX identities_user ON identities(user_id);

CREATE TABLE invites (
    code_hash     TEXT PRIMARY KEY,
    household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('guardian', 'kid', 'wall')),
    member_id     TEXT,
    new_name      TEXT,
    expires_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE memberships (
    id            TEXT PRIMARY KEY,
    household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id     TEXT NOT NULL,
    user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    role          TEXT NOT NULL CHECK (role IN ('guardian', 'kid')),
    -- Guardians: unlocks the wall and kids' devices.
    pin_hash      TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), pin_length INTEGER, co_holder INTEGER NOT NULL DEFAULT 0,
    UNIQUE (household_id, member_id)
  );

CREATE UNIQUE INDEX memberships_user ON memberships(household_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE passkeys (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key  BLOB NOT NULL,
    counter     INTEGER NOT NULL DEFAULT 0,
    transports  TEXT,
    provider    TEXT,
    device      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_used   TEXT
  );

CREATE INDEX passkeys_user ON passkeys(user_id);

CREATE TABLE pin_resets (
    membership_id TEXT PRIMARY KEY REFERENCES memberships(id) ON DELETE CASCADE,
    code_hash     TEXT NOT NULL,
    sent_at       TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    tries         INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE sessions (
    token_hash    TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('user', 'device', 'wall')),
    user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
    household_id  TEXT REFERENCES households(id) ON DELETE CASCADE,
    membership_id TEXT REFERENCES memberships(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    entered       INTEGER NOT NULL DEFAULT 1,
    -- Unlocked for parent changes with a guardian's PIN, until this instant.
    parent_until  TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , parent_by TEXT REFERENCES memberships(id) ON DELETE SET NULL, wall_mode INTEGER NOT NULL DEFAULT 0);

CREATE TABLE usage_daily (
    day          TEXT NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    metric       TEXT NOT NULL,
    count        INTEGER NOT NULL,
    PRIMARY KEY (day, household_id, metric)
  );

CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , demo_until TEXT);
