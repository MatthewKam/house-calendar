// Emoji the icon pickers offer, each with words to search by. Food comes first: groceries use it
// most, and suggestIcon() matches item names against it.

export interface Emoji {
  e: string;
  /** Search words, lowercase; the first is its name. */
  k: string;
  food?: true;
}

const food = (e: string, k: string): Emoji => ({ e, k, food: true });
const item = (e: string, k: string): Emoji => ({ e, k });

export const EMOJI: Emoji[] = [
  // ---- Food and drink ----
  food('🥛', 'milk dairy'), food('🧀', 'cheese dairy'), food('🥚', 'eggs egg'), food('🧈', 'butter dairy'),
  food('🍦', 'ice cream dessert'), food('🍨', 'yogurt yoghurt gelato'), food('🍞', 'bread loaf toast'),
  food('🥐', 'croissant pastry'), food('🥯', 'bagel bagels'), food('🥖', 'baguette'), food('🫓', 'tortilla tortillas flatbread pita naan'),
  food('🥞', 'pancakes pancake mix waffles'), food('🥣', 'cereal oatmeal oats granola'), food('🍚', 'rice'), food('🍝', 'pasta spaghetti noodles'),
  food('🍜', 'ramen noodles soup'), food('🥫', 'canned can soup beans'), food('🍕', 'pizza'), food('🌮', 'taco tacos'),
  food('🌯', 'burrito wrap'), food('🥪', 'sandwich deli lunch meat'), food('🍔', 'burger hamburger'), food('🌭', 'hot dog hotdogs sausage'),
  food('🍗', 'chicken drumstick'), food('🥩', 'steak beef meat'), food('🥓', 'bacon'), food('🍖', 'ribs pork meat'),
  food('🐟', 'fish salmon tuna'), food('🍤', 'shrimp prawns'), food('🦀', 'crab'), food('🍣', 'sushi'),
  food('🍎', 'apple apples'), food('🍏', 'green apple'), food('🍐', 'pear pears'), food('🍊', 'orange oranges clementine mandarin'),
  food('🍋', 'lemon lemons lime limes'), food('🍌', 'banana bananas'), food('🍉', 'watermelon melon'), food('🍇', 'grapes grape'),
  food('🍓', 'strawberries strawberry berries'), food('🫐', 'blueberries blueberry'), food('🍒', 'cherries cherry'), food('🍑', 'peach peaches'),
  food('🥭', 'mango mangoes'), food('🍍', 'pineapple'), food('🥥', 'coconut'), food('🥝', 'kiwi kiwis'),
  food('🍅', 'tomato tomatoes'), food('🥑', 'avocado avocados guacamole'), food('🥦', 'broccoli'), food('🥬', 'lettuce spinach greens kale cabbage salad'),
  food('🥒', 'cucumber cucumbers pickles'), food('🌶️', 'pepper chili jalapeno'), food('🫑', 'bell pepper peppers'), food('🌽', 'corn'),
  food('🥕', 'carrot carrots'), food('🫒', 'olives olive oil'), food('🧄', 'garlic'), food('🧅', 'onion onions'),
  food('🥔', 'potato potatoes'), food('🍠', 'sweet potato yam'), food('🍄', 'mushroom mushrooms'), food('🥜', 'peanuts peanut butter nuts'),
  food('🌰', 'chestnut nuts almonds'), food('🫘', 'beans'), food('🍯', 'honey'), food('🧂', 'salt seasoning spices'),
  food('🫙', 'jar jam sauce salsa paste sesame tahini soy vinegar ketchup mustard mayo'), food('🧁', 'cupcake cupcakes muffin muffins'), food('🍰', 'cake'), food('🍪', 'cookies cookie'),
  food('🍫', 'chocolate'), food('🍬', 'candy sweets'), food('🍩', 'donut donuts'), food('🥨', 'pretzel pretzels'),
  food('🍿', 'popcorn'), food('🍟', 'fries chips'), food('🧃', 'juice box juice'), food('🥤', 'soda pop drink'),
  food('🧋', 'boba tea'), food('☕', 'coffee'), food('🍵', 'tea'), food('🧊', 'ice'),
  food('💧', 'water'), food('🍷', 'wine'), food('🍺', 'beer'), food('🥟', 'dumplings potstickers'),
  food('🍙', 'rice ball onigiri seaweed nori furikake'), food('🥗', 'salad'), food('🍳', 'cooking breakfast'), food('🥧', 'pie'),
  food('🧇', 'waffle waffles'), food('🫕', 'fondue'), food('🍼', 'baby formula bottle'), food('🥡', 'takeout leftovers'), food('🍱', 'tofu bento kimchi'), food('🫚', 'ginger'),
  // ---- Home and chores ----
  item('🧻', 'paper towels toilet paper tissues'), item('🧼', 'soap'), item('🧽', 'sponge dishes clean'), item('🧴', 'lotion shampoo sunscreen'),
  item('🪥', 'toothbrush toothpaste teeth'), item('🦷', 'teeth brush'), item('🧹', 'sweep broom'), item('🧺', 'laundry basket'),
  item('🗑️', 'trash garbage bin'), item('♻️', 'recycling recycle'), item('🍽️', 'dishes table set'), item('🛏️', 'bed make'),
  item('🚿', 'shower'), item('🛁', 'bath'), item('🪴', 'plants water garden'), item('🌱', 'garden seeds'),
  item('🧸', 'toys tidy'), item('🧦', 'socks'), item('👕', 'clothes dressed shirt'), item('👟', 'shoes'),
  item('🧥', 'coat jacket'), item('🎒', 'backpack school bag'), item('🔋', 'batteries battery'), item('💡', 'light bulb'),
  item('🕯️', 'candles candle'), item('🪣', 'bucket mop'), item('🧯', 'fire extinguisher'), item('🔧', 'fix repair tools'),
  item('🛒', 'shopping cart groceries'), item('📦', 'package box amazon'), item('✉️', 'mail letter'), item('💊', 'medicine vitamins pills'),
  item('🩹', 'bandaids bandage first aid'), item('😴', 'sleep bedtime nap'), item('🐶', 'dog feed pet walk'), item('🐱', 'cat feed pet'),
  item('🐠', 'fish tank pet'), item('🐹', 'hamster pet'), item('🐦', 'bird'), item('🦮', 'dog walk'),
  // ---- School and activities ----
  item('📚', 'books homework study'), item('📖', 'read reading book'), item('✏️', 'pencil write homework'), item('🖍️', 'crayons draw'),
  item('🧮', 'math'), item('💻', 'computer laptop'), item('🗣️', 'speak language practice'), item('🎹', 'piano music'),
  item('🎻', 'violin music'), item('🎸', 'guitar music'), item('🥁', 'drums music'), item('🎺', 'trumpet music'),
  item('🎨', 'art paint'), item('✂️', 'scissors craft'), item('🧩', 'puzzle'), item('🎲', 'games board game'),
  item('⚽', 'soccer football'), item('🏀', 'basketball'), item('⚾', 'baseball'), item('🏈', 'football'),
  item('🎾', 'tennis'), item('🏐', 'volleyball'), item('🏊', 'swim swimming'), item('🚴', 'bike cycling ride'),
  item('🤸', 'gymnastics stretch exercise'), item('🥋', 'karate martial arts jiu jitsu'), item('🩰', 'ballet dance'), item('⛸️', 'skating'),
  item('🏃', 'run running exercise'), item('🧘', 'yoga calm'), item('🏋️', 'workout gym weights'), item('⛳', 'golf'),
  // ---- Getting around and other ----
  item('🚗', 'car drive'), item('🚌', 'bus school'), item('✈️', 'flight travel trip'), item('⛽', 'gas fuel'),
  item('🏥', 'doctor hospital'), item('🦷', 'dentist'), item('💇', 'haircut'), item('🎂', 'birthday cake'),
  item('🎁', 'gift present'), item('🎉', 'party celebrate'), item('📅', 'calendar plan'), item('⏰', 'alarm time wake'),
  item('📞', 'call phone'), item('💰', 'money pay bills'), item('🏦', 'bank'), item('📝', 'note list'),
  item('⭐', 'star'), item('❤️', 'love heart'), item('✅', 'done check'), item('🔔', 'reminder bell'),
];

/** Each emoji once (a few appear under two subjects). */
const unique = (list: Emoji[]) => list.filter((x, i) => list.findIndex((y) => y.e === x.e) === i);
export const ALL_EMOJI = unique(EMOJI);

/** Emoji whose words start with what was typed ("ban" finds 🍌). */
export function searchEmoji(query: string): Emoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJI.filter((x) => x.k.split(' ').some((w) => w.startsWith(q)) || x.k.includes(q));
}

/** Groceries shown first in the list icon picker. */
export const GROCERY_ICONS = ALL_EMOJI.filter((x) => x.food).slice(0, 40).map((x) => x.e);

const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/(oes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

/** An icon for a grocery item's name ("2 bananas" → 🍌), or null if nothing fits. */
export function suggestIcon(text: string): string | null {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  // Two-word names first ("ice cream", "peanut butter"), then single words.
  for (let n = 2; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      // Food first; household things (paper towels, batteries) if no food fits.
      const fits = (x: Emoji, w: string) => ` ${x.k} `.includes(` ${w} `);
      const hit = ALL_EMOJI.find((x) => x.food && (fits(x, phrase) || fits(x, singular(phrase))))
        ?? ALL_EMOJI.find((x) => !x.food && (fits(x, phrase) || fits(x, singular(phrase))));
      if (hit) return hit.e;
    }
  }
  return null;
}

/** Splits a leading emoji off a name: "🥛 Milk" → { icon: "🥛", text: "Milk" }. */
export function splitIcon(title: string): { icon: string | null; text: string } {
  const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s*/u.exec(title);
  return m ? { icon: m[1], text: title.slice(m[0].length) } : { icon: null, text: title };
}
