-- The accounts database (server/accounts.ts), at version 6. Written by server/schema.test.ts; don't edit by hand.

CREATE TABLE email_codes (
    email       TEXT PRIMARY KEY,
    code_hash   TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    tries       INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE households (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    db_file     TEXT NOT NULL,
    photos_dir  TEXT NOT NULL,
    -- The household that was here before accounts: it keeps the .env integrations (iCloud, Reminders).
    legacy      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  , holder_id TEXT REFERENCES memberships(id) ON DELETE SET NULL);

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
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), pin_length INTEGER,
    UNIQUE (household_id, member_id)
  );

CREATE UNIQUE INDEX memberships_user ON memberships(household_id, user_id) WHERE user_id IS NOT NULL;

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

CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
