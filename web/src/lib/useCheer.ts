import { useCallback, useEffect, useRef, useState } from 'react';
import { startOfWeek, fromDayKey } from './dates';
import { useRewardHistory, useTasks, useTasksDone } from './queries';
import { allTasksDone } from './tasks';
import type { Member } from './types';

/** A Hooray: who, and what for. */
export interface Cheer { names: string[]; emoji: string; message: string }

/** "a", "a and b", "a, b and c". */
const listOf = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/**
 * Whom to cheer: the kids who just ticked the last of every task due today (extras too), or whose
 * reward jar just filled. Only at the moment it happens, on whichever screen is open, not from
 * opening the page once they're done.
 */
export function useCheer(members: Member[], today: string) {
  const tasks = useTasks();
  const done = useTasksDone(startOfWeek(fromDayKey(today)));
  const history = useRewardHistory();
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const allDone = members.filter((m) => allTasksDone(tasks.data ?? [], done.data ?? [], m.id, today)).map((m) => m.id);
  const key = `${today}|${allDone.join(',')}`;
  const before = useRef<{ today: string; ids: string[] } | null>(null);
  const loaded = tasks.isSuccess && done.isSuccess && !done.isPlaceholderData;

  useEffect(() => {
    if (!loaded) return;
    const was = before.current;
    before.current = { today, ids: allDone };
    // The first look (or a new day) just notes who's done.
    if (!was || was.today !== today) return;
    const newly = members.filter((m) => allDone.includes(m.id) && !was.ids.includes(m.id)).map((m) => m.name);
    if (newly.length) setCheer({ names: newly, emoji: '🎉', message: "All of today's tasks are done!" });
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
