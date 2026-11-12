import { useAnswerColor, useAuthStatus } from '../../lib/queries';
import type { Member } from '../../lib/types';
import s from './ColorAsked.module.css';

/**
 * A new color asked for someone, waiting for the account holder (server/members.ts): the color now and
 * the one asked for, who asked, and to the holder OK or No; to anyone else, who it's waiting for.
 */
export default function ColorAsked({ member: m }: { member: Member }) {
	const auth = useAuthStatus().data;
	const answer = useAnswerColor();
	if (!m.colorAsked) return null;
	const holder = !auth?.signedIn || auth.holder;
	const who =
		m.colorAsked.by === m.name
			? `${m.name} asked for a new color`
			: `New color for ${m.name}${m.colorAsked.by ? `, from ${m.colorAsked.by}` : ''}`;
	return (
		<div className={s.asked}>
			<span className={s.dots} aria-hidden="true">
				<span className={s.dot} style={{ background: m.color }} />→
				<span className={s.dot} style={{ background: m.colorAsked.color }} />
			</span>
			<span className={s.text}>
				{who}
				{!holder && (
					<span className={s.waiting}>
						Waiting for {auth?.signedIn && auth.holderName ? auth.holderName : 'the account holder'} to OK it
					</span>
				)}
			</span>
			{holder && (
				<span className={s.answer}>
					<button type="button" className={s.ok} onClick={() => answer.mutate({ id: m.id, approve: true })}>
						OK
					</button>
					<button type="button" className={s.no} onClick={() => answer.mutate({ id: m.id, approve: false })}>
						No
					</button>
				</span>
			)}
		</div>
	);
}
