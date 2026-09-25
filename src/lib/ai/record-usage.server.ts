// Central AI Usage Metering & Observability Recorder. Server-only.
//
// INVARIANT: Metering failure must NEVER break, delay, or block an AI call,
// pipeline stage, or legal case. This function is fire-and-forget and safe.
//
// Never stores confidential case facts, prompts, documents, or responses.
// Records only operational metadata: tokens, provider, model, latency, and estimated cost.

import { calculateEstimatedCost } from "./pricing";

export interface RecordAIUsageArgs {
  userId?: string | null;
  organizationId?: string | null;
  caseId?: string | null;
  executionId?: string | null;
  provider?: string | null;
  model: string;
  operation?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  success?: boolean;
  error?: string | null;
  groqKeyId?: string | null;
}

/**
 * Centrally records an AI usage event into `ai_usage`.
 * Non-blocking, best-effort. Catches and logs all errors without rethrowing.
 */
export async function recordAIUsage(args: RecordAIUsageArgs): Promise<void> {
  // Fire and forget - never block the caller
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const totalTokens =
      args.totalTokens ??
      ((args.inputTokens ?? 0) + (args.outputTokens ?? 0) > 0
        ? (args.inputTokens ?? 0) + (args.outputTokens ?? 0)
        : null);

    const estimatedCostUsd = calculateEstimatedCost({
      provider: args.provider,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens,
    });

    let effectiveUserId = args.userId ?? null;
    let effectiveOrgId = args.organizationId ?? null;

    // If userId was not passed but caseId exists, attempt best-effort lookup from cases
    if (!effectiveUserId && args.caseId) {
      try {
        const { data: caseRow } = await supabaseAdmin
          .from("cases")
          .select("user_id")
          .eq("id", args.caseId)
          .maybeSingle();
        if (caseRow?.user_id) {
          effectiveUserId = caseRow.user_id;
        }
      } catch {
        // Silently continue
      }
    }

    // Best-effort organization lookup if not provided
    if (effectiveUserId && !effectiveOrgId) {
      try {
        const { data: membership } = await supabaseAdmin
          .from("org_memberships")
          .select("org_id")
          .eq("user_id", effectiveUserId)
          .eq("status", "active")
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (membership?.org_id) {
          effectiveOrgId = membership.org_id;
        }
      } catch {
        // Silently continue
      }
    }

    // Fall back to a system/admin identifier if userId is null so row constraint passes
    if (!effectiveUserId) {
      // In Supabase, ai_usage.user_id has NOT NULL REFERENCES auth.users(id).
      // If no user context exists at all, skip insert to prevent foreign key error.
      return;
    }

    const row: Record<string, unknown> = {
      user_id: effectiveUserId,
      case_id: args.caseId ?? null,
      provider_type: args.provider ?? null,
      model: args.model || "unknown",
      operation: args.operation || "completion",
      input_tokens: args.inputTokens ?? null,
      output_tokens: args.outputTokens ?? null,
      total_tokens: totalTokens,
      latency_ms: args.latencyMs != null ? Math.round(args.latencyMs) : null,
      success: args.success !== false,
      error: args.error ? String(args.error).slice(0, 1000) : null,
      groq_key_id: args.groqKeyId ?? null,
      estimated_cost_usd: estimatedCostUsd,
      execution_id: args.executionId ?? null,
      organization_id: effectiveOrgId,
    };

    const { error: insertErr } = await supabaseAdmin.from("ai_usage").insert(row as any);
    if (insertErr) {
      // Log as operational diagnostic, never throw
      console.warn("[ai-usage] Failed to record usage event (observability only):", insertErr.message);
    }
  } catch (err) {
    // Non-blocking catch
    console.warn("[ai-usage] Exception recording AI usage event:", err instanceof Error ? err.message : String(err));
  }
}
