// Fun facts for kid mode's Today: a big picture and one short sentence a grown-up can read aloud. Written
// here, not fetched, so every one suits a young kid; the littlest get their own, simpler ones.

export interface KidFact {
	picture: string;
	text: string;
}

const KID_FACTS: KidFact[] = [
	{ picture: '🐙', text: 'An octopus has three hearts!' },
	{ picture: '🦋', text: 'Butterflies taste with their feet.' },
	{ picture: '🐝', text: 'Bees do a little dance to tell their friends where the flowers are.' },
	{ picture: '🐧', text: "Penguins can't fly, but they are super swimmers." },
	{ picture: '🌙', text: 'There is no air on the Moon, so astronauts wear space suits.' },
	{ picture: '🦈', text: 'Sharks were around before there were any trees.' },
	{ picture: '🐘', text: "An elephant's trunk is a nose, a hand and a straw, all in one." },
	{ picture: '🌈', text: 'A rainbow happens when sunshine shines through raindrops.' },
	{ picture: '🐨', text: 'Koalas sleep for most of the day, up to 20 hours!' },
	{ picture: '🦷', text: 'You will have 20 baby teeth, and later 32 grown-up teeth.' },
	{ picture: '❤️', text: 'Your heart beats about 100,000 times every day.' },
	{ picture: '🦉', text: 'Owls can turn their heads almost all the way around.' },
	{ picture: '🐬', text: 'Dolphins sleep with half of their brain at a time.' },
	{ picture: '🐸', text: 'Frogs drink water through their skin.' },
	{ picture: '☀️', text: "The Sun is a star. It's the closest star to us." },
	{ picture: '🌍', text: 'The Earth spins all the way around once every day.' },
	{ picture: '🦔', text: 'Baby hedgehogs are called hoglets.' },
	{ picture: '🐼', text: 'Pandas spend about half the day eating bamboo.' },
	{ picture: '🦀', text: 'Crabs walk sideways.' },
	{ picture: '🐳', text: 'The blue whale is the biggest animal that has ever lived.' },
	{ picture: '🐿️', text: 'Squirrels bury nuts, forget some, and they grow into trees.' },
	{ picture: '🦩', text: 'Flamingos are pink because of the pink food they eat.' },
	{ picture: '🐪', text: "A camel's hump is full of fat, not water." },
	{ picture: '🐶', text: "Every dog's nose print is different, like your fingerprints." },
	{ picture: '🐱', text: 'Cats sleep for most of the day.' },
	{ picture: '🍌', text: 'Bananas grow pointing up, toward the sun.' },
	{ picture: '🍓', text: 'A strawberry wears its seeds on the outside.' },
	{ picture: '🌻', text: 'Young sunflowers turn to follow the sun across the sky.' },
	{ picture: '🐜', text: 'An ant can carry things much heavier than itself.' },
	{ picture: '🦕', text: 'Birds are related to dinosaurs, and some dinosaurs had feathers.' },
	{ picture: '❄️', text: 'Every snowflake has six sides.' },
	{ picture: '🌊', text: 'Most of the Earth is covered in water.' },
	{ picture: '🐌', text: 'A snail carries its house on its back.' },
	{ picture: '🦘', text: "Baby kangaroos are called joeys. They ride in their mom's pouch." },
	{ picture: '🐊', text: "Crocodiles can't stick out their tongues." },
	{ picture: '🌵', text: "A cactus keeps water inside, for when it's dry." },
	{ picture: '🦓', text: 'No two zebras have the same stripes.' },
	{ picture: '🦑', text: 'A squid squirts ink to hide.' },
	{ picture: '🐻', text: 'Bears sleep through most of the winter.' },
	{ picture: '🚀', text: 'Astronauts grow a little bit taller in space.' },
	{ picture: '🥕', text: 'Long ago, carrots were purple.' },
	{ picture: '🐣', text: 'Baby chicks peep inside their eggs before they hatch.' },
	{ picture: '🦜', text: 'Some parrots can learn to say words.' },
	{ picture: '🌳', text: 'Trees and plants make the air we breathe.' },
	{ picture: '🍯', text: 'Bees make honey from flowers.' },
	{ picture: '🦦', text: "Sea otters hold hands when they sleep, so they don't float apart." },
	{ picture: '🐟', text: 'Some fish can change their colors.' },
	{ picture: '⭐', text: 'Stars are giant suns, very, very far away.' },
	{ picture: '🐞', text: 'Ladybugs come in red, orange, yellow and even black.' },
	{ picture: '🦒', text: "A giraffe's tongue is as long as your arm." },
];

/** Facts for the littlest (2–3): things they can see, hear or do, in a few words. */
const LITTLE_FACTS: KidFact[] = [
	{ picture: '🐄', text: 'Cows say moo, and they give us milk.' },
	{ picture: '🐝', text: 'Bees go buzz, and they make honey.' },
	{ picture: '🐘', text: 'Elephants are big, with a long, long nose.' },
	{ picture: '🐶', text: "Dogs wag their tails when they're happy." },
	{ picture: '🐱', text: "Cats purr when they're cozy." },
	{ picture: '🦆', text: 'Ducks say quack, and they love to swim.' },
	{ picture: '🐸', text: 'Frogs go hop, hop, hop!' },
	{ picture: '🐟', text: 'Fish live in the water.' },
	{ picture: '🐔', text: 'Chickens lay eggs.' },
	{ picture: '🐑', text: 'Sheep are soft and fluffy.' },
	{ picture: '🦒', text: 'Giraffes have long, long necks.' },
	{ picture: '🐢', text: 'Turtles carry their house on their back.' },
	{ picture: '🦉', text: 'Owls stay up at night.' },
	{ picture: '🐰', text: 'Bunnies have long ears.' },
	{ picture: '🐵', text: 'Monkeys love bananas.' },
	{ picture: '🐻', text: 'Bears sleep all winter long.' },
	{ picture: '🦁', text: 'Lions say roar!' },
	{ picture: '🐌', text: 'Snails go very, very slow.' },
	{ picture: '🦋', text: 'Butterflies have pretty wings.' },
	{ picture: '🐧', text: 'Penguins waddle and slide on their tummies.' },
	{ picture: '☀️', text: 'The sun keeps us warm.' },
	{ picture: '🌙', text: 'The moon comes out at night.' },
	{ picture: '🌧️', text: 'Rain helps the flowers grow.' },
	{ picture: '🌈', text: 'Rainbows have lots of colors.' },
	{ picture: '⭐', text: 'Stars twinkle in the night sky.' },
	{ picture: '🍎', text: 'Apples grow on trees.' },
	{ picture: '🥕', text: 'Carrots grow under the ground.' },
	{ picture: '🍌', text: 'Bananas are yellow.' },
	{ picture: '❄️', text: 'Snow is cold and white.' },
	{ picture: '🌳', text: 'Birds make their nests in trees.' },
	{ picture: '🚒', text: 'Fire trucks are red and go nee-naw.' },
];

/** One of a list for the day (YYYY-MM-DD): the same all day, the next one tomorrow. */
export function ofTheDay<T>(list: T[], day: string): T {
	const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
	return list[((days % list.length) + list.length) % list.length];
}

/** The day's fact (YYYY-MM-DD), from the littlest's own list for them. */
export const factFor = (day: string, little = false) => ofTheDay(little ? LITTLE_FACTS : KID_FACTS, day);
