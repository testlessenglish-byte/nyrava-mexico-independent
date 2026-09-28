import { describe, expect, it } from 'vitest';
import { completedCoreCitations, createCanonicalCitation } from '../citation-production';
import { completeEvidenceCitation } from '../../intelligence/evidence-gate.server';
import { buildGroundingCorpus } from '../../intelligence/grounding.server';
import { withReviewedSections } from '../reviewed-sections';
import { composeFinalReportPayload } from '../final-report-contract';
import { auditReportCitationIntegrity } from '../citation-integrity';

const quote = 'El tribunal confirmó la sentencia recurrida mediante resolución definitiva.';
const pages = [{ document_id: 'doc-a', page: 27, text: quote }];
const index = [{ document_id: 'doc-a', doc_n: 1, canonical_source_id: 'source-a' }];
const ref = { document_id: 'doc-a', doc_n: 1, page: 27, quote };
const canonical = () => createCanonicalCitation(ref, quote, pages, index)!;
function payload(): any {
  return { case: { id: 'case-a', execution_id: 'run-a', case_type: 'familiar' },
    documents: [{ id: 'doc-a', doc_n: 1 }], findings: [], agents: [], analysis: null, score: null,
    report: { case_id: 'case-a', execution_id: 'run-a', citations: [], executive_summary: quote.repeat(3),
      full_report: { pre_release_source_pages: pages, source_audit: { canonical_sources: [
        { ...index[0], original_filename: 'decision.pdf', display_name: 'decision.pdf', source_aliases: [] },
      ] } } } };
}
describe('publication producer boundaries', () => {
  it('marks failed core certification explicitly and keeps the contract blocking', () => {
    const core = completedCoreCitations([{ id: 'core', text: 'Una conclusión sin revisión semántica.', source_refs: [ref] }], [], pages, index);
    expect(core[0].source_refs[0]).toMatchObject({ verification_status: 'unverified', publication_status: 'QUARANTINED' });
    const input = payload(); input.report.full_report.mandatory_decision_core = { items: core };
    expect(auditReportCitationIntegrity(composeFinalReportPayload(input)).ok).toBe(false);
  });
  it('never leaves a no-page producer reference indistinguishable from publishable evidence', () => {
    const corpus = buildGroundingCorpus([{ id: 'doc-a', filename: 'decision.pdf', extracted_text: quote }], 3000, []);
    expect(completeEvidenceCitation(ref, corpus)).toMatchObject({ verification_status: 'unverified', publication_status: 'QUARANTINED' });
  });
  it('does not let a legacy stored section overwrite a supplied current section', () => {
    const input = payload(); input.theories = [{ id: 't', citations: [canonical()] }];
    input.report.full_report.reviewed_sections = { theories: [{ id: 't', citations: [ref] }] };
    expect(withReviewedSections(input).theories[0].citations[0].verification_status).toBe('verified');
  });
  it('materializes the appendix from verified nested source identities', () => {
    const input = payload(); input.theories = [{ id: 't', narrative: quote + ' [DOC 1 p.27]', citations: [canonical()] }];
    input.perspectives = [{ key_evidence: [{ item: 'Resolución', citation: canonical() }] }];
    const composed = composeFinalReportPayload(input);
    expect(composed.report!.citations).toEqual(expect.arrayContaining([expect.objectContaining({ canonical_source_id: 'source-a', page: 27 })]));
    expect(auditReportCitationIntegrity(composed).errors).toEqual([]);
  });
});
