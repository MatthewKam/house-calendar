import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { schemaOf } from './schemas.ts';

describe('schemaOf', () => {
	it('keeps what was sent for a thing that may be nothing: 0, "", false and null each as they are', async () => {
		const app = Fastify();
		const Shape = z.strictObject({
			n: z.number().max(10).nullable(),
			t: z.string().max(5).nullable(),
			b: z.boolean().nullable(),
			kind: z.enum(['a', 'b']).nullable(),
		});
		app.post('/x', { schema: { body: schemaOf(Shape) } }, async (req) => req.body);
		const send = async (payload: object) => {
			const res = await app.inject({ method: 'POST', url: '/x', payload });
			return { status: res.statusCode, body: res.json() };
		};
		expect((await send({ n: 0, t: '', b: false, kind: 'a' })).body).toEqual({ n: 0, t: '', b: false, kind: 'a' });
		expect((await send({ n: null, t: null, b: null, kind: null })).body).toEqual({
			n: null,
			t: null,
			b: null,
			kind: null,
		});
		// Its limits still hold.
		expect((await send({ n: 11, t: null, b: null, kind: null })).status).toBe(400);
		expect((await send({ n: null, t: null, b: null, kind: 'c' })).status).toBe(400);
	});
});
