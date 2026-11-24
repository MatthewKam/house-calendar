import { useEffect, useState, type FormEvent } from 'react';
import { api, type AuthStatus, type JoinPreview } from '../../lib/api';
import { clearJoin, pendingJoin } from '../../lib/joinCode';
import s from './styles/Account.module.css';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Input } from '../ui/Field';

const KIND = { guardian: 'as a guardian', kid: 'as a kid', wall: 'as the family wall' };

/**
 * Joins a household with an invite code: shows what it's for first ("Join The Kims as Sam"), and,
 * for a code that names no one, asks who you are. `signedIn`: whether this device has an account;
 * guardian codes need one.
 */
export default function JoinForm({ signedIn, onJoined }: { signedIn: boolean; onJoined: (s: AuthStatus) => void }) {
	const [code, setCode] = useState(pendingJoin() ?? '');
	const [preview, setPreview] = useState<JoinPreview | null>(null);
	const [pick, setPick] = useState<string | 'new' | null>(null);
	const [name, setName] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const ready = code.replace(/[^a-z0-9]/gi, '').length === 8;

	// Look the code up as soon as it's complete.
	useEffect(() => {
		setPreview(null);
		setError(null);
		if (!ready) return;
		let live = true;
		api.previewJoin(code).then(
			(p) => live && setPreview(p),
			(e: Error) => live && setError(e.message),
		);
		return () => {
			live = false;
		};
	}, [code, ready]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!preview) return;
		setBusy(true);
		setError(null);
		try {
			const choose = preview.choose ? (pick === 'new' ? { name: name.trim() } : pick ? { memberId: pick } : {}) : {};
			const status = await api.join({ code, ...choose });
			clearJoin();
			onJoined(status);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	const needsAccount = preview?.kind === 'guardian' && !signedIn;
	const picked = !preview?.choose || (pick === 'new' ? !!name.trim() : !!pick);

	return (
		<form className={s.card} onSubmit={submit}>
			<h2>Join with a code</h2>
			<Input
				className={s.code}
				value={code}
				onChange={(e) => setCode(e.target.value)}
				placeholder="ABCD-EFGH"
				aria-label="Invite code"
				autoCapitalize="characters"
				autoComplete="off"
				spellCheck={false}
				maxLength={12}
			/>
			{preview && (
				<p className={s.hint}>
					<strong>{preview.household}</strong> {KIND[preview.kind]}
					{preview.for ? `: ${preview.for}` : ''}
				</p>
			)}
			{preview?.choose && !needsAccount && (
				<>
					<p className={s.hint}>Which one is you?</p>
					<div className={s.choices}>
						{preview.choose.map((m) => (
							<Chip
								key={m.id}

								pressed={pick === m.id}
								onClick={() => setPick(m.id)}
							>
								{m.name}
							</Chip>
						))}
						<Chip pressed={pick === 'new'} onClick={() => setPick('new')}>
							Someone new
						</Chip>
					</div>
					{pick === 'new' && (
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							aria-label="Your name"
							maxLength={40}
						/>
					)}
				</>
			)}
			{needsAccount && <p className={s.hint}>Guardians sign in first (above); the code will still be here.</p>}
			{preview?.kind === 'kid' && signedIn && (
				<p className={s.hint}>
					This code is for a kid: your account joins as one. A grown-up asks for a guardian code instead.
				</p>
			)}
			{error && <p className={s.error}>{error}</p>}
			{!needsAccount && (
				<Button variant="primary" size="lg" block type="submit" disabled={!preview || !picked || busy}>
					{preview ? `Join ${preview.household}` : 'Join'}
				</Button>
			)}
		</form>
	);
}
