// Exactly what Sprig keeps about a child, in parents' words: one list for everywhere it's said. Settings →
// Family → Children's privacy shows it (web ChildConsent), the consent email carries it (server/codeEmail.ts),
// and the privacy page's Children section says the same words (server/childPrivacy.test.ts checks each is
// there). Change it here and on the page together. docs/coppa.md has where each is kept in the code.

export interface ChildDataGroup {
	title: string;
	items: string[];
}

/** What's kept about a child, by where it comes from. */
export const CHILD_DATA: ChildDataGroup[] = [
	{
		title: 'About them (you add it)',
		items: [
			'Their name and the color that marks them.',
			'Their birthday, or the stage you pick for them (little, early, middle, tween or teen).',
			'Allergies you add, so recipes can flag them.',
		],
	},
	{
		title: 'Tasks, stars and rewards',
		items: [
			'The tasks you give them, and each time one is ticked: the day, the time and the stars it earned.',
			'Goals you set them: when each started and was done, and any note you write.',
			'Moments you catch them being good: what kind, your note, and the stars.',
			'Stars they put in jars (which jar and when), the rewards you set, and when each is won.',
		],
	},
	{
		title: 'Potty chart and learning games (only if you turn them on)',
		items: [
			'Each potty step marked (ask, sit, go, wipe, wash), whether it was pee or poo, and when.',
			'Each learning game played: the skill, the level, how many rounds and how many right the first time, and the stars; how long they played each day; their level in each skill.',
		],
	},
	{
		title: 'Family things they take part in',
		items: [
			'Events they are on, which you add or which come from calendars you connect.',
			'List items they add or tick, with who ticked each and when.',
			'Photos and videos they upload from their device, and when each was taken. Photos and videos others add may show them; Sprig does not look at who is in a photo.',
		],
	},
	{
		title: 'Their device (one you add with a code)',
		items: [
			'Its name (for example "iPad · Safari"), when it was added and when it was last used.',
			'If alerts are on: the address its notification service gives us for sending them, and its time zone.',
		],
	},
	{
		title: 'An older child who signs in themselves',
		items: ['Their email address, and how they sign in: Apple, Google, a code we email them, or a passkey.'],
	},
];

/** What Sprig never keeps about a child. */
export const CHILD_NOT_KEPT = [
	'Where they are: no location history. If "Here" is picked for the weather, the device\'s rough location (about a kilometer) is used for the forecast and not kept.',
	'Their voice: Sprig never records children, and videos are kept without sound.',
	"Hidden details in photos and videos, such as where they were taken: they're removed when each is added.",
	'Their contacts, or anything from other apps on their device.',
	'Advertising IDs, or anything that follows them to other apps or websites.',
];

/** How it's used, and by whom: short lines. */
export const CHILD_USE = [
	'It is used only to run Sprig for your family. No ads, nothing sold, nothing shared for anyone else to use.',
	"Your household sees it: guardians see everything; your children's devices and the family wall show what's meant for them.",
	"The only others who handle it are the services Sprig needs to work (our host, our backups, and email for codes), and they may not use it for anything else. A child's device can't use Sprig's AI features.",
	'Activity over 2 years old is deleted automatically, and removing your child deletes what we keep about them.',
];
