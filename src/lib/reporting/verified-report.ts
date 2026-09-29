import { candidateApprovalPassed, candidateMatches, freezeReleaseCandidate, type CandidateApproval, type ReleaseCandidate } from './release-candidate';
import { validateFinalReportContract, type FinalReportPayload } from './final-report-contract';
import { resolveFinalReleaseDecision } from './final-release-decision';

export type VerifiedReportPackage = ReleaseCandidate & { approvals: Record<string, CandidateApproval> };
const requiredGates = ['report', 'qa', 'judge', 'hallucination', 'final_contract'] as const;

/** The only post-freeze generator input is the exact candidate the existing
 * reviewers approved. No DB, provider, finding producer or citation producer. */
export function generateVerifiedReport(input: VerifiedReportPackage, caseId: string, executionId: string): FinalReportPayload {
  if (input.case_id !== caseId || input.execution_id !== executionId ||
      !candidateMatches(input, input.payload)) throw new Error('REPORT_PACKAGE_IDENTITY_MISMATCH');
  for (const gate of requiredGates) {
    if (!candidateApprovalPassed(input, gate, input.approvals?.[gate]))
      throw new Error('REPORT_PACKAGE_APPROVAL_MISSING:' + gate);
  }
  // Freeze a detached copy so renderers cannot damage the retry source.
  const candidate = freezeReleaseCandidate(input.payload);
  const contract = validateFinalReportContract(candidate.payload);
  const release = resolveFinalReleaseDecision({ report: candidate.payload.report!, contract });
  if (!release.released) throw new Error('REPORT_CONTRACT_BLOCKED:' + release.errors.join(','));
  return candidate.payload;
}

/** Read the existing persisted candidate, not a second copy of citation truth. */
export function verifiedReportPackage(report: Record<string, any>, caseId: string, executionId: string): VerifiedReportPackage {
  const stored = report.full_report?.release_candidate;
  if (report.case_id !== caseId || report.execution_id !== executionId || report.quality_blocked !== false ||
      report.full_report?.final_review?.released !== true || !stored?.payload)
    throw new Error('REPORT_PACKAGE_NOT_VERIFIED');
  return { ...stored, case_id: caseId };
}
