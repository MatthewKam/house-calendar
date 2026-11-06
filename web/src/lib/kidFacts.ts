// Fun facts for kid mode's Today when nothing's on: a big picture and one short sentence a grown-up
// (or the 🔊 button) can read aloud. Written here, not fetched, so every one suits a 2-year-old.

export interface KidFact { picture: string; text: string }

export const KID_FACTS: KidFact[] = [
	{ picture: "🐙", text: "An octopus has three hearts!" },
	{ picture: "🦋", text: "Butterflies taste with their feet." },
	{ picture: "🐝", text: "Bees do a little dance to tell their friends where the flowers are." },
	{ picture: "🐧", text: "Penguins can't fly, but they are super swimmers." },
	{ picture: "🌙", text: "There is no air on the Moon, so astronauts wear space suits." },
	{ picture: "🦈", text: "Sharks were around before there were any trees." },
	{ picture: "🐘", text: "An elephant's trunk is a nose, a hand and a straw, all in one." },
	{ picture: "🌈", text: "A rainbow happens when sunshine shines through raindrops." },
	{ picture: "🐨", text: "Koalas sleep for most of the day, up to 20 hours!" },
	{ picture: "🦷", text: "You will have 20 baby teeth, and later 32 grown-up teeth." },
	{ picture: "❤️", text: "Your heart beats about 100,000 times every day." },
	{ picture: "🦉", text: "Owls can turn their heads almost all the way around." },
	{ picture: "🐬", text: "Dolphins sleep with half of their brain at a time." },
	{ picture: "🐸", text: "Frogs drink water through their skin." },
	{ picture: "☀️", text: "The Sun is a star. It's the closest star to us." },
	{ picture: "🌍", text: "The Earth spins all the way around once every day." },
	{ picture: "🦔", text: "Baby hedgehogs are called hoglets." },
	{ picture: "🐼", text: "Pandas spend about half the day eating bamboo." },
	{ picture: "🦀", text: "Crabs walk sideways." },
	{ picture: "🐳", text: "The blue whale is the biggest animal that has ever lived." },
	{ picture: "🐿️", text: "Squirrels bury nuts, forget some, and they grow into trees." },
	{ picture: "🦩", text: "Flamingos are pink because of the pink food they eat." },
	{ picture: "🐪", text: "A camel's hump is full of fat, not water." },
	{ picture: "🐶", text: "Every dog's nose print is different, like your fingerprints." },
	{ picture: "🐱", text: "Cats sleep for most of the day." },
	{ picture: "🍌", text: "Bananas grow pointing up, toward the sun." },
	{ picture: "🍓", text: "A strawberry wears its seeds on the outside." },
	{ picture: "🌻", text: "Young sunflowers turn to follow the sun across the sky." },
	{ picture: "🐜", text: "An ant can carry things much heavier than itself." },
	{ picture: "🦕", text: "Birds are related to dinosaurs, and some dinosaurs had feathers." },
	{ picture: "❄️", text: "Every snowflake has six sides." },
	{ picture: "🌊", text: "Most of the Earth is covered in water." },
	{ picture: "🐌", text: "A snail carries its house on its back." },
	{ picture: "🦘", text: "Baby kangaroos are called joeys. They ride in their mom's pouch." },
	{ picture: "🐊", text: "Crocodiles can't stick out their tongues." },
	{ picture: "🌵", text: "A cactus keeps water inside, for when it's dry." },
	{ picture: "🦓", text: "No two zebras have the same stripes." },
	{ picture: "🦑", text: "A squid squirts ink to hide." },
	{ picture: "🐻", text: "Bears sleep through most of the winter." },
	{ picture: "🚀", text: "Astronauts grow a little bit taller in space." },
	{ picture: "🥕", text: "Long ago, carrots were purple." },
	{ picture: "🐣", text: "Baby chicks peep inside their eggs before they hatch." },
	{ picture: "🦜", text: "Some parrots can learn to say words." },
	{ picture: "🌳", text: "Trees and plants make the air we breathe." },
	{ picture: "🍯", text: "Bees make honey from flowers." },
	{ picture: "🦦", text: "Sea otters hold hands when they sleep, so they don't float apart." },
	{ picture: "🐟", text: "Some fish can change their colors." },
	{ picture: "⭐", text: "Stars are giant suns, very, very far away." },
	{ picture: "🐞", text: "Ladybugs come in red, orange, yellow and even black." },
	{ picture: "🦒", text: "A giraffe's tongue is as long as your arm." },
];

/** The day's fact: the same all day, a new one each day (YYYY-MM-DD). */
export function factFor(day: string): KidFact {
	const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
	return KID_FACTS[((days % KID_FACTS.length) + KID_FACTS.length) % KID_FACTS.length];
}
