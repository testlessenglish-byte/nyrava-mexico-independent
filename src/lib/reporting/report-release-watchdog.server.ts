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

      // 1.5 Apply Claim-Level Reconciliation (NYRAVA RELEASE INVARIANT)
      const { reconcileCaseFindingsClaims } = await import("@/lib/intelligence/claim-level-reconciliation.server");
      await reconcileCaseFindingsClaims(db, caseId, (c as any).execution_id);

      // Re-fetch reportRow after reconciliation
      const { data: refreshedReport } = await (db as any)
        .from("reports")
        .select("*")
        .eq("case_id", caseId)
        .maybeSingle();
      if (refreshedReport) {
        reportRow = refreshedReport;
      }

      // 2. Evaluate release readiness
      const decision = resolveFinalReleaseDecision({
        report: reportRow,
        contract: { ok: true, blocking_errors: [] },
        gates: (reportRow.full_report || {}).final_review_progress?.outcomes || {},
        errors: reportRow.quality_block_reasons || [],
      });

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
      if (decision.released) {
        const targetOutcome = decision.release_outcome;
        const msg = targetOutcome === "RELEASED_WITH_WARNINGS"
          ? "Final review passed with warnings — report released and downloadable."
          : "Final review passed — report released and downloadable.";

        await (db as any)
          .from("reports")
          .update({
            quality_blocked: false,
            quality_block_reasons: [],
            full_report: {
              ...fullReport,
              release_decision: decision.decision,
              release_outcome: targetOutcome,
              final_review: { status: "released", decision: decision.decision, released: true },
            },
          })
          .eq("id", reportRow.id);

        await (db as any)
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
          .eq("id", caseId);

        results.push({
          caseId,
          recovered: true,
          action: targetOutcome === "RELEASED_WITH_WARNINGS" ? "released_with_warnings" : "released",
          details: msg,
        });
      } else {
        // VERIFICATION_FAILED outcome: Report is complete, but failed strict evidence verification.
        // As required: Do NOT delete report or leave case stuck. PDF must be downloadable
        // with the prominent banner: "EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS".
        const blockingReasons = Array.isArray(reportRow.quality_block_reasons) && reportRow.quality_block_reasons.length > 0
          ? reportRow.quality_block_reasons
          : ["Certain assertions or citations could not be fully verified against evidence."];

        const updatedFull = {
          ...fullReport,
          release_decision: "BLOCKED",
          release_outcome: "VERIFICATION_FAILED",
          verification_failed: true,
          verification_banner: "EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS",
          verification_reasons: blockingReasons,
          final_review: { status: "needs_revision", decision: "VERIFICATION_FAILED", released: false },
        };

        await (db as any)
          .from("reports")
          .update({
            quality_blocked: true,
            quality_block_reasons: blockingReasons,
            full_report: updatedFull,
          })
          .eq("id", reportRow.id);

        await (db as any)
          .from("cases")
          .update({
            status: "needs_revision",
            progress: 100,
            report_at: reportAt,
            worker_lease_until: null,
            next_stage: null,
            status_message: "Report complete — Evidence verification failed (review required before filing; PDF downloadable).",
            error: blockingReasons.join("; ").slice(0, 2000),
          })
          .eq("id", caseId);

        results.push({
          caseId,
          recovered: true,
          action: "verification_failed",
          details: "Transitioned to VERIFICATION_FAILED terminal state with downloadable PDF enabled.",
        });
      }
    }
  } catch (err) {
    console.error("[report-release-watchdog] error during watchdog run:", err);
  }

  return results;
}
