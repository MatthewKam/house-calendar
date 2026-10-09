import { useCallback, useEffect, useRef, useState } from 'react';
import { startOfWeek, fromDayKey } from './dates';
import { useRewardHistory, useTasks, useTasksDone } from './queries';
import { requiredDone } from './tasks';
import type { Member } from './types';

/** A Hooray: who, and what for. */
export interface Cheer { names: string[]; emoji: string; message: string }

/** "a", "a and b", "a, b and c". */
const listOf = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/**
 * Who's been cheered for finishing today, on this device (kept through a refresh), and when each
 * last was. Unticking takes a Hooray back (it may have been an accident), so finishing again cheers
 * again, but not within a couple of minutes of the last one (no ticking and unticking for more).
 */
const CHEERED = 'household:cheered';
const AGAIN_MS = 2 * 60_000;
interface Cheered { day: string; ids: string[]; at: Record<string, number> }
function cheered(today: string): Cheered {
  try {
    const saved = JSON.parse(localStorage.getItem(CHEERED) ?? 'null') as Cheered | null;
    if (saved?.day === today) return { day: today, ids: saved.ids ?? [], at: saved.at ?? {} };
  } catch {
    // Unreadable: start over.
  }
  return { day: today, ids: [], at: {} };
}
function save(c: Cheered) {
  try {
    localStorage.setItem(CHEERED, JSON.stringify(c));
  } catch {
    // Private browsing or storage blocked: it just isn't remembered.
  }
}

/**
 * Whom to cheer: the kids who just ticked the last of today's required tasks (extras don't count), or whose
 * reward jar just filled. Only at the moment it happens, on whichever screen is open, not from
 * opening the page once they're done.
 */
export function useCheer(members: Member[], today: string) {
  const tasks = useTasks();
  const done = useTasksDone(startOfWeek(fromDayKey(today)));
  const history = useRewardHistory();
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const allDone = members.filter((m) => requiredDone(tasks.data ?? [], done.data ?? [], m.id, today)).map((m) => m.id);
  const key = `${today}|${allDone.join(',')}`;
  const before = useRef<{ today: string; ids: string[] } | null>(null);
  // The family too: with no one loaded yet, the first look would see no one done, and everyone who
  // already was would then cheer as if they'd just finished.
  const loaded = tasks.isSuccess && done.isSuccess && !done.isPlaceholderData && members.length > 0;

  useEffect(() => {
    if (!loaded) return;
    const was = before.current;
    before.current = { today, ids: allDone };
    // The first look (or a new day) just notes who's done.
    if (!was || was.today !== today) return;
    const c = cheered(today);
    // Unticked since: the Hooray is taken back (it may have been ticked by accident).
    c.ids = c.ids.filter((id) => allDone.includes(id));
    // Just finished, not cheered (or taken back, and not in the last couple of minutes).
    const now = Date.now();
    const newly = members.filter((m) => allDone.includes(m.id) && !was.ids.includes(m.id) && !c.ids.includes(m.id)
      && now - (c.at[m.id] ?? 0) > AGAIN_MS);
    for (const m of newly) {
      c.ids.push(m.id);
      c.at[m.id] = now;
    }
    save(c);
    if (newly.length) setCheer({ names: newly.map((m) => m.name), emoji: '🎉', message: "All of today's tasks are done!" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  // Jars: every win seen so far. A new one waiting to be redeemed just filled (a redeem that's
  // undone isn't new, so it doesn't cheer again).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!history.data) return;
    const was = seen.current;
    seen.current = new Set(history.data.map((w) => w.id));
    if (!was) return;
    const filled = history.data.filter((w) => !w.givenAt && !w.missedOn && !was.has(w.id));
    if (!filled.length) return;
    const ids = new Set(filled.flatMap((w) => w.memberIds));
    setCheer({
      names: members.filter((m) => ids.has(m.id)).map((m) => m.name),
      emoji: '🎁',
      message: `${listOf(filled.map((w) => w.title))} ${filled.length === 1 ? 'is' : 'are'} earned!`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data]);

  return { cheer, done: useCallback(() => setCheer(null), []) };
}
