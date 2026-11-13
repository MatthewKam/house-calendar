import { Component, type ErrorInfo, type ReactNode } from 'react';
import Problem from './Problem';
import s from './Problem.module.css';

/**
 * Keeps a part of the app to itself when it breaks: instead of the whole app going blank, just this part
 * says so ("Something went wrong with the weather") with Try again, and everything else carries on.
 * `what` names the part. `resetKey`: when it changes (another page, another kid), the part tries again
 * by itself. `kind` picks the look (Problem.tsx); 'app' is the last resort around everything, with Reload.
 */
interface Props {
	what: string;
	kind?: 'card' | 'page' | 'kid' | 'app';
	resetKey?: unknown;
	className?: string;
	/** Instead of trying again (a pop-up that broke): e.g. Close, which closes it. */
	retryLabel?: string;
	onRetry?: () => void;
	/** Kid mode as a whole: the grown-ups' way out, since its own Exit is gone with it. */
	onLeave?: () => void;
	children: ReactNode;
}
interface State {
	error: Error | null;
	key: unknown;
}

export default class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null, key: this.props.resetKey };

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { error };
	}

	static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
		return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(`Sprig: ${this.props.what} broke`, error, info.componentStack);
	}

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		const { what, kind = 'card', className, retryLabel, onRetry, onLeave } = this.props;
		if (kind === 'app') {
			return (
				<div className={s.appScreen}>
					<img src="/wordmark.svg" alt="Sprig" className={s.wordmark} />
					<Problem
						kind="page"
						message="Sprig hit a problem. Reloading usually fixes it."
						retryLabel="Reload"
						onRetry={() => location.reload()}
					/>
				</div>
			);
		}
		return (
			<Problem
				kind={kind}
				className={className}
				message={`Something went wrong with ${what}.`}
				retryLabel={retryLabel}
				onLeave={onLeave}
				onRetry={() => {
					onRetry?.();
					this.setState({ error: null });
				}}
			/>
		);
	}
}
