import { describe, expect, it } from 'vitest';
import { freezeReleaseCandidate, candidateMatches, bindCandidateApproval, candidateApprovalPassed } from '../release-candidate';
const input = () => ({ case: { id: 'c', execution_id: 'e' }, report: { id: 'r', case_id: 'c', execution_id: 'e', full_report: {} }, findings: [], documents: [], theories: [{ narrative: 'Original' }] });
describe('immutable execution release candidate', () => {
  it('freezes a detached candidate and binds all gate approvals to it', () => {
    const source = input(), candidate = freezeReleaseCandidate(source as any);
    expect(Object.isFrozen(candidate.payload.theories[0])).toBe(true);
    source.theories[0].narrative = 'Changed';
    expect(candidateMatches(candidate, source as any)).toBe(false);
    for (const gate of ['qa', 'hallucination', 'judge', 'final_contract']) {
      const approval = bindCandidateApproval(candidate, gate, true);
      expect(candidateApprovalPassed(candidate, gate, approval)).toBe(true);
      expect(candidateApprovalPassed(freezeReleaseCandidate(source as any), gate, approval)).toBe(false);
    }
  });
  it('rejects missing and conflicting execution identities', () => {
    expect(() => freezeReleaseCandidate({ ...input(), case: { id: 'c' } } as any)).toThrow();
    expect(() => freezeReleaseCandidate({ ...input(), report: { ...input().report, execution_id: 'other' } } as any)).toThrow();
  });
});
