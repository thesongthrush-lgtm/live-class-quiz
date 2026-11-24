// Last One Standing: random player names. Big, varied word lists (checked by hand to keep
// combinations classroom-safe), several name shapes, and no repeats within a game on one device.

const ADJ = [
  "Brave", "Clever", "Lucky", "Mighty", "Jolly", "Swift", "Bold", "Calm", "Cosmic", "Dizzy",
  "Electric", "Fancy", "Fearless", "Fizzy", "Flying", "Friendly", "Funky", "Gentle", "Giant", "Glowing",
  "Golden", "Grumpy", "Happy", "Heroic", "Honest", "Humble", "Icy", "Jazzy", "Jumpy", "Kind",
  "Legendary", "Little", "Lively", "Loyal", "Magic", "Majestic", "Mellow", "Merry", "Midnight", "Misty",
  "Modern", "Mystic", "Neon", "Noble", "Odd", "Orange", "Polite", "Proud", "Purple", "Quiet",
  "Quirky", "Rapid", "Rocket", "Royal", "Rusty", "Sassy", "Secret", "Shiny", "Silent", "Silver",
  "Sleepy", "Smart", "Smiley", "Snappy", "Sneaky", "Snowy", "Solar", "Sparkly", "Speedy", "Spicy",
  "Spotty", "Stormy", "Sunny", "Super", "Tidy", "Tiny", "Turbo", "Velvet", "Wacky", "Wild",
  "Windy", "Wise", "Witty", "Zany", "Zippy", "Atomic", "Bouncy", "Breezy", "Bright", "Bubbly",
  "Busy", "Cheeky", "Chilly", "Crafty", "Crunchy", "Curious", "Daring", "Dazzling", "Eager", "Epic",
  "Fluffy", "Frosty", "Fuzzy", "Gigantic", "Glittery", "Groovy", "Hasty", "Hungry", "Jumbo", "Lunar",
  "Marble", "Mini", "Nifty", "Ninja", "Peppy", "Plucky", "Polar", "Pocket", "Retro", "Rowdy",
  "Scarlet", "Shy", "Sly", "Sparky", "Spooky", "Steady", "Sticky", "Stripy", "Sugar", "Thunder",
  "Tricky", "Trusty", "Vivid", "Wobbly", "Wonder", "Zesty", "Amber", "Arctic", "Crimson", "Emerald",
  "Galactic", "Hidden", "Jade", "Lemon", "Minty", "Ocean", "Pixel", "Ruby", "Sapphire", "Tropical",
];

const NOUN = [
  // animals
  "Otter", "Panda", "Falcon", "Puffin", "Badger", "Koala", "Walrus", "Penguin", "Gecko", "Llama",
  "Lobster", "Moose", "Narwhal", "Octopus", "Pelican", "Raccoon", "Squid", "Toucan", "Yak", "Zebra",
  "Hedgehog", "Flamingo", "Hamster", "Jellyfish", "Kangaroo", "Lemur", "Meerkat", "Platypus", "Sloth", "Wombat",
  // food
  "Waffle", "Pickle", "Noodle", "Pretzel", "Taco", "Pancake", "Mango", "Biscuit", "Donut", "Bagel",
  "Turnip", "Pumpkin", "Potato", "Cupcake", "Dumpling", "Nacho", "Burrito", "Crumpet", "Meatball", "Popcorn",
  // jobs and people
  "Pirate", "Wizard", "Ninja", "Robot", "Viking", "Knight", "Detective", "Astronaut", "Chef", "Captain",
  "Inventor", "Explorer", "Pilot", "Sailor", "Juggler", "Painter", "Drummer", "Ranger", "Lifeguard", "Gardener",
  // space and weather
  "Comet", "Rocket", "Galaxy", "Meteor", "Planet", "Nebula", "Asteroid", "Moon", "Thunder", "Tornado",
  "Blizzard", "Rainbow", "Cloud", "Lightning", "Hurricane", "Sunbeam", "Snowflake", "Puddle", "Breeze", "Volcano",
  // gems and materials
  "Diamond", "Emerald", "Crystal", "Pearl", "Topaz", "Opal", "Marble", "Granite", "Copper", "Comet",
  // instruments and music
  "Banjo", "Trumpet", "Tuba", "Ukulele", "Violin", "Bongo", "Kazoo", "Cello", "Piano", "Harmonica",
  // sport
  "Goalie", "Sprinter", "Striker", "Surfer", "Skater", "Boxer", "Racer", "Champion", "Hurler", "Diver",
  // fantasy creatures
  "Dragon", "Unicorn", "Phoenix", "Griffin", "Goblin", "Troll", "Yeti", "Mermaid", "Pixie", "Kraken",
  // everyday objects
  "Teapot", "Umbrella", "Lantern", "Kettle", "Rubber Duck", "Pencil", "Backpack", "Compass", "Toaster", "Sock",
  "Button", "Jigsaw", "Balloon", "Scooter", "Spoon", "Trampoline", "Yo-yo", "Teacup", "Doorbell", "Pogo Stick",
];

const TITLES = ["Captain", "Professor", "Doctor", "Agent", "Sir", "Lady", "Chief", "Major", "Count", "Baron", "Lord", "DJ", "King", "Queen", "Uncle", "Auntie", "Mister", "Madam", "Coach", "Judge"];
const MAX = 14;
const NOUNS = [...new Set(NOUN)];
const pick = a => a[Math.floor(Math.random() * a.length)];

function candidate() {
  const r = Math.random();
  const n = pick(NOUNS);
  // Mostly "Adjective Noun", sometimes alliterative, a title, or "The …".
  if (r < 0.18) { const t = pick(TITLES); if (t !== n) return { name: t + " " + n, adj: t, noun: n }; }
  if (r < 0.3) { const same = ADJ.filter(a => a[0] === n[0] && a !== n); if (same.length) { const a = pick(same); return { name: a + " " + n, adj: a, noun: n }; } }
  const a = pick(ADJ.filter(x => x !== n));
  if (r < 0.38) return { name: "The " + a + " " + n, adj: a, noun: n };
  return { name: a + " " + n, adj: a, noun: n };
}

// One generator per device (each phone, or the teacher's computer for the NPCs).
// Each adjective and noun is used once, and first letters are spread out when possible.
export function nameMaker() {
  const usedA = new Set(), usedN = new Set(), usedL = new Set();
  return function next() {
    let best = null;
    for (let i = 0; i < 400; i++) {
      const c = candidate();
      if (c.name.length > MAX) continue;
      const freshWords = !usedA.has(c.adj) && !usedN.has(c.noun);
      const freshLetter = !usedL.has(c.name.replace(/^The /, "")[0]);
      if (freshWords && freshLetter) { best = c; break; }
      if (freshWords && !best) best = c;
    }
    if (!best) best = candidate();
    usedA.add(best.adj); usedN.add(best.noun); usedL.add(best.name.replace(/^The /, "")[0]);
    if (usedA.size > ADJ.length * 0.8) usedA.clear();
    if (usedN.size > NOUNS.length * 0.8) usedN.clear();
    if (usedL.size >= 20) usedL.clear();
    return best.name;
  };
}

export const randomName = nameMaker();
export const NAME_LISTS = { ADJ, NOUN: NOUNS, TITLES, MAX };
