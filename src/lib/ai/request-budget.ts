// Deployment request envelope observed in Groq TPM413 responses. Context-window
// size is not permission to exceed this account's per-request TPM envelope.
import { createHash } from 'node:crypto';

export const GROQ_REQUEST_TOKEN_LIMIT = 32_000;
export const REQUEST_TOKEN_HEADROOM = 256;

/** Explicit deployment limits verified for individual keys, never a tier assumption. */
export function groqRequestTokenLimit(apiKey?: string | null): number {
  if (!apiKey) return GROQ_REQUEST_TOKEN_LIMIT;
  try {
    const limits = JSON.parse(process.env.GROQ_KEY_REQUEST_TOKEN_LIMITS ?? '{}');
    const fingerprint = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    const limit = limits[fingerprint];
    if (Number.isSafeInteger(limit) && limit >= 1024 && limit <= 131072) return limit;
  } catch { /* Invalid configuration keeps the conservative default. */ }
  return GROQ_REQUEST_TOKEN_LIMIT;
}

export function groqOutputTokens(opts: { maxTokens?: number; json?: boolean }): number {
  const requested = opts.maxTokens ?? (opts.json ? 2_048 : 4_096);
  return Math.max(1, Math.min(Math.floor(requested), 4_096));
}

/** maxTokens is an upper bound. Preserve the input and fit completion into the request envelope. */
export function groqRequestOutputBudget(opts: {maxTokens?: number; json?: boolean}, inputTokens: number, requestLimit = GROQ_REQUEST_TOKEN_LIMIT): number | null {
  const requested = groqOutputTokens(opts);
  const available = Math.floor(requestLimit - REQUEST_TOKEN_HEADROOM - inputTokens);
  // Retain explicitly small caller budgets, but do not create unusably tiny
  // completions just to make a large input appear eligible.
  if (available < Math.min(requested, 256)) return null;
  return Math.min(requested, available);
}

/** Conservative estimate including UTF-8 text and message framing, not a tokenizer count. */
export function estimateRequestInputTokens(opts: { systemInstruction?: string; userContent: unknown }): number {
  const text = (value: string) => Math.ceil(new TextEncoder().encode(value).length / 3);
  let tokens = 32 + text(opts.systemInstruction ?? "");
  if (typeof opts.userContent === "string") tokens += text(opts.userContent);
  else if (Array.isArray(opts.userContent)) for (const part of opts.userContent) {
    tokens += part && typeof part === "object" && "text" in part ? text(String(part.text ?? "")) + 8 : 1_500;
  }
  return tokens;
}

/** One lossless retry uses the provider's actual requested/limit counters. */
export function outputBudgetAfterTpm413(message: string, currentOutput: number): number | null {
  if (!/HTTP 413/i.test(message)) return null;
  const limit = Number(message.match(/Limit\s*[:=]?\s*([\d,]+)/i)?.[1]?.replaceAll(",", ""));
  const requested = Number(message.match(/Requested\s*[:=]?\s*([\d,]+)/i)?.[1]?.replaceAll(",", ""));
  if (!Number.isFinite(limit) || !Number.isFinite(requested) || requested <= limit) return null;
  const next = Math.floor(currentOutput - (requested - limit) - REQUEST_TOKEN_HEADROOM);
  return next >= 256 && next < currentOutput ? next : null;
}
