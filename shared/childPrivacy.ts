// Exactly what Sprig keeps about a child, in parents' words: one list for everywhere it's said. Settings →
// Family → Children's privacy shows it (web ChildConsent), the consent email carries it (server/codeEmail.ts),
// and the privacy page's Children section says the same words (server/childPrivacy.test.ts checks each is
// there). Change it here and on the page together. docs/coppa.md has where each is kept in the code.
// Each line names what's stored, short enough to scan.

export interface ChildDataGroup {
	title: string;
	/** Why Sprig needs it. */
	why: string;
	/** Exactly what's stored. */
	items: string[];
}

/** What's stored about a child, by kind. */
export const CHILD_DATA: ChildDataGroup[] = [
	{
		title: 'About them (you add it)',
		why: "So everyone sees who's who, their stars suit their age, and recipes warn about allergies.",
		items: ['Name and color', 'Birthday, or a stage you pick', 'Allergies'],
	},
	{
		title: 'Tasks and stars',
		why: "So they can tick their tasks and fill their jars, and you can see how they're doing.",
		items: [
			'The tasks you give them',
			'Each tick: the day, time and stars earned',
			'Goals: when each started and was done, and your note',
			'"Caught being good" moments: the kind, your note and the stars',
			'Stars put in jars, rewards you set, and when each is won',
		],
	},
	{
		title: 'Potty chart (if you use it)',
		why: 'So their chart fills in as they go.',
		items: ['Each step marked, pee or poo, and the time'],
	},
	{
		title: 'Learning games (if you turn them on)',
		why: 'So games get harder as they learn, and stop at the time you set.',
		items: ['Each game: the skill, level, rounds, how many right first time, stars', 'Minutes played each day'],
	},
	{
		title: 'Family things they take part in',
		why: "So they're on the calendar, lists and photos with the rest of the family.",
		items: [
			"Events they're on",
			'List items they add or tick, and when',
			'Photos and videos they upload, and the date each was taken',
		],
	},
	{
		title: 'Their device (added with a code)',
		why: 'So you can see their devices and sign one out, and alerts reach them at the right time.',
		items: [
			'Its name, like "iPad · Safari"',
			'When it was added and last used',
			'If alerts are on: its alert address and time zone',
			'If Sprig breaks on it: a crash report, so we can fix it (what went wrong, never what they did or typed)',
		],
	},
	{
		title: 'An older child who signs in',
		why: 'So they can sign in on their own.',
		items: ['Their email address, and how they sign in'],
	},
];

/** What Sprig never stores about a child. */
export const CHILD_NOT_KEPT = [
	'Where they are (a rough location for the weather is used once, not stored)',
	'Their voice (videos are kept without sound)',
	"Where a photo or video was taken (it's removed when it's added)",
	'Contacts, or anything from their other apps',
	'Advertising IDs, or anything that tracks them elsewhere',
];

/** How it's used, and by whom. */
export const CHILD_USE = [
	'Only to run Sprig for your family, seen only by your household',
	"Never sold, never used for ads, and a child's device can't use Sprig's AI features",
	'Handled only by the services Sprig runs on (our host, backups, and email for codes)',
	'Activity over 2 years old is deleted; removing a child deletes everything about them',
];
