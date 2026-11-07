import { GAMES } from './learn/LearnTab';
import LearnSounds from './LearnSounds';
import { useLearn, useSetLearn } from '../lib/queries';
import type { LearnState, Member } from '../lib/types';
import s from '../styles/MembersPanel.module.css';

/** The word beside Learning in Settings while it's folded: who has it on. */
export function learnNote(kids: LearnState[], members: Member[]) {
  const on = kids.filter((k) => k.enabled).map((k) => members.find((m) => m.id === k.memberId)?.name.split(' ')[0]).filter(Boolean);
  return on.length ? `On for ${on.join(', ')}` : 'Off';
}

/**
 * Learning in kid mode, for each kid: on or off, and each of their games' level. A game moves up by
 * itself after 3 perfect plays in a row; here a grown-up can move it up or down.
 */
export default function LearnSettings({ members, today }: { members: Member[]; today: string }) {
  const kids = useLearn(today).data ?? [];
  const set = useSetLearn(today);
  if (kids.length === 0) return <p className={s.hint}>Add a kid with a birthday first.</p>;
  return (
    <section className={s.bare}>
      <p className={s.hint}>
        Games in kid mode's Learn tab: pictures and sounds, no wrong answers, and no stars. A game moves up a level by
        itself after 3 perfect plays in a row; Math and Pairs after 5 perfect or 20 plays at a level, Maze after 20
        plays.
      </p>
      {kids.map((k) => {
        const kid = members.find((m) => m.id === k.memberId);
        if (!kid) return null;
        return (
          <div key={k.memberId} className={s.learnKid}>
            <label className={s.saverRow}>
              <input type="checkbox" checked={k.enabled} disabled={set.isPending}
                onChange={(e) => set.mutate({ memberId: k.memberId, enabled: e.target.checked })} />
              <b>{kid.name}</b>: Learn in kid mode
            </label>
            {k.enabled && k.games.map(({ game, level, maxLevel }) => (
              <div key={game} className={s.learnGame}>
                <span>{GAMES[game].title}</span>
                <button type="button" className={s.learnStep} aria-label={`${GAMES[game].title}: down a level`}
                  disabled={level <= 1 || set.isPending}
                  onClick={() => set.mutate({ memberId: k.memberId, levels: { [game]: level - 1 } })}>−</button>
                <span className={s.learnLevel}>Level {level} of {maxLevel}</span>
                <button type="button" className={s.learnStep} aria-label={`${GAMES[game].title}: up a level`}
                  disabled={level >= maxLevel || set.isPending}
                  onClick={() => set.mutate({ memberId: k.memberId, levels: { [game]: level + 1 } })}>+</button>
              </div>
            ))}
          </div>
        );
      })}
      {set.isError && <p className={s.error}>{set.error.message}</p>}
      <h3 className={s.soundsHead}>Animal sounds</h3>
      <LearnSounds />
    </section>
  );
}
