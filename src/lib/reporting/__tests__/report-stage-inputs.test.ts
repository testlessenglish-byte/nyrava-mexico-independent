import { describe, expect, it } from 'vitest';
import type { CaseExportData } from '../../export';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';
import { composeReportStagePayload } from '../final-report-inputs.server';
import { resolveFinalReleaseDecision } from '../final-release-decision';

const source = 'La Sala determina que se desecha el recurso de revisión.';
const invalidTheory = {
  id: 'theory-1',
  citations: [{ document_id: 'doc-1', doc_n: 1, page: 1, quote: source }],
};

function base(): Pick<CaseExportData, 'case' | 'documents' | 'report' | 'findings'> {
  return {
    case: { case_type: 'civil', case_analysis_mode: 'concluded_audit' },
    documents: [{ id: 'doc-1', document_id: 'doc-1', filename: 'sentencia.pdf', doc_n: 1 }],
    report: { executive_summary: source.repeat(3), full_report: {
      pre_release_source_pages: [{ document_id: 'doc-1', page: 1, text: source }],
    } },
    findings: [],
  };
}

function database() {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => void) {
          resolve({ data: table === 'case_theories' ? [invalidTheory] : [], error: null });
        },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return query;
    },
  };
}

describe('report-stage release input', () => {
  it('validates the same stored theory citations seen by the final release path', async () => {
    const input = base();
    const incomplete = composeFinalReportPayload({ ...input, analysis: null, agents: [], score: null });
    expect(auditReportCitationIntegrity(incomplete).errors.some(error => error.includes('theories[0]'))).toBe(false);

    const db = database();
    const complete = await composeReportStagePayload(db, 'case-1', input, input.findings);
    expect(db.calls).toContain('case_theories');
    expect(complete.theories).toHaveLength(1);
    expect((complete.report?.full_report as any)?.reviewed_sections?.theories).toHaveLength(1);
    expect(auditReportCitationIntegrity(complete).errors).toContain(
      'citation_integrity:theories[0].citations[0]:proposition_supported_missing',
    );
    const contract = validateFinalReportContract(complete);
    const release = resolveFinalReleaseDecision({ report: complete.report ?? {}, contract });
    expect(release.released).toBe(false);
    expect(release.errors).toContain(
      'final_report_contract:citation_integrity:theories[0].citations[0]:proposition_supported_missing',
    );
  });
});
