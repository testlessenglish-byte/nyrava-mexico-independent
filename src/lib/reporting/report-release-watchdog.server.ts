import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveFinalReleaseDecision } from "./final-release-decision";

type Db = SupabaseClient<Database>;

export interface WatchdogInspection {
  caseId: string;
  recovered: boolean;
  action: "already_terminal" | "released" | "released_with_warnings" | "verification_failed" | "unblocked" | "none";
  details?: string;
}

/**
 * Report Release Watchdog
 *
 * Ensures no completed report becomes permanently stuck or unavailable for PDF download.
 * Detects situations where:
 *  - all required stages finished but report remains in processing/reporting
 *  - report row exists with substantive content but case status wasn't finalized
 *  - release decision was checkpointed or stalled
 *  - an inapplicable stage is incorrectly blocking release
 *  - PDF download was disabled or blocked
 *
 * Safely transitions the case and report into the appropriate terminal outcome:
 *  - RELEASED (PASS)
 *  - RELEASED_WITH_WARNINGS (PASS_WITH_WARNINGS)
 *  - VERIFICATION_FAILED (terminal state with "EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS")
 */
export async function runReportReleaseWatchdog(
  db: Db,
  opts?: { caseId?: string }
): Promise<WatchdogInspection[]> {
  const results: WatchdogInspection[] = [];

  try {
    let query = (db as any)
      .from("cases")
      .select("id, status, status_message, error, execution_id, report_at, progress, worker_lease_until, updated_at");

    if (opts?.caseId) {
      query = query.eq("id", opts.caseId);
    } else {
      query = query.in("status", ["reporting", "intelligence_running", "processing", "needs_revision"]);
    }

    const { data: cases, error: casesErr } = await query;
    if (casesErr || !cases) return results;

    for (const c of cases) {
      const caseId = c.id;
      // An active worker owns finalization. A watchdog tick must never race
      // that worker or infer a release from an intermediate report row.
      if (c.worker_lease_until && new Date(c.worker_lease_until).getTime() > Date.now()) {
        results.push({ caseId, recovered: false, action: "none", details: "Active worker lease" });
        continue;
      }
      if (c.status === "needs_revision") {
        results.push({ caseId, recovered: false, action: "already_terminal" });
        continue;
      }

      // 1. Fetch corresponding report row
      const { data: initialReportRow } = await (db as any)
        .from("reports")
        .select("*")
        .eq("case_id", caseId)
        .maybeSingle();

      let reportRow = initialReportRow;

      if (!reportRow) {
        // No report generated yet for this case
        results.push({ caseId, recovered: false, action: "none", details: "No report row present" });
        continue;
      }
      if (!c.execution_id || !reportRow.execution_id || c.execution_id !== reportRow.execution_id) {
        results.push({ caseId, recovered: false, action: "none", details: "Report execution does not match case" });
        continue;
      }

      const fullReport = reportRow.full_report || {};
      const hasSubstantiveContent = Boolean(
        reportRow.facts ||
        reportRow.executive_summary ||
        reportRow.attorney_summary ||
        reportRow.evidence_summary ||
        fullReport.facts ||
        fullReport.executive_summary
      );

      if (!hasSubstantiveContent) {
        results.push({ caseId, recovered: false, action: "none", details: "Report has no substantive content" });
        continue;
      }

      // The final review already reconciled claims and validated the actual
      // source snapshot. A watchdog cannot create a new approval verdict.
      const contract = fullReport.final_report_contract_validation;
      const finalReview = fullReport.final_review;
      if (!contract || typeof contract.ok !== "boolean" ||
          !Array.isArray(contract.blocking_errors) ||
          !finalReview || typeof finalReview.released !== "boolean") {
        results.push({ caseId, recovered: false, action: "none", details: "Final review incomplete" });
        continue;
      }
      const recordedGates = fullReport.release_gate?.gates;
      const completeGateRecord = recordedGates && typeof recordedGates === "object" &&
        ["report", "qa", "judge", "hallucination"].every(
          (key) => typeof recordedGates[key] === "boolean",
        );
      const decision = resolveFinalReleaseDecision({
        report: reportRow,
        contract,
        ...(completeGateRecord ? { gates: recordedGates } : {}),
        errors: reportRow.quality_block_reasons || [],
      });
      const approvedSnapshot =
        finalReview.released === true &&
        fullReport.release_gate?.ok === true &&
        completeGateRecord &&
        Array.isArray(fullReport.release_gate?.missing_required_engines) &&
        fullReport.release_gate.missing_required_engines.length === 0 &&
        ["PASS", "PASS_WITH_WARNINGS"].includes(fullReport.release_decision);
      const canRelease = approvedSnapshot && decision.released;

      const nowIso = new Date().toISOString();
      const reportAt = c.report_at || reportRow.updated_at || nowIso;

      // Case already in clean released terminal state
      if (c.status === "released") {
        if (!c.report_at) {
          await (db as any).from("cases").update({ report_at: reportAt }).eq("id", caseId);
        }
        results.push({ caseId, recovered: false, action: "already_terminal" });
        continue;
      }

      // If the case is stuck in reporting/processing/intelligence_running or needs terminal transition:
      if (canRelease) {
        const targetOutcome = decision.release_outcome;
        const msg = targetOutcome === "RELEASED_WITH_WARNINGS"
          ? "Final review passed with warnings — report released and downloadable."
          : "Final review passed — report released and downloadable.";

        const caseUpdate = (db as any)
          .from("cases")
          .update({
            status: "released",
            progress: 100,
            report_at: reportAt,
            completed_at: c.completed_at || nowIso,
            worker_lease_until: null,
            next_stage: null,
            status_message: msg,
            error: null,
          })
          .eq("id", caseId)
          .eq("execution_id", c.execution_id)
          .eq("status", c.status);
        const { data: changed, error: caseErr } = await (c.worker_lease_until
          ? caseUpdate.eq("worker_lease_until", c.worker_lease_until)
          : caseUpdate.is("worker_lease_until", null)).select("id");
        if (caseErr || !changed?.length) {
          results.push({ caseId, recovered: false, action: "none", details: "Case changed during watchdog review" });
          continue;
        }

        results.push({
          caseId,
          recovered: true,
          action: targetOutcome === "RELEASED_WITH_WARNINGS" ? "released_with_warnings" : "released",
          details: msg,
        });
      } else {
        // A completed final review rejected this draft. Keep its diagnostic
        // content and mark the case for revision without claiming approval.
        const blockingReasons = decision.errors.length
          ? decision.errors
          : ["Final review did not approve this report."];

        const updatedFull = {
          ...fullReport,
          release_decision: "BLOCKED",
          release_outcome: "VERIFICATION_FAILED",
          verification_failed: true,
          verification_banner: "EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS",
          verification_reasons: blockingReasons,
          final_review: { ...finalReview, status: "needs_revision", decision: "BLOCKED", released: false },
        };

        const caseUpdate = (db as any)
          .from("cases")
          .update({
            status: "needs_revision",
            progress: 100,
            report_at: reportAt,
            worker_lease_until: null,
            next_stage: null,
            status_message: "Report verification failed — review required before filing.",
            error: blockingReasons.join("; ").slice(0, 2000),
          })
          .eq("id", caseId)
          .eq("execution_id", c.execution_id)
          .eq("status", c.status);
        const { data: changed, error: caseErr } = await (c.worker_lease_until
          ? caseUpdate.eq("worker_lease_until", c.worker_lease_until)
          : caseUpdate.is("worker_lease_until", null)).select("id");
        if (caseErr || !changed?.length) {
          results.push({ caseId, recovered: false, action: "none", details: "Case changed during watchdog review" });
          continue;
        }
        await (db as any)
          .from("reports")
          .update({
            quality_blocked: true,
            quality_block_reasons: blockingReasons,
            full_report: updatedFull,
          })
          .eq("id", reportRow.id)
          .eq("execution_id", c.execution_id);

        results.push({
          caseId,
          recovered: true,
          action: "verification_failed",
          details: "Transitioned to needs_revision after a completed blocked review.",
        });
      }
    }
  } catch (err) {
    console.error("[report-release-watchdog] error during watchdog run:", err);
  }

  return results;
}
