import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';

// Address suggestions while typing an event's address (Google Places Autocomplete). The key stays
// on the server.

export interface Place { text: string; main: string; secondary: string }
/** Suggestions for what's typed so far, nearest `near` first when given. */
export type PlaceSearch = (input: string, session: string, near?: string) => Promise<Place[]>;

/**
 * Google Places API (New): Autocomplete, leaning toward places within ~50 km of home. Home is
 * looked up once (Text Search) for that. Typing and then picking one is billed as a single
 * session. https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 */
export function googlePlaces(apiKey: string, fetchImpl: typeof fetch = fetch): PlaceSearch {
  const homes = new Map<string, { latitude: number; longitude: number } | null>();
  async function post(url: string, fields: string, body: unknown) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fields },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `Google Maps answered ${res.status}`);
    return data;
  }
  async function where(home: string) {
    if (!homes.has(home)) {
      const data = await post('https://places.googleapis.com/v1/places:searchText', 'places.location', { textQuery: home, pageSize: 1 })
        .catch(() => null);
      homes.set(home, (data?.places as { location?: { latitude: number; longitude: number } }[] | undefined)?.[0]?.location ?? null);
    }
    return homes.get(home) ?? null;
  }
  return async (input, session, near) => {
    const center = near ? await where(near) : null;
    const data = (await post('https://places.googleapis.com/v1/places:autocomplete',
      'suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat', {
        input,
        sessionToken: session,
        ...(center && { locationBias: { circle: { center, radius: 50_000 } } }),
      })) as { suggestions?: { placePrediction?: { text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] };
    return (data.suggestions ?? []).flatMap(({ placePrediction: p }) => {
      const text = p?.text?.text;
      if (!text) return [];
      return [{ text, main: p.structuredFormat?.mainText?.text ?? text, secondary: p.structuredFormat?.secondaryText?.text ?? '' }];
    });
  };
}

export function registerPlaces(app: FastifyInstance, db: DB, search: PlaceSearch | undefined) {
  const home = () => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'homeAddress'`).get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as string).trim() : '';
  };
  // Typing the same thing again (backspacing, another event) doesn't cost another request.
  const cache = new Map<string, { at: number; places: Place[] }>();

  app.get<{ Querystring: { q?: string; session?: string } }>('/api/places', async (req, reply) => {
    const q = (req.query.q ?? '').trim().slice(0, 200);
    // No key: no suggestions, and the field works as plain text.
    if (!search || q.length < 3) return [];
    const near = home();
    const key = `${near}\n${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.places;
    try {
      const places = await search(q, (req.query.session ?? '').slice(0, 64) || 'none', near || undefined);
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), places });
      return places;
    } catch (err) {
      req.log.warn({ err }, 'address suggestions failed');
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Address suggestions failed' });
    }
  });
}
