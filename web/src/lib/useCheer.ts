import { useCallback, useEffect, useRef, useState } from 'react';
import { startOfWeek, fromDayKey } from './dates';
import { useTasks, useTasksDone } from './queries';
import { allTasksDone } from './tasks';
import type { Member } from './types';

/**
 * Whom to cheer: the kids who just ticked the last of every task due today (extras too). Only at the
 * moment it happens, on whichever screen is open, not from opening the page once they're done.
 */
export function useCheer(members: Member[], today: string) {
  const tasks = useTasks();
  const done = useTasksDone(startOfWeek(fromDayKey(today)));
  const [names, setNames] = useState<string[] | null>(null);
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
    if (newly.length) setNames(newly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  return { names, done: useCallback(() => setNames(null), []) };
}
