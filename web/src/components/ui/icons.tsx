// Small line icons drawn in the current text color (the star is filled gold).

const svg = { viewBox: '0 0 24 24', 'aria-hidden': true } as const;

export const StarIcon = ({ className }: { className?: string }) => (
	<svg {...svg} className={className} style={{ fill: 'var(--star)', stroke: 'none' }}>
		<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
	</svg>
);

export const PencilIcon = () => (
	<svg {...svg}>
		<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
		<path d="M13.5 8.5l3 3" />
	</svg>
);

/** Copy: drawn at its own size and weight, so it shows wherever it's used (no page styles needed). */
export const CopyIcon = () => (
	<svg
		{...svg}
		width="1.15rem"
		height="1.15rem"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<rect x="8.5" y="8.5" width="11" height="11" rx="2" />
		<path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
	</svg>
);

export const TrashIcon = () => (
	<svg {...svg}>
		<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
	</svg>
);

export const GripIcon = () => (
	<svg {...svg} style={{ fill: 'currentColor', stroke: 'none' }}>
		{[6, 12, 18].map((y) => (
			<g key={y}>
				<circle cx="9" cy={y} r="1.6" />
				<circle cx="15" cy={y} r="1.6" />
			</g>
		))}
	</svg>
);

/** Cards: big pictures, in a grid. */
export const CardsIcon = () => (
	<svg {...svg}>
		<rect x="4" y="4" width="7" height="7" rx="1.5" />
		<rect x="13" y="4" width="7" height="7" rx="1.5" />
		<rect x="4" y="13" width="7" height="7" rx="1.5" />
		<rect x="13" y="13" width="7" height="7" rx="1.5" />
	</svg>
);

/** A list: words only, a line each. */
export const ListIcon = () => (
	<svg {...svg}>
		<path d="M4 6h16M4 12h16M4 18h16" />
	</svg>
);

/** Rows: a small picture on the left, words on the right. */
export const RowsIcon = () => (
	<svg {...svg}>
		<rect x="4" y="4.5" width="6" height="6" rx="1.2" />
		<rect x="4" y="13.5" width="6" height="6" rx="1.2" />
		<path d="M13 6.5h7M13 9h4.5M13 15.5h7M13 18h4.5" />
	</svg>
);
