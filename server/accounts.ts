import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

// The accounts database, shared by every household: who people are (signed in with Apple, Google or
// an emailed code), which households they belong to and as what, invites, and signed-in devices.
// Each household's own data (events, tasks, jars, photos) is in its own SQLite file (db.ts).
//
// Roles: a guardian manages the household and can change anything from their own phone; each
// guardian also sets a PIN, which unlocks the wall (or a kid's device) for changes. A kid can sign in
// with their own account, or use a device added with a code (no account needed). The wall is a
// device added with a code, and needs a guardian's PIN to enter.

export type AccountsDB = Database.Database;

const migrations: string[] = [
  `
  CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- One per way of signing in. Users with the same verified email are the same user.
  CREATE TABLE identities (
    provider    TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'email')),
    subject     TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT,
    PRIMARY KEY (provider, subject)
  );
  CREATE INDEX identities_user ON identities(user_id);

  CREATE TABLE households (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    db_file     TEXT NOT NULL,
    photos_dir  TEXT NOT NULL,
    -- The household that was here before accounts: it keeps the .env integrations (iCloud, Reminders).
    legacy      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- A person in a household (members.id in its database) who can sign in: a guardian with an
  -- account, or a kid with an account or with devices added by code (user_id NULL).
  CREATE TABLE memberships (
    id            TEXT PRIMARY KEY,
    household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id     TEXT NOT NULL,
    user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    role          TEXT NOT NULL CHECK (role IN ('guardian', 'kid')),
    -- Guardians: unlocks the wall and kids' devices.
    pin_hash      TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (household_id, member_id)
  );
  CREATE UNIQUE INDEX memberships_user ON memberships(household_id, user_id) WHERE user_id IS NOT NULL;

  -- A one-time code (and link) to join: as a guardian or kid (for a person, existing or new), or as the wall.
  -- With no person, whoever joins picks which person they are (used to claim the household from before accounts).
  CREATE TABLE invites (
    code_hash     TEXT PRIMARY KEY,
    household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('guardian', 'kid', 'wall')),
    member_id     TEXT,
    new_name      TEXT,
    expires_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- A signed-in device. user: someone's account (in household_id, their current household);
  -- device: a kid's device added by code; wall: the family wall (entered once a guardian's PIN is typed).
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
  );

  CREATE TABLE email_codes (
    email       TEXT PRIMARY KEY,
    code_hash   TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    tries       INTEGER NOT NULL DEFAULT 0
  );
  `,
  // Which guardian's PIN unlocked a wall or kid's device, to show who it's open for.
  `
  ALTER TABLE sessions ADD COLUMN parent_by TEXT REFERENCES memberships(id) ON DELETE SET NULL;
  `,
];

export function openAccounts(file: string): AccountsDB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}

/**
 * Households' files are stored relative to the data folder, so the folder can move (to a server, a
 * backup) as a whole. `toStored` makes a path relative when it's inside; `fromStored` resolves it.
 */
export const toStored = (dataDir: string, p: string) => {
  const abs = resolve(dataDir, p);
  return abs.startsWith(resolve(dataDir) + sep) ? relative(dataDir, abs) : abs;
};
export const fromStored = (dataDir: string, p: string) => resolve(dataDir, p);

/** Paths saved before they were relative: made relative now (done on each start; quick when there's nothing to do). */
export function relativizePaths(db: AccountsDB, dataDir: string) {
  const rows = db.prepare('SELECT id, db_file, photos_dir FROM households').all() as { id: string; db_file: string; photos_dir: string }[];
  const update = db.prepare('UPDATE households SET db_file = ?, photos_dir = ? WHERE id = ?');
  for (const r of rows) {
    if (!isAbsolute(r.db_file) && !isAbsolute(r.photos_dir)) continue;
    update.run(toStored(dataDir, r.db_file), toStored(dataDir, r.photos_dir), r.id);
  }
}

export interface HouseholdRow { id: string; name: string; db_file: string; photos_dir: string; legacy: number }
export interface MembershipRow {
  id: string; household_id: string; member_id: string; user_id: string | null; role: 'guardian' | 'kid'; pin_hash: string | null;
}
export interface SessionRow {
  token_hash: string; kind: 'user' | 'device' | 'wall'; user_id: string | null; household_id: string | null;
  membership_id: string | null; label: string; entered: number; parent_until: string | null; parent_by: string | null;
  last_seen: string; created_at: string;
}
export interface InviteRow {
  code_hash: string; household_id: string; kind: 'guardian' | 'kid' | 'wall'; member_id: string | null; new_name: string | null; expires_at: string;
}
