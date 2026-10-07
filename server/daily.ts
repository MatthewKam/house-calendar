import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';

// A dad joke and a quote, for cards on the calendar page. Each comes from a free service with no
// key, once a day; the wall is a family screen, so grim jokes are skipped.

const UA = 'Household wall calendar (family use)';
const DAY = '^\\d{4}-\\d{2}-\\d{2}$';

/** Words that keep a joke off a family wall. */
const GRIM = /\b(kill\w*|dead\w*|death\w*|die|died|dies|dying|fatal\w*|landslide\w*|flood\w*|avalanche\w*|tornado\w*|wreck\w*|drown\w*|accident\w*|collapse\w*|casualt\w*|murder\w*|assassinat\w*|war|wars|wartime|bomb\w*|attack\w*|massacre\w*|shoot\w*|shot|terror\w*|crash\w*|disaster\w*|execut\w*|genocide|invasion|invaded|invade\w*|battle\w*|siege|hostage\w*|riot\w*|coup|suicide|earthquake\w*|hurricane\w*|tsunami\w*|sank|sinking|famine|plague|slave\w*|nazi\w*|holocaust|weapon\w*|nuclear|missile\w*|gun\w*|drunk|beer|sex\w*|drug\w*|prison\w*|jail\w*|arrest\w*|hanged|lynch\w*|burned|fire|fires|explod\w*|explosion\w*|injur\w*|victim\w*|rebel\w*|militar\w*|army|troops|soldier\w*|insurgen\w*|guerrilla\w*|rape\w*|abuse\w*)\b/i;
export const familyFriendly = (text: string) => !GRIM.test(text);

export interface Joke { text: string }
export interface Quote { text: string; author: string }

type Fetch = typeof fetch;

/** A dad joke (icanhazdadjoke.com), trying a few until one suits a family wall. */
export async function fetchJoke(fetchImpl: Fetch): Promise<Joke> {
  for (let i = 0; i < 6; i++) {
    const res = await fetchImpl('https://icanhazdadjoke.com/', { headers: { accept: 'application/json', 'user-agent': UA } });
    if (!res.ok) throw new Error(`icanhazdadjoke answered ${res.status}`);
    const { joke } = (await res.json()) as { joke: string };
    if (joke && familyFriendly(joke)) return { text: joke.trim() };
  }
  throw new Error('No family-friendly joke found');
}

/** ZenQuotes' quote of the day. */
export async function fetchQuote(fetchImpl: Fetch): Promise<Quote> {
  const res = await fetchImpl('https://zenquotes.io/api/today', { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`ZenQuotes answered ${res.status}`);
  const [q] = (await res.json()) as { q: string; a: string }[];
  if (!q?.q) throw new Error('ZenQuotes sent no quote');
  return { text: q.q.trim(), author: q.a?.trim() || 'Unknown' };
}

/** GET /api/daily?day=: today's joke and quote (null for either that couldn't be fetched). */
export function registerDaily(app: FastifyInstance, db: DB, fetchImpl: Fetch = fetch) {
  // A failed fetch isn't retried for a while, so a service being down doesn't slow every page load.
  const failedAt = new Map<string, number>();
  const RETRY_MS = 10 * 60_000;

  async function item<T>(day: string, kind: string, get: () => Promise<T>): Promise<T | null> {
    const row = db.prepare('SELECT data FROM daily_items WHERE day = ? AND kind = ?').get(day, kind) as { data: string } | undefined;
    if (row) return JSON.parse(row.data) as T;
    if (Date.now() - (failedAt.get(`${day}/${kind}`) ?? 0) < RETRY_MS) return null;
    try {
      const value = await get();
      db.prepare('INSERT OR REPLACE INTO daily_items (day, kind, data) VALUES (?, ?, ?)').run(day, kind, JSON.stringify(value));
      // Only the last couple of weeks are kept.
      db.prepare("DELETE FROM daily_items WHERE day < date(?, '-14 days')").run(day);
      return value;
    } catch (err) {
      failedAt.set(`${day}/${kind}`, Date.now());
      app.log.warn({ err }, `daily ${kind} failed`);
      return null;
    }
  }

  app.get<{ Querystring: { day: string } }>('/api/daily', {
    schema: { querystring: { type: 'object', required: ['day'], properties: { day: { type: 'string', pattern: DAY } } } },
  }, async (req) => {
    const { day } = req.query;
    const [joke, quote] = await Promise.all([
      item(day, 'joke', () => fetchJoke(fetchImpl)),
      item(day, 'quote', () => fetchQuote(fetchImpl)),
    ]);
    return { joke, quote };
  });
}
