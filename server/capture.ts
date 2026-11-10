import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { isDay } from './schemas.ts';
import { kidIds } from './privacy.ts';
import { atLocal } from './push.ts';

// Quick capture (docs/quick-capture.md): something said ("remind me to call the dentist Friday at
// 10") or a photo of a flyer becomes proposed list items, events and kid tasks. Nothing is saved
// here: the app shows them as cards, a grown-up checks them, and the app adds the ones kept through
// the usual routes. Sent to Claude: the words or photo, today's date, the family's names (and who's
// a kid) and the list names; nothing from the calendar. A flyer's photo is kept by the app, with the
// events read from it (photos.ts), not here.

/** What Claude found, before names and times are checked. */
const Found = z.object({
  items: z.array(z.object({
    kind: z.enum(['item', 'event', 'task']),
    title: z.string(),
    /** item: which list (an existing one, or a new name). */
    list: z.string().nullable(),
    /** YYYY-MM-DD: when it's due (item), on (event), or to do (task). */
    date: z.string().nullable(),
    /** HH:MM, 24-hour, local. */
    time: z.string().nullable(),
    /** event: when it ends, if said. */
    endDate: z.string().nullable(),
    endTime: z.string().nullable(),
    /** Family members' names it's for. */
    people: z.array(z.string()),
    location: z.string().nullable(),
    /** event: other details worth keeping, from a flyer or what was said. */
    notes: z.string().nullable(),
  })),
});
export type Found = z.infer<typeof Found>['items'];

export interface CaptureContext {
  /** Local day and time, and the time zone. */
  today: string;
  now: string;
  timeZone: string;
  /** Who is talking, when known. */
  speaker: string | null;
  family: { name: string; kid: boolean }[];
  lists: string[];
}
export type CaptureInput = { text: string } | { image: { mediaType: string; data: string } };
/** Reads words or a photo into what it asks for (Claude; replaced in tests). */
export type Understand = (input: CaptureInput, ctx: CaptureContext) => Promise<Found>;

/** A card the app shows: what to add, with names already matched to people. */
export type Proposal =
  | { kind: 'item'; title: string; list: string; due: string | null; memberId: string | null }
  | { kind: 'event'; title: string; allDay: boolean; start: string; end: string; memberIds: string[]; location: string | null; notes: string | null }
  | { kind: 'task'; title: string; memberId: string; day: string };

const SYSTEM = `You help a busy family add things to their family app from something a parent said, or a photo of
a flyer, invitation, school notice or appointment card. Turn it into a list of things to add:
- "item": something to remember or buy, on one of their lists. A reminder is an item with a date (and a time if
  one is said). Put shopping on the list it names, or the closest existing list ("Groceries" for food); put
  reminders and to-dos on "To do" unless another list is named. A new list name is fine when they ask for one.
- "event": something happening at a time: an appointment, practice, party, school day off. From a flyer, one
  event per date (a flyer with three dates gives three events). No time said: an all-day event.
- "task": something a kid should do on a day ("make sure Sam returns his library book by the 14th" gives a task
  for Sam that day, and also an item reminding the parent). Only for the kids in the family.
Dates are YYYY-MM-DD and times HH:MM (24-hour), in the family's own time; work out "Friday", "tomorrow" and "the
14th" from today's date (the next one coming). "Me" and "I" are the speaker. people: names of family members it's
for, as given; leave it empty when it's for everyone or no one in particular. Keep titles short, the way a person
would write them, without the date or names already in other fields. notes (events only): the other details worth
keeping, as short lines: what to bring or wear, cost, how to RSVP and by when, a contact, a website; null when
there are none. Leave out anything that isn't something to
add; an empty list is fine.`;

/** Claude: reads the words or the photo. Sent to the Anthropic API. */
export function claudeUnderstand(client = new Anthropic()): Understand {
  return async (input, ctx) => {
    const context = JSON.stringify(ctx);
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: betaZodOutputFormat(Found) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: 'text' in input
          ? `${context}\n\nThey said: ${JSON.stringify(input.text)}`
          : [
            { type: 'image', source: { type: 'base64', media_type: input.image.mediaType as 'image/jpeg', data: input.image.data } },
            { type: 'text', text: `${context}\n\nThis is a photo they took. Find what to add from it.` },
          ],
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error("Sprig couldn't read that");
    if (!response.parsed_output) throw new Error(`Nothing came back (stop reason: ${response.stop_reason})`);
    return response.parsed_output.items;
  };
}

const TIME = /^(\d{1,2}):(\d{2})$/;
const realDay = (d: string | null): d is string => !!d && isDay(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** `day` at `time` (HH:MM) in `tz`, as an instant; null when the time isn't one. */
function instant(day: string, time: string | null, tz: string) {
  const m = time && TIME.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return new Date(atLocal(day, Number(m[1]), tz, Number(m[2]))).toISOString();
}

/** Checks what Claude found: names to people, local times to instants; anything that doesn't make sense goes. */
function toProposals(found: Found, members: { id: string; name: string; kid: boolean }[], tz: string, lists: string[]): Proposal[] {
  const lower = (s: string) => s.trim().toLowerCase();
  const person = (name: string) => members.find((m) => lower(m.name) === lower(name))
    ?? members.find((m) => lower(m.name).split(/\s+/)[0] === lower(name).split(/\s+/)[0]);
  const listName = (name: string | null) => {
    const wanted = (name ?? '').trim() || 'To do';
    return lists.find((l) => lower(l) === lower(wanted)) ?? wanted.slice(0, 100);
  };
  const out: Proposal[] = [];
  for (const f of found) {
    const title = f.title.trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!title) continue;
    const people = [...new Set(f.people.map(person).filter((m) => !!m))];
    const notes = f.notes?.trim().slice(0, 4000) || null;
    if (f.kind === 'item') {
      const due = realDay(f.date) ? instant(f.date, f.time, tz) ?? f.date : null;
      out.push({ kind: 'item', title, list: listName(f.list), due, memberId: people[0]?.id ?? null });
    } else if (f.kind === 'event') {
      if (!realDay(f.date)) continue;
      const start = instant(f.date, f.time, tz);
      const endDay = realDay(f.endDate) && f.endDate >= f.date ? f.endDate : f.date;
      if (start) {
        const end = instant(endDay, f.endTime, tz);
        out.push({ kind: 'event', title, allDay: false, start, end: end && end > start ? end : new Date(Date.parse(start) + 3_600_000).toISOString(),
          memberIds: people.map((m) => m.id), location: f.location?.trim() || null, notes });
      } else {
        out.push({ kind: 'event', title, allDay: true, start: f.date, end: nextDay(endDay), memberIds: people.map((m) => m.id),
          location: f.location?.trim() || null, notes });
      }
    } else {
      const kid = people.find((m) => m.kid);
      if (!kid || !realDay(f.date)) continue;
      out.push({ kind: 'task', title, memberId: kid.id, day: f.date });
    }
  }
  return out;
}

/** `now` in time zone `tz`: its day (YYYY-MM-DD) and time (HH:MM). */
function localNow(now: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, now: `${p.weekday} ${p.hour}:${p.minute}` };
}

const realZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function registerCapture(app: FastifyInstance, db: DB, understand?: Understand) {
  app.get('/api/capture', async () => ({ on: !!understand }));

  // A grown-up's (auth.ts). A photo comes as base64, shrunk on the phone first.
  app.post<{ Body: { text?: string; image?: { mediaType: string; data: string }; timeZone: string } }>('/api/capture', {
    bodyLimit: 8 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['timeZone'], additionalProperties: false, properties: {
      text: { type: 'string', minLength: 1, maxLength: 2000 },
      image: { type: 'object', required: ['mediaType', 'data'], additionalProperties: false, properties: {
        mediaType: { enum: ['image/jpeg', 'image/png', 'image/webp'] }, data: { type: 'string', maxLength: 8_000_000 } } },
      timeZone: { type: 'string', maxLength: 64 },
    } } },
  }, async (req, reply) => {
    if (!understand) return reply.code(503).send({ error: 'Saying and snapping need ANTHROPIC_API_KEY in .env' });
    const { text, image, timeZone } = req.body;
    if (!text?.trim() && !image) return reply.code(400).send({ error: 'Say something or take a photo' });
    if (!realZone(timeZone)) return reply.code(400).send({ error: 'Unknown time zone' });
    const kids = kidIds(db);
    const members = (db.prepare('SELECT id, name FROM members ORDER BY sort_order, created_at').all() as { id: string; name: string }[])
      .map((m) => ({ ...m, kid: kids.has(m.id) }));
    const lists = (db.prepare('SELECT title FROM lists ORDER BY created_at').all() as { title: string }[]).map((l) => l.title);
    const viewer = req.raw.viewer;
    const speaker = members.find((m) => m.id === viewer?.memberId)?.name ?? null;
    let found: Found;
    try {
      found = await understand(text?.trim() ? { text: text.trim() } : { image: image! },
        { ...localNow(new Date(), timeZone), timeZone, speaker, family: members.map((m) => ({ name: m.name, kid: m.kid })), lists });
    } catch (err) {
      req.log.warn({ err }, 'Capture failed');
      // A key that's wrong or revoked won't come right by trying again.
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return reply.code(502).send({ error: "Sprig's Claude key isn't working. Check ANTHROPIC_API_KEY on the server." });
      }
      return reply.code(502).send({ error: "Sprig couldn't work that out just now. Try again in a moment." });
    }
    return { proposals: toProposals(found, members, timeZone, lists) };
  });
}
