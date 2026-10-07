// Small line icons drawn in the current text color (the star is filled gold).

const svg = { viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const StarIcon = ({ className }: { className?: string }) => (
	<svg {...svg} className={className} style={{ fill: "#e3a008", stroke: "none" }}>
		<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
	</svg>
);

export const PencilIcon = () => (
	<svg {...svg}>
		<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
		<path d="M13.5 8.5l3 3" />
	</svg>
);

export const TrashIcon = () => (
	<svg {...svg}>
		<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
	</svg>
);

export const GripIcon = () => (
	<svg {...svg} style={{ fill: "currentColor", stroke: "none" }}>
		{[6, 12, 18].map((y) => (
			<g key={y}>
				<circle cx="9" cy={y} r="1.6" />
				<circle cx="15" cy={y} r="1.6" />
			</g>
		))}
	</svg>
);

export const GiftIcon = () => (
	<svg {...svg}>
		<rect x="3.5" y="8" width="17" height="4" rx="1" />
		<path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zm0 0c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z" />
	</svg>
);
