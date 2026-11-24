import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './styles/Button.module.css';

// Sprig's buttons: one look per job, the same everywhere. A sheet's Save is `primary`, its Cancel
// `secondary`; Delete in a confirm is `destructive`, a quieter red word is `danger`; Undo, Clear and
// "Use a different email" are `link`; a quieter grey one beside another button (Cancel in a row, Undo,
// Take back) is `quiet`. Kid mode's buttons are `size="lg"`.

type Variant = 'primary' | 'secondary' | 'destructive' | 'danger' | 'link' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	/** What it does, by look: primary (the one main action), secondary, destructive (filled red), danger (red words), link, quiet (grey words). */
	variant?: Variant;
	/** How big a thing to press: sm in dense rows, md everywhere else, lg for a page's main action and kids. */
	size?: Size;
	/** A picture before the words (an emoji or an icon from icons.tsx). */
	icon?: ReactNode;
	/** As wide as where it sits. */
	block?: boolean;
}

/** A button with words (and maybe an icon). Never submits a form unless it says `type="submit"`. */
export function Button({
	variant = 'secondary',
	size = 'md',
	icon,
	block,
	className,
	type = 'button',
	children,
	...rest
}: Props) {
	const classes = [s.button, s[variant], s[size], block && s.block, className].filter(Boolean).join(' ');
	return (
		<button type={type} className={classes} {...rest}>
			{icon !== undefined ? (
				<>
					<span className={s.icon} aria-hidden="true">
						{icon}
					</span>
					<span className={s.text}>{children}</span>
				</>
			) : (
				children
			)}
		</button>
	);
}

interface IconProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
	/** What it does, read out (there are no words to read). */
	label: string;
	/** The picture. */
	icon: ReactNode;
	/** plain (just the picture: ×, ⋯), secondary (on a soft background), primary (on the accent). */
	variant?: 'plain' | 'secondary' | 'primary';
	size?: Size;
}

/** A square button that's only a picture (×, ⋯, ✏️), named for screen readers by `label`. */
export function IconButton({
	label,
	icon,
	variant = 'plain',
	size = 'md',
	className,
	type = 'button',
	...rest
}: IconProps) {
	const classes = [s.iconButton, s[variant], s[size], className].filter(Boolean).join(' ');
	return (
		<button type={type} className={classes} aria-label={label} title={label} {...rest}>
			<span aria-hidden="true">{icon}</span>
		</button>
	);
}
