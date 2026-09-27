import { describe, expect, it } from 'vitest';
import { auditReportCitationIntegrity, canonicalizeReportCitations } from '../citation-integrity';
import { resolveFinalReleaseDecision } from '../final-release-decision';

const quote = 'El tribunal confirmó la sentencia recurrida.';
function payload(override: Record<string, unknown> = {}) {
  return { case: {}, documents: [{ id: 'doc-1', doc_n: 1, canonical_source_id: 'doc-1' }], analysis: null, agents: [], score: null,
    report: { executive_summary: `${quote} [DOC 1 p.1]`, citations: [{ document_id: 'doc-1', doc_n: 1,
      page: 1, quote, proposition_supported: quote, verification_status: 'verified', ...override }],
      full_report: { pre_release_source_pages: [{ document_id: 'doc-1', filename: 'Sentencia.pdf', page: 1, text: quote }] } } };
}
describe('final subscriber citation integrity', () => {
  function attributedPayload() {
    const data = payload();
    const excerpt = 'Este tribunal resuelve que se confirma la sentencia.';
    data.report.executive_summary = `${excerpt} [DOC 1 p.1]`;
    Object.assign(data.report.citations[0], { quote: excerpt, proposition_supported: excerpt });
    data.report.full_report.pre_release_source_pages[0].text = excerpt;
    const safe = `Determinación del órgano emisor (Órgano jurisdiccional emisor): ${excerpt}`;
    const finding = { description: safe, evidence_refs: [data.report.citations[0]],
      canonical_attribution: { attribution_type: 'COURT_HOLDING', speaker: 'Órgano jurisdiccional emisor',
        source_document: 'doc-1', source_page: 1, source_verified: true, supporting_excerpt: excerpt,
        safe_proposition: safe } };
    return Object.assign(data, { findings: [finding] });
  }
  it('accepts a reconstructed verified canonical attribution wrapper around the exact proposition', () => {
    expect(auditReportCitationIntegrity(attributedPayload()).ok).toBe(true);
  });
  it('canonicalizes citation metadata bound to a verified canonical attribution wrapper', () => {
    const data = attributedPayload(); data.report.executive_summary = '';
    Object.assign(data.report.citations[0], { proposition_supported: undefined, verification_status: undefined });
    expect(auditReportCitationIntegrity(canonicalizeReportCitations(data)).ok).toBe(true);
  });
  it.each(['fake-prefix', 'changed-assertion', 'wrong-speaker', 'wrong-source', 'unverified'])('blocks %s canonical attribution wrappers', defect => {
    const data = attributedPayload(); const f = data.findings[0]; const c = f.canonical_attribution;
    if (defect === 'fake-prefix') f.description = c.safe_proposition = `Hecho acreditado sin revisión: ${c.supporting_excerpt}`;
    if (defect === 'changed-assertion') f.description = `${c.safe_proposition} El acusado fue absuelto.`;
    if (defect === 'wrong-speaker') { c.speaker = 'Parte actora'; f.description = c.safe_proposition = `Determinación del órgano emisor (Parte actora): ${c.supporting_excerpt}`; }
    if (defect === 'wrong-source') c.source_document = 'other-document';
    if (defect === 'unverified') c.source_verified = false;
    expect(auditReportCitationIntegrity(canonicalizeReportCitations(data)).ok).toBe(false);
  });
  it('canonicalizes only a source-verified excerpt bound to the actual inline assertion, immutably', () => {
    const data = payload({ proposition_supported: undefined, verification_status: undefined });
    const result = canonicalizeReportCitations(data);
    expect(auditReportCitationIntegrity(result).ok).toBe(true);
    expect(data.report.citations[0].verification_status).toBeUndefined();
  });
  it('verifies a generated quoted numbered order as a complete literal assertion', () => {
    const data = payload({ proposition_supported: undefined, verification_status: undefined });
    const order = 'PRIMERO. Se confirma la sentencia recurrida.';
    data.report.citations[0].quote = order;
    data.report.full_report.pre_release_source_pages[0].text = order;
    data.report.executive_summary = `“${order}” [DOC 1 p.1]`;
    expect(auditReportCitationIntegrity(canonicalizeReportCitations(data)).ok).toBe(true);
  });
  it.each([`No es cierto que “${quote}” [DOC 1 p.1]`, `“${quote}” no ocurrió. [DOC 1 p.1]`])('does not discard negation around a literal quotation: %s', summary => {
    const data = payload({ proposition_supported: undefined, verification_status: undefined });
    data.report.executive_summary = summary;
    expect(auditReportCitationIntegrity(canonicalizeReportCitations(data)).ok).toBe(false);
  });
  it.each(['unbound', 'unrelated', 'wrong-page', 'explicit-unverified'])('does not certify %s citations during canonicalization', kind => {
    const data = payload({ proposition_supported: undefined, verification_status: undefined });
    if (kind === 'unbound') data.report.executive_summary = 'Resumen sin referencia.';
    if (kind === 'unrelated') data.report.executive_summary = 'El acusado fue absuelto. [DOC 1 p.1]';
    if (kind === 'wrong-page') data.report.citations[0].page = 2;
    if (kind === 'explicit-unverified') data.report.citations[0].verification_status = 'unverified';
    expect(auditReportCitationIntegrity(canonicalizeReportCitations(data)).ok).toBe(false);
  });
  it('accepts a literal, supported, located citation without changing the payload', () => {
    const data = payload(); const before = structuredClone(data);
    expect(auditReportCitationIntegrity(data).ok).toBe(true);
    expect(data).toEqual(before);
  });
  it.each([
    { quote: '' }, { quote: 'Cita documental referenciada en el texto' },
    { quote: 'Referencia localizada; transcripción/verificación pendiente' },
    { proposition_supported: '' }, { verification_status: 'unverified' },
    { proposition_supported: 'El tribunal no confirmó la sentencia recurrida.' },
    { proposition_supported: 'La parte actora confirmó la sentencia recurrida.' },
    { proposition_supported: 'El acusado fue absuelto de todos los cargos.' },
    { page: 2 }, { document_id: 'other-doc' },
  ])('rejects unresolved or unsupported citation %j', override => {
    expect(auditReportCitationIntegrity(payload(override)).ok).toBe(false);
  });
  it('does not use literal occurrence to support unrelated inline prose', () => {
    const data = payload(); data.report.executive_summary = 'El acusado fue absuelto. [DOC 1 p.1]';
    expect(auditReportCitationIntegrity(data).ok).toBe(false);
  });
  it('rejects an inline citation absent from the annex', () => {
    const data = payload(); data.report.citations = [];
    expect(auditReportCitationIntegrity(data).errors.join(' ')).toContain('inline_reference_unresolved');
  });
  it('rejects adjacent inline pages when the source and annex verify only page one', () => {
    const data = payload();
    data.report.executive_summary = `${quote} [DOC 1 p.2]`;
    expect(auditReportCitationIntegrity(data).errors.join(' ')).toContain('inline_reference_unresolved');
  });
  it('rejects an unresolved singular citation in subscriber cross examination', () => {
    const data = payload(); Object.assign(data.report, { cross_examination: [{
      text: quote, citation: { document_id: 'doc-1', page: 1, quote: '' },
    }] });
    expect(auditReportCitationIntegrity(data).ok).toBe(false);
  });
  it('rejects a speaker role that contradicts the exact quoted proposition', () => {
    expect(auditReportCitationIntegrity(payload({ speaker_role: 'quejoso' })).ok).toBe(false);
  });
  it('does not silently replace a conflicting page alias', () => {
    expect(auditReportCitationIntegrity(payload({ page_number: 2 })).ok).toBe(false);
  });
  it('rejects conflicting excerpt aliases instead of verifying only the preferred quote', () => {
    expect(auditReportCitationIntegrity(payload({ excerpt: 'El tribunal revocó la sentencia.' })).ok).toBe(false);
  });
  it('audits the separately displayed source_quote even when evidence refs are valid', () => {
    const data = payload(); Object.assign(data, { findings: [{ description: quote,
      source_document_id: 'doc-1', source_page: 1, source_quote: 'El tribunal revocó la sentencia.',
      evidence_refs: data.report.citations }] });
    expect(auditReportCitationIntegrity(data).ok).toBe(false);
  });
  it('excludes raw diagnostics and retained historical findings from published audit', () => {
    const data = payload(); Object.assign(data.report.full_report, { raw_findings: [{ source_quote: 'bogus' }],
      citation_audit: { quarantined_findings: [{ quote: 'bogus', document_id: 'doc-1' }] } });
    expect(auditReportCitationIntegrity(data).ok).toBe(true);
  });
  it.each(['Civil', 'Penal', 'Familiar', 'Migratorio'])('blocks the same material defect in %s with other verified content', materia => {
    const data = payload({quote: ''}); data.case = { materia };
    const audit = auditReportCitationIntegrity(data);
    const release = resolveFinalReleaseDecision({ report: { full_report: { final_published_claims: [{ id: 'valid' }] } },
      contract: { ok: audit.ok, blocking_errors: audit.errors }, errors: ['CITATION_UNRESOLVED'] });
    expect(release.released).toBe(false);
    expect(release.errors).toContain('CITATION_UNRESOLVED');
  });
});
