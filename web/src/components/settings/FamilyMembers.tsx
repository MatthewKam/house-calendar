import { useState } from 'react';
import { useAuthStatus, useDeleteMember, useSetMemberColor, useUpdateMember } from '../../lib/queries';
import { STAGE_NAMES } from '../../lib/stages';
import type { Member, MemberPatch } from '../../lib/types';
import ColorAsked from '../account/ColorAsked';
import { PencilIcon } from '../ui/icons';
import MemberDialog, { type MemberEdit } from './MemberDialog';
import s from './styles/Settings.module.css';

/**
 * The family (Settings, Family): a card for each person with their color, name, stage and allergies;
 * a tap on one opens MemberDialog to change their name, color, birthday, stage and allergies. People's
 * colors are the household's: the account holder's changes are made, anyone else's asked for
 * (ColorAsked shows one waiting). People join with an invite (Settings, Users), not here.
 */
export default function FamilyMembers({ members }: { members: Member[] }) {
	const auth = useAuthStatus().data;
	const updateMember = useUpdateMember();
	const setColor = useSetMemberColor();
	const removeMember = useDeleteMember();
	// Signed out there's no holder. A grown-up's color is only theirs to change.
	const holder = !auth?.signedIn || auth.holder;
	const canColor = (m: Member) => !auth?.signedIn || !m.guardian || m.id === auth.memberId;
	// Whose editor is open (a member id), or null.
	const [editing, setEditing] = useState<string | null>(null);
	const editingMember = members.find((m) => m.id === editing);

	function save(m: Member, edit: MemberEdit) {
		const name = edit.name.trim();
		const patch: MemberPatch = {};
		if (name && name !== m.name) patch.name = name;
		if ((edit.birthdate || null) !== m.birthdate) patch.birthdate = edit.birthdate || null;
		if (edit.stage !== m.stageChosen) patch.stage = edit.stage;
		if (edit.allergies.join() !== m.allergies.join()) patch.allergies = edit.allergies;
		if (Object.keys(patch).length) updateMember.mutate({ id: m.id, patch });
		if (edit.color !== m.color) setColor.mutate({ id: m.id, color: edit.color, holder });
		setEditing(null);
	}

	return (
		<>
			<p className={s.hint}>
				Tap someone to change their name, color, birthday or allergies. A birthday sets each kid's stage, which decides
				how they earn stars.
				{!holder && auth?.signedIn && ` A new color waits for ${auth.holderName ?? 'the account holder'} to OK it.`}
			</p>

			<ul className={s.list}>
				{members.map((m) => (
					<li key={m.id} className={s.member}>
						<button type="button" className={s.memberCard} onClick={() => setEditing(m.id)}>
							<span className={s.swatch} style={{ background: m.color }} aria-hidden="true" />
							<span className={s.memberName}>
								<PencilIcon />
								{m.name}
							</span>
							{(m.stage || m.allergies.length > 0) && (
								<span className={s.memberTags}>
									{m.stage && <span className={s.stageTag}>{STAGE_NAMES[m.stage]}</span>}
									{m.allergies.length > 0 && <span className={s.allergyTag}>⚠ {m.allergies.join(', ')}</span>}
								</span>
							)}
						</button>
						{m.colorAsked && <ColorAsked member={m} />}
					</li>
				))}
			</ul>

			{editingMember && (
				<MemberDialog
					member={editingMember}
					canColor={canColor(editingMember)}
					onSave={(edit) => save(editingMember, edit)}
					// A child can be removed here, deleting what's kept about them (the privacy page says so). A grown-up
					// who signs in leaves through Settings → Users instead.
					onRemove={
						!editingMember.guardian && !(auth?.signedIn && editingMember.id === auth.memberId)
							? () => {
									removeMember.mutate(editingMember.id);
									setEditing(null);
								}
							: undefined
					}
					onClose={() => setEditing(null)}
				/>
			)}
		</>
	);
}
