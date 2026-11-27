// What the server's log says about each request (Fastify's request log), for the hosted front and every
// household's app: the method and the path, nothing that says who or where from. No address (IP) or port, no
// query (stamps, dates), and long secret-looking parts (a Cooking together link's) masked. The privacy page
// promises the logs don't record where people connect from.

interface Req {
	method?: string;
	url?: string;
}

/** A request as it's logged: its method and path. */
export const logRequest = (req: Req) => ({
	method: req.method,
	url: (req.url ?? '').split('?')[0].replace(/[A-Za-z0-9_-]{32,}/g, '…'),
});

/** Fastify's logger options: info and up, requests as logRequest has them; none while testing. */
export const logger = () => process.env.NODE_ENV !== 'test' && { level: 'info', serializers: { req: logRequest } };
