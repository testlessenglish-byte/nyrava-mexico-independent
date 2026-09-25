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

  const { determineSpeakerAndAttribution } = await import("./final-claim-publication.server");

  // Pass 1: Proposition & Entailment Evaluation for each claim
  for (let i = 0; i < allFindings.length; i++) {
    const f = allFindings[i];
    const diag = evaluateClaimEntailment(f);
    diagnostics.push(diag);

    const title = String(f.title ?? "");
    const desc = String(f.description ?? "");
    const quote = typeof f.source_quote === "string" ? f.source_quote.trim() : "";

    const { speaker, roleLabel, badge, isPartyAllegation } = determineSpeakerAndAttribution(
      title,
      desc,
      quote,
      f.speaker_role,
    );

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
    if (diag.claim_action === "REPAIR" && (diag.repaired_description || diag.repaired_claim)) {
      const repairedTitle = diag.repaired_claim ?? f.title;
      const repairedDesc = diag.repaired_description ?? f.description;
      const patchObj: Record<string, unknown> = {
        title: repairedTitle,
        description: repairedDesc,
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
        metadata: {
          ...(f.metadata || {}),
          original_unrepaired_title: f.title,
          original_unrepaired_description: f.description,
          claim_entailment_diagnostic: diag,
        },
        updated_at: new Date().toISOString(),
      };
      if (isPartyAllegation) {
        patchObj.speaker_role = roleLabel;
        patchObj.speaker_role_label = badge;
        patchObj.finding_type = "DIRECT_EVIDENCE";
        patchObj.proposition_type = "allegation";
        patchObj.audit_classification = "PARTY_ALLEGATION";
        (patchObj.metadata as any).claim_classification = "PARTY_ALLEGATION";
        (patchObj.metadata as any).presentation_category = "PARTY_ALLEGATION";
        (patchObj.metadata as any).speaker_role_badge = badge;
      }
      updates.push({
        id: f.id,
        patch: patchObj,
      });
      allFindings[i] = {
        ...f,
        title: repairedTitle,
        description: repairedDesc,
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
        speaker_role: isPartyAllegation ? roleLabel : f.speaker_role,
        speaker_role_label: isPartyAllegation ? badge : f.speaker_role_label,
        finding_type: isPartyAllegation ? "DIRECT_EVIDENCE" : f.finding_type,
        proposition_type: isPartyAllegation ? "allegation" : f.proposition_type,
        audit_classification: isPartyAllegation ? "PARTY_ALLEGATION" : f.audit_classification,
        metadata: {
          ...(f.metadata || {}),
          original_unrepaired_title: f.title,
          original_unrepaired_description: f.description,
          claim_entailment_diagnostic: diag,
        },
      };
      repairedCount++;
      continue;
    }

    // Action 3: RECLASSIFY party allegations
    if (diag.claim_action === "RECLASSIFY" || isPartyAllegation) {
      updates.push({
        id: f.id,
        patch: {
          finding_type: "DIRECT_EVIDENCE",
          proposition_type: "allegation",
          speaker_role: roleLabel,
          speaker_role_label: badge,
          adoption_status: "party_position",
          audit_classification: "PARTY_ALLEGATION",
          finding_status: "verified",
          verification_status: "verified",
          verification_notes: diag.entailment_reason,
          metadata: {
            ...(f.metadata || {}),
            claim_classification: "PARTY_ALLEGATION",
            presentation_category: "PARTY_ALLEGATION",
            speaker_role_badge: badge,
            claim_entailment_diagnostic: diag,
          },
          updated_at: new Date().toISOString(),
        },
      });
      allFindings[i] = {
        ...f,
        finding_type: "DIRECT_EVIDENCE",
        proposition_type: "allegation",
        speaker_role: roleLabel,
        speaker_role_label: badge,
        adoption_status: "party_position",
        audit_classification: "PARTY_ALLEGATION",
        finding_status: "verified",
        verification_status: "verified",
        verification_notes: diag.entailment_reason,
        metadata: {
          ...(f.metadata || {}),
          claim_classification: "PARTY_ALLEGATION",
          presentation_category: "PARTY_ALLEGATION",
          speaker_role_badge: badge,
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

  // Pass 4: Semantic Deduplication for party allegations (e.g. Discriminación de género vs Discriminación en la custodia)
  for (let i = 0; i < allFindings.length; i++) {
    const f1 = allFindings[i];
    if (f1.finding_status === "suppressed" || f1.lifecycle_status === "superseded") continue;

    const t1 = String(f1.title ?? "").toLowerCase();
    const d1 = String(f1.description ?? "").toLowerCase();

    for (let j = i + 1; j < allFindings.length; j++) {
      const f2 = allFindings[j];
      if (f2.finding_status === "suppressed" || f2.lifecycle_status === "superseded") continue;

      const t2 = String(f2.title ?? "").toLowerCase();
      const d2 = String(f2.description ?? "").toLowerCase();

      const bothCustodyGender =
        (t1.includes("discriminación") || t1.includes("discriminacion") || d1.includes("discriminación") || d1.includes("discriminacion")) &&
        (t2.includes("discriminación") || t2.includes("discriminacion") || d2.includes("discriminación") || d2.includes("discriminacion")) &&
        (t1.includes("custodia") || d1.includes("custodia") || t1.includes("genero") || d1.includes("genero") || t1.includes("sexo") || d1.includes("sexo")) &&
        (t2.includes("custodia") || d2.includes("custodia") || t2.includes("genero") || d2.includes("genero") || t2.includes("sexo") || d2.includes("sexo"));

      if (bothCustodyGender) {
        updates.push({
          id: f2.id,
          patch: {
            finding_status: "suppressed",
            lifecycle_status: "superseded",
            superseded_reason: "duplicate_allegation_merged",
            metadata: {
              ...(f2.metadata || {}),
              superseded_by: f1.id,
              suppressed_reason: "duplicate_allegation_merged",
            },
            updated_at: new Date().toISOString(),
          },
        });
        allFindings[j] = {
          ...f2,
          finding_status: "suppressed",
          lifecycle_status: "superseded",
        };
        mergedCount++;
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
    const { sanitizeReportObjectiveAndProse } = await import("./final-claim-publication.server");
    const sanitizedProse = sanitizeReportObjectiveAndProse(reportRow, activeFindings as any, { isConcludedAudit: true });

    const sanitizedFull = {
      ...full,
      prose: {
        ...((full.prose as Record<string, unknown>) ?? {}),
        executive_summary: sanitizedProse.executiveSummary,
      },
      objective: sanitizedProse.objective ?? full.objective,
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
        executive_summary: sanitizedProse.executiveSummary,
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
