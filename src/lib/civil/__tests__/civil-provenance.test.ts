import { describe, expect, it } from 'vitest';
import { attributeCivilProposition } from '../proposition-attribution';
import { classifyCivilEvidenceAvailability, resolveCivilProceduralContext } from '../procedural-context';

const page = (text: string) => ({ document_id: 'source', page: 8, text });
const finding = (quote: string) => ({ proposition: 'El tribunal omitió valorar la prueba.', source_refs: [{ document_id: 'source', page: 8, quote }] });
describe('Civil proposition attribution', () => {
  it('ends party scope after a closed quotation and paragraph before an explicit current holding', () => {
    const quote = 'Este tribunal determina que el agravio es infundado.';
    const source = `Los quejosos alegan: «El agravio es fundado».\n\n${quote}`;
    expect(attributeCivilProposition(finding(quote), [page(source)]).attribution_type).toBe('COURT_HOLDING');
  });
  it('preserves outer party scope across a paragraph boundary introducing a quotation', () => {
    const quote = 'Este tribunal determina que el agravio es fundado.';
    const source = `Los actores sostienen lo siguiente:\n\n“${quote}”`;
    expect(attributeCivilProposition(finding(quote), [page(source)]).attribution_type).toBe('PARTY_ALLEGATION');
  });
  it.each(['Los quejosos aducen que', 'Las actoras alegan que', 'Los recurrentes sostienen que', 'Las demandadas manifestaron que', 'Los apelantes se duelen de que'])('preserves plural party scope: %s', role => {
    const quote = `${role} el tribunal omitió valorar la prueba.`;
    const result = attributeCivilProposition(finding(quote), [page(quote)]);
    expect(result.attribution_type).toBe('PARTY_ALLEGATION');
    expect(result.safe_proposition).toContain(quote);
    expect(result.source_verified).toBe(true);
  });
  it('uses surrounding party scope when the supplied quote omits it', () => {
    const quote = 'El tribunal omitió valorar la prueba.';
    const result = attributeCivilProposition(finding(quote), [page(`Los quejosos alegan: «${quote}»`)]);
    expect(result.attribution_type).toBe('PARTY_ALLEGATION');
    expect(result.safe_proposition).toContain('Alegación');
  });
  it('does not elevate a quoted lower court to reviewing court holding', () => {
    const quote = 'La sala responsable resolvió: «Se absuelve a la demandada». Este tribunal estudia el agravio.';
    expect(attributeCivilProposition(finding(quote), [page(quote)]).attribution_type).toBe('LOWER_COURT_HOLDING');
  });
  it('does not trust judicial wrapper or unverified type', () => {
    expect(attributeCivilProposition({ ...finding('Se omitió valorar.'), attribution_type: 'COURT_HOLDING', document_type: 'sentencia' }, [page('Otro texto')]).attribution_type).toBe('UNRESOLVED');
  });
  it('recognizes an expressly speaking issuing court without relying on the wrapper', () => {
    const quote = 'Este tribunal resuelve que es infundado el agravio.';
    expect(attributeCivilProposition(finding(quote), [page(quote)]).attribution_type).toBe('COURT_HOLDING');
  });
  it('accepts the production GoldFinding scalar source_document_id shape', () => {
    const quote = 'Los quejosos alegan que no se valoró la prueba.';
    const result = attributeCivilProposition({ source_document_id: 'source', source_page: 8, source_quote: quote, evidence_refs: ['evidence-1'] }, [page(quote)]);
    expect(result.source_verified).toBe(true);
    expect(result.attribution_type).toBe('PARTY_ALLEGATION');
  });
});
describe('Civil independent procedural context', () => {
  it('resolves explicit source fields separately without a territorial law default', () => {
    const context = resolveCivilProceduralContext({ full_report: { pre_release_source_pages: [page('Materia de origen: civil. Procedimiento de origen: juicio ordinario civil. Postura procesal actual: amparo directo. Estado procesal: concluido.')] } });
    expect(context.underlying_materia.value).toBe('civil');
    expect(context.current_procedural_posture.value).toBe('amparo directo');
    expect(context.concluded.value).toBe(true);
    expect(context.applicable_substantive_law_entity.status).toBe('UNRESOLVED');
    expect(classifyCivilEvidenceAvailability({}, context).classification).toBe('LOCATE_EXISTING_RECORD');
  });
  it('keeps contradictory source fields unresolved', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('Entidad de la legislación sustantiva aplicable: Puebla.'), { ...page('Entidad de la legislación sustantiva aplicable: Jalisco.'), page: 9 }] });
    expect(context.applicable_substantive_law_entity.status).toBe('CONFLICT');
    expect(context.applicable_substantive_law_entity.value).toBeNull();
  });
  it('rejects unsupported structured fields and party allegations about posture', () => {
    const context = resolveCivilProceduralContext({ case: { jurisdiction: 'CDMX' }, source_pages: [page('Las actoras alegan: «Estado procesal: concluido».')], procedural_context_evidence: [{ field: 'originating_jurisdiction', value: 'CDMX', source_document: 'source', source_page: 8, supporting_excerpt: 'No existe' }] });
    expect(context.originating_jurisdiction.value).toBeNull();
    expect(context.concluded.value).toBeNull();
  });
  it('requires a source-backed applicable rule as well as an open posture', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('Postura procesal actual: primera instancia. Estado procesal: en trámite. Periodo probatorio: abierto. Legislación procesal aplicable: Código procesal local.')] });
    expect(classifyCivilEvidenceAvailability({ action: 'new_evidence' }, context).classification).toBe('UNRESOLVED');
    const rules = [{ verified: true, permits_new_evidence: true, applicable_procedural_law: 'Código procesal local', procedural_posture: 'primera instancia', source_document: 'rule', source_page: 2, supporting_excerpt: 'Podrán ofrecer pruebas durante el periodo abierto.' }];
    expect(classifyCivilEvidenceAvailability({ action: 'new_evidence' }, context, rules).classification).toBe('POTENTIALLY_ADMISSIBLE_NEW_EVIDENCE');
  });
  it('never recommends new evidence for a closed record', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('Postura procesal actual: revisión. Periodo probatorio: cerrado.')] });
    expect(classifyCivilEvidenceAvailability({ action: 'new_evidence' }, context).classification).toBe('NOT_PROCEDURALLY_AVAILABLE');
    expect(classifyCivilEvidenceAvailability({ action: 'certified_record' }, context).classification).toBe('OBTAIN_CERTIFIED_RECORD');
  });
  it('extracts only explicitly identified origin and current proceeding from natural source prose', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('El juicio de origen es un juicio ordinario civil. Se resuelve el presente amparo directo.')] });
    expect(context.underlying_proceeding_type.value).toBe('juicio ordinario civil');
    expect(context.underlying_materia.value).toBe('civil');
    expect(context.current_procedural_posture.value).toBe('amparo directo');
    expect(context.applicable_procedural_law.value).toBeNull();
  });
  it('leaves conflicting rule permissions unresolved', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('Postura procesal actual: primera instancia. Estado procesal: en trámite. Periodo probatorio: abierto. Legislación procesal aplicable: Código procesal local.')] });
    const rule = { verified: true, applicable_procedural_law: 'Código procesal local', procedural_posture: 'primera instancia', source_document: 'rule', source_page: 2, supporting_excerpt: 'Regla aplicable.' };
    expect(classifyCivilEvidenceAvailability({ action: 'new_evidence' }, context, [{ ...rule, permits_new_evidence: true }, { ...rule, permits_new_evidence: false }]).classification).toBe('UNRESOLVED');
  });
  it('does not turn quoted procedural history into current status', () => {
    const context = resolveCivilProceduralContext({ source_pages: [page('La sentencia anterior expresó: «Estado procesal: concluido». Se resuelve el presente amparo directo.')] });
    expect(context.concluded.value).toBeNull();
  });
});
