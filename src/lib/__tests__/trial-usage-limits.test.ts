import { describe, expect, it } from "vitest";

function trialDailyLimit(monthlyLimit: number | null): number | null {
  return monthlyLimit == null ? null : Math.ceil(monthlyLimit / 30);
}

describe("trial daily usage limits", () => {
  it("limits Basic AI usage to 5 requests per day from 150 monthly", () => {
    expect(trialDailyLimit(150)).toBe(5);
  });

  it("limits Basic Talk-to-Case to 1 per day from 30 monthly", () => {
    expect(trialDailyLimit(30)).toBe(1);
  });

  it("limits Pro AI usage to 25 requests per day from 750 monthly", () => {
    expect(trialDailyLimit(750)).toBe(25);
  });

  it("limits Pro Talk-to-Case to 5 per day from 150 monthly", () => {
    expect(trialDailyLimit(150)).toBe(5);
  });

  it("rounds partial daily allowances upward", () => {
    expect(trialDailyLimit(31)).toBe(2);
  });

  it("preserves unlimited plans", () => {
    expect(trialDailyLimit(null)).toBeNull();
  });
});