import { useState } from 'react';
import { useRecipeActions } from '../../lib/queries';
import type { CookNote, Member, Recipe } from '../../lib/types';
import ConfirmDialog from '../ui/ConfirmDialog';
import s from './Recipes.module.css';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/Field';

/** "Nov 14", or "Nov 14, 2025" from another year. */
function day(at: string) {
	const d = new Date(at);
	const year = d.getFullYear() !== new Date().getFullYear();
	return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
}

/**
 * Notes after cooking ("Used half the sugar, Tayen loved it"), newest first, each with its day and who
 * wrote it. Written when a time is saved after Done cooking, or here; grown-ups change and take them out.
 */
export default function CookNotes({
	recipe: r,
	parent,
	people,
}: {
	recipe: Recipe;
	parent: boolean;
	people: Member[];
}) {
	const { addNote, editNote, removeNote } = useRecipeActions();
	// Writing: a new note (''), or one being changed (its id).
	const [writing, setWriting] = useState<string | null>(null);
	const [text, setText] = useState('');
	const [removing, setRemoving] = useState<CookNote | null>(null);
	if (!r.cookNotes.length && !parent) return null;

	const start = (n: CookNote | null) => {
		setWriting(n?.id ?? '');
		setText(n?.text ?? '');
	};
	const save = () => {
		const t = text.trim();
		if (!t) return;
		if (writing) editNote.mutate({ id: r.id, noteId: writing, text: t });
		else addNote.mutate({ id: r.id, text: t });
		setWriting(null);
	};
	const editor = (
		<form
			className={s.noteEditor}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<TextArea
				className={s.noteBox}
				rows={3}
				maxLength={1000}
				aria-label="Note"
				placeholder="What to remember next time (used half the sugar, kids loved it)"
				value={text}
				autoFocus
				onChange={(e) => setText(e.target.value)}
			/>
			<span className={s.noteButtons}>
				<Button onClick={() => setWriting(null)}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={!text.trim()}>
					Save
				</Button>
			</span>
		</form>
	);

	return (
		<section className={s.part} aria-label="Notes from cooking">
			<div className={s.sectionHead}>
				<h3>Notes from cooking</h3>
				{parent && writing === null && (
					<Button size="sm" onClick={() => start(null)}>
						＋ Add a note
					</Button>
				)}
			</div>
			{writing === '' && editor}
			{r.cookNotes.length === 0 && writing === null && (
				<p className={s.hint}>Nothing yet. After Done cooking, a note for next time can go with the time.</p>
			)}
			<ul className={s.cookNotes}>
				{r.cookNotes.map((n) => {
					const who = people.find((m) => m.id === n.memberId);
					return (
						<li key={n.id} className={s.cookNote}>
							<span className={s.cookNoteWho}>
								{who && <span className={s.ratingDot} style={{ background: who.color }} aria-hidden="true" />}
								{[day(n.writtenAt), who?.name].filter(Boolean).join(' · ')}
							</span>
							{writing === n.id ? (
								editor
							) : (
								<>
									<p className={s.notes}>{n.text}</p>
									{parent && (
										<span className={s.noteButtons}>
											<Button variant="quiet" size="sm" onClick={() => start(n)}>
												Edit
											</Button>
											<Button variant="quiet" size="sm" onClick={() => setRemoving(n)}>
												Delete
											</Button>
										</span>
									)}
								</>
							)}
						</li>
					);
				})}
			</ul>
			{removing && (
				<ConfirmDialog
					title="Delete this note?"
					confirmLabel="Delete"
					onCancel={() => setRemoving(null)}
					onConfirm={() => {
						removeNote.mutate({ id: r.id, noteId: removing.id });
						setRemoving(null);
					}}
				>
					“{removing.text.length > 80 ? `${removing.text.slice(0, 80)}…` : removing.text}”
				</ConfirmDialog>
			)}
		</section>
	);
}
