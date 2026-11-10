// What the games are made of: animals and their noises, toys, fruit, and words with a picture (art.tsx
// draws each by its id).

// The animals with a noise: shared with the server, which keeps grown-ups' recordings of them.
export { ANIMALS, type Animal } from "../../../../shared/learn.ts";
import { ANIMALS } from "../../../../shared/learn.ts";

/** Animals to play with at a level: farm ones first, then pets, then the wild ones too. */
export function animalsUpTo(level: number) {
	const homes = level <= 1 ? ["farm"] : level <= 3 ? ["farm", "house"] : ["farm", "house", "wild"];
	return ANIMALS.filter((a) => homes.includes(a.home));
}

/** Things to find in a room. */
export const TOYS = [
	{ id: "teddy", one: "teddy bear", many: "teddy bears" },
	{ id: "sock", one: "sock", many: "socks" },
	{ id: "ball", one: "ball", many: "balls" },
	{ id: "block", one: "block", many: "blocks" },
	{ id: "book", one: "book", many: "books" },
	{ id: "car", one: "car", many: "cars" },
	{ id: "cup", one: "cup", many: "cups" },
	{ id: "shoe", one: "shoe", many: "shoes" },
	{ id: "hat", one: "hat", many: "hats" },
];

export const FRUIT = [
	{ id: "apple", one: "apple", many: "apples" },
	{ id: "pear", one: "pear", many: "pears" },
	{ id: "orange", one: "orange", many: "oranges" },
	{ id: "strawberry", one: "strawberry", many: "strawberries" },
	{ id: "banana", one: "banana", many: "bananas" },
	{ id: "grapes", one: "bunch of grapes", many: "bunches of grapes" },
	{ id: "lemon", one: "lemon", many: "lemons" },
	{ id: "cherry", one: "cherry", many: "cherries" },
];

/**
 * Words with a picture a 4-year-old knows straight away, for the missing first letter (only pictures that
 * say one word clearly: a cup could be a mug). Any length: the levels change the letters, not the words.
 */
export const WORDS = [
	"cat", "dog", "pig", "cow", "sun", "hat", "bee", "egg", "car", "key", "bus", "fox", "bed",
	"ball", "fish", "duck", "frog", "moon", "star", "tree", "sock", "book", "goat", "lion", "bear", "boat", "kite",
	"apple", "horse", "mouse", "sheep", "house", "train", "shoe", "bone", "teddy",
	"monkey", "banana", "orange", "carrot", "cheese", "flower", "rabbit", "cherry",
	"umbrella", "elephant", "butterfly",
].map((word) => ({ word, pic: word }));

/** Letters that look alike, offered together from level 3 so it's about looking closely. */
export const LOOK_ALIKE: Record<string, string[]> = {
	b: ["d", "p"], d: ["b", "p"], p: ["b", "q"], m: ["n", "w"], n: ["m", "h"], c: ["o", "e"], o: ["c", "a"],
	e: ["c", "a"], h: ["n", "k"], k: ["h", "x"], s: ["z", "c"], t: ["f", "l"], f: ["t", "l"], l: ["i", "t"],
	g: ["q", "j"], a: ["o", "e"], u: ["n", "v"],
};

export const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
