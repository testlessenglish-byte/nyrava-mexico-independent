import {buildNarrativeReviewInput,narrativeManifestMatches} from './report-narrative-review';
import {narrativeReviewContext} from './narrative-review-context';

export async function assertNarrativeExportReady(payload:Record<string,any>):Promise<void> {
  const input=await buildNarrativeReviewInput(narrativeReviewContext(payload));
  if(!narrativeManifestMatches(input,payload.report?.full_report?.narrative_semantic_review))
    throw new Error('REPORT_NARRATIVE_UNVERIFIED: Final prose or its sources have not passed the current semantic review.');
}
