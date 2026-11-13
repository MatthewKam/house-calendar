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
	return { ...nullFirst(schema), ...extra };
}

/**
 * Fastify's checker turns a value into the type a rule expects, trying a choice's rules in order: with
 * "a number, or nothing", a null sent became 0 (and an empty text ""). Nothing is tried first, so null
 * stays null.
 */
function nullFirst(schema: unknown): Record<string, unknown> {
	if (Array.isArray(schema)) return schema.map(nullFirst) as unknown as Record<string, unknown>;
	if (!schema || typeof schema !== 'object') return schema as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) out[key] = nullFirst(value);
	if (Array.isArray(out.anyOf)) {
		const isNull = (s: unknown) => (s as { type?: unknown }).type === 'null';
		out.anyOf = [...out.anyOf.filter(isNull), ...out.anyOf.filter((s) => !isNull(s))];
	}
	return out;
}

/** Whether someone's in the family (by member id). */
export const memberExists = (db: DB, id: string) => !!db.prepare('SELECT 1 FROM members WHERE id = ?').get(id);
/** Whether an optional person (none, or someone in the family) is fine. */
export const noneOrMember = (db: DB, id: string | null | undefined) => !id || memberExists(db, id);
/** Whether everyone listed is in the family. */
export const allMembersExist = (db: DB, ids: string[]) => ids.every((id) => memberExists(db, id));
