// The quote of the day's themes (Today, and the calendar page and wall), each with its quotes: well-known ones
// with who said them, leaving out the ones too often pinned on the wrong person.

import type { Theme } from './dailyThemes';

export interface Quote {
	text: string;
	by: string;
}

export const QUOTE_THEMES: Theme<Quote>[] = [
	{
		id: 'parenting',
		name: 'Parenting',
		forParents: true,
		items: [
			{ text: 'The best way to make children good is to make them happy.', by: 'Oscar Wilde' },
			{ text: 'Play is the work of the child.', by: 'Maria Montessori' },
			{ text: 'It takes a village to raise a child.', by: 'African proverb' },
			{
				text: 'There are two lasting bequests we can hope to give our children. One is roots; the other, wings.',
				by: 'Hodding Carter',
			},
			{
				text: 'Children have never been very good at listening to their elders, but they have never failed to imitate them.',
				by: 'James Baldwin',
			},
			{ text: 'The soul is healed by being with children.', by: 'Fyodor Dostoevsky' },
			{ text: 'Children need models rather than critics.', by: 'Joseph Joubert' },
			{ text: 'A child seldom needs a good talking to as a good listening to.', by: 'Robert Brault' },
			{ text: "Kids don't remember what you try to teach them. They remember what you are.", by: 'Jim Henson' },
			{ text: 'Children are the living messages we send to a time we will not see.', by: 'Neil Postman' },
			{ text: 'The days are long, but the years are short.', by: 'Gretchen Rubin' },
			{ text: 'Anyone who does anything to help a child in his life is a hero to me.', by: 'Fred Rogers' },
			{
				text: 'Play is often talked about as if it were a relief from serious learning. But for children, play is serious learning.',
				by: 'Fred Rogers',
			},
			{ text: "There's no such thing as a perfect parent. So just be a real one.", by: 'Sue Atkins' },
			{ text: 'Children are not things to be molded, but are people to be unfolded.', by: 'Jess Lair' },
		],
	},
	{
		id: 'kindness',
		name: 'Kindness',
		items: [
			{ text: 'No act of kindness, no matter how small, is ever wasted.', by: 'Aesop' },
			{ text: 'One kind word can warm three winter months.', by: 'Japanese proverb' },
			{
				text: 'Three things in human life are important: the first is to be kind; the second is to be kind; and the third is to be kind.',
				by: 'Henry James',
			},
			{ text: 'Be kind, for everyone you meet is fighting a hard battle.', by: 'Ian Maclaren' },
			{ text: 'Wherever there is a human being, there is an opportunity for a kindness.', by: 'Seneca' },
			{ text: 'Never lose a chance of saying a kind word.', by: 'William Makepeace Thackeray' },
			{ text: 'How beautiful a day can be when kindness touches it!', by: 'George Elliston' },
			{
				text: "The best portion of a good man's life: his little, nameless, unremembered acts of kindness and of love.",
				by: 'William Wordsworth',
			},
			{ text: 'A warm smile is the universal language of kindness.', by: 'William Arthur Ward' },
			{
				text: 'Too often we underestimate the power of a touch, a smile, a kind word, a listening ear.',
				by: 'Leo Buscaglia',
			},
			{ text: 'Be kind whenever possible. It is always possible.', by: 'Dalai Lama' },
			{ text: 'Guard well within yourself that treasure, kindness.', by: 'George Sand' },
			{ text: 'Kindness is the sunshine in which virtue grows.', by: 'Robert Green Ingersoll' },
			{ text: 'What wisdom can you find that is greater than kindness?', by: 'Jean-Jacques Rousseau' },
			{
				text: 'Constant kindness can accomplish much. As the sun makes ice melt, kindness causes misunderstanding, mistrust, and hostility to evaporate.',
				by: 'Albert Schweitzer',
			},
		],
	},
	{
		id: 'patience',
		name: 'Patience',
		items: [
			{ text: 'Adopt the pace of nature: her secret is patience.', by: 'Ralph Waldo Emerson' },
			{ text: 'Patience is bitter, but its fruit is sweet.', by: 'Jean-Jacques Rousseau' },
			{ text: 'Patience is the companion of wisdom.', by: 'Saint Augustine' },
			{ text: 'He that can have patience can have what he will.', by: 'Benjamin Franklin' },
			{ text: 'Rivers know this: there is no hurry. We shall get there some day.', by: 'A. A. Milne' },
			{ text: 'Have patience with all things, but first of all with yourself.', by: 'Saint Francis de Sales' },
			{ text: 'The two most powerful warriors are patience and time.', by: 'Leo Tolstoy' },
			{ text: 'Genius is nothing but a greater aptitude for patience.', by: 'Georges-Louis Leclerc de Buffon' },
			{ text: 'Everything comes gradually and at its appointed hour.', by: 'Ovid' },
			{ text: 'Patience and diligence, like faith, remove mountains.', by: 'William Penn' },
			{ text: 'Be patient toward all that is unsolved in your heart.', by: 'Rainer Maria Rilke' },
			{
				text: 'How poor are they that have not patience! What wound did ever heal but by degrees?',
				by: 'William Shakespeare',
			},
			{ text: 'Trees that are slow to grow bear the best fruit.', by: 'Molière' },
			{ text: 'Patience is also a form of action.', by: 'Auguste Rodin' },
			{ text: 'Slow and steady wins the race.', by: 'Aesop' },
		],
	},
	{
		id: 'gratitude',
		name: 'Gratitude',
		items: [
			{ text: 'Let us be grateful to the people who make us happy.', by: 'Marcel Proust' },
			{ text: 'Very little is needed to make a happy life.', by: 'Marcus Aurelius' },
			{ text: 'Gratitude is not only the greatest of virtues, but the parent of all the others.', by: 'Cicero' },
			{ text: 'When I started counting my blessings, my whole life turned around.', by: 'Willie Nelson' },
			{
				text: 'Feeling gratitude and not expressing it is like wrapping a present and not giving it.',
				by: 'William Arthur Ward',
			},
			{
				text: 'Enjoy the little things, for one day you may look back and realize they were the big things.',
				by: 'Robert Brault',
			},
			{
				text: 'If the only prayer you ever say in your entire life is thank you, it will be enough.',
				by: 'Meister Eckhart',
			},
			{
				text: 'He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.',
				by: 'Epictetus',
			},
			{ text: "Silent gratitude isn't much use to anyone.", by: 'Gertrude Stein' },
			{ text: 'Gratitude is the memory of the heart.', by: 'Jean-Baptiste Massieu' },
			{ text: 'Joy is the simplest form of gratitude.', by: 'Karl Barth' },
			{
				text: 'Gratitude makes sense of our past, brings peace for today, and creates a vision for tomorrow.',
				by: 'Melody Beattie',
			},
			{
				text: 'Piglet noticed that even though he had a Very Small Heart, it could hold a rather large amount of Gratitude.',
				by: 'A. A. Milne',
			},
			{ text: "Be thankful for what you have; you'll end up having more.", by: 'Oprah Winfrey' },
			{
				text: 'I awoke this morning with devout thanksgiving for my friends, the old and the new.',
				by: 'Ralph Waldo Emerson',
			},
		],
	},
	{
		id: 'courage',
		name: 'Courage & Resilience',
		items: [
			{ text: 'Little by little, one travels far.', by: 'Spanish proverb' },
			{ text: 'Courage is grace under pressure.', by: 'Ernest Hemingway' },
			{
				text: 'You gain strength, courage, and confidence by every experience in which you really stop to look fear in the face.',
				by: 'Eleanor Roosevelt',
			},
			{
				text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, 'I will try again tomorrow.'",
				by: 'Mary Anne Radmacher',
			},
			{
				text: 'Our greatest glory is not in never falling, but in rising every time we fall.',
				by: 'Oliver Goldsmith',
			},
			{ text: 'Fall seven times, stand up eight.', by: 'Japanese proverb' },
			{ text: 'The best way out is always through.', by: 'Robert Frost' },
			{ text: "Life shrinks or expands in proportion to one's courage.", by: 'Anaïs Nin' },
			{
				text: 'Although the world is full of suffering, it is full also of the overcoming of it.',
				by: 'Helen Keller',
			},
			{ text: 'Rock bottom became the solid foundation on which I rebuilt my life.', by: 'J. K. Rowling' },
			{ text: 'Hope is the thing with feathers that perches in the soul.', by: 'Emily Dickinson' },
			{
				text: 'Courage is not the absence of fear, but rather the judgment that something else is more important than fear.',
				by: 'Ambrose Redmoon',
			},
			{ text: 'We must accept finite disappointment, but never lose infinite hope.', by: 'Martin Luther King Jr.' },
			{
				text: 'Perseverance is not a long race; it is many short races one after the other.',
				by: 'Walter Elliot',
			},
			{ text: 'I am not afraid of storms, for I am learning how to sail my ship.', by: 'Louisa May Alcott' },
		],
	},
	{
		id: 'motivation',
		name: 'Motivation & Success',
		items: [
			{ text: 'Do what you can, with what you have, where you are.', by: 'Theodore Roosevelt' },
			{ text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
			{ text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
			{ text: 'Act as if what you do makes a difference. It does.', by: 'William James' },
			{ text: 'Great things are done by a series of small things brought together.', by: 'Vincent van Gogh' },
			{ text: 'The secret of getting ahead is getting started.', by: 'Mark Twain' },
			{ text: 'Nothing will work unless you do.', by: 'Maya Angelou' },
			{ text: 'Genius is one percent inspiration, ninety-nine percent perspiration.', by: 'Thomas Edison' },
			{ text: "You miss 100% of the shots you don't take.", by: 'Wayne Gretzky' },
			{ text: "Hard work beats talent when talent doesn't work hard.", by: 'Tim Notke' },
			{ text: "Don't watch the clock; do what it does. Keep going.", by: 'Sam Levenson' },
			{ text: 'Plans are nothing; planning is everything.', by: 'Dwight D. Eisenhower' },
			{ text: 'Ever tried. Ever failed. No matter. Try again. Fail again. Fail better.', by: 'Samuel Beckett' },
			{ text: 'Either you run the day or the day runs you.', by: 'Jim Rohn' },
			{ text: 'Success is the sum of small efforts, repeated day in and day out.', by: 'Robert Collier' },
			{
				text: 'What you do makes a difference, and you have to decide what kind of difference you want to make.',
				by: 'Jane Goodall',
			},
		],
	},
	{
		id: 'mindfulness',
		name: 'Mindfulness & Presence',
		items: [
			{ text: 'Nothing is worth more than this day.', by: 'Johann Wolfgang von Goethe' },
			{ text: 'We do not remember days, we remember moments.', by: 'Cesare Pavese' },
			{ text: 'Wherever you go, go with all your heart.', by: 'Confucius' },
			{ text: 'It is not length of life, but depth of life.', by: 'Ralph Waldo Emerson' },
			{ text: 'Write it on your heart that every day is the best day in the year.', by: 'Ralph Waldo Emerson' },
			{
				text: 'The present moment is filled with joy and happiness. If you are attentive, you will see it.',
				by: 'Thich Nhat Hanh',
			},
			{ text: 'Wherever you go, there you are.', by: 'Jon Kabat-Zinn' },
			{ text: 'Life is available only in the present moment.', by: 'Thich Nhat Hanh' },
			{
				text: 'Almost everything will work again if you unplug it for a few minutes, including you.',
				by: 'Anne Lamott',
			},
			{ text: 'Smile, breathe and go slowly.', by: 'Thich Nhat Hanh' },
			{ text: 'How we spend our days is, of course, how we spend our lives.', by: 'Annie Dillard' },
			{ text: 'Forever is composed of nows.', by: 'Emily Dickinson' },
			{ text: 'Realize deeply that the present moment is all you have.', by: 'Eckhart Tolle' },
			{ text: "The little things? The little moments? They aren't little.", by: 'Jon Kabat-Zinn' },
			{
				text: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.',
				by: 'Thich Nhat Hanh',
			},
		],
	},
	{
		id: 'nature',
		name: 'Nature',
		items: [
			{ text: 'In every walk with nature one receives far more than he seeks.', by: 'John Muir' },
			{ text: 'Nature always wears the colors of the spirit.', by: 'Ralph Waldo Emerson' },
			{
				text: 'I go to nature to be soothed and healed, and to have my senses put in order.',
				by: 'John Burroughs',
			},
			{ text: 'Climb the mountains and get their good tidings.', by: 'John Muir' },
			{ text: 'Study nature, love nature, stay close to nature. It will never fail you.', by: 'Frank Lloyd Wright' },
			{ text: 'Heaven is under our feet as well as over our heads.', by: 'Henry David Thoreau' },
			{
				text: 'To sit in the shade on a fine day and look upon verdure is the most perfect refreshment.',
				by: 'Jane Austen',
			},
			{ text: 'If you truly love nature, you will find beauty everywhere.', by: 'Vincent van Gogh' },
			{
				text: 'Live in each season as it passes; breathe the air, drink the drink, taste the fruit.',
				by: 'Henry David Thoreau',
			},
			{ text: "Spring is nature's way of saying, 'Let's party!'", by: 'Robin Williams' },
			{ text: 'A weed is but an unloved flower.', by: 'Ella Wheeler Wilcox' },
			{ text: 'Rain is grace; rain is the sky descending to the earth.', by: 'John Updike' },
			{
				text: 'Those who contemplate the beauty of the earth find reserves of strength that will endure as long as life lasts.',
				by: 'Rachel Carson',
			},
			{ text: 'Nature is not a place to visit. It is home.', by: 'Gary Snyder' },
			{ text: 'The clearest way into the Universe is through a forest wilderness.', by: 'John Muir' },
		],
	},
	{
		id: 'joy',
		name: 'Joy',
		items: [
			{ text: 'Keep your face to the sunshine and you cannot see a shadow.', by: 'Helen Keller' },
			{ text: 'Find ecstasy in life; the mere sense of living is joy enough.', by: 'Emily Dickinson' },
			{
				text: 'Happiness is not something ready made. It comes from your own actions.',
				by: 'Dalai Lama',
			},
			{
				text: "Happiness often sneaks in through a door you didn't know you left open.",
				by: 'John Barrymore',
			},
			{ text: 'The most wasted of all days is one without laughter.', by: 'Nicolas Chamfort' },
			{ text: 'Joy is not in things; it is in us.', by: 'Richard Wagner' },
			{ text: 'There is no duty we so much underrate as the duty of being happy.', by: 'Robert Louis Stevenson' },
			{ text: 'Happiness is a warm puppy.', by: 'Charles M. Schulz' },
			{ text: 'If you want to be happy, be.', by: 'Leo Tolstoy' },
			{ text: 'Joy is a net of love by which you can catch souls.', by: 'Mother Teresa' },
			{ text: 'The happiness of your life depends upon the quality of your thoughts.', by: 'Marcus Aurelius' },
			{
				text: 'Joy does not simply happen to us. We have to choose joy and keep choosing it every day.',
				by: 'Henri Nouwen',
			},
			{ text: 'One joy scatters a hundred griefs.', by: 'Chinese proverb' },
			{
				text: "Now and then it's good to pause in our pursuit of happiness and just be happy.",
				by: 'Guillaume Apollinaire',
			},
			{ text: 'Laughter is the sun that drives winter from the human face.', by: 'Victor Hugo' },
		],
	},
	{
		id: 'humor',
		name: 'Humor & Wit',
		items: [
			{ text: 'Laughter is the shortest distance between two people.', by: 'Victor Borge' },
			{
				text: "I am so clever that sometimes I don't understand a single word of what I am saying.",
				by: 'Oscar Wilde',
			},
			{ text: 'I can resist everything except temptation.', by: 'Oscar Wilde' },
			{
				text: 'The trouble with having an open mind, of course, is that people will insist on coming along and trying to put things in it.',
				by: 'Terry Pratchett',
			},
			{
				text: 'Cleaning your house while your kids are still growing is like shoveling the walk before it stops snowing.',
				by: 'Phyllis Diller',
			},
			{ text: 'Never have more children than you have car windows.', by: 'Erma Bombeck' },
			{ text: "If you can't make it better, you can laugh at it.", by: 'Erma Bombeck' },
			{
				text: 'The secret of staying young is to live honestly, eat slowly, and lie about your age.',
				by: 'Lucille Ball',
			},
			{ text: 'I love deadlines. I love the whooshing noise they make as they go by.', by: 'Douglas Adams' },
			{
				text: 'People who think they know everything are a great annoyance to those of us who do.',
				by: 'Isaac Asimov',
			},
			{ text: 'A clear conscience is usually the sign of a bad memory.', by: 'Steven Wright' },
			{
				text: 'Never put off till tomorrow what you can do the day after tomorrow just as well.',
				by: 'Mark Twain',
			},
			{ text: 'Insanity is hereditary. You get it from your children.', by: 'Sam Levenson' },
			{ text: 'What is a home without children? Quiet.', by: 'Henny Youngman' },
			{ text: 'If evolution really works, how come mothers only have two hands?', by: 'Milton Berle' },
		],
	},
	{
		id: 'wisdom',
		name: 'Wisdom & Leadership',
		items: [
			{ text: 'What we see depends mainly on what we look for.', by: 'John Lubbock' },
			{ text: 'A leader is best when people barely know he exists.', by: 'Lao Tzu' },
			{
				text: 'Leadership is not about being in charge. It is about taking care of those in your charge.',
				by: 'Simon Sinek',
			},
			{ text: 'We are what we repeatedly do.', by: 'Will Durant' },
			{
				text: 'The greatest good you can do for another is not just to share your riches but to reveal to him his own.',
				by: 'Benjamin Disraeli',
			},
			{ text: 'The art of being wise is the art of knowing what to overlook.', by: 'William James' },
			{
				text: 'Example is not the main thing in influencing others. It is the only thing.',
				by: 'Albert Schweitzer',
			},
			{
				text: 'A good leader takes a little more than his share of the blame, a little less than his share of the credit.',
				by: 'Arnold H. Glasow',
			},
			{ text: 'He who knows others is wise; he who knows himself is enlightened.', by: 'Lao Tzu' },
			{
				text: 'The simple things are also the most extraordinary things, and only the wise can see them.',
				by: 'Paulo Coelho',
			},
			{ text: 'Honesty is the first chapter in the book of wisdom.', by: 'Thomas Jefferson' },
			{ text: 'Management is doing things right; leadership is doing the right things.', by: 'Peter Drucker' },
			{
				text: 'Never doubt that a small group of thoughtful, committed citizens can change the world.',
				by: 'Margaret Mead',
			},
			{
				text: 'We have two ears and one mouth so that we can listen twice as much as we speak.',
				by: 'Epictetus',
			},
			{
				text: 'Speak when you are angry and you will make the best speech you will ever regret.',
				by: 'Ambrose Bierce',
			},
		],
	},
	{
		id: 'family',
		name: 'Friendship & Family',
		items: [
			{ text: 'What is done in love is done well.', by: 'Vincent van Gogh' },
			{ text: 'Where there is love there is life.', by: 'Mahatma Gandhi' },
			{ text: 'Other things may change us, but we start and end with the family.', by: 'Anthony Brandt' },
			{ text: 'A friend is someone who knows all about you and still loves you.', by: 'Elbert Hubbard' },
			{ text: "Family is not an important thing. It's everything.", by: 'Michael J. Fox' },
			{ text: 'Walking with a friend in the dark is better than walking alone in the light.', by: 'Helen Keller' },
			{
				text: "Friendship is born at that moment when one person says to another, 'What! You too? I thought I was the only one.'",
				by: 'C. S. Lewis',
			},
			{
				text: 'Call it a clan, call it a network, call it a tribe, call it a family. Whatever you call it, whoever you are, you need one.',
				by: 'Jane Howard',
			},
			{
				text: "The bond that links your true family is not one of blood, but of respect and joy in each other's life.",
				by: 'Richard Bach',
			},
			{ text: 'There is nothing on this earth more to be prized than true friendship.', by: 'Thomas Aquinas' },
			{
				text: 'Happiness is having a large, loving, caring, close-knit family in another city.',
				by: 'George Burns',
			},
			{ text: 'Friends are the family we choose for ourselves.', by: 'Edna Buchanan' },
			{ text: 'A real friend is one who walks in when the rest of the world walks out.', by: 'Walter Winchell' },
			{ text: 'Home is where you are loved the most and act the worst.', by: 'Marjorie Pay Hinckley' },
			{ text: 'The ornament of a house is the friends who frequent it.', by: 'Ralph Waldo Emerson' },
			{
				text: "Piglet sidled up to Pooh from behind. 'Pooh!' he whispered. 'Yes, Piglet?' 'Nothing,' said Piglet, taking Pooh's paw. 'I just wanted to be sure of you.'",
				by: 'A. A. Milne',
			},
		],
	},
	{
		id: 'learning',
		name: 'Learning & Curiosity',
		items: [
			{ text: 'I have no special talents. I am only passionately curious.', by: 'Albert Einstein' },
			{
				text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
				by: 'Dr. Seuss',
			},
			{ text: 'Curiosity is the wick in the candle of learning.', by: 'William Arthur Ward' },
			{ text: 'The mind is not a vessel to be filled, but a fire to be kindled.', by: 'Plutarch' },
			{ text: 'Anyone who stops learning is old, whether at twenty or eighty.', by: 'Henry Ford' },
			{ text: 'The beautiful thing about learning is that nobody can take it away from you.', by: 'B. B. King' },
			{ text: 'Children must be taught how to think, not what to think.', by: 'Margaret Mead' },
			{
				text: 'The important thing is not to stop questioning. Curiosity has its own reason for existing.',
				by: 'Albert Einstein',
			},
			{
				text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
				by: 'George R. R. Martin',
			},
			{ text: 'Once you learn to read, you will be forever free.', by: 'Frederick Douglass' },
			{ text: 'There is no friend as loyal as a book.', by: 'Ernest Hemingway' },
			{ text: 'Learning never exhausts the mind.', by: 'Leonardo da Vinci' },
			{ text: 'Wonder is the beginning of wisdom.', by: 'Socrates' },
			{ text: 'The cure for boredom is curiosity. There is no cure for curiosity.', by: 'Ellen Parr' },
			{ text: 'Millions saw the apple fall, but Newton was the one who asked why.', by: 'Bernard Baruch' },
		],
	},
];
