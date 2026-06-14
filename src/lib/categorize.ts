// Auto-categorization for imported transactions.
//
// Strategy: merchant-keyword rules first (most specific), then fall back to the
// bank-provided "spend category" hint, then Miscellaneous. Everything is a
// best guess — the import preview lets the user correct any row.

import {
  MEAL_SPLIT_SLUG,
  DEFAULT_MEAL_NEED_CENTS,
  mealFlag,
  type NeedWant,
} from "./categories";

export interface CategoryGuess {
  /** Slug from DEFAULT_CATEGORIES. */
  categorySlug: string;
  /** "Need" | "Want" | "Comfort" | null best guess. */
  needWant: NeedWant | null;
}

interface Rule {
  // Matched against the upper-cased description.
  test: RegExp;
  slug: string;
}

// Order matters: first match wins.
const RULES: Rule[] = [
  // Coffee / snacks (check before generic restaurants)
  { test: /STARBUCKS|TIM HORTON|TIMHORTON|COFFEE|CAFE|\bCAF\b|YOGEN FRUZ|DAVIDSTEA|SECOND CUP|BUBBLE TEA|CHATIME|GONG CHA|COBS BREAD|DONUT/, slug: "coffee-snacks" },
  // Rideshare trips (Uber/Lyft) — a need (getting somewhere) bought in its
  // premium form, so it maps to Comfort rather than Transit. Must come before
  // the eats rule (which matches UBER EATS) and the transit rule.
  { test: /UBERTRIP|UBER\s*\*?\s*TRIP|LYFT/, slug: "comfort" },
  // Transit (true necessities: transit passes, fuel, parking)
  { test: /PRESTO|\bTTC\b|GO TRANSIT|GO TRAIN|VIA RAIL|TRANSIT|PARKING|PETRO|ESSO|SHELL|GAS BAR|COINAMATIC.*WASH/, slug: "transit" },
  // Food delivery / restaurants
  { test: /UBER\s*EATS|UBEREATS|UBER CANADA\/UBEREATS|DOORDASH|SKIPTHE|SKIP THE|FANTUAN|RESTAURANT|SUSHI|PIZZA|RAMEN|NOODLE|KITCHEN|GRILL|BURGER|MCDONALD|A&W|KFC|SUBWAY|CHIPOTLE|CHICKEN|BBQ|HOT POT|HOTPOT|DINER|EATERY|BISTRO|TACO|THAI|PHO\b|MEAT BOWL|SPICY|KORNER|HARVEST MARKET/, slug: "eating-out" },
  // Groceries / supermarkets
  { test: /WAL-?MART|WALMART|LOBLAW|T&T SUPERMARKET|T & T|METRO\b|NO FRILLS|FRESHCO|SOBEYS|FARM BOY|COSTCO|SUPERMARKET|SUPERCENTER|GROCERY|GROCER|FOODBASICS|FOOD BASICS|H MART|HMART|GALLERIA|LITTLE HARVEST/, slug: "groceries" },
  // Subscriptions / recurring digital
  { test: /APPLE\.COM\/BILL|APPLE\.COM|ICLOUD|SPOTIFY|NETFLIX|DISNEY|CRUNCHYROLL|YOUTUBE|GOOGLE\s*\*|OPENAI|CHATGPT|ROGERS|BELL CANADA|FIDO|TELUS|FREEDOM MOBILE|AUDIBLE|AMAZON PRIME|MICROSOFT|ADOBE|NOTION|GITHUB/, slug: "subscriptions" },
  // School
  { test: /BOOKSTORE|TUITION|UNIVERSITY|COLLEGE|\bUTM\b|\bUOFT\b|U OF T|REGISTRAR|CAMPUS|TEXTBOOK/, slug: "school" },
  // Health / pharmacy
  { test: /PHARMA|SHOPPERS DRUG|REXALL|DENTAL|DENTIST|CLINIC|MEDICAL|OPTICAL|PHYSIO|HOSPITAL|WELL\.CA|GUARDIAN/, slug: "health" },
  // Explore (travel: flights, hotels, etc.)
  { test: /AIR CANADA|WESTJET|FLAIR|PORTER AIR|EXPEDIA|BOOKING\.COM|AIRBNB|HOTEL|MARRIOTT|HILTON|AIRLINE|AIRPORT|FLIGHT/, slug: "explore" },
  // Tech / tools
  { test: /BEST BUY|CANADA COMPUTERS|NEWEGG|MEMORY EXPRESS|STAPLES|HOME DEPOT|CANADIAN TIRE|IKEA/, slug: "tech-tools" },
  // Shopping / retail
  { test: /AMAZON|AMZN|MINISO|PANDORA|VICTORIA'?S SECRET|AERIE|UNIQLO|ZARA|H&M|SEPHORA|MANGO|ARTIST STATION|GIFT|SMOKE & GIFT|STORE\b|RETAIL|MARSHALLS|WINNERS|LULULEMON/, slug: "shopping" },
  // Explore (social / entertainment / outings)
  { test: /CINEPLEX|CINEMA|MOVIE|THEATRE|THEATER|BAR\b|PUB\b|BREWERY|LCBO|BEER STORE|EVENTBRITE|TICKETMASTER|ARCADE|KARAOKE/, slug: "explore" },
];

// Bank "spend category" -> our slug, used when no keyword rule matches.
const CIBC_CATEGORY_FALLBACK: Record<string, string> = {
  Restaurants: "eating-out",
  "Retail and Grocery": "shopping",
  Transportation: "transit",
  "Personal and Household Expenses": "miscellaneous",
  "Professional and Financial Services": "miscellaneous",
  "Hotel, Entertainment and Recreation": "explore",
  "Home and Office Improvement": "tech-tools",
  "Health and Education": "health",
  "Foreign Currency Transactions": "miscellaneous",
  "Other Transactions": "miscellaneous",
};

// Default Need/Want guess per category slug. Editable per-row afterwards.
const NEED_WANT_BY_SLUG: Record<string, NeedWant> = {
  "rent-housing": "Need",
  groceries: "Need",
  transit: "Need",
  health: "Need",
  school: "Need",
  subscriptions: "Want",
  "eating-out": "Want",
  "coffee-snacks": "Want",
  shopping: "Want",
  explore: "Want",
  comfort: "Comfort",
};

export function guessCategory(
  description: string,
  bankCategory?: string | null,
  opts?: { amountCents?: number; mealNeedCents?: number },
): CategoryGuess {
  const desc = description.toUpperCase();

  let slug = "";
  for (const rule of RULES) {
    if (rule.test.test(desc)) {
      slug = rule.slug;
      break;
    }
  }

  if (!slug && bankCategory && CIBC_CATEGORY_FALLBACK[bankCategory.trim()]) {
    slug = CIBC_CATEGORY_FALLBACK[bankCategory.trim()];
  }

  if (!slug) slug = "miscellaneous";

  // Eating out is split by the per-meal threshold when we know the amount:
  // a cheap meal is a Need, a pricey one is Comfort.
  if (slug === MEAL_SPLIT_SLUG && opts?.amountCents !== undefined) {
    return {
      categorySlug: slug,
      needWant: mealFlag(
        opts.amountCents,
        opts.mealNeedCents ?? DEFAULT_MEAL_NEED_CENTS,
      ),
    };
  }

  return { categorySlug: slug, needWant: NEED_WANT_BY_SLUG[slug] ?? null };
}
