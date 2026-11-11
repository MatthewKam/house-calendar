import { GAME_NAMES } from '../../../shared/learn.ts';
import { firstName } from '../lib/people';
import LearnSounds from './LearnSounds';
import { useChangeLearnDay, useLearn, useSetLearn } from '../lib/queries';
import type { LearnState, LearnToday, Member } from '../lib/types';
import s from '../styles/MembersPanel.module.css';

/** The word beside Learning in Settings while it's folded: who has it on. */
export function learnNote(kids: LearnState[], members: Member[]) {
  const on = kids.filter((k) => k.enabled).flatMap((k) => members.filter((m) => m.id === k.memberId).map((m) => firstName(m.name)));
  return on.length ? `On for ${on.join(', ')}` : 'Off';
}

/** Time a day to pick from (minutes; null: no time limit). */
const MINUTES = [null, 10, 15, 20, 30, 45, 60];

/** Today, in a line: games played of how many, the time, and why it's resting. */
function todayLine(d: LearnToday) {
  const parts = [`${d.played} of ${d.games} ${d.games === 1 ? 'game' : 'games'} played`];
  if (d.minutes !== null) parts.push(`${Math.floor(d.seconds / 60)} of ${d.minutes} min`);
  const why = { tasks: 'waiting for Daily tasks', locked: 'locked today', games: 'all games played', time: 'time used up' } as const;
  parts.push(d.why ? why[d.why] : d.unlocked ? 'unlocked today' : 'open');
  return parts.join(' · ');
}

/**
 * Learning in kid mode, for each kid: on or off, and each of their games' level. A game moves up by
 * itself after 3 perfect plays in a row (a 2-year-old's is ready instead, and waits here for a grown-up
 * to move it up); here a grown-up can move it up or down.
 */
export default function LearnSettings({ members, today }: { members: Member[]; today: string }) {
  const kids = useLearn(today).data ?? [];
  const set = useSetLearn(today);
  const change = useChangeLearnDay(today);
  if (kids.length === 0) return <p className={s.hint}>Add a kid with a birthday first.</p>;
  return (
    <section className={s.bare}>
      <p className={s.hint}>
        Games in kid mode's Learn tab: pictures and sounds, no wrong answers, and no stars. A game moves up a level by
        itself after 3 perfect plays in a row; Math and Pairs after 5 perfect or 20 plays at a level, Maze after 20
        plays. The 2-year-olds' games don't move up by themselves: after 3 perfect plays, it says they're ready here
        (and your phone gets a heads-up), and you move them up when you think so. When one reaches its top level, it
        says so here and your phone gets a heads-up, so you can ask for more levels.
      </p>
      <p className={s.hint}>
        Each day the games open once a kid's Daily tasks are done (or you unlock them here, or with your PIN on their
        screen), for their games a day, and their time a day if you set one. Whichever runs out first ends the day; a
        game already started always finishes. Chomp! is always free.
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
            {k.enabled && (
              <div className={s.learnDay}>
                <div className={s.learnGame}>
                  <span>Games a day</span>
                  <button type="button" className={s.learnStep} aria-label="One fewer game a day"
                    disabled={k.today.gamesADay <= 1 || set.isPending}
                    onClick={() => set.mutate({ memberId: k.memberId, gamesADay: k.today.gamesADay - 1 })}>−</button>
                  <span className={s.learnLevel}>{k.today.gamesADay}</span>
                  <button type="button" className={s.learnStep} aria-label="One more game a day"
                    disabled={k.today.gamesADay >= 10 || set.isPending}
                    onClick={() => set.mutate({ memberId: k.memberId, gamesADay: k.today.gamesADay + 1 })}>+</button>
                </div>
                <label className={s.learnTime}>
                  Time a day
                  <select value={k.today.minutesADay ?? ''} disabled={set.isPending}
                    onChange={(e) => set.mutate({ memberId: k.memberId, minutesADay: e.target.value ? Number(e.target.value) : null })}>
                    {MINUTES.map((m) => <option key={m ?? 'none'} value={m ?? ''}>{m === null ? 'No limit' : `${m} minutes`}</option>)}
                  </select>
                </label>
                <p className={s.learnToday}>Today: {todayLine(k.today)}</p>
                <div className={s.learnTodayButtons}>
                  {k.today.why === 'tasks' || k.today.why === 'locked' || (k.today.unlocked === false) ? (
                    <button type="button" className={s.learnChip} disabled={change.isPending}
                      onClick={() => change.mutate({ memberId: k.memberId, open: true })}>Unlock today</button>
                  ) : (
                    <button type="button" className={s.learnChip} disabled={change.isPending}
                      onClick={() => change.mutate({ memberId: k.memberId, open: false })}>Lock today</button>
                  )}
                  {k.today.unlocked !== null && (
                    <button type="button" className={s.learnChip} disabled={change.isPending}
                      onClick={() => change.mutate({ memberId: k.memberId, open: null })}>Back to Daily tasks first</button>
                  )}
                  <button type="button" className={s.learnChip} disabled={change.isPending}
                    onClick={() => change.mutate({ memberId: k.memberId, moreGames: true })}>+2 games</button>
                  {k.today.minutes !== null && (
                    <button type="button" className={s.learnChip} disabled={change.isPending}
                      onClick={() => change.mutate({ memberId: k.memberId, moreMinutes: true })}>+15 minutes</button>
                  )}
                </div>
              </div>
            )}
            {k.enabled && k.games.map(({ game, level, maxLevel, ready }) => (
              <div key={game} className={s.learnGame}>
                <span>
                  {GAME_NAMES[game]}
                  {/* At the top: time to ask for more levels. */}
                  {level >= maxLevel && <span className={s.learnTop}>Top level</span>}
                  {/* A little one's, ready for the next level: a grown-up moves it up. */}
                  {ready && (
                    <button type="button" className={s.learnReady} disabled={set.isPending}
                      onClick={() => set.mutate({ memberId: k.memberId, levels: { [game]: level + 1 } })}>
                      Ready for level {level + 1}: move up
                    </button>
                  )}
                </span>
                <button type="button" className={s.learnStep} aria-label={`${GAME_NAMES[game]}: down a level`}
                  disabled={level <= 1 || set.isPending}
                  onClick={() => set.mutate({ memberId: k.memberId, levels: { [game]: level - 1 } })}>−</button>
                <span className={s.learnLevel}>Level {level} of {maxLevel}</span>
                <button type="button" className={s.learnStep} aria-label={`${GAME_NAMES[game]}: up a level`}
                  disabled={level >= maxLevel || set.isPending}
                  onClick={() => set.mutate({ memberId: k.memberId, levels: { [game]: level + 1 } })}>+</button>
              </div>
            ))}
          </div>
        );
      })}
      {set.isError && <p className={s.error}>{set.error.message}</p>}
      {change.isError && <p className={s.error}>{change.error.message}</p>}
      <h3 className={s.soundsHead}>Animal sounds</h3>
      <LearnSounds />
    </section>
  );
}
