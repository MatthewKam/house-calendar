import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('tasks migrations', () => {
  it('keeps existing tasks (once "chores") and their ticks, now recording who did them', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cal-')), 'cal.db');
    // Build a database as it was before "chores for everyone" (migration 6).
    openDb(file, 5).close();
    const old = new Database(file);
    old.exec(`INSERT INTO members (id, name, color) VALUES ('t', 'Riley', '#2fa66a');
      INSERT INTO chores (id, title, member_id, days) VALUES ('c1', 'Make bed', 't', '0123456');
      INSERT INTO chore_done (chore_id, day) VALUES ('c1', '2026-10-05'), ('c1', '2026-10-06');`);
    old.close();

    const migrated = openDb(file);
    expect(migrated.prepare('SELECT id, title, member_id FROM tasks').all()).toEqual([{ id: 'c1', title: 'Make bed', member_id: 't' }]);
    expect(migrated.prepare('SELECT task_id, member_id, day FROM task_done ORDER BY day').all()).toEqual([
      { task_id: 'c1', member_id: 't', day: '2026-10-05' },
      { task_id: 'c1', member_id: 't', day: '2026-10-06' },
    ]);
    // Foreign keys now point at the renamed tables.
    migrated.prepare('DELETE FROM tasks').run();
    expect(migrated.prepare('SELECT COUNT(*) n FROM task_done').get()).toEqual({ n: 0 });
  });
});

describe('several-people migration', () => {
  it('carries over who events were for, including manual and Claude picks', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cal-')), 'cal.db');
    openDb(file, 6).close();
    const old = new Database(file);
    old.exec(`INSERT INTO members (id, name, color) VALUES ('t', 'Riley', '#2fa66a');
      INSERT INTO calendars (id, provider, remote_id, name) VALUES ('ic', 'icloud', 'u', 'Home');
      INSERT INTO events (id, calendar_id, member_id, title, start, end) VALUES ('e1', 'local', 't', 'Swim', '2026-10-06', '2026-10-07');
      INSERT INTO events (id, calendar_id, member_id, title, start, end, series_id) VALUES ('e2', 'ic', NULL, 'Bills', '2026-10-06', '2026-10-07', 's2');
      INSERT INTO event_people (calendar_id, series_id, member_id, source) VALUES ('ic', 's1', 't', 'manual'), ('ic', 's2', NULL, 'ai');`);
    old.close();

    const db = openDb(file);
    expect(db.prepare('SELECT event_id, member_id FROM event_members').all()).toEqual([{ event_id: 'e1', member_id: 't' }]);
    expect(db.prepare('SELECT series_id, member_ids, source FROM event_people ORDER BY series_id').all()).toEqual([
      { series_id: 's1', member_ids: '["t"]', source: 'manual' },
      { series_id: 's2', member_ids: '[]', source: 'ai' },
    ]);
  });
});

describe('rewards migration', () => {
  it('moves a reward from the person to the rewards table, as a monthly reward', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cal-')), 'cal.db');
    openDb(file, 11).close();
    const old = new Database(file);
    old.exec(`INSERT INTO members (id, name, color, reward_title, reward_goal) VALUES ('t', 'Riley', '#2fa66a', 'Lego set', 20),
      ('n', 'Sam', '#2f7de1', NULL, NULL);`);
    old.close();
    const db = openDb(file);
    expect(db.prepare('SELECT member_id, title, goal, mode FROM rewards').all())
      .toEqual([{ member_id: 't', title: 'Lego set', goal: 20, mode: 'monthly' }]);
    expect(db.prepare('PRAGMA table_info(members)').all().map((c: any) => c.name)).not.toContain('reward_title');
  });
});
