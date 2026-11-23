/**
 * Sprig's sprout with its orange dot, drawn on the page so it follows light and dark (the --sprout-*
 * colours in styles/app.css): green on light, the app icon's white and mint on dark. Size it with `className`.
 */
export default function Sprout({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="10 8 84 86" aria-hidden="true">
			<path
				d="M50 90C50 74 50 62 50 50"
				stroke="var(--sprout-stem)"
				strokeWidth="7"
				strokeLinecap="round"
				fill="none"
			/>
			<path d="M50 54C33 56 18 45 16 28C33 26 48 36 50 54Z" fill="var(--sprout-leaf)" />
			<path d="M50 46C55 27 70 15 88 16C88 35 73 47 50 46Z" fill="var(--sprout-leaf-2)" />
			{/* own: the brand's orange, the same on light and dark */}
			<circle cx="82.5" cy="19.5" r="8.3" fill="#f97316" />
		</svg>
	);
}
