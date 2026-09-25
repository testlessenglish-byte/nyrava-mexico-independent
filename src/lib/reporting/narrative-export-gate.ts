import {buildNarrativeReviewInput,narrativeManifestMatches} from './report-narrative-review';
import {narrativeReviewContext} from './narrative-review-context';

export async function assertNarrativeExportReady(
  payload: Record<string, any>,
  opts?: { throwOnUnverified?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const input = await buildNarrativeReviewInput(narrativeReviewContext(payload));
    const matches = narrativeManifestMatches(input, payload.report?.full_report?.narrative_semantic_review);
    if (!matches) {
      const errorMsg = 'REPORT_NARRATIVE_UNVERIFIED: Final prose or its sources have not passed the current semantic review.';
      if (opts?.throwOnUnverified) {
        throw new Error(errorMsg);
      }
      if (payload.report) {
        const full = payload.report.full_report || {};
        payload.report.full_report = full;
        if (!Array.isArray(payload.report.quality_block_reasons)) {
          payload.report.quality_block_reasons = [];
        }
        if (!payload.report.quality_block_reasons.includes(errorMsg)) {
          payload.report.quality_block_reasons.push(errorMsg);
        }
        payload.report.quality_blocked = true;
      }
      return { ok: false, error: errorMsg };
    }
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Semantic review check failed.';
    if (opts?.throwOnUnverified) throw err;
    return { ok: false, error: errorMsg };
  }
}
