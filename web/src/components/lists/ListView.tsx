import { useState } from 'react';
import {
	useAuthStatus,
	useListActions,
	useLists,
	useLiveLists,
	useMembers,
	useReminders,
	useSetSetting,
	useSettings,
} from '../../lib/queries';
import { timeLabel } from '../../lib/dates';
import { listColor } from '../../lib/lists';
import { useParent } from '../../lib/useParent';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import Sheet from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Field, Fieldset, Input } from '../ui/Field';
import sheet from '../ui/styles/Sheet.module.css';
import ListCard, { type CardList } from './ListCard';
import s from './ListView.module.css';

/** The Lists page: Sprig's own lists, and shared iCloud Reminders lists synced through the phones. */
export default function ListView() {
	// Choosing which lists show needs a parent.
	const { parent } = useParent();
	// Lists hidden from the wall, by name (lowercase, so a renamed capital doesn't bring one back).
	const hidden = (useSettings().data?.hiddenLists as string[] | undefined) ?? [];
	const setSetting = useSetSetting();
	const ownQuery = useLists();
	const lists = [...(ownQuery.data ?? []), ...(useReminders().data?.lists ?? [])];
	const [choosing, setChoosing] = useState(false);
	const [adding, setAdding] = useState(false);
	const isHidden = (title: string) => hidden.includes(title.toLowerCase());
	const toggle = (title: string) => {
		const key = title.toLowerCase();
		setSetting.mutate({
			key: 'hiddenLists',
			value: isHidden(title) ? hidden.filter((h) => h !== key) : [...hidden, key],
		});
	};

	return (
		<section className={s.page} aria-label="Lists">
			<header className={`${s.pageHead} pageHeadGlobal`}>
				<h1 className={s.pageTitle}>Lists</h1>
				<span className={s.spacer} />
				{parent && (
					<Button icon="+" onClick={() => setAdding(true)}>
						New list
					</Button>
				)}
				{lists.length > 0 && parent && (
					<Button
						variant={choosing ? 'primary' : 'secondary'}
						aria-pressed={choosing}
						onClick={() => setChoosing(!choosing)}
					>
						{choosing ? 'Done' : 'Choose lists'}
					</Button>
				)}
			</header>
			{choosing && (
				<div className={s.picker} role="group" aria-label="Lists to show">
					{lists.map((l) => (
						<Chip
							key={l.title}
							icon={isHidden(l.title) ? undefined : '✓'}
							pressed={!isHidden(l.title)}
							onClick={() => toggle(l.title)}
						>
							{l.title}
						</Chip>
					))}
				</div>
			)}
			{/* Couldn't check with the family's phones since: said, so two people shopping don't both buy it. */}
			{ownQuery.data && (ownQuery.fetchStatus === 'paused' || ownQuery.errorUpdatedAt > ownQuery.dataUpdatedAt) && (
				<p className={s.unsynced} role="status">
					📶 Not synced since {timeLabel(new Date(ownQuery.dataUpdatedAt))}: ticks from other phones won’t show until
					the signal’s back.
				</p>
			)}
			{/* Loading: list-shaped blocks, not "no lists yet". A failed refresh keeps what's there (above). */}
			{ownQuery.isError && !ownQuery.data ? (
				<Problem kind="page" message={loadProblem('lists', ownQuery.error)} onRetry={() => void ownQuery.refetch()} />
			) : ownQuery.isPending ? (
				<Loading label="Loading lists" className={s.loading}>
					<Skeleton height="14rem" />
					<Skeleton height="14rem" />
				</Loading>
			) : (
				<Lists hidden={isHidden} onNew={parent ? () => setAdding(true) : undefined} />
			)}
			{adding && <NewListSheet onClose={() => setAdding(false)} />}
		</section>
	);
}

function Lists({ hidden, onNew }: { hidden: (title: string) => boolean; onNew?: () => void }) {
	const reminders = useReminders();
	const own = useLists();
	const members = useMembers().data ?? [];
	const auth = useAuthStatus().data;
	const me = auth?.signedIn ? auth.memberId : null;
	const { shopping } = useListActions();
	// Shopping together from any list here: the lists come live while this page is open. It stays on
	// for two hours (server/lists.ts) or until it's tapped off, so a look at a recipe and back finds it on.
	useLiveLists((own.data ?? []).some((l) => l.shopping.includes(me)));
	// Each list's color and its items' dragged order, kept on the wall by list name.
	const settings = useSettings().data;
	const colors = (settings?.listColors as Record<string, string> | undefined) ?? {};
	const orders = (settings?.listOrder as Record<string, string[]> | undefined) ?? {};
	const setSetting = useSetSetting();
	if (reminders.isPending || own.isPending) return null;
	const all: CardList[] = [
		...(own.data ?? []).map((l) => ({ ...l, source: 'sprig' as const, syncedBy: [] })),
		...(reminders.data?.lists ?? []).map((l) => ({ ...l, id: l.title, source: 'reminders' as const, shopping: [] })),
	];
	if (all.length === 0) {
		return (
			<div className={s.setup}>
				<h2>No lists yet</h2>
				<p>Make one for groceries, to-dos or packing. Anyone can add to it and tick things off.</p>
				{onNew && (
					<Button variant="primary" icon="+" onClick={onNew}>
						New list
					</Button>
				)}
				{reminders.data?.enabled && (
					<p>Your iCloud Reminders lists show up here too, after the Reminders Shortcut runs on an iPhone.</p>
				)}
			</div>
		);
	}
	const shown = all.filter((l) => !hidden(l.title));
	if (shown.length === 0) {
		return (
			<div className={s.setup}>
				<h2>All lists are hidden</h2>
				<p>
					Tap <strong>Choose lists</strong> to pick which ones show here.
				</p>
			</div>
		);
	}
	return (
		<div className={s.board}>
			{shown.map((l) => (
				<ListCard
					key={`${l.source}:${l.id}`}
					list={l}
					members={members}
					me={me}
					onShopping={(on) => shopping.mutate({ id: l.id, on })}
					// Until one is picked, each list gets the next color in turn.
					color={listColor(l.title, all.indexOf(l), colors)}
					onColor={(c) => setSetting.mutate({ key: 'listColors', value: { ...colors, [l.title.toLowerCase()]: c } })}
					order={orders[l.title.toLowerCase()] ?? []}
					onReorder={(order) =>
						setSetting.mutate({ key: 'listOrder', value: { ...orders, [l.title.toLowerCase()]: order } })
					}
				/>
			))}
		</div>
	);
}

/** Starting a new list of Sprig's own. */
function NewListSheet({ onClose }: { onClose: () => void }) {
	const { addList } = useListActions();
	const [title, setTitle] = useState('');
	return (
		<>
			<Sheet
				label="New list"
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					if (title.trim()) addList.mutate(title, { onSuccess: onClose });
				}}
			>
				<h2 className={sheet.heading}>New list</h2>
				<Field label="List name">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Groceries, To do, Packing…"
						maxLength={100}
						autoFocus
					/>
				</Field>
				{addList.isError && <p className={s.error}>{addList.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={!title.trim() || addList.isPending}>
						Make it
					</Button>
				</div>
			</Sheet>
		</>
	);
}

/**
 * Add to a list from anywhere (the phone's +): type it, pick the list, Add. It stays open for the next
 * one, so a few groceries go in one after another.
 */
export function AddToListSheet({
	onClose,
	onNewList,
}: {
	onClose: () => void;
	/** No lists yet: go make one. */ onNewList: () => void;
}) {
	const lists = useLists().data;
	const { add } = useListActions();
	const [title, setTitle] = useState('');
	const [listId, setListId] = useState<string | null>(null);
	const [added, setAdded] = useState<string | null>(null);
	const chosen = lists?.find((l) => l.id === listId) ?? lists?.[0];
	return (
		<>
			<Sheet
				label="Add to a list"
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					if (!chosen || !title.trim()) return;
					add.mutate({ listId: chosen.id, title: title.trim() });
					setAdded(`${title.trim()} → ${chosen.title}`);
					setTitle('');
				}}
			>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>Add to a list</h2>
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
				</header>
				{lists && lists.length === 0 ? (
					<>
						<p className={sheet.body}>No lists yet. Make one on the Lists page first: Groceries, To do, Packing…</p>
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<Button variant="primary" onClick={onNewList}>
								Go to Lists
							</Button>
						</div>
					</>
				) : (
					<>
						<Field label="What to add">
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Milk, call the dentist…"
								maxLength={300}
								autoFocus
							/>
						</Field>
						<Fieldset label="Which list">
							{lists?.map((l) => (
								<Chip key={l.id} pressed={l.id === chosen?.id} onClick={() => setListId(l.id)}>
									{l.title}
								</Chip>
							))}
						</Fieldset>
						{added && <p className={s.added}>✓ {added}</p>}
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<Button onClick={onClose}>Done</Button>
							<Button variant="primary" type="submit" disabled={!title.trim() || !chosen}>
								Add
							</Button>
						</div>
					</>
				)}
			</Sheet>
		</>
	);
}
