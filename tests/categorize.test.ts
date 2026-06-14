import { describe, it, expect } from "vitest";
import { guessCategory } from "@/lib/categorize";

describe("guessCategory — merchant keyword rules", () => {
  const cases: [string, string | null, string][] = [
    ["UBER CANADA/UBEREATS TORONTO", "Restaurants", "eating-out"],
    // Rideshare trips (getting somewhere) map to transit, alongside passes/fuel.
    ["UBER CANADA/UBERTRIP TORONTO", "Transportation", "transit"],
    ["LYFT *RIDE THU 8PM VANCOUVER", "Transportation", "transit"],
    ["PRESTO FARE/TTC TORONTO", "Transportation", "transit"],
    ["STARBUCKS #123 TORONTO", "Restaurants", "coffee-snacks"],
    ["TIM HORTONS #456", "Restaurants", "coffee-snacks"],
    ["WAL-MART SUPERCENTER#3654 MISSISSAUGA", "Retail and Grocery", "groceries"],
    ["T&T SUPERMARKET #015 MISSISSAUGA", "Retail and Grocery", "groceries"],
    ["APPLE.COM/BILL 866-712-7753", "Retail and Grocery", "subscriptions"],
    ["SPOTIFY P0ABCDEF", "Retail and Grocery", "subscriptions"],
    ["UTM BOOKSTORE MISS", "Retail and Grocery", "school"],
    ["SHOPPERS DRUG MART #123", "Retail and Grocery", "groceries"],
    ["AIR CANADA TORONTO", "Transportation", "explore"],
    ["MINISO CANADA TORONTO", "Retail and Grocery", "shopping"],
    ["CINEPLEX ODEON", "Hotel, Entertainment and Recreation", "explore"],
  ];
  for (const [desc, bank, expected] of cases) {
    it(`${desc} -> ${expected}`, () => {
      expect(guessCategory(desc, bank).categorySlug).toBe(expected);
    });
  }
});

describe("guessCategory — bank category fallback", () => {
  it("uses the bank hint when no keyword matches", () => {
    expect(guessCategory("SOME UNKNOWN MERCHANT", "Restaurants").categorySlug).toBe(
      "eating-out",
    );
    expect(
      guessCategory("RANDO SHOP 123", "Retail and Grocery").categorySlug,
    ).toBe("shopping");
    expect(
      guessCategory("MYSTERY", "Personal and Household Expenses").categorySlug,
    ).toBe("miscellaneous");
  });

  it("falls back to miscellaneous when nothing matches", () => {
    expect(guessCategory("ZZZ", null).categorySlug).toBe("miscellaneous");
  });
});

describe("guessCategory — need/want guess", () => {
  it("marks essentials as Need and discretionary as Want", () => {
    expect(guessCategory("WAL-MART", "Retail and Grocery").needWant).toBe("Need");
    expect(guessCategory("UBER EATS", "Restaurants").needWant).toBe("Want");
    expect(guessCategory("ZZZ", null).needWant).toBeNull();
  });

  it("marks rideshare trips as Comfort (a need bought in premium form)", () => {
    expect(guessCategory("UBER CANADA/UBERTRIP TORONTO").needWant).toBe(
      "Comfort",
    );
    expect(guessCategory("LYFT *RIDE SAT 9PM VANCOUVER").needWant).toBe(
      "Comfort",
    );
  });

  it("splits eating out by the per-meal threshold when amount is known", () => {
    // Under the $15 floor → Need; over → Comfort.
    expect(
      guessCategory("SOME SUSHI PLACE", "Restaurants", { amountCents: 1200 })
        .needWant,
    ).toBe("Need");
    expect(
      guessCategory("SOME SUSHI PLACE", "Restaurants", { amountCents: 2500 })
        .needWant,
    ).toBe("Comfort");
    // Custom threshold is respected.
    expect(
      guessCategory("SOME SUSHI PLACE", "Restaurants", {
        amountCents: 1200,
        mealNeedCents: 1000,
      }).needWant,
    ).toBe("Comfort");
  });
});
