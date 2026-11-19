import { useState } from 'react';
import { api } from '../../lib/api';
import Sheet from '../ui/Sheet';
import buttons from '../ui/Buttons.module.css';
import a from './Account.module.css';
import s from './DemoBar.module.css';

/** "in about 5 hours", "within the hour": how long until the demo is deleted. */
function timeLeft(until: string) {
	const hours = Math.floor((Date.parse(until) - Date.now()) / 3_600_000);
	if (hours < 1) return 'within the hour';
	return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * The site's demo (server/hosted/demo.ts): a small note over every screen that this family is made up,
 * opening what the demo is (the PIN, when it goes, what's off) and "Make your own family", which deletes
 * it now and goes back to signing in.
 */
export default function DemoBar({ demo, onEnded }: { demo: { until: string; pin: string }; onEnded: () => void }) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function makeOwn() {
		setBusy(true);
		setError(null);
		try {
			await api.endDemo();
			onEnded();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	}

	return (
		<>
			<button type="button" className={s.bar} onClick={() => setOpen(true)}>
				<span className={buttons.buttonIcon} aria-hidden="true">
					👀
				</span>
				<span className={buttons.buttonText}>You’re in a demo · Make your own family</span>
			</button>
			{open && (
				<Sheet label="You're in a demo" onClose={() => setOpen(false)}>
					<div className={a.column}>
						<h2 className={a.title}>You’re in a demo</h2>
						<p className={a.lead}>
							The Rivera family is made up, just for you. Change anything you like: it’s all deleted{' '}
							{timeLeft(demo.until)}.
						</p>
						<p className={a.hint}>
							The grown-ups’ PIN is <strong>{demo.pin}</strong>, for leaving kid mode or the wall.
						</p>
						<p className={a.hint}>
							Off in the demo: reading flyers and recipes, photos, calendar connections, alerts and invites.
						</p>
						{error && <p className={a.error}>{error}</p>}
						<button type="button" className={a.primary} disabled={busy} onClick={() => void makeOwn()}>
							Make your own family
						</button>
						<button type="button" className={a.link} onClick={() => setOpen(false)}>
							Keep looking
						</button>
					</div>
				</Sheet>
			)}
		</>
	);
}
