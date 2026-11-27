import { describe, expect, it } from 'vitest';
import { logRequest } from './logging.ts';

describe("the server's request log", () => {
	it('keeps the method and path only: no address, no query, no secret-looking parts', () => {
		const logged = logRequest({
			method: 'GET',
			url: `/api/cook/${'1'.repeat(8)}-0000-0000-0000-${'2'.repeat(12)}/${'x'.repeat(32)}/me?stamp=abc`,
		});
		expect(logged).toEqual({ method: 'GET', url: '/api/cook/…/…/me' });
		expect(Object.keys(logRequest({ method: 'POST', url: '/api/events' }))).toEqual(['method', 'url']);
	});
});
