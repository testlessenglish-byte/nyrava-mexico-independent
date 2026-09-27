import { describe, expect, it } from 'vitest';
import { prepareCivilReport, auditCivilReport } from '../report-contract';
import { assessCase } from '../../reporting/qualitative-assessment';
const source = 'La parte actora reclama daño moral. Los quejosos alegan que el tribunal omitió valorar el dictamen. Postura procesal actual: revisión. Estado procesal: concluido.';
const payload = () => ({ case: { case_type: 'civil' }, documents: [{ id: 'd', doc_n: 1 }], findings: [{ id: 'f', title: 'El tribunal omitió valorar el dictamen', description: 'Los quejosos alegan que el tribunal omitió valorar el dictamen.', severity: 'high', evidence_refs: [{ document_id: 'd', page: 1, quote: 'Los quejosos alegan que el tribunal omitió valorar el dictamen.' }] }], report: { missing_evidence_struct: [{ item: 'Dictamen del juicio de origen', recommendation: 'Consideren la posibilidad de presentar nuevas pruebas o testimonios.' }], full_report: { pre_release_source_pages: [{ document_id: 'd', page: 1, text: source }] } } });
describe('Civil report integration', () => {
  it.each([
    ['contractual_default', 'Se reclama incumplimiento contractual. El contrato celebrado impone pago vencido.', 'incumplimiento contractual', 'exige interpelación previa; los elementos son: contrato, incumplimiento'],
    ['moral_harm', 'La actora reclama daño moral.', 'daño moral', 'los elementos son: daño, causalidad'],
    ['lease_performance', 'Se reclama el pago de rentas del contrato de arrendamiento celebrado.', 'arrendamiento', 'los elementos son: contrato de arrendamiento, renta vencida'],
    ['property_title', 'La actora reclama la propiedad y posesión del inmueble.', 'propiedad', 'los elementos son: título, identidad del inmueble'],
  ])('admits %s only with its own sourced predicates and law', (key, facts, issue, requirements) => {
    const data: any = payload(); data.findings = [];
    const authority = `Este tribunal determina que la legislación sustantiva de Jalisco para ${issue} es aplicable al fondo del juicio y ${requirements}.`;
    data.report.full_report.pre_release_source_pages[0].text = `${facts}\n\n${authority}`;
    prepareCivilReport(data);
    expect(data.report.full_report.civil_rule_applicability[key].apply).toBe(true);
    for (const denied of [authority.replace('es aplicable', 'no es aplicable'), authority.replace('exige interpelación', 'no exige interpelación')]) {
      if (denied === authority) continue;
      const negative = payload() as any; negative.findings = [];
      negative.report.full_report.pre_release_source_pages[0].text = `${facts}\n\n${denied}`;
      prepareCivilReport(negative);
      expect(negative.report.full_report.civil_rule_applicability[key].apply).toBe(false);
    }
    const wrong = structuredClone(data);
    wrong.report.full_report.civil_authorities = [];
    wrong.report.full_report.pre_release_source_pages[0].text = facts;
    prepareCivilReport(wrong);
    expect(wrong.report.full_report.civil_rule_applicability[key].apply).toBe(false);
  });
  it('blocks inapplicable rules and truncated conclusions in narrative sections', () => {
    const data: any = payload();
    data.report.executive_summary = 'Se requiere interpelación previa al incumplimiento.';
    prepareCivilReport(data);
    expect(auditCivilReport(data).errors).toContain('civil_rule_not_applicable:contractual_default');
    data.report.executive_summary = 'La acción procede porque';
    expect(auditCivilReport(data).errors).toContain('civil_semantic_content_incomplete');
    data.report.executive_summary = 'Se acredita la responsabilidad y debe indemnizar a la actora.';
    expect(auditCivilReport(data).errors).toContain('civil_unsupported_legal_conclusion');
  });
  it('does not revive a finding suppressed only by its publication decision', () => {
    const data: any = payload(); data.findings[0].metadata = { published_claim: { publication_status: 'SUPPRESSED' } };
    prepareCivilReport(data); expect(data.findings).toHaveLength(0);
  });
  it('never elevates a lower court statement to a reviewing court conclusion', () => {
    const data: any = payload(); const quote = 'El tribunal de origen resolvió que la demanda era improcedente.';
    data.report.full_report.pre_release_source_pages[0].text = quote;
    data.findings[0].evidence_refs[0].quote = quote; data.findings[0].description = 'Este tribunal revisor resolvió la demanda improcedente.';
    prepareCivilReport(data); expect(data.findings[0].description).not.toContain('Este tribunal revisor');
    expect(data.findings[0].description).toContain('órgano de origen');
  });
  it('propagates canonical allegation attribution and separates corpus requests from procedural advice', () => {
    const data: any = payload(); prepareCivilReport(data);
    expect(data.findings[0].canonical_attribution.attribution_type).toBe('PARTY_ALLEGATION');
    expect(data.findings[0].title).toMatch(/Alegación/);
    expect(data.findings[0].speaker_role_label).not.toBe('NO DETERMINADO');
    expect(JSON.stringify(data.report.missing_evidence_struct)).not.toContain('presentar nuevas pruebas');
    expect(data.report.missing_evidence_struct[0].gap_type).toBe('ANALYTICAL_CORPUS_GAP');
    expect(data.report.full_report.civil_elements_matrix.length).toBeGreaterThan(0);
    expect(data.report.full_report.civil_procedural_context.applicable_substantive_law_entity.status).toBe('UNRESOLVED');
  });
  it.each(['familiar', 'penal', 'migratorio'])('leaves %s substantive report routing and content untouched', materia => {
    const data: any = payload(); data.case.case_type = materia; const before = structuredClone(data);
    prepareCivilReport(data); expect(data).toEqual(before); expect(auditCivilReport(data).ok).toBe(true);
  });
  it('blocks unsupported or truncated Civil conclusions rather than filling missing words', () => {
    const data: any = payload(); data.findings[0].description = 'La responsabilidad civil es procedente porque';
    expect(auditCivilReport(data).errors).toContain('civil_semantic_content_incomplete');
  });
  it.each(['material_authority_unresolved', 'material_citations_unresolved', 'underlying_record_absent'])('prioritizes insufficiency when %s', key => {
    const finding = (direction: string) => ({ id: direction, impact_direction: direction, finding_type: 'DIRECT_EVIDENCE', source_document_id: 'd', source_page: 1, source_quote: 'Recorded fact' });
    expect(assessCase({ full_report: { assessment_limitations: { [key]: true } } }, [finding('strengthens'), finding('weakens')]).state).toBe('INSUFFICIENT_EVIDENCE');
  });
});
