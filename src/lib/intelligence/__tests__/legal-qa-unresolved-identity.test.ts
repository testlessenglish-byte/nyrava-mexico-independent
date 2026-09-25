import { describe, expect, it, vi } from 'vitest';
import { LegalQaBlockedError, runLegalQaGate } from '../legal-qa.server';

vi.mock('../case-classification.server', () => ({ resolveCaseIdentity: vi.fn(async () => ({ caseType: null, status: 'unverified' })) }));

describe('legal QA without a resolved materia', () => {
  it('records needs_classification and blocks without reading or rewriting engine prose', async () => {
    const reads: string[] = [];
    const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const db = { from(table: string) {
      const query = {
        select() { reads.push(table); return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: { case_type: 'civil', report_language: 'es' } }),
        update(patch: Record<string, unknown>) { writes.push({ table, patch }); return query; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return query;
    } };
    const failure = await runLegalQaGate({ db: db as never, caseId: 'unresolved' }).catch(error => error);
    expect(failure).toBeInstanceOf(LegalQaBlockedError);
    expect(failure.report).toMatchObject({ status: 'needs_classification', materia: null, ok: false, blocked: true, remediated_fields: 0 });
    expect(reads).toEqual(['cases']);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ table: 'cases', patch: { legal_qa_report: failure.report } });
  });
});
