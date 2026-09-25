// Centralized AI Model & Provider Pricing (USD per 1M tokens).
// Approximate cost estimates for observability, metering, and admin cost monitoring.
import type { ProviderType } from "./providers/types";

export interface Price {
  input: number;
  output: number;
}

// Fallback pricing per provider type (USD per 1M tokens)
export const PRICING: Record<ProviderType, Price> = {
  groq:       { input: 0.59, output: 0.79 },
  openai:     { input: 2.50, output: 10.00 },
  anthropic:  { input: 3.00, output: 15.00 },
  gemini:     { input: 1.25, output: 5.00 },
  openrouter: { input: 0.50, output: 1.50 },
  ollama:     { input: 0,    output: 0 },
  lmstudio:   { input: 0,    output: 0 },
};

// Specific model pricing (USD per 1M tokens)
export const AI_MODEL_PRICING: Record<string, Price> = {
  // OpenAI
  "gpt-4o":                   { input: 2.50, output: 10.00 },
  "gpt-4o-2024-08-06":        { input: 2.50, output: 10.00 },
  "gpt-4o-mini":              { input: 0.15, output: 0.60 },
  "gpt-4-turbo":              { input: 10.00, output: 30.00 },
  "o1-preview":               { input: 15.00, output: 60.00 },
  "o1-mini":                  { input: 3.00, output: 12.00 },
  "text-embedding-3-small":   { input: 0.02, output: 0 },
  "text-embedding-3-large":   { input: 0.13, output: 0 },

  // Anthropic
  "claude-3-5-sonnet":          { input: 3.00, output: 15.00 },
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
  "claude-3-5-sonnet-20240620": { input: 3.00, output: 15.00 },
  "claude-3-haiku":             { input: 0.25, output: 1.25 },
  "claude-3-haiku-20240307":    { input: 0.25, output: 1.25 },
  "claude-3-opus":              { input: 15.00, output: 75.00 },

  // Google Gemini
  "gemini-1.5-pro":           { input: 1.25, output: 5.00 },
  "gemini-1.5-flash":         { input: 0.075, output: 0.30 },
  "gemini-2.0-flash":         { input: 0.10, output: 0.40 },
  "gemini-2.0-flash-exp":     { input: 0.10, output: 0.40 },

  // Groq / Meta Llama
  "llama-3.3-70b-versatile":  { input: 0.59, output: 0.79 },
  "llama-3.1-70b-versatile":  { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant":     { input: 0.05, output: 0.08 },
  "llama-3-70b":              { input: 0.59, output: 0.79 },
  "llama-3-8b":               { input: 0.05, output: 0.08 },
  "mixtral-8x7b-32768":       { input: 0.24, output: 0.24 },
  "openai/gpt-oss-120b":      { input: 0.15, output: 0.60 },

  // OpenRouter defaults
  "deepseek/deepseek-chat-v3": { input: 0.14, output: 0.28 },
  "deepseek/deepseek-r1":      { input: 0.55, output: 2.19 },
};

/**
 * Resolves rates for a given provider and model name.
 */
export function resolveModelPrice(provider?: string | null, model?: string | null): Price {
  if (model) {
    const direct = AI_MODEL_PRICING[model];
    if (direct) return direct;

    // Substring search for common model keys (e.g. "gpt-4o", "claude-3-5-sonnet")
    const lower = model.toLowerCase();
    for (const [key, price] of Object.entries(AI_MODEL_PRICING)) {
      if (lower.includes(key.toLowerCase())) {
        return price;
      }
    }
  }

  const pType = (provider?.toLowerCase() ?? "") as ProviderType;
  if (pType && PRICING[pType]) {
    return PRICING[pType];
  }

  // General default fallback
  return { input: 0.50, output: 1.50 };
}

/**
 * Calculates estimated AI cost in USD from input/output or total tokens.
 */
export function calculateEstimatedCost(args: {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}): number {
  const price = resolveModelPrice(args.provider, args.model);

  const inp = Number(args.inputTokens ?? 0);
  const out = Number(args.outputTokens ?? 0);
  const tot = Number(args.totalTokens ?? 0);

  if (inp > 0 || out > 0) {
    const cost = (inp / 1_000_000) * price.input + (out / 1_000_000) * price.output;
    return Number(cost.toFixed(6));
  }

  if (tot > 0) {
    // Estimate 65% input, 35% output when tokens are not broken down
    const estimatedInp = tot * 0.65;
    const estimatedOut = tot * 0.35;
    const cost = (estimatedInp / 1_000_000) * price.input + (estimatedOut / 1_000_000) * price.output;
    return Number(cost.toFixed(6));
  }

  return 0;
}

/**
 * Preserved for backwards compatibility with existing callers.
 */
export function estimateCost(type: ProviderType, inputTokens: number, outputTokens: number): number {
  const p = PRICING[type] ?? { input: 0.15, output: 0.60 };
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

/**
 * Format a USD cost value for admin display.
 */
export function formatUsdCost(cost: number | null | undefined): string {
  const num = Number(cost ?? 0);
  if (num === 0) return "$0.00";
  if (num < 0.01) return "< $0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
