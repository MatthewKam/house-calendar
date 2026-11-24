import { useState, type FormEvent } from 'react';
import { useRewardActions } from '../../lib/queries';
import type { Member } from '../../lib/types';
import { PickChip } from '../ui/NameChip';
import sheet from '../ui/styles/Sheet.module.css';
import s from './Rewards.module.css';
import Sheet from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';

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
				<div className={sheet.body}>They go back to {kid.name}'s bucket.</div>
				<div className={s.stager}>
					<IconButton variant="secondary" label="One fewer" icon="−" disabled={n <= 1} onClick={() => setN(n - 1)} />
					<span className={s.staged}>
						{n} of {max} ⭐
					</span>
					<IconButton variant="secondary" label="One more" icon="+" disabled={n >= max} onClick={() => setN(n + 1)} />
				</div>
				{takeBack.isError && <div className={s.problem}>{takeBack.error.message}</div>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={takeBack.isPending}>
						Take back
					</Button>
				</div>
			</Sheet>
		</>
	);
}
