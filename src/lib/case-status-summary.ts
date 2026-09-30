const INTERNAL_REPORT_DIAGNOSTICS = /(?:final_report_contract|citation_integrity|proposition_supported_missing|verification_pending|citation_quarantined|report_contract_blocked|report_narrative_unverified|identity_conflict|quality_block_reasons|report needs review:|report generation requires revision:)/i;

/** Keep persisted status text safe for case lists and dashboard cards.
 * Detailed release reasons belong in report diagnostics, not in shared case
 * status lines where they can overwhelm other case UI. */
export function caseStatusSummary(status: unknown, message: unknown): string | null {
  if (typeof message !== "string" || !message.trim()) return null;
  const value = message.trim();
  if (!INTERNAL_REPORT_DIAGNOSTICS.test(value) && value.length <= 180) return value;

  if (status === "needs_revision") return "Report needs review before release.";
  if (status === "failed") return "Analysis needs attention. Open the case for details.";
  return "Open the case to review its current status.";
}
