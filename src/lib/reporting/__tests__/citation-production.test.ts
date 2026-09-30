import { describe, it, expect } from 'vitest';
import { createCanonicalCitation, writerCitationCatalog, assertWriterCitationReferences } from '../citation-production';
import { auditReportCitationIntegrity, bindAttributedFindingCitations } from '../citation-integrity';
import { alignDecisionCoreFindings } from '../../intelligence/mandatory-decision-core';
import { supportInput } from '../../intelligence/claim-support-review';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';
const quote = 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.';
const pages = [{ document_id: 'doc', filename: 'source.pdf', page: 27, text: quote }];
const docs = [{ document_id: 'doc', doc_n: 1, canonical_source_id: 'doc' }];
const ref = { document_id: 'doc', doc_n: 1, page: 27, quote, chunk_index: 9 };
describe('upstream canonical citation production', () => {
  it('creates completed proposition verification only after checking the exact source', () => {
    const citation = createCanonicalCitation(ref, quote, pages, docs);
    expect(citation).toMatchObject({ proposition_supported: quote, verification_status: 'verified', page: 27, chunk_index: 9 });
    expect(createCanonicalCitation({ ...ref, page: 26 }, quote, pages, docs)).toBeNull();
    expect(createCanonicalCitation(ref, 'Se admite el recurso de revisión.', pages, docs)).toBeNull();
  });
  it('accepts a paraphrase only with a current source-bound existing semantic review', () => {
    const claim = { id: 'f', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      source_document_id: 'doc', source_page: 27, source_quote: quote };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash, supporting_quote: quote, reason: 'Fuente cotejada.' };
    expect(createCanonicalCitation(ref, claim.description, pages, docs, { claim, review })).not.toBeNull();
    expect(createCanonicalCitation(ref, claim.description, pages, docs, { claim, review: { ...review, hash: 'stale' } })).toBeNull();
    expect(createCanonicalCitation(ref, claim.description, pages, docs, { claim, review: { ...review, verdict: 'insufficient' } })).toBeNull();
  });
  it('preserves source-bound review evidence through the actual final report projection', () => {
    const claim = { id: 'f', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      speaker_role: 'scjn', proposition_type: 'holding', adoption_status: 'adopted',
      potential_impact: 'La determinación forma parte del análisis de la resolución.',
      source_document_id: 'doc', source_page: 27, source_quote: quote };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash, supporting_quote: quote, reason: 'Fuente cotejada.' };
    const citation = createCanonicalCitation(ref, claim.description, pages, docs, { claim, review })!;
    const input: any = { case: { case_type: 'civil', case_analysis_mode: 'concluded_audit' }, documents: [{ id: 'doc' }],
      agents: [], analysis: null, score: null, findings: [{ ...claim, verification_status: 'unverified', metadata: { semantic_support_review: review } }], report: { report_mode: 'LIMITED', citations: writerCitationCatalog([ref], pages, docs),
        full_report: { pre_release_source_pages: pages,
          source_audit: { canonical_sources: [{ document_id: 'doc', canonical_source_id: 'doc', original_filename: 'source.pdf', source_aliases: [] }] },
          mandatory_decision_core: { items: [{ id: 'core', kind: 'COURT_HOLDING', text: claim.description, source_refs: [citation], speaker_role: 'scjn' }] } } } };
    input.report.executive_summary = 'El informe recoge la determinación documentada en la resolución judicial aportada para su revisión.';
    const result = composeFinalReportPayload(input);
    expect(validateFinalReportContract(result).blocking_errors).toEqual([]);
    const stored = (result.report!.full_report as any).mandatory_decision_core.items[0].source_refs[0];
    stored.proposition_verification.claim.description = 'Se admite el recurso.';
    expect(validateFinalReportContract(result).blocking_errors.join(' ')).toContain('proposition_not_supported');
  });
  it('keeps Civil attribution-safe text after core alignment without certifying a new assertion', () => {
    const claim = { id: 'f', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      source_module: 'decision_core', speaker_role: 'scjn', proposition_type: 'court_holding', adoption_status: 'adopted',
      source_document_id: 'doc', source_page: 27, source_quote: quote, verification_status: 'verified' };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash, supporting_quote: quote };
    const citation = createCanonicalCitation(ref, claim.description, pages, docs, { claim, review })!;
    const core: any = [{ id: 'core', kind: 'COURT_HOLDING', text: claim.description,
      source_refs: [citation], speaker_role: 'scjn', proposition_type: 'holding', adoption_status: 'adopted' }];
    const original = [{ ...claim, evidence_refs: [citation], metadata: { mandatory_decision_core_id: 'core', semantic_support_review: review } }];
    const input: any = { case: { case_type: 'civil', case_analysis_mode: 'concluded_audit' }, documents: [{ id: 'doc' }],
      agents: [], analysis: null, score: null, findings: alignDecisionCoreFindings(original, core, 'es'),
      report: { report_mode: 'LIMITED', citations: writerCitationCatalog([ref], pages, docs), full_report: {
        pre_release_source_pages: pages, mandatory_decision_core: { items: core },
        source_audit: { canonical_sources: [{ document_id: 'doc', canonical_source_id: 'doc', source_aliases: [] }] } } } };
    input.report.executive_summary = 'El informe recoge la determinación documentada en la resolución judicial aportada para su revisión.';
    const result = composeFinalReportPayload(input, original);
    expect(result.findings![0].description).toContain('Atribución pendiente');
    expect(validateFinalReportContract(result).blocking_errors).toEqual([]);
    result.findings![0].description = 'El tribunal admitió el recurso.';
    bindAttributedFindingCitations(result);
    expect(validateFinalReportContract(result).blocking_errors.join(' ')).toContain('published_proposition_mismatch');
  });
  it('rejects report-authored review proof and changes to reviewed attribution', () => {
    const claim = { id: 'f', title: 'Alegación', description: 'La parte solicita desechar el recurso.',
      speaker_role: 'party', proposition_type: 'allegation', adoption_status: 'party_position',
      source_document_id: 'doc', source_page: 27, source_quote: quote };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash, supporting_quote: quote };
    const proof = { claim, review };
    expect(createCanonicalCitation({ ...ref, proposition_verification: proof }, claim.description, pages, docs)).toBeNull();
    expect(createCanonicalCitation({ ...ref, speaker_role: 'scjn' }, claim.description, pages, docs, proof)).toBeNull();
    const forged = { ...ref, proposition_supported: claim.description, verification_status: 'verified', proposition_verification: proof };
    const payload: any = { case: {}, documents: [{ id: 'doc' }], findings: [], report: { citations: [forged],
      full_report: { pre_release_source_pages: pages } } };
    expect(auditReportCitationIntegrity(payload).errors.join(' ')).toContain('proposition_not_supported');
    payload.findings = [{ ...claim, metadata: { semantic_support_review: review } }];
    payload.report.full_report.mandatory_decision_core = { items: [{ text: claim.description, speaker_role: 'scjn', source_refs: [forged] }] };
    expect(auditReportCitationIntegrity(payload).errors.join(' ')).toContain('reviewed_attribution_mismatch');
  });
  it('writer references resolve to the verified catalogue and the final citation gate accepts it', () => {
    const catalog = writerCitationCatalog([ref], pages, docs);
    const prose = quote + ' [DOC 1 p.27]';
    expect(() => assertWriterCitationReferences(prose, catalog)).not.toThrow();
    expect(() => assertWriterCitationReferences('Otra afirmación [DOC 1 p.27]', catalog)).toThrow();
    expect(() => assertWriterCitationReferences(quote + ' [DOC 1 p.99]', catalog)).toThrow();
    // The quote exists only on physical PDF page 27. An adjacent number alone
    // is never evidence of a valid extracted-page offset.
    expect(() => assertWriterCitationReferences(quote + ' [DOC 1 p.26]', catalog)).toThrow();
    expect(() => assertWriterCitationReferences(quote + ' [DOC 1 p.28]', catalog)).toThrow();
    const payload: any = { case: {}, documents: [{ id: 'doc', doc_n: 1, canonical_source_id: 'doc' }], report: { executive_summary: prose,
      citations: catalog, full_report: { pre_release_source_pages: pages } } };
    expect(auditReportCitationIntegrity(payload).ok).toBe(true);
    payload.report.citations[0].quote = 'Texto inexistente.';
    expect(auditReportCitationIntegrity(payload).ok).toBe(false);
  });
  it('resolves a reviewed paraphrase through its stable finding ID and exact source binding', () => {
    const claim = { id: 'reviewed-finding', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      source_document_id: 'doc', source_page: 27, source_quote: quote };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash,
      supporting_quote: quote, reason: 'Fuente cotejada.' };
    const input: any = { case: { case_type: 'civil' }, documents: [{ id: 'doc', doc_n: 1 }],
      agents: [], analysis: null, score: null,
      findings: [{ ...claim, metadata: { semantic_support_review: review } }],
      report: { executive_summary: 'Resumen documental de la resolución y sus efectos en el asunto civil. '.repeat(3),
        citations: [{ ...ref, finding_id: claim.id }],
        full_report: { pre_release_source_pages: pages,
          source_audit: { canonical_sources: [{ document_id: 'doc', canonical_source_id: 'doc',
            original_filename: 'source.pdf', display_name: 'source.pdf', source_aliases: [] }] },
          prose: { legal_analysis: `${claim.description} [DOC 1 p.27]` } } } };
    const composed = composeFinalReportPayload(input);
    const citation = composed.report!.citations[0] as any;
    expect(citation).toMatchObject({ proposition_supported: claim.description, verification_status: 'verified' });
    expect(auditReportCitationIntegrity(composed).errors.filter(error => error.includes('inline_'))).toEqual([]);

    const forged = structuredClone(input);
    forged.report.citations[0].finding_id = 'nonexistent-finding';
    const blocked = composeFinalReportPayload(forged);
    expect(validateFinalReportContract(blocked).blocking_errors.join(' ')).toContain('inline_proposition_not_supported');
  });

  it('publishes the reviewed finding paraphrase, with full canonical identity, to the Writer catalog', () => {
    const claim = { id: 'reviewed-catalog-finding', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      source_document_id: 'doc', source_page: 27, source_quote: quote, execution_id: 'run-current' };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash,
      supporting_quote: quote, reason: 'Fuente cotejada.' };
    const sourceRef = { ...ref, finding_id: claim.id };
    const finding = { ...claim, verification_status: 'verified', evidence_refs: [sourceRef], metadata: { execution_id: 'run-current', semantic_support_review: review } };
    const catalog = writerCitationCatalog([sourceRef], pages, docs, [finding], { caseId: 'case-current', executionId: 'run-current' });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      proposition_supported: claim.description,
      canonical_source_id: 'doc', document_id: 'doc', doc_n: 1, page: 27,
      finding_id: claim.id, case_id: 'case-current', execution_id: 'run-current',
      verification_status: 'verified', source_location_verified: true,
    });
    expect(catalog[0].writer_ref_id).toMatch(/^cite_[a-f0-9]{24}$/);
  });

  it('does not publish quarantined or non-reportable claims to the Writer catalog', () => {
    const diagnostic = { entailment_status: 'ENTAILED', claim_action: 'KEEP', final_reportable: true };
    const valid = { ...ref, verification_status: 'verified', source_location_verified: true,
      proposition_supported: quote, metadata: { claim_entailment_diagnostic: diagnostic } };
    expect(writerCitationCatalog([valid], pages, docs)).toHaveLength(1);
    for (const rejected of [
      { ...valid, verification_status: 'quarantined' },
      { ...valid, metadata: { claim_entailment_diagnostic: { ...diagnostic, final_reportable: false } } },
      { ...valid, metadata: { claim_entailment_diagnostic: { ...diagnostic, claim_action: 'REMOVE' } } },
    ]) expect(writerCitationCatalog([rejected], pages, docs)).toHaveLength(0);
  });

  it('keeps citations execution-scoped when finding reviews are matched', () => {
    const claim = { id: 'finding-current', title: 'Determinación', description: 'Se desecha el recurso de revisión.',
      source_document_id: 'doc', source_page: 27, source_quote: quote, execution_id: 'run-current' };
    const review: any = { version: 1, verdict: 'supported', hash: supportInput(claim, pages).hash,
      supporting_quote: quote };
    const refCurrent = { ...ref, finding_id: claim.id, execution_id: 'run-current' };
    const refStale = { ...ref, finding_id: claim.id, execution_id: 'run-old' };
    const finding = { ...claim, execution_id: 'run-current', evidence_refs: [refCurrent], metadata: { execution_id: 'run-current', semantic_support_review: review } };
    expect(writerCitationCatalog([refCurrent, refStale], pages, docs, [finding], { executionId: 'run-current' }))
      .toMatchObject([{ execution_id: 'run-current', proposition_supported: claim.description }]);
  });
});
