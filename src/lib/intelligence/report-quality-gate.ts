// Report Quality Gate — 6-dimension quality score (0–100) computed
// deterministically over the assembled `parsed` report + quality_signals.
//
// Purpose: block generic/thin reports before they reach the attorney and
// give ops a queryable pass/fail metric. Pure function — no I/O, no LLM
// calls, no mutation. Safe to call anywhere after `parsed` is merged.
//
// Score >= 70 with zero critical issues => passed. Anything else is failing
// and must either regenerate or surface a warning banner to the attorney.
//
// TODO(calibration): the dimension weights below (20/20/20/20/10/10) and the
// 70-point pass bar are hand-specified, not derived from real attorney
// accept/reject outcomes. Fixing that requires a new outcomes-tracking table
// (score at generation time -> did the attorney accept/edit-heavily/discard)
// that doesn't exist yet — intentionally not added here since it's new
// infrastructure, not a fix to this file's existing logic. Once that table
// exists, re-derive these constants from it.

export interface QualityGateResult {
  score: number; // 0–100
  passed: boolean;
  dimensions: Record<QualityDimension, DimensionScore>;
  critical_issues: string[];
  warnings: string[];
}

export type QualityDimension =
  | "memo_completeness"
  | "citation_integrity"
  | "findings_coverage"
  | "motion_quality"
  | "cross_examination"
  | "prose_specificity";

export interface DimensionScore {
  score: number;
  max: number;
  detail: string;
}

interface QualitySignalsLike {
  chunk_success?: { narrative?: boolean; memo?: boolean; intelligence?: boolean };
  citation_count?: number;
  orphaned_citation_count?: number;
  uncovered_finding_count?: number;
  legal_memorandum_present?: boolean;
  legal_memorandum_irac_complete?: boolean;
  avg_prose_length?: number;
}

// Generic AI phrases that indicate low specificity or hedge-y, non-attorney
// prose. Presence in prose is penalized but not fatal — thresholded on ratio.
// This list is drawn from an actual reviewed report (not a hypothetical) —
// keep it aligned with what attorneys flag as "sounds AI-generated" rather
// than a generic style guide, or it silently stops catching regressions.
const GENERIC_PHRASES = [
  /\bthe evidence suggests\b/gi,
  /\bit is possible that\b/gi,
  /\bmay potentially\b/gi,
  /\bcould potentially\b/gi,
  /\bin some cases\b/gi,
  /\bgenerally speaking\b/gi,
  /\bas a general matter\b/gi,
  /\bthere are indications\b/gi,
  /\bsignificantly compromised\b/gi,
  /\bheavily relies? on\b/gi,
  /\bcharacterized by\b/gi,
  /\boverall risk\b/gi,
  /\baims? to\b/gi,
  /\bfocuses? on\b/gi,
  /\bit is important to note\b/gi,
  /\bplays? a crucial role\b/gi,
  /\bin order to\b/gi,
  /\bbased on the available evidence\b/gi,
  /\bthis could indicate\b/gi,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreMemoCompleteness(parsed: any): DimensionScore {
  const memo = parsed?.legal_memorandum;
  if (!memo || typeof memo !== "object") {
    return { score: 0, max: 20, detail: "legal_memorandum missing" };
  }
  const irac = asArr(memo.legal_analysis);
  const motions = asArr(memo.recommended_motions);

  // 10 pts: IRAC entries with case citations + document evidence
  let iracPts = 0;
  if (irac.length > 0) {
    const good = irac.filter((i) => {
      const rule = String(i?.rule ?? "");
      // Mexican statutory and judicial authority. Presence is a completeness
      // signal only; the independent authority/source gates verify validity.
      const hasCase = /(?:art[ií]culos?\s+\d+[\s\S]*\b(?:Constituci[oó]n|Ley|C[oó]digo)|\b(?:tesis|jurisprudencia|registro digital)\s*[:\w./() -]*\d|\b(?:amparo en revisi[oó]n|amparo directo|contradicci[oó]n de (?:tesis|criterios))\s+\d+\/\d{4})/i.test(rule);
      const app = String(i?.application ?? "");
      const hasDocCite = /\[DOC\s+\d+\s+p\.\s*\d+/i.test(app);
      const complete =
        typeof i?.issue === "string" &&
        i.issue.length > 20 &&
        rule.length > 40 &&
        app.length > 40 &&
        typeof i?.conclusion === "string" &&
        i.conclusion.length > 15;
      return complete && hasCase && hasDocCite;
    }).length;
    iracPts = Math.min(10, Math.round((good / Math.max(1, irac.length)) * 10));
  }

  // 10 pts: motions with 2+ factual basis + 150+ word draft paragraphs
  let motionPts = 0;
  if (motions.length > 0) {
    const good = motions.filter((m) => {
      const basis = asArr(m?.factual_basis);
      const draft = String(m?.draft_paragraph ?? "");
      return basis.length >= 2 && draft.split(/\s+/).length >= 150;
    }).length;
    motionPts = Math.min(10, Math.round((good / Math.max(1, motions.length)) * 10));
  }

  const total = iracPts + motionPts;
  return {
    score: total,
    max: 20,
    detail: `IRAC ${iracPts}/10 (${irac.length} entries), motions ${motionPts}/10 (${motions.length} entries)`,
  };
}

function scoreCitationIntegrity(orphaned: number, total: number): DimensionScore {
  if (total === 0) {
    return { score: 0, max: 20, detail: "no citations detected" };
  }
  if (orphaned === 0) {
    return { score: 20, max: 20, detail: `${total} citations, 0 orphaned` };
  }
  const ratio = orphaned / total;
  const score = Math.max(0, Math.round(20 * (1 - ratio * 2))); // 50% orphaned => 0
  return { score, max: 20, detail: `${orphaned}/${total} orphaned` };
}

function scoreFindingsCoverage(uncovered: number, findingsTotal: number): DimensionScore {
  if (findingsTotal === 0) {
    return { score: 20, max: 20, detail: "no findings to cover" };
  }
  const covered = findingsTotal - uncovered;
  const ratio = covered / findingsTotal;
  const score = Math.round(20 * ratio);
  return { score, max: 20, detail: `${covered}/${findingsTotal} findings covered` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreMotionQuality(parsed: any): DimensionScore {
  const memoMotions = asArr(parsed?.legal_memorandum?.recommended_motions);
  const intelMotions = asArr(parsed?.motion_opportunities);
  const all = [...memoMotions, ...intelMotions];
  if (all.length === 0) {
    return { score: 0, max: 20, detail: "no motions generated" };
  }
  const courtReady = all.filter((m) => {
    const draft = String(m?.draft_paragraph ?? m?.draft_outline ?? "");
    const legalStd = String(m?.legal_standard ?? m?.basis ?? "");
    return draft.split(/\s+/).length >= 150 && legalStd.length >= 40;
  }).length;

  // 3+ court-ready motions = full marks; scale linearly below that.
  const score = Math.min(20, Math.round((courtReady / 3) * 20));
  return { score, max: 20, detail: `${courtReady} court-ready of ${all.length} motions` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreCrossExamination(parsed: any, verifiedCitations?: Set<string>): DimensionScore {
  const cx = asArr(parsed?.cross_examination);
  if (cx.length === 0) {
    return { score: 0, max: 10, detail: "no cross-examination outlines" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isGrounded = (l: any) => {
    const cite = String(l?.impeachment_with ?? l?.citation ?? "");
    if (!cite) return false;
    if (!verifiedCitations || verifiedCitations.size === 0) return true; // caller opted out of grounding check
    return verifiedCitations.has(cite);
  };
  const withImpeachment = cx.filter((w) => {
    const lines = asArr(w?.lines);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return lines.some((l: any) => isGrounded(l) && asArr(l?.questions).length > 0);
  }).length;
  const score = Math.min(10, Math.round((withImpeachment / Math.max(1, cx.length)) * 10));
  return {
    score,
    max: 10,
    detail: verifiedCitations
      ? `${withImpeachment}/${cx.length} witnesses have GROUNDED impeachment questions`
      : `${withImpeachment}/${cx.length} witnesses have impeachment questions`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreProseSpecificity(parsed: any, avgProseLen: number): DimensionScore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prose = (parsed?.prose ?? {}) as Record<string, any>;
  const strs = Object.values(prose).filter((v): v is string => typeof v === "string");
  if (strs.length === 0) {
    return { score: 0, max: 10, detail: "no prose fields" };
  }
  const joined = strs.join("\n");
  let genericHits = 0;
  for (const rx of GENERIC_PHRASES) {
    const m = joined.match(rx);
    if (m) genericHits += m.length;
  }
  // Length component (5 pts): >=1500 chars avg = full marks.
  const lenPts = Math.min(5, Math.round((avgProseLen / 1500) * 5));
  // Generic component (5 pts): 0 hits = full; each hit -1.
  const genPts = Math.max(0, 5 - genericHits);
  return {
    score: lenPts + genPts,
    max: 10,
    detail: `avg ${avgProseLen} chars, ${genericHits} generic phrases`,
  };
}

/**
 * Score the assembled report. `parsed` is the merged chunk output (with
 * `legal_memorandum`, `prose`, `motion_opportunities`, `cross_examination`,
 * etc.). `signals` is the same quality_signals block written to
 * validation.quality_signals. `findingsTotal` is the number of upstream
 * findings we expected the report to reference.
 */
export function scoreReportQuality(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsed: any,
  signals: QualitySignalsLike,
  findingsTotal: number,
  /**
   * Optional set of citation strings (e.g. `impeachment_with` / `citation`
   * values) already verified elsewhere in the pipeline — the same shape as
   * the gated citations engines.server.ts's witness engine persists. When
   * provided, cross_examination scoring only credits impeachment questions
   * grounded in one of these; when omitted, scoring falls back to the prior
   * presence-only check so existing callers don't need to change.
   */
  verifiedCitations?: Set<string>,
  context?: { reportMode: "FULL" | "LIMITED"; strategyAllowed: boolean },
): QualityGateResult {
  const verificationOnly = context?.reportMode === "LIMITED" || context?.strategyAllowed === false;
  const summary = String(parsed?.prose?.executive_summary ?? parsed?.executive_summary ?? "");
  const dims: Record<QualityDimension, DimensionScore> = {
    memo_completeness: scoreMemoCompleteness(parsed),
    citation_integrity: scoreCitationIntegrity(signals.orphaned_citation_count ?? 0, signals.citation_count ?? 0),
    findings_coverage: scoreFindingsCoverage(signals.uncovered_finding_count ?? 0, findingsTotal),
    motion_quality: scoreMotionQuality(parsed),
    cross_examination: scoreCrossExamination(parsed, verifiedCitations),
    prose_specificity: scoreProseSpecificity(parsed, signals.avg_prose_length ?? 0),
  };

  if (verificationOnly) {
    dims.memo_completeness = {score: summary.trim().length >= 80 ? 20 : 0, max:20, detail:"verification report executive summary"};
    dims.motion_quality = {score:0,max:0,detail:"not applicable: report capability prohibits strategy"};
    dims.cross_examination = {score:0,max:0,detail:"not applicable: report capability prohibits strategy"};
  }

  const score = Math.round(100 * Object.values(dims).reduce((a, d) => a + d.score, 0) /
    Object.values(dims).reduce((a,d) => a + d.max, 0));

  const critical_issues: string[] = [];
  const warnings: string[] = [];
  if (!verificationOnly && !signals.legal_memorandum_present) critical_issues.push("legal_memorandum absent");
  if (verificationOnly && summary.trim().length < 80) critical_issues.push("executive summary absent or incomplete");
  if ((signals.citation_count ?? 0) === 0) critical_issues.push("no citations detected");
  if ((signals.orphaned_citation_count ?? 0) > 0) {
    critical_issues.push(`${signals.orphaned_citation_count} orphaned citation(s) — verify docIndex`);
  }
  if (!verificationOnly && !signals.legal_memorandum_irac_complete) warnings.push("IRAC blocks incomplete");
  if (!verificationOnly && dims.motion_quality.score < 10) warnings.push("motion_quality below threshold");
  if (dims.findings_coverage.score < 14) warnings.push("findings_coverage below threshold");
  if (!verificationOnly && signals.chunk_success && !signals.chunk_success.memo) critical_issues.push("memo chunk failed");
  if (signals.chunk_success && !signals.chunk_success.intelligence) warnings.push("intelligence chunk failed");

  const passed = score >= 70 && critical_issues.length === 0;

  return { score, passed, dimensions: dims, critical_issues, warnings };
}
