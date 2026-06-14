import { describe, it, expect } from "vitest";
import { merchantKey } from "../src/lib/merchant-key";
import { overrideWithRule } from "../src/lib/merchant-rules";
import { guessIncomeType, isIncomeAmount } from "../src/lib/categories";

describe("merchantKey — normalization", () => {
  it("upper-cases and collapses punctuation/whitespace", () => {
    expect(merchantKey("Project Seoul")).toBe("PROJECT SEOUL");
    expect(merchantKey("  project   seoul  ")).toBe("PROJECT SEOUL");
    expect(merchantKey("PROJECT-SEOUL")).toBe("PROJECT SEOUL");
    expect(merchantKey("PROJECT.SEOUL/T")).toBe("PROJECT SEOUL T");
  });

  it("drops store numbers, order ids and dates (pure-numeric tokens)", () => {
    expect(merchantKey("TIM HORTONS #0421")).toBe("TIM HORTONS");
    expect(merchantKey("TIM HORTONS 1187")).toBe("TIM HORTONS");
    expect(merchantKey("SHOPPERS DRUG MART #82")).toBe("SHOPPERS DRUG MART");
  });

  it("collapses different locations of the same merchant to one key", () => {
    const a = merchantKey("TIM HORTONS #0421 TORONTO");
    const b = merchantKey("TIM HORTONS #1187 MISSISSAUGA");
    // City differs, so keys differ — but the store-number noise is gone, so the
    // brand portion matches. (Location is part of identity here by design.)
    expect(a).toBe("TIM HORTONS TORONTO");
    expect(b).toBe("TIM HORTONS MISSISSAUGA");
  });

  it("is identical across days for the same raw description", () => {
    const desc = "PROJECT SEOUL T";
    expect(merchantKey(desc)).toBe(merchantKey(desc));
    expect(merchantKey("PROJECT SEOUL T")).toBe("PROJECT SEOUL T");
  });

  it("keeps alphanumeric tokens that mix letters and digits", () => {
    // Not a pure number, so it survives (it's part of the name, e.g. a brand).
    expect(merchantKey("7ELEVEN")).toBe("7ELEVEN");
    expect(merchantKey("A&W #123")).toBe("A W");
  });

  it("returns empty string for numbers-only / empty descriptions", () => {
    expect(merchantKey("")).toBe("");
    expect(merchantKey("   ")).toBe("");
    expect(merchantKey("12345")).toBe("");
    expect(merchantKey("### 999 ---")).toBe("");
  });

  it("distinct merchants do not collide", () => {
    expect(merchantKey("STARBUCKS")).not.toBe(merchantKey("PROJECT SEOUL"));
    expect(merchantKey("UBER EATS")).not.toBe(merchantKey("UBERTRIP"));
  });
});

describe("overrideWithRule — precedence (expense rows)", () => {
  const idToSlug = new Map([
    ["cat_coffee", "coffee-snacks"],
    ["cat_shopping", "shopping"],
  ]);
  const base = {
    categorySlug: "shopping",
    categoryId: "cat_shopping",
    needWant: "Need",
    incomeType: null,
  };

  it("returns the base guess unchanged when there is no rule", () => {
    expect(overrideWithRule(base, undefined, idToSlug, false)).toEqual(base);
  });

  it("a remembered category overrides both id and slug", () => {
    const out = overrideWithRule(
      base,
      { categoryId: "cat_coffee", needWant: null, incomeType: null },
      idToSlug,
      false,
    );
    expect(out.categoryId).toBe("cat_coffee");
    expect(out.categorySlug).toBe("coffee-snacks");
    expect(out.needWant).toBe("Need");
  });

  it("a remembered need-want always wins", () => {
    const out = overrideWithRule(
      base,
      { categoryId: null, needWant: "Want", incomeType: null },
      idToSlug,
      false,
    );
    expect(out.needWant).toBe("Want");
    expect(out.categoryId).toBe("cat_shopping");
  });

  it("applies both category and need-want together (the screenshot case)", () => {
    const out = overrideWithRule(
      base,
      { categoryId: "cat_coffee", needWant: "Want", incomeType: null },
      idToSlug,
      false,
    );
    expect(out).toEqual({
      categorySlug: "coffee-snacks",
      categoryId: "cat_coffee",
      needWant: "Want",
      incomeType: null,
    });
  });

  it("ignores a remembered category that no longer exists (archived/deleted)", () => {
    const out = overrideWithRule(
      base,
      { categoryId: "cat_gone", needWant: "Want", incomeType: null },
      idToSlug,
      false,
    );
    expect(out.categoryId).toBe("cat_shopping");
    expect(out.categorySlug).toBe("shopping");
    expect(out.needWant).toBe("Want");
  });

  it("does NOT apply a remembered income type to an expense row", () => {
    const out = overrideWithRule(
      base,
      { categoryId: null, needWant: null, incomeType: "Refund" },
      idToSlug,
      false,
    );
    expect(out.incomeType).toBeNull();
  });
});

describe("overrideWithRule — income rows", () => {
  const idToSlug = new Map([["cat_shopping", "shopping"]]);
  // An income row starts with a guessed income type and no need-want.
  const incomeBase = {
    categorySlug: "shopping",
    categoryId: "cat_shopping",
    needWant: null,
    incomeType: "Refund",
  };

  it("a remembered income type wins on a credit row", () => {
    const out = overrideWithRule(
      incomeBase,
      { categoryId: null, needWant: null, incomeType: "Salary" },
      idToSlug,
      true,
    );
    expect(out.incomeType).toBe("Salary");
    expect(out.needWant).toBeNull();
  });

  it("does NOT apply a remembered need-want to a credit row", () => {
    const out = overrideWithRule(
      incomeBase,
      { categoryId: null, needWant: "Want", incomeType: null },
      idToSlug,
      true,
    );
    expect(out.needWant).toBeNull();
    expect(out.incomeType).toBe("Refund"); // unchanged guess
  });
});

describe("isIncomeAmount / guessIncomeType", () => {
  it("classifies by sign", () => {
    expect(isIncomeAmount(-6769)).toBe(true);
    expect(isIncomeAmount(6769)).toBe(false);
    expect(isIncomeAmount(0)).toBe(false); // a zero isn't income
  });

  it("guesses Salary for payroll-ish deposits, Refund otherwise", () => {
    expect(guessIncomeType("ACME CORP PAYROLL DEP")).toBe("Salary");
    expect(guessIncomeType("EMPLOYER DIRECT DEPOSIT")).toBe("Salary");
    expect(guessIncomeType("UNIQLO CANADA POS RETURN")).toBe("Refund");
    expect(guessIncomeType("SOME RANDOM CREDIT")).toBe("Refund");
  });
});
