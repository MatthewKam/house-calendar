import { useState, type FormEvent } from "react";
import { useRewardActions } from "../../lib/queries";
import type { Member } from "../../lib/types";
import { PickChip } from "../ui/NameChip";
import sheet from "../ui/Sheet.module.css";
import s from "./Rewards.module.css";
import Sheet from "../ui/Sheet";

interface Props {
	jar: { id: string; title: string };
	/** Kids with stars in the jar, and how many each; with more than one, the parent picks whose. */
	kids: { kid: Member; max: number }[];
	onClose: () => void;
}

/** Parents only: takes some of a kid's stars back out of a jar, into their bucket. */
export default function TakeBackDialog({ jar, kids, onClose }: Props) {
	const { takeBack } = useRewardActions();
	const [whose, setWhose] = useState(0);
	const { kid, max } = kids[whose];
	const [n, setN] = useState(1);

	function submit(e: FormEvent) {
		e.preventDefault();
		takeBack.mutate({ id: jar.id, memberId: kid.id, stars: n }, { onSuccess: onClose });
	}

	return (
		<>
			<Sheet label="Take stars back" onClose={onClose} className={sheet.confirm} onSubmit={submit}>
				<h2 className={sheet.heading}>Take stars back from {jar.title}</h2>
				{kids.length > 1 && (
					<div className={s.whose}>
						{kids.map((k, i) => (
							<PickChip
								key={k.kid.id}
								name={k.kid.name}
								color={k.kid.color}
								on={i === whose}
								onClick={() => {
									setWhose(i);
									setN(1);
								}}
							/>
						))}
					</div>
				)}
				<div className={sheet.body}>
					They go back to {kid.name}'s bucket.
				</div>
				<div className={s.stager}>
					<button type="button" className={s.step} disabled={n <= 1} aria-label="One fewer" onClick={() => setN(n - 1)}>
						−
					</button>
					<span className={s.staged}>
						{n} of {max} ⭐
					</span>
					<button type="button" className={s.step} disabled={n >= max} aria-label="One more" onClick={() => setN(n + 1)}>
						+
					</button>
				</div>
				{takeBack.isError && <div className={s.problem}>{takeBack.error.message}</div>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={takeBack.isPending}>
						Take back
					</button>
				</div>
			</Sheet>
		</>
	);
}
