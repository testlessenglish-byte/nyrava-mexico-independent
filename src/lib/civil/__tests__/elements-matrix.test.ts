import { describe, expect, it } from 'vitest';
import { buildCivilElementsMatrix, classifyCivilAuthority, extractCivilAuthorityCandidates } from '../elements-matrix';
const quote = 'Este tribunal determina que rige como criterio obligatorio la legislación sustantiva de Jalisco; los elementos aplicables incluyen afectación. La controversia versa sobre daño moral.';
const pages = [{ document_id: 'd', page: 2, text: quote }];
const source_refs = [{ document_id: 'd', page: 2, quote }];
const authority = { id: 'law', issue: 'dano_moral', elements: ['afectacion'], entity: 'Jalisco', role: 'substantive', entity_verified: true, applicability_verified: true, controlling_verified: true, source_refs };
describe('Civil elements and authority contract', () => {
  it('derives applicable authority and its elements from the actual source, without model flags', () => {
    const text = 'Este tribunal determina que rige la legislación sustantiva de Jalisco para daño moral. Sus elementos aplicables son: afectación, nexo causal.';
    const authorityPages = [{ document_id: 'law', page: 3, text }];
    const candidates = extractCivilAuthorityCandidates(authorityPages);
    expect(candidates[0].entity).toBe('Jalisco');
    expect(candidates[0].elements).toEqual(['afectación', 'nexo causal']);
    expect(classifyCivilAuthority(candidates[0], authorityPages).status).toBe('AUTHORITY_APPLICABLE');
    expect(extractCivilAuthorityCandidates([{ ...authorityPages[0], text: 'La parte actora alega: ' + text }])).toEqual([]);
  });
  it('never promotes a mentioned federal code or reviewing court location to controlling law', () => {
    expect(classifyCivilAuthority({ ...authority, entity_verified: false }, pages).status).toBe('AUTHORITY_CANDIDATE');
    expect(classifyCivilAuthority({ label: 'Código Civil Federal' }, pages).status).toBe('AUTHORITY_MENTIONED');
    expect(classifyCivilAuthority(authority, pages).status).toBe('AUTHORITY_CONTROLLING');
  });
  it('does not promote arbitrary model flags or an allegation to applicable law', () => {
    const text = 'La parte actora alega que rige el Código Civil Federal para daño moral.';
    expect(classifyCivilAuthority({ ...authority, entity: 'Federal', source_refs: [{ ...source_refs[0], quote: text }] }, [{ ...pages[0], text }]).status).toBe('AUTHORITY_CANDIDATE');
    expect(classifyCivilAuthority({ ...authority, entity: 'Otra entidad' }, pages).status).toBe('AUTHORITY_CANDIDATE');
  });
  it('does not treat a nested party quotation of court words as applicable authority', () => {
    const inner = 'Este tribunal determina que la legislación sustantiva de Jalisco para la acción de daño moral es aplicable; los elementos son afectación y nexo causal.';
    const source = `Los actores sostienen lo siguiente:\n\n“${inner}”`;
    const p = [{ document_id: 'd', page: 2, text: source }];
    expect(extractCivilAuthorityCandidates(p)).toEqual([]);
    expect(classifyCivilAuthority({ ...authority, source_refs: [{ document_id: 'd', page: 2, quote: inner }] }, p).status).toBe('AUTHORITY_CANDIDATE');
  });
  it('keeps allegations separate from evidence and court findings', () => {
    const f = { id: 'f', civil_issue: 'dano_moral', civil_element: 'afectacion', impact_direction: 'strengthens', evidence_refs: source_refs, canonical_attribution: { attribution_type: 'PARTY_ALLEGATION', source_verified: true } };
    const rows = buildCivilElementsMatrix({ pages, authorities: [authority], findings: [f] });
    const row = rows.find(r => r.element === 'afectacion')!;
    expect(row.party_allegations).toHaveLength(1);
    expect(row.supporting_evidence).toHaveLength(0);
    expect(row.status).toBe('UNRESOLVED');
  });
  it('requires verified authority and evidence before supporting an element', () => {
    const evidenceText = 'Consta en el acta la afectación. No se acredita la afectación en el dictamen posterior.';
    const evidencePages = [...pages, { document_id: 'evidence', page: 1, text: evidenceText }];
    const f = { id: 'f', civil_issue: 'dano_moral', civil_element: 'afectacion', impact_direction: 'strengthens', evidence_refs: [{ document_id: 'evidence', page: 1, quote: 'Consta en el acta la afectación.' }], canonical_attribution: { attribution_type: 'DOCUMENTED_FACT', source_verified: true } };
    expect(buildCivilElementsMatrix({ pages: evidencePages, authorities: [], findings: [f] }).every(r => r.status === 'UNRESOLVED')).toBe(true);
    expect(buildCivilElementsMatrix({ pages: evidencePages, authorities: [authority], findings: [f] }).find(r => r.element === 'afectacion')?.status).toBe('SUPPORTED');
    expect(buildCivilElementsMatrix({ pages: evidencePages, authorities: [authority], findings: [f, { ...f, id: 'contrary', impact_direction: 'weakens', evidence_refs: [{ ...f.evidence_refs[0], quote: 'No se acredita la afectación en el dictamen posterior.' }] }] }).find(r => r.element === 'afectacion')?.status).toBe('DISPUTED');
  });
  it('a recitation of legal elements does not establish the underlying facts', () => {
    const f = { id: 'f', civil_issue: 'dano_moral', civil_element: 'afectacion', impact_direction: 'strengthens', evidence_refs: source_refs, canonical_attribution: { attribution_type: 'COURT_HOLDING', source_verified: true } };
    expect(buildCivilElementsMatrix({ pages, authorities: [authority], findings: [f] }).find(r => r.element === 'afectacion')?.status).toBe('UNRESOLVED');
  });
  it.each(['arrendamiento', 'propiedad', 'pago de deuda', 'incumplimiento contractual'])('never imports moral-harm elements into %s', issue => {
    const result = buildCivilElementsMatrix({ pages: [{ ...pages[0], text: `La controversia versa sobre ${issue}.` }], authorities: [authority], findings: [] });
    expect(result.some(r => r.issue === 'dano_moral')).toBe(false);
    expect(result.every(r => r.status === 'UNRESOLVED')).toBe(true);
  });
});
