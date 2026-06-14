import { describe, it, expect } from "vitest";
import {
  ASSET_CLASSES,
  ASSET_CLASS_BY_ID,
  PROFILES,
  blendProfile,
} from "@/lib/portfolio-library";
import { projectScenarios } from "@/lib/projection";

describe("portfolio library data", () => {
  it("every profile's allocations sum to 100", () => {
    for (const p of PROFILES) {
      const total = p.allocations.reduce((a, x) => a + x.percent, 0);
      expect(total, `profile ${p.id} sums to 100`).toBe(100);
    }
  });

  it("every allocation references a known asset class", () => {
    for (const p of PROFILES) {
      for (const a of p.allocations) {
        expect(ASSET_CLASS_BY_ID[a.classId], `${p.id} -> ${a.classId}`).toBeDefined();
      }
    }
  });

  it("every asset class has at least one CA and one US ETF", () => {
    for (const c of ASSET_CLASSES) {
      expect(c.caEtfs.length, `${c.id} CA etfs`).toBeGreaterThan(0);
      expect(c.usEtfs.length, `${c.id} US etfs`).toBeGreaterThan(0);
    }
  });

  it("asset class ids are unique", () => {
    const ids = ASSET_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("blendProfile", () => {
  it("returns a higher expected return for tech-focused than conservative", () => {
    const tech = PROFILES.find((p) => p.id === "tech")!;
    const conservative = PROFILES.find((p) => p.id === "conservative")!;
    const t = blendProfile(tech.allocations)!;
    const c = blendProfile(conservative.allocations)!;
    expect(t.annualReturn).toBeGreaterThan(c.annualReturn);
    expect(t.annualVol).toBeGreaterThan(c.annualVol);
  });

  it("weights returns by allocation percentage", () => {
    // 50% usLarge (10%) + 50% bonds (4.5%) => 7.25%
    const blended = blendProfile([
      { classId: "usLarge", percent: 50 },
      { classId: "bonds", percent: 50 },
    ])!;
    expect(blended.annualReturn).toBeCloseTo((0.1 + 0.045) / 2, 6);
  });

  it("normalizes when percentages don't sum to 100", () => {
    const blended = blendProfile([
      { classId: "usLarge", percent: 10 },
      { classId: "bonds", percent: 10 },
    ])!;
    expect(blended.annualReturn).toBeCloseTo((0.1 + 0.045) / 2, 6);
  });

  it("returns null when nothing usable is allocated", () => {
    expect(blendProfile([])).toBeNull();
    expect(blendProfile([{ classId: "usLarge", percent: 0 }])).toBeNull();
  });
});

describe("projectScenarios with a blended profile", () => {
  it("keeps best >= average >= worst at the final year", () => {
    const stats = blendProfile(PROFILES[0].allocations)!;
    const points = projectScenarios({
      startCents: 1_000_000,
      monthlyContributionCents: 50_000,
      stats,
      years: 20,
    });
    const end = points[points.length - 1];
    expect(end.bestCents).toBeGreaterThanOrEqual(end.averageCents);
    expect(end.averageCents).toBeGreaterThanOrEqual(end.worstCents);
  });
});
