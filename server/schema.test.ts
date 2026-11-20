import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from './db.ts';
import { openAccounts } from './accounts.ts';

// The tables as they stand after every migration, written out to server/schema/ so they can be read in
// one place. A migration that changes them fails this test until the files are rewritten:
// `npx vitest run server/schema.test.ts -u`.

/** Every table with its indexes and triggers after it, as SQLite keeps them. */
function schema(db: Database.Database, title: string) {
	const rows = db
		.prepare(
			`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, type = 'table' DESC, name`,
		)
		.all() as { type: string; name: string; sql: string }[];
	const version = db.pragma('user_version', { simple: true });
	return (
		`-- ${title}, at version ${version}. Written by server/schema.test.ts; don't edit by hand.\n\n` +
		rows.map((r) => `${r.sql};`).join('\n\n') +
		'\n'
	);
}

describe('schema', () => {
	it("a household's database", async () => {
		await expect(schema(openDb(':memory:'), "A household's database (server/db.ts)")).toMatchFileSnapshot(
			'./schema/household.sql',
		);
	});

	it('the accounts database', async () => {
		await expect(schema(openAccounts(':memory:'), 'The accounts database (server/accounts.ts)')).toMatchFileSnapshot(
			'./schema/accounts.sql',
		);
	});
});

describe('upgrades', () => {
	it('gives calendars.account to a database that took upgrade 68 before it had it', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sprig-db-'));
		const file = join(dir, 'calendar.db');
		// Version 68 as it first was: sync_refused, no account column.
		const old = openDb(file, 67);
		old.exec('CREATE TABLE sync_refused (source TEXT PRIMARY KEY, since TEXT NOT NULL)');
		old.pragma('user_version = 68');
		old.close();
		const db = openDb(file);
		const cols = (db.prepare("SELECT name FROM pragma_table_info('calendars')").all() as { name: string }[]).map(
			(c) => c.name,
		);
		expect(cols).toContain('account');
		db.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('leaves a new database with the one account column', () => {
		const db = openDb(':memory:');
		const n = db.prepare("SELECT count(*) AS n FROM pragma_table_info('calendars') WHERE name = 'account'").get() as {
			n: number;
		};
		expect(n.n).toBe(1);
	});
});
