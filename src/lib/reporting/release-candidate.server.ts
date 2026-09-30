import { loadReviewSourceSnapshot, scopedReviewPages, documentPurposesResolved } from '../intelligence/review-source-snapshot.server';
import { filterFindingsForExecution } from '../intelligence/finding-selection';
import { supportSnapshotValid } from '../intelligence/claim-support-review';
import { loadFinalReportSections } from './final-report-inputs.server';
import { composeFinalReportPayload } from './final-report-contract';
import { freezeReleaseCandidate, contentHash } from './release-candidate';

export async function prepareReleaseCandidate(db: any, caseId: string, executionId: string) {
  const [caseResult, reportResult, sourceSnapshot, sections] = await Promise.all([
    db.from('cases').select('*').eq('id', caseId).maybeSingle(),
    db.from('reports').select('*').eq('case_id', caseId).eq('execution_id', executionId).maybeSingle(),
    loadReviewSourceSnapshot(db, caseId), loadFinalReportSections(db, caseId, executionId),
  ]);
  if (caseResult.error || reportResult.error || !caseResult.data || !reportResult.data || caseResult.data.execution_id !== executionId)
    throw new Error('RELEASE_CANDIDATE_CONTEXT_UNAVAILABLE');
  const caseRow = caseResult.data, reportRow = reportResult.data;
  const findings = filterFindingsForExecution(sourceSnapshot.findings, executionId);
  const composed = composeFinalReportPayload({ analysis: null, agents: [], score: null, ...sections,
    case: caseRow, documents: sourceSnapshot.documents, findings,
    report: { ...reportRow, full_report: { ...reportRow.full_report, pre_release_source_pages: sourceSnapshot.pages,
      reviewed_sections: sections } },
  });
  const { prepareFinalReportForRelease } = await import('../export');
  const payload = await prepareFinalReportForRelease(composed);
  // Preflight payloads are immutable once their report contract is validated.
  // Add release-only source proof to a private copy before freezing the full
  // candidate, rather than mutating that validated payload in place.
  const candidatePayload = structuredClone(payload);
  // Source proof is part of the same hash as the published content.
  (candidatePayload as any).release_source_snapshot = { findings, pages: sourceSnapshot.pages, documents: sourceSnapshot.documents };
  const candidate = freezeReleaseCandidate(candidatePayload);
  return { candidate, caseRow, reportRow, sourceSnapshot, sectionsHash: contentHash(sections),
    findingsData: findings,
    semanticSnapshotValid: supportSnapshotValid(findings as any, scopedReviewPages(sourceSnapshot)),
    documentPurposeValid: documentPurposesResolved(sourceSnapshot.documents) };
}

/** Reject section edits during review, including producer writes after the freeze. */
export async function assertReleaseSectionsUnchanged(db: any, caseId: string, executionId: string, expected: string) {
  if (contentHash(await loadFinalReportSections(db, caseId, executionId)) !== expected)
    throw new Error('RELEASE_CANDIDATE_SECTIONS_CHANGED');
}
