import { describe, it, expect } from "vitest";
import {
  calculateEstimatedCost,
  estimateCost,
  formatUsdCost,
  resolveModelPrice,
  AI_MODEL_PRICING,
  PRICING,
} from "../pricing";
import { normalizePlan, normalizeStatus } from "../../admin-ai-usage.functions";

describe("Admin Subscriber AI Usage & Cost Monitor - Pricing", () => {
  it("resolves specific model prices correctly", () => {
    const gpt4o = resolveModelPrice("openai", "gpt-4o");
    expect(gpt4o.input).toBe(2.50);
    expect(gpt4o.output).toBe(10.00);

    const claudeSonnet = resolveModelPrice("anthropic", "claude-3-5-sonnet-20241022");
    expect(claudeSonnet.input).toBe(3.00);
    expect(claudeSonnet.output).toBe(15.00);

    const llama70b = resolveModelPrice("groq", "llama-3.3-70b-versatile");
    expect(llama70b.input).toBe(0.59);
    expect(llama70b.output).toBe(0.79);
  });

  it("calculates cost accurately from input and output tokens", () => {
    // 100,000 input tokens and 20,000 output tokens for gpt-4o:
    // (100,000 / 1,000,000) * 2.50 + (20,000 / 1,000,000) * 10.00 = 0.25 + 0.20 = 0.45
    const cost = calculateEstimatedCost({
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 100_000,
      outputTokens: 20_000,
    });
    expect(cost).toBeCloseTo(0.45, 4);
  });

  it("falls back to blended total tokens when input/output breakdown is unavailable", () => {
    // 100,000 total tokens with llama-3-70b
    const cost = calculateEstimatedCost({
      provider: "groq",
      model: "llama-3-70b",
      totalTokens: 100_000,
    });
    expect(cost).toBeGreaterThan(0);
  });

  it("formats USD cost cleanly", () => {
    expect(formatUsdCost(0)).toBe("$0.00");
    expect(formatUsdCost(0.004)).toBe("< $0.01");
    expect(formatUsdCost(0.42)).toBe("$0.42");
    expect(formatUsdCost(14.72)).toBe("$14.72");
    expect(formatUsdCost(287.41)).toBe("$287.41");
  });

  it("preserves backwards-compatible estimateCost export", () => {
    const cost = estimateCost("groq", 1_000_000, 1_000_000);
    expect(cost).toBe(PRICING.groq.input + PRICING.groq.output);
  });
});

describe("Admin Subscriber AI Usage & Cost Monitor - Normalization", () => {
  it("normalizes plans to friendly labels and canonical keys", () => {
    expect(normalizePlan("solo").label).toBe("Single User");
    expect(normalizePlan("firm").label).toBe("Pro");
    expect(normalizePlan("pro").label).toBe("Pro");
    expect(normalizePlan("enterprise").label).toBe("Enterprise");
    expect(normalizePlan(null, true).label).toBe("Trial");
    expect(normalizePlan("trial").label).toBe("Trial");
  });

  it("normalizes statuses to friendly labels and canonical keys", () => {
    expect(normalizeStatus("active").label).toBe("Active");
    expect(normalizeStatus("trialing").label).toBe("Trialing");
    expect(normalizeStatus("past_due").label).toBe("Past Due");
    expect(normalizeStatus("canceled").label).toBe("Canceled");
    expect(normalizeStatus(null).label).toBe("Inactive");
  });
});
