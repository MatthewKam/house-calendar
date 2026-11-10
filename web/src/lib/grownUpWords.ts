// The grown-ups' Today: a quote of the day (well-known and old, with who said it) and kind words for a
// parent, or just a person, a new one of each every day.

import { ofTheDay, type KidFact } from "./kidFacts";

export interface Quote { text: string; by: string }

const QUOTES: Quote[] = [
	{ text: "The best way to make children good is to make them happy.", by: "Oscar Wilde" },
	{ text: "Do what you can, with what you have, where you are.", by: "Theodore Roosevelt" },
	{ text: "Nothing is worth more than this day.", by: "Johann Wolfgang von Goethe" },
	{ text: "Write it on your heart that every day is the best day in the year.", by: "Ralph Waldo Emerson" },
	{ text: "No act of kindness, no matter how small, is ever wasted.", by: "Aesop" },
	{ text: "Adopt the pace of nature: her secret is patience.", by: "Ralph Waldo Emerson" },
	{ text: "Keep your face to the sunshine and you cannot see a shadow.", by: "Helen Keller" },
	{ text: "Well done is better than well said.", by: "Benjamin Franklin" },
	{ text: "Very little is needed to make a happy life.", by: "Marcus Aurelius" },
	{ text: "A journey of a thousand miles begins with a single step.", by: "Lao Tzu" },
	{ text: "Act as if what you do makes a difference. It does.", by: "William James" },
	{ text: "Play is the work of the child.", by: "Maria Montessori" },
	{ text: "We do not remember days, we remember moments.", by: "Cesare Pavese" },
	{ text: "Wherever you go, go with all your heart.", by: "Confucius" },
	{ text: "One kind word can warm three winter months.", by: "Japanese proverb" },
	{ text: "It takes a village to raise a child.", by: "African proverb" },
	{ text: "What is done in love is done well.", by: "Vincent van Gogh" },
	{ text: "Great things are done by a series of small things brought together.", by: "Vincent van Gogh" },
	{ text: "Let us be grateful to the people who make us happy.", by: "Marcel Proust" },
	{ text: "Little by little, one travels far.", by: "Spanish proverb" },
	{ text: "Patience is bitter, but its fruit is sweet.", by: "Jean-Jacques Rousseau" },
	{ text: "What we see depends mainly on what we look for.", by: "John Lubbock" },
	{ text: "The secret of getting ahead is getting started.", by: "Mark Twain" },
	{ text: "It is not length of life, but depth of life.", by: "Ralph Waldo Emerson" },
	{ text: "Where there is love there is life.", by: "Mahatma Gandhi" },
];

const GROWN_UP_KIND_WORDS: KidFact[] = [
	{ picture: "💛", text: "You don't have to be perfect to be exactly what they need." },
	{ picture: "🌧️", text: "The love you give counts, even on the messy days." },
	{ picture: "🛋️", text: "Rest is part of the work." },
	{ picture: "🌱", text: "You're doing better than you think." },
	{ picture: "✨", text: "The small moments are the big ones." },
	{ picture: "🤝", text: "It's okay to ask for help." },
	{ picture: "🌬️", text: "You're allowed to stop and take a breath." },
	{ picture: "🩹", text: "Making up after a hard moment teaches more than never having one." },
	{ picture: "🧺", text: "They won't remember the laundry. They'll remember you." },
	{ picture: "🫶", text: "Be as gentle with yourself as you are with them." },
	{ picture: "📝", text: "You are more than your to-do list." },
	{ picture: "👣", text: "Today you only need to do the next right thing." },
	{ picture: "🙋", text: "Showing up is enough." },
	{ picture: "🌻", text: "You're growing too." },
	{ picture: "😂", text: "Laughing together counts as a good day." },
	{ picture: "☕", text: "It's okay if today was just okay." },
	{ picture: "🏡", text: "You are someone's safe place." },
	{ picture: "🌳", text: "Your patience is planting something." },
	{ picture: "🌅", text: "You can start the day over any time you like." },
	{ picture: "🔋", text: "Tired means you've given a lot. Give some back to you." },
	{ picture: "🎁", text: "Good enough is a gift to everyone, you included." },
	{ picture: "👀", text: "Notice one thing that went right today." },
	{ picture: "🌟", text: "You matter for who you are, not only for what you do." },
	{ picture: "🧭", text: "You know your family best." },
];

/** The day's quote and kind words (YYYY-MM-DD): the same all day, new ones tomorrow. */
export const quoteFor = (day: string) => ofTheDay(QUOTES, day);
export const grownUpKindWordsFor = (day: string) => ofTheDay(GROWN_UP_KIND_WORDS, day);
