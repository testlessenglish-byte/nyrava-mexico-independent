// Client-callable entry point for the 13-agent pipeline.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { AGENT_DEFINITIONS } from "@/lib/agents/types";

type Db = SupabaseClient<Database>;
type AuthContext = { supabase?: Db; userId?: string };

type AgentLogRow = { agent_key?: string | null; agent_index?: number | null; created_at?: string | null };

/**
 * Pure dedup step for getAgentLogs' default (no explicit runId) view. See
 * that handler's doc comment for WHY this exists: the 13-agent pipeline
 * writes agent_logs under TWO different run_ids per case (a 13-agent
 * preliminary pass, then a 4-agent final-release-review pass that always
 * runs last) — naively scoping to "the single most recent run_id" silently
 * drops the other 9 agents from every live view once a pipeline finishes.
 * `rows` MUST already be ordered newest-first by created_at; this keeps the
 * first (= newest) row seen per agent_key and discards the rest, then
 * re-sorts by agent_index for stable display order.
 */
export function latestRowPerAgentKey<T extends AgentLogRow>(rows: readonly T[]): T[] {
  const latestPerAgent = new Map<string, T>();
  for (const row of rows) {
    const key = String(row.agent_key ?? "");
    if (key && !latestPerAgent.has(key)) latestPerAgent.set(key, row);
  }
  return [...latestPerAgent.values()].sort(
    (a, b) => Number(a.agent_index ?? 0) - Number(b.agent_index ?? 0),
  );
}

async function getAuthedContext(context: AuthContext, label: string) {
  if (context?.supabase && context.userId) {
    return { supabase: context.supabase, userId: context.userId };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error(`[${label}] backend env unavailable`);
  const { getRequest } = await import("@tanstack/react-start/server");
  const authHeader = getRequest()?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error(`[${label}] signed-in session was not attached`);
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error(`[${label}] session invalid`);
  return { supabase, userId: data.claims.sub };
}

export const runMultiAgentAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await getAuthedContext(context, "MultiAgent");
    // Groq temporarily removed — see pipeline-runner.server.ts for details.
    // Router still resolves this user's active keys (Gemini) via userId.
    const apiKey = "";
    const keys: string[] = [];
    const { runMultiAgentPipeline } = await import("@/lib/agents/orchestrator.server");
    return runMultiAgentPipeline({
      db: supabase,
      userId,
      caseId: data.caseId,
      apiKey,
      apiKeys: keys,
      // Manual/admin reruns are analytical passes, not final release
      // reviews. A report may not exist yet; only runFinalReleaseReview()
      // may assign the terminal case status after Report Writer saves it.
      deferRelease: true,
    });
  });

export const getAgentLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(), runId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await getAuthedContext(context, "AgentLogs");
    if (data.runId) {
      // Explicit request for ONE specific historical run (e.g. an admin
      // inspecting a past run's raw log) — return exactly that run's rows,
      // unmodified.
      const { data: rows, error } = await supabase
        .from("agent_logs")
        .select("*")
        .eq("case_id", data.caseId)
        .eq("run_id", data.runId)
        .order("agent_index", { ascending: true });
      if (error) throw new Error(error.message);
      return { agents: AGENT_DEFINITIONS, logs: rows ?? [], runId: data.runId };
    }
    // Default (live case view): the 13-agent pipeline runs in TWO passes per
    // case — a preliminary pass covering all 13 agents (deferRelease:true),
    // then runFinalReleaseReview() as the pipeline's LAST step, which
    // re-runs only 4 gate agents (report/qa/judge/hallucination) under a
    // BRAND NEW run_id. Resolving "no runId" to "the single most recently
    // created run_id" (the previous behavior) therefore always resolved to
    // that narrower final-review run once a pipeline finished — silently
    // dropping the other 9 agents from every live view permanently after
    // every completed run (the reported bug: 13/13 executed mid-run,
    // 4/13 once "Report Generator completed" fires). Instead, take the
    // latest row PER agent_key across every run_id for this case — the
    // same aggregation buildAgentStatistics() (statistics.server.ts) already
    // uses server-side for the report's own persisted snapshot, so the live
    // view and the snapshot agree.
    const { data: rows, error } = await supabase
      .from("agent_logs")
      .select("*")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const logs = latestRowPerAgentKey(rows ?? []);
    const runId = (rows?.[0] as { run_id?: string } | undefined)?.run_id;
    return { agents: AGENT_DEFINITIONS, logs, runId };
  });


/** Run one review, then hand any changed inputs back to the report worker. */
export const rerunSingleAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(),
    agentKey: z.string().refine(key => AGENT_DEFINITIONS.some(agent => agent.key === key), "Unknown agent"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await getAuthedContext(context, "SingleAgent");
    const { data: roles, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (roleError) throw new Error(roleError.message);
    // Subscribers may regenerate reports for cases accessible through RLS.
    // The remaining diagnostic agent controls stay administrator-only.
    if (data.agentKey !== "report" && !roles?.some(row => ["admin", "super_admin", "firm_admin"].includes(row.role))) throw new Error("Admin access required");
    // RLS still controls access to this case; the role check does not bypass it.
    const lease = new Date(Date.now() + 120_000).toISOString();
    const { data: locked, error: lockError } = await supabase.from("cases")
      .update({ worker_lease_until: lease })
      .eq("id", data.caseId).is("next_stage", null)
      .or("worker_lease_until.is.null,worker_lease_until.lt." + new Date().toISOString())
      .select("id,execution_id,case_analysis_mode").maybeSingle();
    if (lockError) throw new Error(lockError.message);
    if (!locked) throw new Error("Case unavailable or already running. Wait for the current run to finish.");
    try {
      const { isCompletedCaseMode, normalizeCaseAnalysisMode } = await import("@/lib/intelligence/case-analysis-mode");
      if (data.agentKey === "report" && isCompletedCaseMode(normalizeCaseAnalysisMode(locked.case_analysis_mode))) {
        // Explicit report retries may retry a failed prerequisite once.
        // Normal worker continuations still respect the failure marker.
        const { ensureDecisionReconstruction } = await import("@/lib/intelligence/decision-reconstruction-extractor.server");
        await ensureDecisionReconstruction(supabase, data.caseId, userId, undefined, true);
      }
      const { data: previous, error: previousError } = await supabase.from("agent_logs")
        .select("status,output,errors").eq("case_id", data.caseId).eq("agent_key", data.agentKey)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error(previousError.message);
      const { runSingleAgentReview } = await import("@/lib/agents/orchestrator.server");
      const review = await runSingleAgentReview({ db: supabase, userId, caseId: data.caseId,
        apiKey: "", apiKeys: [], executionId: locked.execution_id ?? undefined, deferRelease: true }, data.agentKey);
      const { agentReviewChanged } = await import("@/lib/agents/single-review");
      const changed = agentReviewChanged(previous, review.result);
      // Queue the existing report stage, whose final release review remains mandatory.
      // Keep the execution id so upstream evidence remains associated with this case run.
      const reportQueued = changed || data.agentKey === "report";
      if (reportQueued) {
        // A deliberate retry must not reuse failed or stale narrative chunks.
        // Keep the previous report for review; only discard the resumable cache.
        const { error: cacheError } = await supabase.from("reports")
          .update({ report_chunk_cache: { __regenerate: true } }).eq("case_id", data.caseId);
        if (cacheError) throw new Error(cacheError.message);
      }
      const patch = reportQueued ? {
        worker_lease_until: null, status: "queued" as const, next_stage: "report",
        queued_at: new Date().toISOString(), cancel_requested: false,
        status_message: "Agent review saved; refreshing report and release checks",
        report_checkpoint_count: 0,
      } : { worker_lease_until: null };
      const { data: saved, error } = await supabase.from("cases").update(patch)
        .eq("id", data.caseId).eq("worker_lease_until", lease).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!saved) throw new Error("Agent review saved, but the case changed before report refresh could be queued.");
      return { ...review, reportQueued };
    } finally {
      const { error } = await supabase.from("cases").update({ worker_lease_until: null })
        .eq("id", data.caseId).eq("worker_lease_until", lease);
      if (error) console.error("[single-agent] Could not release case lease", error.code);
    }
  });
