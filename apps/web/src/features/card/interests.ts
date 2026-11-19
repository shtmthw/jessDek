/**
 * The built-in interests. A recipe stores the id, so labels can be reworded without touching saved
 * cards. Removing an id quietly drops it from cards that had it.
 */

export interface InterestDef {
  id: string;
  label: string;
  emoji: string;
  /** Extra search words. */
  words?: string;
}

export interface InterestGroup {
  id: string;
  label: string;
  items: readonly InterestDef[];
}

const i = (id: string, label: string, emoji: string, words?: string): InterestDef => ({
  id,
  label,
  emoji,
  words,
});

export const INTEREST_GROUPS: readonly InterestGroup[] = [
  {
    id: 'outdoors',
    label: 'Outdoors',
    items: [
      i('hiking', 'Hiking', '🥾', 'trails walking mountains'),
      i('camping', 'Camping', '🏕️', 'tent outdoors'),
      i('climbing', 'Climbing', '🧗', 'bouldering rock'),
      i('biking', 'Biking', '🚲', 'cycling bike bicycle'),
      i('running', 'Running', '🏃', 'jogging marathon'),
      i('swimming', 'Swimming', '🏊', 'pool'),
      i('surfing', 'Surfing', '🏄', 'waves ocean'),
      i('skiing', 'Skiing', '⛷️', 'snow winter'),
      i('snowboarding', 'Snowboarding', '🏂', 'snow winter'),
      i('fishing', 'Fishing', '🎣'),
      i('gardening', 'Gardening', '🌱', 'plants'),
      i('beach', 'Beach days', '🏖️', 'sea sun'),
      i('road-trips', 'Road trips', '🚗', 'driving travel'),
      i('stargazing', 'Stargazing', '🔭', 'astronomy stars'),
      i('birdwatching', 'Birdwatching', '🐦', 'birds nature'),
    ],
  },
  {
    id: 'sports',
    label: 'Sports & fitness',
    items: [
      i('gym', 'Gym', '🏋️', 'lifting weights fitness workout'),
      i('yoga', 'Yoga', '🧘', 'meditation stretching'),
      i('football', 'Football', '⚽', 'soccer'),
      i('basketball', 'Basketball', '🏀'),
      i('tennis', 'Tennis', '🎾'),
      i('volleyball', 'Volleyball', '🏐'),
      i('skateboarding', 'Skateboarding', '🛹', 'skating'),
      i('dancing', 'Dancing', '💃', 'dance'),
      i('martial-arts', 'Martial arts', '🥋', 'karate judo taekwondo'),
      i('boxing', 'Boxing', '🥊'),
      i('golf', 'Golf', '⛳'),
      i('baseball', 'Baseball', '⚾'),
      i('cricket', 'Cricket', '🏏'),
      i('badminton', 'Badminton', '🏸'),
      i('ping-pong', 'Ping pong', '🏓', 'table tennis'),
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    items: [
      i('drawing', 'Drawing', '✏️', 'sketching art'),
      i('painting', 'Painting', '🎨', 'art'),
      i('photography', 'Photography', '📷', 'camera photos'),
      i('writing', 'Writing', '✍️', 'stories'),
      i('poetry', 'Poetry', '📜', 'poems'),
      i('knitting', 'Knitting', '🧶', 'crochet yarn'),
      i('sewing', 'Sewing', '🧵', 'fashion'),
      i('pottery', 'Pottery', '🏺', 'ceramics clay'),
      i('design', 'Design', '🖌️'),
      i('filmmaking', 'Filmmaking', '🎥', 'video'),
      i('cosplay', 'Cosplay', '🎭', 'costumes'),
      i('diy', 'DIY', '🔨', 'making building'),
    ],
  },
  {
    id: 'music',
    label: 'Music',
    items: [
      i('music', 'Music', '🎵'),
      i('singing', 'Singing', '🎤', 'karaoke'),
      i('guitar', 'Guitar', '🎸'),
      i('piano', 'Piano', '🎹', 'keys'),
      i('drums', 'Drums', '🥁'),
      i('concerts', 'Concerts', '🎶', 'gigs live music festivals'),
      i('djing', 'DJing', '🎧', 'dj mixing'),
      i('jazz', 'Jazz', '🎷', 'saxophone'),
      i('violin', 'Violin', '🎻', 'strings classical'),
    ],
  },
  {
    id: 'games',
    label: 'Games & tech',
    items: [
      i('games', 'Games', '🎮', 'gaming video games'),
      i('board-games', 'Board games', '🎲', 'tabletop'),
      i('chess', 'Chess', '♟️'),
      i('puzzles', 'Puzzles', '🧩'),
      i('coding', 'Coding', '💻', 'programming computers'),
      i('anime', 'Anime', '🍥', 'manga'),
      i('comics', 'Comics', '💥', 'superheroes'),
      i('tech', 'Tech', '📱', 'gadgets'),
      i('robots', 'Robots', '🤖', 'robotics ai'),
      i('space', 'Space', '🚀', 'rockets planets'),
      i('science', 'Science', '🔬'),
    ],
  },
  {
    id: 'food',
    label: 'Food & drink',
    items: [
      i('pizza', 'Pizza', '🍕'),
      i('cooking', 'Cooking', '🍳', 'chef'),
      i('baking', 'Baking', '🧁', 'cakes'),
      i('coffee', 'Coffee', '☕', 'cafe'),
      i('tea', 'Tea', '🍵'),
      i('sushi', 'Sushi', '🍣'),
      i('tacos', 'Tacos', '🌮'),
      i('ramen', 'Ramen', '🍜', 'noodles'),
      i('burgers', 'Burgers', '🍔'),
      i('desserts', 'Desserts', '🍰', 'sweets cake'),
      i('boba', 'Boba', '🧋', 'bubble tea'),
      i('chocolate', 'Chocolate', '🍫'),
      i('vegan', 'Plant-based', '🥗', 'vegan vegetarian salad'),
      i('bbq', 'BBQ', '🍖', 'barbecue grill'),
    ],
  },
  {
    id: 'culture',
    label: 'Chill & culture',
    items: [
      i('movies', 'Movies', '🎬', 'films cinema'),
      i('tv', 'TV shows', '📺', 'series'),
      i('reading', 'Reading', '📚', 'books'),
      i('podcasts', 'Podcasts', '🎙️'),
      i('travel', 'Travel', '✈️', 'trips'),
      i('languages', 'Languages', '🗣️'),
      i('history', 'History', '🏛️'),
      i('museums', 'Museums', '🖼️', 'art galleries'),
      i('fashion', 'Fashion', '👗', 'clothes style'),
      i('makeup', 'Makeup', '💄', 'beauty'),
      i('thrifting', 'Thrifting', '🛍️', 'shopping vintage'),
      i('astrology', 'Astrology', '🔮', 'zodiac tarot'),
      i('memes', 'Memes', '😂', 'funny'),
      i('naps', 'Naps', '😴', 'sleep'),
      i('journaling', 'Journaling', '📓', 'diary'),
    ],
  },
  {
    id: 'people',
    label: 'People & pets',
    items: [
      i('cats', 'Cats', '🐱'),
      i('dogs', 'Dogs', '🐶'),
      i('animals', 'Animals', '🐾', 'pets'),
      i('volunteering', 'Volunteering', '🤝', 'charity helping'),
      i('parties', 'Parties', '🎉', 'going out'),
      i('friends', 'Hanging out', '🫶', 'friends'),
      i('family', 'Family', '🏡', 'home'),
    ],
  },
];

const BY_ID = new Map(INTEREST_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it] as const)));

export const interestById = (id: string): InterestDef | undefined => BY_ID.get(id);

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** Built-in interests matching every word of the query, by label first, then other words. */
export function searchInterests(query: string): InterestDef[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<[InterestDef, number]> = [];
  for (const it of BY_ID.values()) {
    const label = fold(it.label);
    const hay = `${label} ${fold(it.words ?? '')}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push([it, label.startsWith(words[0]!) ? 0 : label.includes(words[0]!) ? 1 : 2]);
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([it]) => it);
}
