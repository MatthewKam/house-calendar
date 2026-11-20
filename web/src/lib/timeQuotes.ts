// What Today's calendar says once the day's events are over (in place of "Nothing else today"): a quote
// about time with who said it, or a dad joke about clocks and calendars (no one to name). One a day, the
// same all day. Well-known quotes only, leaving out the ones too often pinned on the wrong person.

import { ofTheDay } from './kidFacts';

export interface TimeLine {
	text: string;
	/** Who said it; none for a dad joke. */
	by?: string;
}

export const TIME_LINES: TimeLine[] = [
	{ text: 'Forever is composed of nows.', by: 'Emily Dickinson' },
	{ text: 'How we spend our days is, of course, how we spend our lives.', by: 'Annie Dillard' },
	{ text: 'Time you enjoy wasting is not wasted time.', by: 'Marthe Troly-Curtin' },
	{ text: 'Lost time is never found again.', by: 'Benjamin Franklin' },
	{ text: 'You may delay, but time will not.', by: 'Benjamin Franklin' },
	{
		text: 'Time is the coin of your life. It is the only coin you have, and only you can determine how it will be spent.',
		by: 'Carl Sandburg',
	},
	{ text: 'The two most powerful warriors are patience and time.', by: 'Leo Tolstoy' },
	{ text: 'Adopt the pace of nature: her secret is patience.', by: 'Ralph Waldo Emerson' },
	{ text: "Life is what happens to us while we're making other plans.", by: 'Allen Saunders' },
	{ text: "The bad news is time flies. The good news is you're the pilot.", by: 'Michael Altshuler' },
	{ text: 'Better three hours too soon than a minute too late.', by: 'William Shakespeare' },
	{ text: 'Wherever you are, be all there.', by: 'Jim Elliot' },
	{
		text: 'Enjoy the little things, for one day you may look back and realize they were the big things.',
		by: 'Robert Brault',
	},
	{ text: 'Why did the man throw the clock out the window? He wanted to see time fly.' },
	{ text: 'What did one clock say to the other? "Got a minute?"' },
	{ text: 'Why are clocks so shy? They always keep their hands over their faces.' },
	{ text: 'Why was the clock hungry? It went back four seconds.' },
	{ text: 'I got fired from the calendar factory. All I did was take a day off.' },
	{ text: "Why don't calendars ever win races? Their days are numbered." },
	{ text: 'I stayed up all night wondering where the sun went. Then it dawned on me.' },
	{ text: 'Time flies like an arrow. Fruit flies like a banana.' },
];

/** The day's line (YYYY-MM-DD): the same all day. */
export const timeLineFor = (day: string) => ofTheDay(TIME_LINES, day);
