// Hallucination review: quotation identity and claim support are separate.
// A matching fragment cannot certify its interpretation or court attribution.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { reviewClaimSupport } from './claim-support-review.server';
import { supportInput, type SupportClaim, type SupportVerdict } from './claim-support-review';
import { PROJECTION_LIKE } from "@/lib/intelligence/finding-selection";
import { isDuplicateTitle } from "./report-recommendations";
import { checkDomainVocabulary } from "./domain-vocabulary-gate";
import { validateRenderedReport } from "@/lib/canonical/prerender-validate.server";
import { decideRenderedReportRelease } from "@/lib/canonical/rendered-report-release";
import { loadReviewSourceSnapshot, scopedReviewPages } from './review-source-snapshot.server';

type Db = SupabaseClient<Database>;

type Finding = SupportClaim & {
  updated_at: string;
  finding_status?: string;
  lifecycle_status?: string;
  superseded_at?: string | null;
  id: string;
  title: string;
  description?: string | null;
  source_document_id: string | null;
  source_page: number | null;
  source_quote: string | null;
  source_doc_ids: string[] | null;
  speaker_role?: string | null;
  proposition_type?: string | null;
  adoption_status?: string | null;
};

type Page = { document_id: string; page: number; text: string };

export type HallucinationReport = {
  ran_at: string;
  total: number;
  verified: number;
  unverified: number;
  no_citation: number;
  /** Citations to public legal authority, exempt from verbatim corpus matching. */
  authority_exempt: number;
  by_module: Record<
    string,
    {
      total: number;
      verified: number;
      unverified: number;
      no_citation: number;
      authority_exempt: number;
    }
  >;
  unverified_examples: Array<{ id: string; title: string; reason: string }>;
  quarantined_actions_removed?: number;
  score_prose_reconciled?: number;
  score_placeholder_sentences_removed?: number;
  concluded_case_actions_removed?: number;
  materia_leak_actions_removed?: number;
  false_orphan_citations_reconciled?: number;
  /** An integrity block recorded by an EARLIER stage (e.g. procedural
   *  semantics). Reported verbatim so the real blocker is visible; it is
   *  deliberately NOT treated as a hallucination failure. */
  upstream_release_block?: string[] | null;
};

const REPORT_PROSE_FIELDS = [
  "executive_summary",
  "attorney_summary",
  "evidence_summary",
  "timeline_summary",
  "contradiction_report",
  "missing_evidence_report",
  "recommendations",
  "investigator_summary",
  "case_overview",
  "facts",
  "witness_analysis",
  "constitutional_issues",
  "discovery_analysis",
  "procedural_issues_report",
  "prosecution_theory_report",
  "defense_theory_report",
  "alternative_theory_report",
  "risk_analysis",
] as const;

const ACTION_TITLE_RX =
  /\b(presentar|preparar|interponer|promover|solicitar|revisar|formular|impugnar|apelar|recurrir|demandar|tramitar|iniciar)\b/i;

const ACTION_STOPWORDS = new Set([
  "para", "por", "con", "que", "del", "las", "los", "una", "uno", "unos", "unas",
  "este", "esta", "estos", "estas", "debe", "deberia", "recomienda", "recomendar",
  "considerar", "considere", "adecuadamente", "nueva", "nuevo",
]);

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function actionTokens(value: string): Set<string> {
  return new Set(
    foldText(value)
      .split(" ")
      .filter((token) => token.length >= 4 && !ACTION_STOPWORDS.has(token))
      .map((token) => (token.length > 6 && token.endsWith("s") ? token.slice(0, -1) : token)),
  );
}

function similarActionText(a: string, b: string): boolean {
  if (isDuplicateTitle(a, b)) return true;
  const aa = actionTokens(a);
  const bb = actionTokens(b);
  if (aa.size < 3 || bb.size < 3) return false;
  const [small, big] = aa.size <= bb.size ? [aa, bb] : [bb, aa];
  let overlap = 0;
  for (const token of small) if (big.has(token)) overlap += 1;
  return overlap >= 3 && overlap / small.size >= 0.55;
}

function scrubQuarantinedActionSentence(text: string, actionTitles: string[]): string {
  if (!text.trim() || actionTitles.length === 0) return text;
  const pieces = text.split(/(?<=[.!?])\s+|\n+/g);
  const kept = pieces.filter((piece) => {
    const foldedPiece = foldText(piece);
    return !actionTitles.some((title) => {
      const foldedTitle = foldText(title);
      if (!foldedTitle) return false;
      return foldedPiece.includes(foldedTitle) || similarActionText(piece, title);
    });
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/** `well-supported` is an internal sanitizer token, never attorney prose. */
function scrubScorePlaceholderSentence(text: string): { text: string; removed: number } {
  if (!text || !/\bwell-supported\b/i.test(text)) return { text, removed: 0 };
  const pieces = text.split(/(?<=[.!?])\s+|\n+/g);
  const kept: string[] = [];
  let removed = 0;
  for (const piece of pieces) {
    if (/\bwell-supported\b/i.test(piece)) {
      removed += 1;
      continue;
    }
    if (piece.trim()) kept.push(piece.trim());
  }
  return { text: kept.join(" ").replace(/\s+/g, " ").trim(), removed };
}

const NEW_PROCEEDING_RX =
  /\b(demanda\s+de\s+amparo(?:\s+(?:directo|indirecto))?|promover\s+(?:un\s+)?amparo|interponer\s+(?:un\s+)?recurso|presentar\s+(?:una\s+)?demanda|iniciar\s+(?:un\s+)?juicio|promover\s+(?:un\s+)?juicio)\b/i;

function hasRecommendationSupport(rec: Record<string, unknown>): boolean {
  const findingIds = Array.isArray(rec.supportingFindingIds) ? rec.supportingFindingIds : [];
  const evidence = Array.isArray(rec.supportingEvidence) ? rec.supportingEvidence : [];
  return findingIds.length > 0 || evidence.length > 0;
}

function filterConcludedCaseRecommendations(
  recommendations: unknown,
  caseAnalysisMode: unknown,
): { recommendations: unknown; removed: number } {
  if (String(caseAnalysisMode ?? "") !== "concluded_audit" || !Array.isArray(recommendations)) {
    return { recommendations, removed: 0 };
  }
  let removed = 0;
  const kept = recommendations.filter((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return true;
    const rec = value as Record<string, unknown>;
    const title = String(rec.title ?? "");
    if (!NEW_PROCEEDING_RX.test(title)) return true;
    if (hasRecommendationSupport(rec)) return true;
    removed += 1;
    return false;
  });
  return { recommendations: kept, removed };
}

/** Remove only recommended-action rows whose own text violates the resolved
 * materia vocabulary. We do not rewrite them into a guessed legal action. */
function sanitizePerspectiveActions(
  full: Record<string, unknown>,
  caseType: string,
  underlyingMateria?: string | null,
): number {
  const intelligence = full.intelligence;
  if (!intelligence || typeof intelligence !== "object" || Array.isArray(intelligence)) return 0;
  const intel = intelligence as Record<string, unknown>;
  if (!Array.isArray(intel.perspectives)) return 0;
  let removed = 0;
  intel.perspectives = intel.perspectives.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const perspective = { ...(value as Record<string, unknown>) };
    if (!Array.isArray(perspective.recommended_actions)) return perspective;
    perspective.recommended_actions = perspective.recommended_actions.filter((action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return true;
      const row = action as Record<string, unknown>;
      const text = [row.action, row.title, row.description, row.reason]
        .map((part) => String(part ?? ""))
        .join(" ");
      const check = checkDomainVocabulary(
        text,
        caseType || undefined,
        underlyingMateria,
      );
      if (check.clean) return true;
      removed += 1;
      return false;
    });
    return perspective;
  });
  full.intelligence = intel;
  return removed;
}

function reconcileStrengthScoreText(
  text: string,
  rawScore: number | null,
  finalScore: number | null,
): string {
  if (
    !text || rawScore == null || finalScore == null || rawScore === finalScore ||
    !Number.isFinite(rawScore) || !Number.isFinite(finalScore)
  ) return text;
  const raw = String(Math.round(rawScore));
  const final = String(Math.round(finalScore));
  const rx = new RegExp(
    `(fortaleza\\s+del\\s+caso(?:\\s+se\\s+califica\\s+en\\s+|\\s*[:=]?\\s*))${raw}\\b`,
    "i",
  );
  return text.replace(rx, `$1${final}`);
}

function reconcileFalseOrphans(
  full: Record<string, unknown>,
  documents: Array<{ metadata?: unknown }>,
): number {
  const audit = full._citation_audit_prose;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return 0;
  const auditObj = { ...(audit as Record<string, unknown>) };
  if (!Array.isArray(auditObj.orphaned)) return 0;
  const original = auditObj.orphaned.map(String);
  const kept = original.filter((entry) => {
    const m = entry.match(/\[DOC\s+(\d+)\s+p\.(\d+)\]\s+—\s+page\s+\d+\s+exceeds/i);
    if (!m) return true;
    const docIndex = Number(m[1]) - 1;
    const citedPage = Number(m[2]);
    const doc = documents[docIndex];
    if (!doc) return true;
    const metadata = doc.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return true;
    const actualPages = Number((metadata as Record<string, unknown>).pages);
    return !(Number.isFinite(actualPages) && actualPages >= citedPage);
  });
  const reconciled = original.length - kept.length;
  if (reconciled === 0) return 0;
  auditObj.orphaned = kept;
  auditObj.orphan_count = kept.length;
  full._citation_audit_prose = auditObj;

  const validation = full.validation;
  if (validation && typeof validation === "object" && !Array.isArray(validation)) {
    const validationObj = { ...(validation as Record<string, unknown>) };
    const signals = validationObj.quality_signals;
    if (signals && typeof signals === "object" && !Array.isArray(signals)) {
      validationObj.quality_signals = {
        ...(signals as Record<string, unknown>),
        orphaned_citation_count: kept.length,
      };
    }
    const gate = validationObj.quality_gate;
    if (gate && typeof gate === "object" && !Array.isArray(gate)) {
      const gateObj = { ...(gate as Record<string, unknown>) };
      if (Array.isArray(gateObj.critical_issues)) {
        gateObj.critical_issues = gateObj.critical_issues
          .map(String)
          .filter((issue) => !/orphaned citation\(s\)/i.test(issue) || kept.length > 0)
          .map((issue) =>
            /orphaned citation\(s\)/i.test(issue) && kept.length > 0
              ? `${kept.length} orphaned citation(s) — verify docIndex`
              : issue,
          );
      }
      validationObj.quality_gate = gateObj;
    }
    full.validation = validationObj;
  }
  return reconciled;
}

async function reconcileSavedReportProse(
  db: Db,
  caseId: string,
): Promise<{
  quarantinedActionsRemoved: number;
  scoreProseReconciled: number;
  scorePlaceholderSentencesRemoved: number;
  concludedCaseActionsRemoved: number;
  materiaLeakActionsRemoved: number;
  falseOrphanCitationsReconciled: number;
  upstreamReleaseBlock: string[] | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: saved }, { data: caseRow }, { data: documentsRaw }] = await Promise.all([
    (db as any)
      .from("reports")
      .select(`full_report,case_strength_score,score_breakdown,quality_blocked,quality_block_reasons,${REPORT_PROSE_FIELDS.join(",")}`)
      .eq("case_id", caseId)
      .maybeSingle(),
    (db as any)
      .from("cases")
      .select("case_type,underlying_materia,case_analysis_mode")
      .eq("id", caseId)
      .maybeSingle(),
    (db as any)
      .from("documents")
      .select("metadata,created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  ]);
  if (!saved) {
    return {
      quarantinedActionsRemoved: 0,
      scoreProseReconciled: 0,
      scorePlaceholderSentencesRemoved: 0,
      concludedCaseActionsRemoved: 0,
      materiaLeakActionsRemoved: 0,
      falseOrphanCitationsReconciled: 0,
      upstreamReleaseBlock: null,
    };
  }

  const full =
    saved.full_report && typeof saved.full_report === "object" && !Array.isArray(saved.full_report)
      ? ({ ...(saved.full_report as Record<string, unknown>) } as Record<string, unknown>)
      : null;
  const citationAudit = full?.citation_audit as
    | { quarantined_findings?: Array<{ title?: unknown }> }
    | undefined;
  const actionTitles = (citationAudit?.quarantined_findings ?? [])
    .map((f) => String(f?.title ?? "").trim())
    .filter((title) => title.length > 0 && ACTION_TITLE_RX.test(title));

  const patch: Record<string, unknown> = {};
  let removed = 0;
  for (const field of REPORT_PROSE_FIELDS) {
    const value = saved[field];
    if (typeof value !== "string" || !value.trim() || actionTitles.length === 0) continue;
    const scrubbed = scrubQuarantinedActionSentence(value, actionTitles);
    if (scrubbed !== value.trim()) {
      patch[field] = scrubbed;
      removed += 1;
    }
  }

  const validation =
    full?.validation && typeof full.validation === "object" && !Array.isArray(full.validation)
      ? (full.validation as Record<string, unknown>)
      : null;
  const consistency = validation?.score_consistency as
    | { case_strength_score_llm_raw?: unknown; case_strength_score?: unknown }
    | undefined;
  const rawScore = typeof consistency?.case_strength_score_llm_raw === "number" ? consistency.case_strength_score_llm_raw : null;
  const finalScore =
    typeof saved.case_strength_score === "number"
      ? saved.case_strength_score
      : typeof consistency?.case_strength_score === "number"
        ? consistency.case_strength_score
        : null;
  let scoreReconciled = 0;
  let placeholderRemoved = 0;

  if (typeof saved.score_breakdown === "string") {
    const original = saved.score_breakdown;
    const scoreFixed = reconcileStrengthScoreText(original, rawScore, finalScore);
    const placeholderFixed = scrubScorePlaceholderSentence(scoreFixed);
    if (placeholderFixed.text !== original) {
      patch.score_breakdown = placeholderFixed.text;
      if (scoreFixed !== original) scoreReconciled += 1;
      placeholderRemoved += placeholderFixed.removed;
    }
  }

  const prose =
    full?.prose && typeof full.prose === "object" && !Array.isArray(full.prose)
      ? { ...(full.prose as Record<string, unknown>) }
      : null;
  if (prose && typeof prose.score_breakdown === "string") {
    const original = prose.score_breakdown;
    const scoreFixed = reconcileStrengthScoreText(original, rawScore, finalScore);
    const placeholderFixed = scrubScorePlaceholderSentence(scoreFixed);
    if (placeholderFixed.text !== original) {
      prose.score_breakdown = placeholderFixed.text;
      full!.prose = prose;
      patch.full_report = full;
      if (scoreFixed !== original) scoreReconciled += 1;
      placeholderRemoved += placeholderFixed.removed;
    }
  }

  let concludedCaseActionsRemoved = 0;
  let materiaLeakActionsRemoved = 0;
  let falseOrphanCitationsReconciled = 0;
  if (full) {
    const filtered = filterConcludedCaseRecommendations(full.canonical_recommendations, caseRow?.case_analysis_mode);
    if (filtered.removed > 0) {
      full.canonical_recommendations = filtered.recommendations;
      concludedCaseActionsRemoved = filtered.removed;
    }
    materiaLeakActionsRemoved = sanitizePerspectiveActions(
      full,
      String(caseRow?.case_type ?? ""),
      caseRow?.underlying_materia == null ? null : String(caseRow.underlying_materia),
    );
    falseOrphanCitationsReconciled = reconcileFalseOrphans(
      full,
      (documentsRaw ?? []) as Array<{ metadata?: unknown }>,
    );

    // Do not let a previous rendered-QA diagnostic become content that the
    // next validation pass scans. Diagnostics mentioning the bad token/term
    // would otherwise self-reproduce after the actual content was fixed.
    delete full.rendered_qa;
    patch.full_report = full;
  }

  if (Object.keys(patch).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from("reports").update(patch as any).eq("case_id", caseId);
    if (error) throw new Error(`Failed to reconcile saved report prose: ${error.message}`);
  }

  const reconciledReport = { ...saved, ...patch } as Record<string, unknown>;
  const reconciledFullReport = reconciledReport.full_report as Record<string, unknown> | null;
  const isReportEmpty = !reconciledFullReport || Object.keys(reconciledFullReport).length === 0;

  const renderedIssues = isReportEmpty ? [] : validateRenderedReport(
    reconciledReport,
    String(caseRow?.case_type ?? ""),
    caseRow?.underlying_materia == null ? null : String(caseRow.underlying_materia),
  );
  const renderedDecision = isReportEmpty ? { blocked: false, reasons: [] } : decideRenderedReportRelease(renderedIssues);

  if (full) {
    full.rendered_qa = {
      issues: renderedIssues,
      issue_count: renderedIssues.length,
      critical_count: renderedIssues.filter((issue) => issue.severity === "critical").length,
      policy: "Final rendered-content validation after deterministic reconciliation.",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from("reports").update({ full_report: full as any }).eq("case_id", caseId);
    if (error) throw new Error(`Failed to persist final rendered QA: ${error.message}`);
  }

  // A block discovered in the rendered report is recorded as an upstream release block
  // on the report itself, NOT thrown as an unhandled error. Throwing here aborted
  // hallucination verification and made the rendered-QA failure resurface as a false
  // `gate:hallucination`, hiding the real blocker while 100% of claims verified.
  // The release is still blocked — by whoever actually blocked it.
  // One underlying problem must surface as one actionable reason, even when
  // mirrored sections reproduce it.
  const priorNonRenderedReasons = (Array.isArray(saved.quality_block_reasons) ? saved.quality_block_reasons.map(String) : [])
    .filter((r) => !r.startsWith("rendered_report_qa:"));

  const allBlockReasons = [...new Set([
    ...priorNonRenderedReasons,
    ...(renderedDecision.blocked ? renderedDecision.reasons : []),
  ])];

  const qualityBlocked = priorNonRenderedReasons.length > 0 || renderedDecision.blocked;
  const upstreamReleaseBlock = qualityBlocked
    ? (allBlockReasons.length ? allBlockReasons : ["quality_blocked"])
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("reports")
    .update({
      quality_blocked: qualityBlocked,
      quality_block_reasons: allBlockReasons,
    })
    .eq("case_id", caseId);

  return {
    quarantinedActionsRemoved: removed,
    scoreProseReconciled: scoreReconciled,
    scorePlaceholderSentencesRemoved: placeholderRemoved,
    concludedCaseActionsRemoved,
    materiaLeakActionsRemoved,
    falseOrphanCitationsReconciled,
    upstreamReleaseBlock,
  };

}

export async function runHallucinationReview(args: { db: Db; caseId: string; userId?: string }): Promise<HallucinationReport> {
  const { db, caseId } = args;

  const snapshot=await loadReviewSourceSnapshot(db,caseId);
  const findings = (snapshot.findings as Array<Finding & { source_module: string; metadata?: Record<string, unknown> }>)
    .filter(f=>!String(f.source_module ?? '').startsWith(PROJECTION_LIKE.replace(/%$/,'')))
    .filter(f=>f.finding_status!=="suppressed" && !f.superseded_at && f.lifecycle_status!=="superseded" && f.metadata?.provisional!==true);

  const proseReconciliation = await reconcileSavedReportProse(db, caseId);

  const pages = scopedReviewPages(snapshot);
  const findingsById=new Map(findings.map(f=>[f.id,f]));
  const persistBatch=async (batch:ReadonlyMap<string,SupportVerdict>)=>{
    for(const [id,verdict] of batch){
      const finding=findingsById.get(id)!;
      const status=!finding.source_quote || !finding.source_document_id ? 'no_citation'
        : verdict.verdict==='supported' ? 'verified' : 'unverified';
      const {data:written,error}=await db.from('case_findings').update({
        verification_status:status,verification_notes:`${verdict.verdict}: ${verdict.reason}`,
        verified_at:new Date().toISOString(),metadata:{...finding.metadata,semantic_support_review:verdict},
      } as any).eq('id',id).eq('updated_at',finding.updated_at).select('id,updated_at');
      if(error || written?.length!==1)throw new Error('Finding changed during semantic review; review must be repeated.');
      finding.updated_at=written[0].updated_at;
    }
  };
  const support = await reviewClaimSupport(findings, pages, args.userId,persistBatch);

  const report: HallucinationReport = {
    ran_at: new Date().toISOString(),
    total: findings.length,
    verified: 0,
    unverified: 0,
    no_citation: 0,
    authority_exempt: 0,
    by_module: {},
    unverified_examples: [],
    quarantined_actions_removed: proseReconciliation.quarantinedActionsRemoved,
    score_prose_reconciled: proseReconciliation.scoreProseReconciled,
    score_placeholder_sentences_removed: proseReconciliation.scorePlaceholderSentencesRemoved,
    concluded_case_actions_removed: proseReconciliation.concludedCaseActionsRemoved,
    materia_leak_actions_removed: proseReconciliation.materiaLeakActionsRemoved,
    false_orphan_citations_reconciled: proseReconciliation.falseOrphanCitationsReconciled,
    upstream_release_block: proseReconciliation.upstreamReleaseBlock,
  };

  const nowIso = new Date().toISOString();
  for (const f of findings) {
    const mod = f.source_module || "unknown";
    if (!report.by_module[mod]) {
      report.by_module[mod] = { total: 0, verified: 0, unverified: 0, no_citation: 0, authority_exempt: 0 };
    }
    report.by_module[mod].total += 1;

    let status: "verified" | "unverified" | "no_citation" | "authority_exempt" = "no_citation";
    let notes = "";
    const quote = (f.source_quote ?? "").trim();
    const docId = f.source_document_id ?? ((Array.isArray(f.source_doc_ids) && f.source_doc_ids[0]) || null);
    const verdict = support.get(f.id);
    if (!quote || !docId) {
      status = "no_citation";
      notes = "Claim lacks a document-bound source quote; legal-authority labels do not waive proof.";
    } else if (verdict?.verdict === 'supported') {
      status = 'verified';
      notes = `Source context supports the claim and attribution: ${verdict.reason}`;
    } else {
      status = 'unverified';
      notes = `${verdict?.verdict ?? 'insufficient'}: ${verdict?.reason ?? 'Semantic support not established.'}`;
    }

    report[status] += 1;
    report.by_module[mod][status] += 1;
    if (status === "unverified" && report.unverified_examples.length < 25) {
      report.unverified_examples.push({ id: f.id, title: f.title, reason: notes });
    }
  }

  // A concurrent edit or newly inserted claim invalidates this review as a whole.
  const current=await loadReviewSourceSnapshot(db,caseId);
  const currentPages=scopedReviewPages(current);
  const eligible=current.findings.filter((f:any)=>!String(f.source_module ?? '').startsWith(PROJECTION_LIKE.replace(/%$/,'')) && f.finding_status!=='suppressed' && !f.superseded_at && f.lifecycle_status!=='superseded' && f.metadata?.provisional!==true);
  if(eligible.length!==findings.length || eligible.some((f:any)=>support.get(f.id)?.hash!==supportInput(f,currentPages).hash))
    throw new Error('Findings changed during semantic review; final approval withheld.');

  const { error: reportError } = await db
    .from("cases")
    .update({ hallucination_report: report as any, hallucination_at: nowIso as any } as any)
    .eq("id", caseId);
  if (reportError) throw new Error(`Semantic review summary could not be saved: ${reportError.message}`);

  return report;
}

export {
  scrubQuarantinedActionSentence as __test__scrubQuarantinedActionSentence,
  reconcileStrengthScoreText as __test__reconcileStrengthScoreText,
  scrubScorePlaceholderSentence as __test__scrubScorePlaceholderSentence,
  filterConcludedCaseRecommendations as __test__filterConcludedCaseRecommendations,
  sanitizePerspectiveActions as __test__sanitizePerspectiveActions,
  reconcileFalseOrphans as __test__reconcileFalseOrphans,
};

