import { useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { LearnState, Member, Skill } from "../../lib/types";
import Animals from "./Animals";
import Counting from "./Counting";
import Feelings from "./Feelings";
import Letters from "./Letters";
import Patterns from "./Patterns";
import Story from "./Story";
import type { ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** Each skill's activity, and how it's shown before starting. */
export const ACTIVITIES: Record<Skill, { title: string; picture: string; Play: ComponentType<ActivityProps> }> = {
	animals: { title: "Who says that?", picture: "🐄", Play: Animals },
	story: { title: "A picture story", picture: "📖", Play: Story },
	counting: { title: "Let's count!", picture: "🍎", Play: Counting },
	letters: { title: "Letters", picture: "🔤", Play: Letters },
	feelings: { title: "How does Bear feel?", picture: "🐻", Play: Feelings },
	patterns: { title: "What comes next?", picture: "🔴", Play: Patterns },
};

/**
 * Kid mode's Learn tab: today's activity for this kid. Start it, play it, and see what it earned (a
 * star for the day's first, a new level now and then). Playing again is always fine.
 */
export default function LearnTab({ kid, today, learn }: { kid: Member; today: string; learn: LearnState }) {
	const qc = useQueryClient();
	const [playing, setPlaying] = useState(false);
	const [result, setResult] = useState<{ star: boolean; leveledUp: boolean } | null>(null);
	const { skill, level } = learn.today;
	const activity = ACTIVITIES[skill];
	const done = useMutation({
		mutationFn: ({ rounds, firstTry }: { rounds: number; firstTry: number }) =>
			api.learnDone(kid.id, { today, skill, level, rounds, firstTry }),
		onSuccess: (r) => setResult({ star: r.star, leveledUp: r.leveledUp }),
		// The star goes in the bucket (and the jars see it).
		onSettled: () => qc.invalidateQueries({ queryKey: ["tasksDone"] }),
	});

	if (playing) {
		const { Play } = activity;
		return (
			// A new key each time, so playing again starts fresh.
			<Play key={String(done.submittedAt)} level={level} onDone={(rounds, firstTry) => {
				setPlaying(false);
				done.mutate({ rounds, firstTry });
			}} />
		);
	}
	return (
		<section className={s.start} aria-label="Today's learning">
			<span className={`${s.startPicture} ${result ? s.yes : ""}`} aria-hidden="true">{result ? (result.star ? "⭐" : "🎉") : activity.picture}</span>
			<h2 className={s.startTitle}>
				{result ? (result.star ? "You earned a star!" : "You did it!") : activity.title}
			</h2>
			{result?.leveledUp && <p className={s.note}>New level! It gets a little trickier next time.</p>}
			{done.isError && <p className={s.note}>Couldn't save that: {done.error.message}</p>}
			<button type="button" className={result || learn.doneToday ? s.quiet : s.go} onClick={() => {
				setResult(null);
				setPlaying(true);
			}}>
				{result || learn.doneToday ? "Play again" : "Let's play!"}
			</button>
			{!result && learn.doneToday && <p className={s.note}>{learn.starToday ? "Today's star is earned. ⭐" : "Done for today!"}</p>}
		</section>
	);
}
