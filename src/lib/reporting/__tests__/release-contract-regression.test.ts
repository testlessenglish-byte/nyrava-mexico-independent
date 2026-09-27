import { describe, it, expect } from 'vitest';
import { auditText } from '../../intelligence/mx-terminology';
import { validateRenderedReport } from '../../canonical/prerender-validate.server';
import { mandatoryDecisionCoreToFindings } from '../../intelligence/mandatory-decision-core';
import { supportInput } from '../../intelligence/claim-support-review';
import { buildGroundingCorpus } from '../../intelligence/grounding.server';
import { resolveEvidenceRef } from '../../intelligence/decision-reconstruction-extractor.server';

// Public source excerpts and the exact failure shapes from ADR 7286/2017.
const quote = 'Se desecha por improcedente el recurso de revisión a que este\ntoca 7286/2017 se refiere.';
const page = { document_id: 'document', filename: 'source.pdf', page: 27, text: quote };
const core: any = { id: 'holding', kind: 'COURT_HOLDING', text: 'Se desecha el recurso de revisión.',
  speaker_role: 'scjn', proposition_type: 'holding', adoption_status: 'adopted',
  source_refs: [{ document_id: 'document', doc_n: 1, page: 27, quote, chunk_index: 6, page_extraction_ref: 'document:27' }] };
describe('release contract regressions from ADR 7286/2017', () => {
  it('does not mistake a numbered Mexican Cfr. footnote for US CFR', () => {
    expect(auditText('11 Cfr. Semanario Judicial de la Federación, 3a. 14, Octava Época', { profile: 'civil', locale: 'es' })
      .filter(i => i.kind === 'us_jurisdiction_reference')).toEqual([]);
    expect(auditText('29 CFR 1910.1200', { profile: 'civil', locale: 'es' }).some(i => i.kind === 'us_jurisdiction_reference')).toBe(true);
  });
  it.each(['29 CFR 1910.1200', '29 C.F.R. § 1910.1200', '29 C.F.R. 1910.1200', '29 CFR Part 1910', '29 CFR §§ 1910.1200', 'Title 29 CFR'])('still blocks actual US regulation %s', citation => {
    expect(auditText(citation, { profile: 'civil', locale: 'es' }).some(i => i.kind === 'us_jurisdiction_reference')).toBe(true);
  });
  it('audits published Civil prose rather than retained source context', () => {
    const source = { page: 12, text: 'acción penal, pues, en caso de no hacerlo, traería aparejada una anarquía' };
    const report = { executive_summary: 'La SCJN revisa la sentencia civil de los tribunales de CDMX.',
      full_report: { civil_rule_context: { pages: [source] }, pre_release_source_pages: [source] } };
    expect(validateRenderedReport(report, 'civil').filter(i => i.code === 'SPANISH_CASE_TYPE_LEAK')).toEqual([]);
    expect(validateRenderedReport({ executive_summary: 'El juez de control dictó la vinculación a proceso.' }, 'civil').some(i => i.code === 'SPANISH_CASE_TYPE_LEAK')).toBe(true);
  });
  it('carries exact source context from core references into semantic review', () => {
    const f: any = mandatoryDecisionCoreToFindings({ core: [core], caseId: 'case', userId: 'user' })[0];
    expect(f.source_document_id).toBe('document');
    expect(f.source_page).toBe(27);
    expect(f.evidence_refs[0].chunk_index).toBe(6);
    expect(supportInput({ ...f, id: 'finding' }, [page]).context).toContain('Se desecha por improcedente');
  });
  it('creates reconstruction references from physical pages, never character-count page guesses', () => {
    const docs = [{ id: 'document', filename: 'source.pdf', extracted_text: quote }];
    const corpus = buildGroundingCorpus(docs);
    corpus.docs[0].physicalPages = [{ page: 27, text: quote }];
    const ref = resolveEvidenceRef(quote, corpus, docs);
    expect(ref).toMatchObject({ document_id: 'document', page: 27, label: 'p.27', page_extraction_ref: 'document:27' });
  });
});
