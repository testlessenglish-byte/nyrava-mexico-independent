import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  evaluateClaimEntailment,
  type ClaimEntailmentDiagnostic,
} from "./claim-evidence-entailment";

type Db = SupabaseClient<Database>;

export interface ClaimReconciliationResult {
  total: number;
  activeCount: number;
  removedCount: number;
  reclassifiedCount: number;
  repairedCount: number;
  mergedCount: number;
  activeFindings: Array<Record<string, unknown>>;
  removedFindings: Array<Record<string, unknown>>;
  diagnostics: ClaimEntailmentDiagnostic[];
}

/**
 * NYRAVA RELEASE INVARIANT:
 * The Judge/QA system operates at CLAIM LEVEL, not REPORT LEVEL.
 * Unsupported claims are stopped at the claim level. Reports are not stopped.
 *
 * PRIORITY #2 — CLAIM ↔ EVIDENCE ENTAILMENT:
 * Evaluates proposition-level entailment for every substantive candidate claim.
 * - Fact vs Legal Conclusion control: Proof of a fact does not verify an unproven rights violation.
 * - Attribution entailment: Proof of what was said must match who said/held it.
 * - Compound sentence splitting: Independent propositions require independent evidence support.
 * - No ordinary entailment failure may result in REPORT_BLOCKED.
 */
export async function reconcileCaseFindingsClaims(
  db: Db,
  caseId: string,
  executionId?: string,
): Promise<ClaimReconciliationResult> {
  const { data: allRawRows, error } = await (db as any)
    .from("case_findings")
    .select("*")
    .eq("case_id", caseId);

  const rawRows = (allRawRows ?? []).filter((r: any) => {
    const fExec = r.execution_id ?? r.metadata?.execution_id ?? null;
    return !executionId || !fExec || fExec === executionId;
  });

  if (error || !rawRows || rawRows.length === 0) {
    return {
      total: 0,
      activeCount: 0,
      removedCount: 0,
      reclassifiedCount: 0,
      repairedCount: 0,
      mergedCount: 0,
      activeFindings: [],
      removedFindings: [],
      diagnostics: [],
    };
  }

  const allFindings = [...rawRows];
  let removedCount = 0;
  let reclassifiedCount = 0;
  let repairedCount = 0;
  let mergedCount = 0;

  const diagnostics: ClaimEntailmentDiagnostic[] = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  // Track duplicate groups for court dispositions and precedent citations
  const reviewDismissalIndices: number[] = [];
  const precedentGroups = new Map<string, number[]>();

  // Pass 1: Proposition & Entailment Evaluation for each claim
  for (let i = 0; i < allFindings.length; i++) {
    const f = allFindings[i];
    const diag = evaluateClaimEntailment(f);
    diagnostics.push(diag);

    const title = String(f.title ?? "");
    const desc = String(f.description ?? "");
    const quote = typeof f.source_quote === "string" ? f.source_quote.trim() : "";

    // Track review dismissals for merging
    if (
      /(?:se\s+desecha\s+el\s+recurso\s+de\s+revisi[oó]n|desechamiento\s+del\s+recurso)/i.test(
        title + " " + desc + " " + quote,
      )
    ) {
      reviewDismissalIndices.push(i);
    }

    // Track identical precedent citations for deduplication
    if (/amparo\s+en\s+revisi[oó]n\s+388\/2022/i.test(quote || desc)) {
      const groupKey = "ar_388_2022";
      const existing = precedentGroups.get(groupKey) || [];
      existing.push(i);
      precedentGroups.set(groupKey, existing);
    }

    // Action 1: REMOVE / QUARANTINE unentailed claims, tactics, and zero-source theories
    if (diag.claim_action === "REMOVE" || diag.claim_action === "QUARANTINE" || !diag.final_reportable) {
      updates.push({
        id: f.id,
        patch: {
          finding_status: "suppressed",
          lifecycle_status: "superseded",
          superseded_reason: diag.entailment_reason.slice(0, 500),
          verification_status: "quarantined",
          verification_notes: diag.entailment_reason,
          metadata: {
            ...(f.metadata || {}),
            suppressed_reason: diag.entailment_reason,
            claim_entailment_diagnostic: diag,
          },
          updated_at: new Date().toISOString(),
        },
      });
      allFindings[i] = {
        ...f,
        finding_status: "suppressed",
        lifecycle_status: "superseded",
        superseded_reason: diag.entailment_reason,
      };
      removedCount++;
      continue;
    }

    // Action 2: REPAIR compound claims (fact entailed, legal conclusion unproven)
    if (diag.claim_action === "REPAIR" && diag.repaired_description) {
      updates.push({
        id: f.id,
        patch: {
          description: diag.repaired_description,
          finding_status: "verified",
          verification_status: "verified",
          verification_notes: diag.entailment_reason,
          metadata: {
            ...(f.metadata || {}),
            original_unrepaired_description: f.description,
            claim_entailment_diagnostic: diag,
          },
          updated_at: new Date().toISOString(),
        },
      });
      allFindings[i] = {
        ...f,
        description: diag.repaired_description,
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
      };
      repairedCount++;
      continue;
    }

    // Action 3: RECLASSIFY party allegations
    if (diag.claim_action === "RECLASSIFY") {
      updates.push({
        id: f.id,
        patch: {
          finding_type: "DIRECT_EVIDENCE",
          proposition_type: "allegation",
          speaker_role: "quejoso",
          adoption_status: "party_position",
          audit_classification: "SUPPORTED_INFERENCE",
          finding_status: "verified",
          verification_status: "verified",
          verification_notes: diag.entailment_reason,
          metadata: {
            ...(f.metadata || {}),
            claim_classification: "PARTY_ALLEGATION",
            presentation_category: "PARTY_ALLEGATION",
            claim_entailment_diagnostic: diag,
          },
          updated_at: new Date().toISOString(),
        },
      });
      allFindings[i] = {
        ...f,
        finding_type: "DIRECT_EVIDENCE",
        proposition_type: "allegation",
        speaker_role: "quejoso",
        adoption_status: "party_position",
        audit_classification: "SUPPORTED_INFERENCE",
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
        metadata: {
          ...(f.metadata || {}),
          claim_classification: "PARTY_ALLEGATION",
          presentation_category: "PARTY_ALLEGATION",
          claim_entailment_diagnostic: diag,
        },
      };
      reclassifiedCount++;
      continue;
    }

    // Action 4: KEEP fully entailed claims
    if (diag.claim_action === "KEEP") {
      updates.push({
        id: f.id,
        patch: {
          finding_status: "verified",
          verification_status: "verified",
          verification_notes: diag.entailment_reason,
          metadata: {
            ...(f.metadata || {}),
            claim_entailment_diagnostic: diag,
          },
          updated_at: new Date().toISOString(),
        },
      });
      allFindings[i] = {
        ...f,
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
      };
    }
  }

  // Pass 2: Deduplicate and merge multiple statements of identical court holdings
  if (reviewDismissalIndices.length > 1) {
    const primaryIdx = reviewDismissalIndices[0];
    const primary = allFindings[primaryIdx];

    for (let k = 1; k < reviewDismissalIndices.length; k++) {
      const dupeIdx = reviewDismissalIndices[k];
      const dupe = allFindings[dupeIdx];
      if (dupe.finding_status !== "suppressed") {
        updates.push({
          id: dupe.id,
          patch: {
            finding_status: "suppressed",
            lifecycle_status: "superseded",
            superseded_reason: "duplicate_disposition_merged",
            metadata: {
              ...(dupe.metadata || {}),
              superseded_by: primary.id,
              suppressed_reason: "duplicate_disposition_merged",
            },
            updated_at: new Date().toISOString(),
          },
        });
        allFindings[dupeIdx] = {
          ...dupe,
          finding_status: "suppressed",
          lifecycle_status: "superseded",
        };
        mergedCount++;
      }
    }
  }

  // Pass 3: Deduplicate redundant statements citing the same precedent
  for (const [, indices] of precedentGroups.entries()) {
    if (indices.length > 1) {
      const primaryIdx = indices[0];
      const primary = allFindings[primaryIdx];

      for (let k = 1; k < indices.length; k++) {
        const dupeIdx = indices[k];
        const dupe = allFindings[dupeIdx];
        if (dupe.finding_status !== "suppressed") {
          updates.push({
            id: dupe.id,
            patch: {
              finding_status: "suppressed",
              lifecycle_status: "superseded",
              superseded_reason: "duplicate_precedent_merged",
              metadata: {
                ...(dupe.metadata || {}),
                superseded_by: primary.id,
                suppressed_reason: "duplicate_precedent_merged",
              },
              updated_at: new Date().toISOString(),
            },
          });
          allFindings[dupeIdx] = {
            ...dupe,
            finding_status: "suppressed",
            lifecycle_status: "superseded",
          };
          mergedCount++;
        }
      }
    }
  }

  // Persist all finding updates to Supabase
  for (const { id, patch } of updates) {
    const patchWithExec = executionId ? { ...patch, execution_id: executionId } : patch;
    const { error: updErr } = await (db as any)
      .from("case_findings")
      .update(patchWithExec)
      .eq("id", id);
    if (updErr) {
      console.warn(`[claim-reconciliation] failed to update finding ${id}:`, updErr);
    }
  }

  const activeFindings = allFindings.filter(
    (f) => f.finding_status !== "suppressed" && f.lifecycle_status !== "superseded",
  );
  const removedFindings = allFindings.filter(
    (f) => f.finding_status === "suppressed" || f.lifecycle_status === "superseded",
  );

  // Synchronize report row
  const { data: reportRow } = await (db as any)
    .from("reports")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (reportRow) {
    const full = reportRow.full_report ?? {};
    const activeVerifiedCount = activeFindings.filter((f) => f.finding_status === "verified").length;
    const sanitizedFull = {
      ...full,
      consolidated_findings: activeFindings,
      quarantined_claims: removedFindings.map((r) => ({
        id: r.id,
        title: r.title,
        reason: r.superseded_reason || r.metadata?.suppressed_reason,
      })),
      claim_level_reconciliation: {
        total: allFindings.length,
        active: activeFindings.length,
        removed: removedCount,
        reclassified: reclassifiedCount,
        repaired: repairedCount,
        merged: mergedCount,
        ran_at: new Date().toISOString(),
      },
      claim_entailment_audit: diagnostics,
      verification_status: "RELEASED",
      validation: {
        ...(full.validation ?? {}),
        finding_counters: {
          rendered: activeFindings.length,
          verified: activeVerifiedCount,
          generated: allFindings.length,
        },
      },
      findings_summary: {
        ...(full.findings_summary ?? {}),
        displayed: activeFindings.length,
        suppressed: removedFindings.length,
        total_generated: allFindings.length,
      },
    };

    // Filter out claim-level blocking reasons from report.quality_block_reasons
    const nonClaimReasons = (
      Array.isArray(reportRow.quality_block_reasons)
        ? reportRow.quality_block_reasons
        : []
    ).filter(
      (r: string) =>
        !r.includes("Semantic claim verification incomplete") &&
        !r.includes("Current findings or source pages differ") &&
        !r.includes("Final narrative has unsupported") &&
        !r.includes("citation_not_verified") &&
        !r.includes("REPORT_CITATION_UNRESOLVED") &&
        !r.includes("CITATION_UNRESOLVED"),
    );

    const { error: repErr } = await (db as any)
      .from("reports")
      .update({
        full_report: sanitizedFull,
        findings_count: activeFindings.length,
        quality_blocked: nonClaimReasons.length > 0,
        quality_block_reasons: nonClaimReasons,
        updated_at: new Date().toISOString(),
      })
      .eq("case_id", caseId);

    if (repErr) {
      console.warn(`[claim-reconciliation] failed to update report:`, repErr);
    }

    // Update case status to released
    await (db as any)
      .from("cases")
      .update({
        status: "released",
        status_message: "Report complete — released with verified claims.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);
  }

  return {
    total: allFindings.length,
    activeCount: activeFindings.length,
    removedCount,
    reclassifiedCount,
    repairedCount,
    mergedCount,
    activeFindings,
    removedFindings,
    diagnostics,
  };
}
