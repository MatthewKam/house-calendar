import type { FastifyInstance } from 'fastify';
import type { CrashLog } from '../crashes.ts';
import { windowLimit, type Sessions } from './session.ts';

// The app reporting a crash (web/src/lib/crashes.ts): POST /api/crash. Open without signing in (a crash on the
// sign-in screen counts too); when signed in, the report notes the household and the kind of device. A few
// a minute per device, and a few hundred a minute in all, so a broken page can't flood it.

const text = (max: number) => ({ type: 'string', maxLength: max });

export function crashRoutes(app: FastifyInstance, x: Sessions, crashes: CrashLog) {
	const perDevice = windowLimit(10, 60_000);
	const all = windowLimit(300, 60_000);

	app.post<{ Body: { message: string; stack?: string; place?: string; platform?: string; version?: string } }>(
		'/api/crash',
		{
			bodyLimit: 32_768,
			schema: {
				body: {
					type: 'object',
					required: ['message'],
					properties: {
						message: text(2000),
						stack: text(16_000),
						place: text(200),
						platform: text(20),
						version: text(40),
					},
				},
			},
		},
		async (req, reply) => {
			const s = x.sessionOf(req);
			if (!all.take('all') || !perDevice.take(s?.token_hash ?? 'signed out')) return reply.code(204).send();
			crashes.record({
				source: 'app',
				...req.body,
				device: s?.kind,
				householdId: s?.household_id,
			});
			return reply.code(204).send();
		},
	);
}
