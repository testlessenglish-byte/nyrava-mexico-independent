import { sha256HexSync } from '../intelligence/sha256';
import type { FinalReportPayload } from './final-report-contract';

export function stableJson(value: unknown): string {
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(value));
}
export function contentHash(value: unknown): string { return sha256HexSync(stableJson(value)); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export type ReleaseCandidate = {
  version: 1; case_id: string; execution_id: string; report_id: string | null;
  hash: string; payload: FinalReportPayload;
};
export type CandidateApproval = { gate: string; candidate_hash: string; execution_id: string; passed: boolean };
export function freezeReleaseCandidate(input: FinalReportPayload): ReleaseCandidate {
  const caseId = input.case?.id, executionId = input.case?.execution_id;
  if (!caseId || !executionId || input.report?.case_id !== caseId || input.report?.execution_id !== executionId)
    throw new Error('RELEASE_CANDIDATE_EXECUTION_MISMATCH');
  for (const row of input.findings ?? []) {
    const scope = row.execution_id ?? (row.metadata as any)?.execution_id;
    if (scope !== executionId || row.case_id !== caseId) throw new Error('RELEASE_CANDIDATE_FINDING_SCOPE_MISMATCH');
  }
  const payload = structuredClone(input);
  return freeze({ version: 1, case_id: String(caseId), execution_id: String(executionId),
    report_id: input.report?.id ? String(input.report.id) : null, hash: contentHash(payload), payload });
}
export function candidateMatches(candidate: ReleaseCandidate, payload: FinalReportPayload): boolean {
  return candidate.hash === contentHash(payload);
}
export function bindCandidateApproval(candidate: ReleaseCandidate, gate: string, passed: boolean): CandidateApproval {
  if (!candidateMatches(candidate, candidate.payload)) throw new Error('RELEASE_CANDIDATE_MUTATED');
  return { gate, candidate_hash: candidate.hash, execution_id: candidate.execution_id, passed };
}
export function candidateApprovalPassed(candidate: ReleaseCandidate, gate: string, approval?: CandidateApproval): boolean {
  return candidateMatches(candidate, candidate.payload) && approval?.passed === true && approval.gate === gate &&
    approval.candidate_hash === candidate.hash && approval.execution_id === candidate.execution_id;
}
