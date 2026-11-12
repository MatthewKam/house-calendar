import { z } from 'zod';
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

/**
 * A shape from shared/ as the JSON schema a route checks requests with. Defaults in the shape are filled
 * in on the request, as Fastify's checker does that. `extra` adds what zod can't say (minProperties).
 */
export function schemaOf(shape: z.ZodType, extra: Record<string, unknown> = {}) {
	const { $schema: _, ...schema } = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
	return { ...schema, ...extra };
}

/** Whether someone's in the family (by member id). */
export const memberExists = (db: DB, id: string) => !!db.prepare('SELECT 1 FROM members WHERE id = ?').get(id);
/** Whether an optional person (none, or someone in the family) is fine. */
export const noneOrMember = (db: DB, id: string | null | undefined) => !id || memberExists(db, id);
/** Whether everyone listed is in the family. */
export const allMembersExist = (db: DB, ids: string[]) => ids.every((id) => memberExists(db, id));
