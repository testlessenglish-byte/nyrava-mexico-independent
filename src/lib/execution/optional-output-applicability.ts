import { allowsProspectiveWorkProduct, normalizeCaseAnalysisMode } from "../intelligence/case-analysis-mode";

/** Missing artifacts are only a coverage gap when that stage applies. */
export function shouldCheckOptionalOutput(
  stage: string,
  caseAnalysisMode: unknown,
  ledger?: { status: string; skipped_reason?: string | null },
): boolean {
  if (ledger?.status === "skipped" && ledger.skipped_reason?.startsWith("skipped_not_applicable:")) return false;
  // Historical strict/balanced tokens do not restrict the single pipeline.
  // The case objective still forbids prospective drafting in retrospective audits.
  return stage !== "work_product" || allowsProspectiveWorkProduct(normalizeCaseAnalysisMode(caseAnalysisMode));
}
