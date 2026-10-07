import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { DB } from './db.ts';

// Who each synced event is for: any number of family members, or nobody in particular ("Everyone").
// Assignments are per series, so one choice covers every repeat.
// Order: a manual pick, then the person the calendar is linked to, then Claude's pick from the title.

/** Titles per request; keeps each response small and a failure cheap to retry. */
const BATCH = 150;
/** Bump when the instructions change in a way that should redo Claude's earlier picks. */
const RULES = 2;

export interface Member { id: string; name: string }
export interface Pending { calendarId: string; seriesId: string; title: string; calendar: string }
/** Classifier: for each pending series (same order), the member ids it's for; [] for everyone. */
export type Classify = (members: Member[], items: Pending[]) => Promise<string[][]>;

/** Identifies what a pick was made from: the family list and the rules. Any change means ask again. */
const basisOf = (members: Member[]) =>
  JSON.stringify([RULES, ...members.map((m) => [m.id, m.name]).sort()]);

const members = (db: DB) => db.prepare('SELECT id, name FROM members ORDER BY sort_order, created_at').all() as Member[];

/** Recomputes who synced events are for, for one calendar or (no id) all of them. */
export function applyPeople(db: DB, calendarId: string | null = null) {
  const scope = { cal: calendarId };
  db.prepare(`DELETE FROM event_members WHERE event_id IN
    (SELECT id FROM events WHERE calendar_id != 'local' AND (@cal IS NULL OR calendar_id = @cal))`).run(scope);
  db.prepare(`
    INSERT OR IGNORE INTO event_members (event_id, member_id)
    SELECT e.id, j.value
    FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    LEFT JOIN event_people p ON p.calendar_id = e.calendar_id AND p.series_id = e.series_id
    JOIN json_each(CASE
      WHEN p.source = 'manual' THEN p.member_ids
      WHEN c.member_id IS NOT NULL THEN json_array(c.member_id)
      ELSE COALESCE(p.member_ids, '[]')
    END) j
    WHERE e.calendar_id != 'local' AND (@cal IS NULL OR e.calendar_id = @cal)
      AND j.value IN (SELECT id FROM members)`).run(scope);
}

/** Someone picked people (none = everyone) for a synced event; applies to the whole series. */
export function assignManually(db: DB, eventId: string, memberIds: string[]) {
  const ev = db.prepare('SELECT calendar_id, series_id FROM events WHERE id = ?').get(eventId) as
    { calendar_id: string; series_id: string | null } | undefined;
  const seriesId = ev?.series_id;
  if (!ev || !seriesId) return false;
  db.transaction(() => {
    db.prepare(`INSERT INTO event_people (calendar_id, series_id, member_ids, source, basis) VALUES (?, ?, ?, 'manual', NULL)
                ON CONFLICT (calendar_id, series_id) DO UPDATE SET member_ids = excluded.member_ids, source = 'manual', basis = NULL`)
      .run(ev.calendar_id, seriesId, JSON.stringify([...new Set(memberIds)]));
    applyPeople(db, ev.calendar_id);
  })();
  return true;
}

/**
 * Before a member is removed: take them out of stored picks. A manual pick left with nobody is
 * dropped, so the series falls back to the calendar link or Claude rather than "Everyone".
 */
export function forgetMember(db: DB, memberId: string) {
  const rows = db.prepare(`SELECT calendar_id, series_id, member_ids, source FROM event_people
    WHERE EXISTS (SELECT 1 FROM json_each(member_ids) WHERE value = ?)`).all(memberId) as
    { calendar_id: string; series_id: string; member_ids: string; source: string }[];
  const update = db.prepare('UPDATE event_people SET member_ids = ? WHERE calendar_id = ? AND series_id = ?');
  const drop = db.prepare('DELETE FROM event_people WHERE calendar_id = ? AND series_id = ?');
  for (const r of rows) {
    const rest = (JSON.parse(r.member_ids) as string[]).filter((id) => id !== memberId);
    if (rest.length === 0 && r.source === 'manual') drop.run(r.calendar_id, r.series_id);
    else update.run(JSON.stringify(rest), r.calendar_id, r.series_id);
  }
}

/** Series with no manual pick and no AI pick for the current family list, in visible calendars not linked to a person. */
export function pendingSeries(db: DB): Pending[] {
  return db.prepare(`
    SELECT e.calendar_id AS calendarId, e.series_id AS seriesId, MIN(e.title) AS title, c.name AS calendar
    FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    LEFT JOIN event_people p ON p.calendar_id = e.calendar_id AND p.series_id = e.series_id
    WHERE e.series_id IS NOT NULL AND c.member_id IS NULL AND c.hidden = 0
      AND (p.series_id IS NULL OR (p.source = 'ai' AND p.basis IS NOT ?))
    GROUP BY e.calendar_id, e.series_id
    ORDER BY e.calendar_id, e.series_id`).all(basisOf(members(db))) as Pending[];
}

/** Asks the classifier about every pending series and stores the answers. Returns how many it assigned to someone. */
export async function assignPending(db: DB, classify: Classify): Promise<number> {
  const family = members(db);
  if (family.length === 0) return 0;
  const basis = basisOf(family);
  const valid = new Set(family.map((m) => m.id));
  const pending = pendingSeries(db);
  const store = db.prepare(`INSERT INTO event_people (calendar_id, series_id, member_ids, source, basis) VALUES (?, ?, ?, 'ai', ?)
    ON CONFLICT (calendar_id, series_id) DO UPDATE SET member_ids = excluded.member_ids, basis = excluded.basis
    WHERE event_people.source = 'ai'`);

  let assigned = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const picks = await classify(family, batch);
    db.transaction(() => {
      batch.forEach((item, j) => {
        const ids = [...new Set((picks[j] ?? []).filter((id) => valid.has(id)))];
        store.run(item.calendarId, item.seriesId, JSON.stringify(ids), basis);
        if (ids.length) assigned++;
      });
      applyPeople(db);
    })();
  }
  return assigned;
}

const Picks = z.object({
  assignments: z.array(z.object({
    index: z.number().int(),
    people: z.array(z.string()),
  })),
});

const SYSTEM = `You sort a family's calendar events by who each one is for.
You get the family members and a numbered list of event titles, each with the name of the calendar it came from.
For each event, list the ids of the family members it is for: one person, or several when the title names several
("Riley & Sam swim" is for both). Give an empty list when it is for the whole family, for nobody in particular
(bills, holidays, other people's birthdays), or when the title doesn't make it clear.
Names in titles are the strongest signal ("Sam - swim class" is Sam's). Possessives count ("Riley's swim school").
Only family members count: in "Play date with Noah & Riley", Noah isn't family, so it's Riley's.
Don't guess from the activity alone. Answer for every index.`;

/** Claude-backed classifier. Event titles and family names are sent to the Anthropic API. */
export function claudeClassifier(client = new Anthropic()): Classify {
  return async (family, items) => {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Low effort is plenty for matching names in short titles.
      output_config: { effort: 'low', format: betaZodOutputFormat(Picks) },
      // If a title trips a safety classifier, let the API retry on a suitable model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          family: family.map((m) => ({ id: m.id, name: m.name })),
          events: items.map((it, index) => ({ index, title: it.title, calendar: it.calendar })),
        }),
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to sort these events');
    if (!response.parsed_output) throw new Error(`Claude returned no assignments (stop reason: ${response.stop_reason})`);
    const picks: string[][] = items.map(() => []);
    for (const a of response.parsed_output.assignments) {
      if (a.index >= 0 && a.index < picks.length) picks[a.index] = a.people;
    }
    return picks;
  };
}
