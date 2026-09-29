import { describe, expect, it } from 'vitest';
import { canonicalizeReportCitations, auditReportCitationIntegrity } from '../citation-integrity';
import { findingCitationReviews } from '../citation-production';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';
import { supportInput } from '../../intelligence/claim-support-review';

const quote = 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.';
function fixture(): any {
  const pages = [{ document_id: 'doc', page: 27, text: quote,
    document_scope: { purpose: 'case_record', connection: { verified: true, mode: 'direct' } } }];
  const finding: any = { id: 'ordinary-finding', case_id: 'case', execution_id: 'execution',
    title: 'Determinación', description: 'Se desecha el recurso de revisión.',
    source_module: 'agent:document_analysis', severity: 'high', confidence: .95,
    source_document_id: 'doc', source_page: 27, source_quote: quote,
    speaker_role: 'scjn', proposition_type: 'holding', adoption_status: 'adopted',
    verification_status: 'verified', finding_status: 'verified',
    evidence_refs: [{ document_id: 'doc', doc_n: 1, page: 27, quote, verified: true }],
    metadata: { execution_id: 'execution', semantic_support_review: undefined } };
  finding.metadata.semantic_support_review = { version: 1, verdict: 'supported',
    hash: supportInput(finding, pages).hash, supporting_quote: quote, reason: 'Offline completed review fixture.' };
  return { case: { id: 'case', execution_id: 'execution', case_type: 'amparo', report_language: 'es' },
    documents: [{ id: 'doc', doc_n: 1, canonical_source_id: 'doc', filename: 'source.pdf' }],
    findings: [finding], agents: [], analysis: null, score: null,
    citation_review_registry: findingCitationReviews([finding]),
    report: { case_id: 'case', execution_id: 'execution', report_mode: 'LIMITED',
      scores_suppressed: true, motions_suppressed: true,
      executive_summary: 'El informe recoge la determinación documentada en la resolución judicial aportada para su revisión.',
      citations: [], full_report: { pre_release_source_pages: pages } } };
}

describe('ordinary finding semantic-review linkage', () => {
  it('certifies an unlinked evidence ref via its owning finding and binds both representations', () => {
    const input = fixture(), original = structuredClone(input);
    expect(input.findings[0].evidence_refs[0]).not.toHaveProperty('finding_id');
    const result = canonicalizeReportCitations(input), finding = result.findings[0], ref = finding.evidence_refs[0];
    for (const value of [finding, ref]) expect(value).toMatchObject({
      proposition_supported: finding.description, verification_status: 'verified', source_location_verified: true,
      proposition_verification: { claim: { id: finding.id } } });
    expect(ref.finding_id).toBe(finding.id);
    expect(finding.id).toBe('ordinary-finding');
    expect(finding.citation_id).toBe(ref.citation_id);
    expect(auditReportCitationIntegrity(result).errors).toEqual([]);
    expect(input).toEqual(original);
    expect(canonicalizeReportCitations(result)).toEqual(result);
  });

  it('passes actual report composition and final contract with certified finding cards', () => {
    const input = fixture();
    const result = composeFinalReportPayload(input, input.findings);
    expect(result.findings).toHaveLength(1);
    expect(result.report_presentation.finding_cards).toHaveLength(1);
    expect(result.report_presentation.finding_cards[0].finding.evidence_refs[0]).toMatchObject({
      proposition_supported: input.findings[0].description, verification_status: 'verified', source_location_verified: true });
    expect(validateFinalReportContract(result).blocking_errors).toEqual([]);
  });

  it.each(['description', 'title', 'document', 'page', 'quote', 'speaker', 'proposition type', 'adoption',
    'execution', 'metadata execution', 'case', 'source text', 'source scope', 'explicit wrong link',
    'ref execution', 'ref document', 'ref page', 'ref quote', 'ref attribution', 'unverified', 'quarantined', 'review verdict',
    'missing trusted review'])('does not certify changed or invalid %s', change => {
    const input = fixture(), f = input.findings[0], ref = f.evidence_refs[0];
    const pages = input.report.full_report.pre_release_source_pages;
    if (change === 'description') f.description = 'Se admite el recurso de revisión.';
    if (change === 'title') f.title = 'Resolución diferente';
    if (change === 'document') f.source_document_id = 'other';
    if (change === 'page') f.source_page = 28;
    if (change === 'quote') f.source_quote = 'Otra cita que no respalda esta determinación.';
    if (change === 'speaker') f.speaker_role = 'quejoso';
    if (change === 'proposition type') f.proposition_type = 'allegation';
    if (change === 'adoption') f.adoption_status = 'rejected';
    if (change === 'execution') f.execution_id = 'old-execution';
    if (change === 'metadata execution') f.metadata.execution_id = 'old-execution';
    if (change === 'case') f.case_id = 'other-case';
    if (change === 'source text') pages[0].text += ' Sin embargo esta determinación no corresponde al presente caso.';
    if (change === 'source scope') pages[0].document_scope.purpose = 'unrelated';
    if (change === 'explicit wrong link') ref.finding_id = 'missing-review';
    if (change === 'ref execution') ref.execution_id = 'old-execution';
    if (change === 'ref document') ref.document_id = 'other';
    if (change === 'ref page') ref.page = 28;
    if (change === 'ref quote') ref.quote = 'Otra cita que no respalda esta determinación.';
    if (change === 'ref attribution') ref.speaker_role = 'quejoso';
    if (change === 'unverified') ref.verification_status = 'unverified';
    if (change === 'quarantined') ref.publication_status = 'QUARANTINED';
    if (change === 'review verdict') input.citation_review_registry[0].review.verdict = 'insufficient';
    if (change === 'missing trusted review') input.citation_review_registry = [];
    const result = canonicalizeReportCitations(input);
    expect(result.findings[0].evidence_refs[0].proposition_supported).toBeUndefined();
    expect(auditReportCitationIntegrity(result).ok).toBe(false);
  });

  it('does not accept an unrelated section id as the owning finding', () => {
    const input = fixture();
    input.findings = [];
    input.report.extra = { id: 'ordinary-finding', description: 'Se desecha el recurso de revisión.',
      evidence_refs: [{ document_id: 'doc', page: 27, quote }] };
    expect(canonicalizeReportCitations(input).report.extra.evidence_refs[0].proposition_supported).toBeUndefined();
  });
});

describe('persistent semantic-review hash', () => {
  const reordered = (value: any): any => Array.isArray(value) ? value.map(reordered) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reordered(child)])) : value;
  it('survives recursive key reordering and JSON persistence including rationale and document scope', () => {
    const input = fixture(), f = input.findings[0], pages = input.report.full_report.pre_release_source_pages;
    f.rationale = { factors: [{ kind: 'source', approved: true }], attribution: { role: 'court', adopted: true } };
    const before = supportInput(f, pages);
    expect(supportInput(JSON.parse(JSON.stringify(reordered(f))), reordered(pages))).toEqual(before);
  });
  it.each(['quote', 'execution', 'attribution', 'scope', 'rationale', 'array order'])('changes the hash for changed %s', change => {
    const input = fixture(), f = input.findings[0], pages = input.report.full_report.pre_release_source_pages;
    f.rationale = { steps: ['one', 'two'] };
    const before = supportInput(f, pages).hash;
    if (change === 'quote') f.source_quote = 'Se desecha por improcedente el recurso';
    if (change === 'execution') f.execution_id = 'other';
    if (change === 'attribution') f.speaker_role = 'quejoso';
    if (change === 'scope') pages[0].document_scope.purpose = 'other';
    if (change === 'rationale') f.rationale.extra = 'unreviewed';
    if (change === 'array order') f.rationale.steps.reverse();
    expect(supportInput(f, pages).hash).not.toBe(before);
  });
});
