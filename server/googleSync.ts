import type { DB } from './db.ts';
import { GoogleSource, type GoogleOAuth } from './providers/google.ts';
import { calendarConnections, type Connection, type ConnectionOptions } from './connections.ts';

// A household's Google connections: each person's Google account, kept with its refresh token.

export type GoogleConnection = Connection;

export function googleCalendars(db: DB, opts: ConnectionOptions & { oauth: GoogleOAuth; fetchImpl?: typeof fetch }) {
  const conns = calendarConnections(db, 'google', {
    ...opts,
    source: (c) => new GoogleSource(c.key, c.memberId, c.account, c.secret, opts.oauth, opts.fetchImpl),
    revoke: (token) => opts.oauth.revoke(token),
  });
  return {
    ...conns,
    connect: (c: { memberId: string | null; account: string; refreshToken: string }) =>
      conns.connect({ memberId: c.memberId, account: c.account, secret: c.refreshToken }),
  };
}
export type GoogleCalendars = ReturnType<typeof googleCalendars>;
