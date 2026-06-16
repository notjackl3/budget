import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkPassword } from "@/lib/auth";

describe("checkPassword", () => {
  const original = process.env.APP_PASSWORD;
  afterEach(() => {
    process.env.APP_PASSWORD = original;
  });

  it("accepts the exact password", () => {
    process.env.APP_PASSWORD = "correct horse battery staple";
    expect(checkPassword("correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", () => {
    process.env.APP_PASSWORD = "s3cret";
    expect(checkPassword("s3cre")).toBe(false);
    expect(checkPassword("s3cret ")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("rejects everything when no password is configured", () => {
    delete process.env.APP_PASSWORD;
    expect(checkPassword("")).toBe(false);
    expect(checkPassword("anything")).toBe(false);
  });

  it("is not fooled by length differences (digest comparison)", () => {
    process.env.APP_PASSWORD = "short";
    expect(checkPassword("a-very-long-guess-that-differs")).toBe(false);
  });
});
