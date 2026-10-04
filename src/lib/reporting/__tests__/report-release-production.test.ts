import { describe, it, expect, vi } from 'vitest';
import { completedCoreCitations, createCanonicalCitation, findingCitationReviews, writerCitationCatalog } from '../citation-production';
import { supportInput } from '../../intelligence/claim-support-review';
import { composeFinalReportPayload, validateFinalReportContract, releaseFinalReportPayload } from '../final-report-contract';
import { validateMandatoryDecisionCore, mandatoryDecisionCoreToFindings } from '../../intelligence/mandatory-decision-core';
import { freezeReleaseCandidate, bindCandidateApproval, contentHash } from '../release-candidate';
import { generateVerifiedReport } from '../verified-report';

const providers = vi.hoisted(() => ({ call: vi.fn(() => { throw new Error('AI forbidden in Report Generator'); }) }));
vi.mock('../../groq.server', () => ({ callGroq: providers.call, parseJsonLoose: JSON.parse }));
vi.mock('../../ai/router.server', () => ({ routeAI: providers.call }));

const documentId = '162f0262-3fc0-45f7-8235-4ddbb224a9f9';
const executionId = '482ecc11-7e26-4fc8-92e4-212f9f753cb9';
const question = '¿Se satisfacen los requisitos de procedencia del recurso de revisión establecidos en el artículo 81, fracción II de la Ley de Amparo?';
const holding = 'Se desecha el recurso de revisión.';
const a = 'PRIMERO. Se desecha el recurso de revisión a que este toca se refiere.';
const b = 'SEGUNDO. Queda firme la sentencia recurrida.';
const pages = [
  { document_id: documentId, page: 1, text: '¿En el caso se satisfacen los requisitos de procedencia del recurso de revisión establecidos en el artículo 81, fracción II de la Ley de Amparo?' },
  { document_id: documentId, page: 27, text: a },
  { document_id: documentId, page: 28, text: b },
];
const index = [{ document_id: documentId, doc_n: 1, canonical_source_id: documentId }];

export function productionFixture() {
  const definitions = [
    ['issue', 'CONTROLLING_ISSUE', question, pages[0]],
    ['holding', 'COURT_HOLDING', holding, pages[1]],
    ['disposition', 'DISPOSITION', a, pages[1]],
    ['disposition', 'DISPOSITION', b, pages[2]],
  ] as const;
  const findings: any[] = definitions.map(([id, kind, description, page], i) => {
    const f: any = { id: `finding-${i}`, case_id: 'case', execution_id: executionId,
      title: description, description, source_module: 'decision_core', category: kind.toLowerCase(),
      severity: 'high', confidence: .99, impact_direction: 'neutral', affected_party: 'neutral',
      source_document_id: documentId, source_page: page.page, source_quote: page.text,
      speaker_role: 'scjn', proposition_type: kind === 'CONTROLLING_ISSUE' ? 'issue' : kind === 'COURT_HOLDING' ? 'holding' : 'procedural_fact',
      adoption_status: kind === 'CONTROLLING_ISSUE' ? 'unresolved' : 'adopted',
      audit_classification: kind === 'COURT_HOLDING' ? 'VERIFIED_COURT_HOLDING' : 'VERIFIED_FACT',
      legal_significance: 'Determinación identificada en la resolución judicial.',
      potential_impact: 'Integra el análisis de la resolución concluida.', authority_level: 'court_record',
      verification_status: 'verified', metadata: { mandatory_decision_core_id: id, mandatory_decision_kind: kind,
        execution_id: executionId, reportable: true, score_moving: false } };
    f.metadata.semantic_support_review = { version: 1, verdict: 'supported', hash: supportInput(f, pages).hash,
      supporting_quote: page.text, reason: 'Offline fixture of completed independent source review.' };
    return f;
  });
  const registry = findings.map(f => {
    const proof = findingCitationReviews([f])[0];
    const c = createCanonicalCitation({ document_id: documentId, page: f.source_page, quote: f.source_quote,
      execution_id: executionId, case_id: 'case', finding_id: f.id }, f.description, pages, index, proof)!;
    expect(c).not.toBeNull();
    f.evidence_refs = [c];
    f.proposition_supported = f.description;
    f.source_location_verified = true;
    f.proposition_verification = proof;
    return c;
  });
  const stale = (c: any) => ({ ...c, verification_status: 'unverified', publication_status: 'QUARANTINED',
    source_location_verified: false, proposition_supported: undefined, certification_error: 'CORE_PROPOSITION_NOT_CERTIFIED' });
  const rawCore = [
    { id: 'issue', kind: 'CONTROLLING_ISSUE', text: question, speaker_role: 'scjn', source_refs: [stale(registry[0])] },
    { id: 'holding', kind: 'COURT_HOLDING', text: holding, speaker_role: 'scjn', source_refs: [stale(registry[1])] },
    { id: 'disposition', kind: 'DISPOSITION', text: a + ' ' + b, speaker_role: 'scjn', source_refs: [stale(registry[2]), stale(registry[3])] },
  ];
  const core = completedCoreCitations(rawCore, findings, pages, index, registry);
  const raw: any = { case: { id: 'case', execution_id: executionId, case_type: 'amparo',
    case_analysis_mode: 'concluded_audit', report_language: 'es' },
    documents: [{ id: documentId, doc_n: 1, canonical_source_id: documentId, filename: 'Resolución.pdf' }],
    findings, agents: [], analysis: null, score: null,
    perspectives: [{ perspective: 'Resolución', key_evidence: [{ description: holding, citation: registry[1] }] }],
    report: { id: 'report', case_id: 'case', execution_id: executionId, quality_blocked: false,
      report_mode: 'LIMITED', scores_suppressed: true, motions_suppressed: true, generated_language: 'es',
      executive_summary: registry.map(c => `“${c.proposition_supported}” [DOC 1 p.${c.page}]`).join('\n\n'),
      citations: registry, full_report: { pre_release_source_pages: pages,
        mandatory_decision_core: { items: core } } } };
  return { raw, core, registry, findings, payload: composeFinalReportPayload(raw) };
}

describe('production-shaped report release', () => {
  it('reuses certified controlling issue, holding and both disposition objects', () => {
    const { core, registry, findings } = productionFixture();
    expect(core.flatMap(c => c.source_refs)).toEqual(registry);
    core.flatMap(c => c.source_refs).forEach((ref, i) => expect(ref).toBe(registry[i]));
    expect(core[2].source_refs.map(c => [c.proposition_supported, c.page])).toEqual([[a, 27], [b, 28]]);
    expect(writerCitationCatalog(registry, pages, index, findings)[0]).toBe(registry[0]);
  });
  it('uses the full hash-bound review and rejects an altered claim or hash', () => {
    const { raw, findings } = productionFixture();
    const core = structuredClone(raw.report.full_report.mandatory_decision_core.items);
    core[0].source_refs = [{ document_id: documentId, page: 1, quote: pages[0].text }];
    expect(completedCoreCitations(core, findings, pages, index)[0].source_refs[0].verification_status).toBe('verified');
    findings[0].legal_significance = 'A different unreviewed claim';
    expect(completedCoreCitations(core, findings, pages, index)[0].source_refs).toEqual([]);
    expect(completedCoreCitations(core, findings, pages, index)[0].certification_error).toBe('CORE_PROPOSITION_NOT_CERTIFIED');
  });
  it('promotes A and B separately before verification', () => {
    const { core } = productionFixture();
    const promoted = mandatoryDecisionCoreToFindings({ core: core as any, caseId: 'case', userId: 'user', executionId });
    expect(promoted.map(f => f.description)).toEqual([question, holding, a, b]);
    expect(promoted.slice(2).map(f => f.source_page)).toEqual([27, 28]);
  });
  it('passes the actual final contract and release with 3 required, 3 represented, 0 missing', () => {
    const { payload, core } = productionFixture();
    expect(validateFinalReportContract(payload).blocking_errors).toEqual([]);
    expect(() => releaseFinalReportPayload(payload)).not.toThrow();
    expect(validateMandatoryDecisionCore(core as any, { executiveSummary: payload.report!.executive_summary,
      findings: payload.findings })).toMatchObject({ required: 3, represented: 3, missing: [], ok: true });
    expect(payload.report_presentation.finding_cards.length).toBeGreaterThan(0);
  });
  it.each(['unsupported proposition', 'wrong page', 'wrong document', 'wrong execution', 'unresolved canonical reference',
    'quarantined citation', 'unverified source', 'fabricated quote', 'missing atom'])('%s blocks', mutation => {
    const { payload } = productionFixture();
    const ref = (payload.report!.full_report as any).mandatory_decision_core.items[2].source_refs[1];
    if (mutation === 'unsupported proposition') (payload.report!.full_report as any).mandatory_decision_core.items[2].text += ' Se concede el amparo.';
    if (mutation === 'wrong page') ref.page = ref.page_number = 27;
    if (mutation === 'wrong document') ref.document_id = 'other-document';
    if (mutation === 'wrong execution') ref.execution_id = 'other-execution';
    if (mutation === 'unresolved canonical reference') ref.canonical_source_id = 'missing';
    if (mutation === 'quarantined citation') ref.publication_status = 'QUARANTINED';
    if (mutation === 'unverified source') ref.verification_status = 'unverified';
    if (mutation === 'fabricated quote') ref.quote = 'Se concede el amparo solicitado.';
    if (mutation === 'missing atom') (payload.report!.full_report as any).mandatory_decision_core.items[2].source_refs.pop();
    expect(validateFinalReportContract(payload).ok).toBe(false);
    expect(() => releaseFinalReportPayload(payload)).toThrow();
  });
  it('generates only the approved package with every provider disabled', () => {
    const { payload } = productionFixture();
    const candidate = freezeReleaseCandidate(payload);
    const approvals = Object.fromEntries(['report', 'qa', 'judge', 'hallucination', 'final_contract']
      .map(gate => [gate, bindCandidateApproval(candidate, gate, true)]));
    const before = contentHash(candidate.payload);
    const report = generateVerifiedReport({ ...candidate, approvals }, 'case', executionId);
    expect(contentHash(report)).toBe(before);
    expect(report.findings).toEqual(payload.findings);
    expect(report.report!.citations).toEqual(payload.report!.citations);
    expect(validateFinalReportContract(report).ok).toBe(true);
    expect(providers.call).not.toHaveBeenCalled();
    expect(() => generateVerifiedReport({ ...candidate, approvals: {} }, 'case', executionId)).toThrow('APPROVAL');
    const corrupted = structuredClone({ ...candidate, approvals });
    corrupted.payload.report!.executive_summary = 'Unapproved change';
    expect(() => generateVerifiedReport(corrupted, 'case', executionId)).toThrow('IDENTITY');
  });
});
