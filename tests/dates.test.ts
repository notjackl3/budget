import { describe, it, expect } from "vitest";
import { isValidYmd, ymdToDate, dateToYMD, monthRange } from "@/lib/dates";

describe("isValidYmd", () => {
  it("accepts real calendar dates", () => {
    expect(isValidYmd("2026-06-14")).toBe(true);
    expect(isValidYmd("2024-02-29")).toBe(true); // leap year
    expect(isValidYmd("2000-01-01")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd("garbage")).toBe(false);
    expect(isValidYmd("2026-6-14")).toBe(false); // unpadded
    expect(isValidYmd("2026/06/14")).toBe(false);
    expect(isValidYmd("2026-06-14T00:00")).toBe(false);
    expect(isValidYmd("06-14-2026")).toBe(false);
  });

  it("rejects out-of-range and overflow dates", () => {
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("2026-00-10")).toBe(false);
    expect(isValidYmd("2026-02-30")).toBe(false); // would roll forward
    expect(isValidYmd("2025-02-29")).toBe(false); // not a leap year
    expect(isValidYmd("2026-04-31")).toBe(false);
  });
});

describe("ymdToDate", () => {
  it("returns a local-noon Date for valid input", () => {
    const d = ymdToDate("2026-06-14");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(12);
  });

  it("round-trips with dateToYMD", () => {
    for (const ymd of ["2026-06-14", "2024-02-29", "2025-12-31"]) {
      expect(dateToYMD(ymdToDate(ymd))).toBe(ymd);
    }
  });

  it("throws on invalid input rather than yielding Invalid Date", () => {
    expect(() => ymdToDate("garbage")).toThrow();
    expect(() => ymdToDate("2026-02-30")).toThrow();
    expect(() => ymdToDate("")).toThrow();
  });
});

describe("monthRange", () => {
  it("spans the whole month", () => {
    const { start, end } = monthRange("2026-02");
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(1);
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
    expect(end.getMonth()).toBe(1);
  });
});
