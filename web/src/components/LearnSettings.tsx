import { useLearn, useSetLearn } from '../lib/queries';
import type { LearnState, Member, Skill } from '../lib/types';
import s from '../styles/MembersPanel.module.css';

const SKILL_NAMES: Record<Skill, string> = {
  animals: 'Animal sounds', story: 'Picture stories', counting: 'Counting', letters: 'Letters', feelings: 'Feelings', patterns: 'Patterns',
};

/** The word beside Learning in Settings while it's folded: who has it on. */
export function learnNote(kids: LearnState[], members: Member[]) {
  const on = kids.filter((k) => k.enabled).map((k) => members.find((m) => m.id === k.memberId)?.name.split(' ')[0]).filter(Boolean);
  return on.length ? `On for ${on.join(', ')}` : 'Off';
}

/**
 * Learning in kid mode, for each kid: on or off, and (from age 3) whether they can level up. With
 * leveling up on, each skill moves up by itself after a few days of getting it right; the levels show
 * here.
 */
export default function LearnSettings({ members, today }: { members: Member[]; today: string }) {
  const kids = useLearn(today).data ?? [];
  const set = useSetLearn(today);
  if (kids.length === 0) return <p className={s.hint}>Add a kid with a birthday first.</p>;
  return (
    <section className={s.bare}>
      <p className={s.hint}>A short activity a day in kid mode's Learn tab: pictures, no wrong answers. Finishing earns a star (from age 4).</p>
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
              <>
                <label className={s.saverRow}>
                  <input type="checkbox" checked={k.levelUp} disabled={!k.canLevelUp || set.isPending}
                    onChange={(e) => set.mutate({ memberId: k.memberId, levelUp: e.target.checked })} />
                  Can level up
                </label>
                <p className={s.hint}>
                  {!k.canLevelUp ? 'Leveling up opens at age 3. Until then, everything stays at level 1.'
                    : k.levelUp ? 'Each skill moves up by itself after 3 days of getting it all right.'
                    : 'Off: everything stays at level 1.'}
                </p>
                {k.levelUp && (
                  <p className={s.hint}>
                    {Object.entries(k.levels).map(([skill, level]) => `${SKILL_NAMES[skill as Skill]}: level ${level}`).join(' · ')}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      {set.isError && <p className={s.error}>{set.error.message}</p>}
    </section>
  );
}
