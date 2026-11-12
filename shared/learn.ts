// The Learn games and their animals, shared by the server (levels, names in alerts, recorded noises)
// and the web app (the games themselves), so the two can't drift apart.

/** The games, and the highest level each has. */
export const GAME_LEVELS = {
	// Little (2): who says that, peekaboo, find it, count the apples, pop the bubbles.
	sounds: 6,
	peekaboo: 6,
	findIt: 6,
	apples: 6,
	pop: 6,
	// Early (4) and up: add them up, Bear's way home, the missing first letter, card matching.
	adding: 6,
	maze: 6,
	letters: 6,
	memory: 6,
} as const;
export type Game = keyof typeof GAME_LEVELS;

/** The games' names, as the kids' Learn tab shows them. */
export const GAME_NAMES: Record<Game, string> = {
	sounds: 'Who says that?',
	peekaboo: 'Peekaboo',
	findIt: 'Find it!',
	apples: 'Counting',
	pop: 'Pop!',
	adding: 'Math',
	maze: 'Maze',
	letters: 'Letters',
	memory: 'Pairs',
};

export interface Animal {
	id: string;
	name: string;
	/** Its noise as a word, said aloud when there's no recording. */
	says: string;
	/** Where it lives: the farm's are the first ones a 2-year-old meets. */
	home: 'farm' | 'house' | 'wild';
}

/** The animals with a noise (a grown-up can record their own of each). */
export const ANIMALS: Animal[] = [
	{ id: 'cow', name: 'cow', says: 'Moo', home: 'farm' },
	{ id: 'pig', name: 'pig', says: 'Oink', home: 'farm' },
	{ id: 'duck', name: 'duck', says: 'Quack', home: 'farm' },
	{ id: 'sheep', name: 'sheep', says: 'Baa', home: 'farm' },
	{ id: 'horse', name: 'horse', says: 'Neigh', home: 'farm' },
	{ id: 'chicken', name: 'chicken', says: 'Cluck cluck', home: 'farm' },
	{ id: 'rooster', name: 'rooster', says: 'Cock-a-doodle-doo', home: 'farm' },
	{ id: 'goat', name: 'goat', says: 'Maa', home: 'farm' },
	{ id: 'dog', name: 'dog', says: 'Woof', home: 'house' },
	{ id: 'cat', name: 'cat', says: 'Meow', home: 'house' },
	{ id: 'frog', name: 'frog', says: 'Ribbit', home: 'wild' },
	{ id: 'owl', name: 'owl', says: 'Hoo hoo', home: 'wild' },
	{ id: 'bee', name: 'bee', says: 'Buzz', home: 'wild' },
	{ id: 'seagull', name: 'seagull', says: 'Caw caw', home: 'wild' },
	{ id: 'hawk', name: 'hawk', says: 'Screech', home: 'wild' },
	{ id: 'lion', name: 'lion', says: 'Roar', home: 'wild' },
	{ id: 'leopard', name: 'leopard', says: 'Grrr', home: 'wild' },
	{ id: 'bear', name: 'bear', says: 'Growl', home: 'wild' },
	{ id: 'wolf', name: 'wolf', says: 'Awoo', home: 'wild' },
	{ id: 'elephant', name: 'elephant', says: 'Pawoo', home: 'wild' },
	{ id: 'monkey', name: 'monkey', says: 'Ooh ooh ah ah', home: 'wild' },
];
