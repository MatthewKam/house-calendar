import type { DB } from './db.ts';

// Pieces the routes share: request shapes (JSON schema) and checks against the household's data.

/** A day, YYYY-MM-DD, as a schema pattern. */
export const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
/** A day as a request value. */
export const DAY_VALUE = { type: 'string', pattern: DAY } as const;
/** Whether a string looks like a day (YYYY-MM-DD); it may still not be a real one (Feb 31). */
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
/** A colour, #rrggbb. */
export const COLOR = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } as const;

/** Whether someone's in the family (by member id). */
export const memberExists = (db: DB, id: string) => !!db.prepare('SELECT 1 FROM members WHERE id = ?').get(id);
/** Whether an optional person (none, or someone in the family) is fine. */
export const noneOrMember = (db: DB, id: string | null | undefined) => !id || memberExists(db, id);
/** Whether everyone listed is in the family. */
export const allMembersExist = (db: DB, ids: string[]) => ids.every((id) => memberExists(db, id));
