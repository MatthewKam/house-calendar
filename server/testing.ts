import { openDb } from './db.ts';
import { buildApp } from './app.ts';

// For tests: a household with its people, the app over it, and a short way to call it.

export interface TestPerson {
  id: string;
  name: string;
  color?: string;
  /** YYYY-MM-DD; a kid's stage comes from it. */
  birthdate?: string | null;
}

/** The first of January this many years ago: the birthdate of a kid that age. */
export const bornYearsAgo = (years: number, today = new Date()) => `${today.getFullYear() - years}-01-01`;

/**
 * A fresh household (in memory) with these people in this order, and the app over it with `opts`.
 * call(method, url, payload) answers with the status and the parsed body.
 */
export function household(people: TestPerson[] = [], opts: Parameters<typeof buildApp>[1] = {}) {
  const db = openDb(':memory:');
  const add = db.prepare('INSERT INTO members (id, name, color, birthdate, sort_order) VALUES (?, ?, ?, ?, ?)');
  people.forEach((p, i) => add.run(p.id, p.name, p.color ?? '#000000', p.birthdate ?? null, i));
  const app = buildApp(db, opts);
  const call = async (method: string, url: string, payload?: object) => {
    const res = await app.inject({ method: method as 'GET', url, payload });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return { db, app, call };
}
