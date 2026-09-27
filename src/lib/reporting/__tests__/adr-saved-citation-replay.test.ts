import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';

// The private, read-only capture is supplied locally. It never enters Git.
describe.skipIf(!process.env.NYRAVA_RELEASE_REPLAY)('saved ADR 7286/2017 citation regression', () => {
  const saved = process.env.NYRAVA_RELEASE_REPLAY
    ? JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY, 'utf8')) : null;
  const input = () => ({
    case: saved.cases[0],
    documents: saved.documents.map((doc: Record<string, unknown>, i: number) => ({ ...doc, doc_n: i + 1 })),
    report: saved.reports[0],
    findings: saved.case_findings,
    agents: [], analysis: null, score: null,
  }) as any;

  it('reproduces every captured citation failure class with the real audit', () => {
    const audit = auditReportCitationIntegrity(input());
    const reasons = audit.errors.join('\n');
    for (const failure of ['inline_proposition_not_supported', 'proposition_not_supported',
      'proposition_supported_missing', 'verification_pending', 'source_location_unverified']) {
      expect(reasons, failure).toContain(failure);
    }
    expect(audit.ok).toBe(false);
  });

  it('keeps the unrepaired saved report blocked by the complete final contract', () => {
    const result = validateFinalReportContract(composeFinalReportPayload(input()));
    expect(result.blocking_errors.some(error => error.startsWith('citation_integrity:'))).toBe(true);
  });
});
