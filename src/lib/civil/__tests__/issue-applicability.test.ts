import { describe, expect, it } from 'vitest';
import { resolveActLexicon } from '../../reporting/legal-acts';
import { synthesizeEvidence } from '../../reporting/evidence-synthesis';
import { resolveCivilIssues, civilRuleApplicability, CIVIL_RULES, civilSpecialistScope } from '../issue-contract';

const page = (text: string) => ({ document_id: 'source', page: 1, text });
const ref = (quote: string) => ({ document_id: 'source', page: 1, quote });
describe('Civil issue applicability', () => {
  it('never activates obligations from civil alone', () => {
    expect(resolveActLexicon('civil').gaps.some(g => g.act === 'incumplimiento_alegado')).toBe(false);
  });
  it('does not read moral in daño moral as payment mora', () => {
    const result = synthesizeEvidence([{ canonical_source_id: 'source', name: 'Decision', quotes: ['La parte actora reclama daño moral.'], weight: { stars: 5, glyphs: '', label: 'Decision' } }], { caseType: 'civil' });
    expect(result?.lines.join(' ')).not.toMatch(/interpelación|incumplimiento/);
  });
  it.each([
    ['La actora demanda indemnización por daño moral y responsabilidad extracontractual.', ['dano_moral', 'responsabilidad_extracontractual']],
    ['Se reclama el incumplimiento contractual y el pago de la deuda.', ['incumplimiento_contractual', 'pago_cobro_deuda']],
    ['La controversia versa sobre arrendamiento.', ['arrendamiento']],
    ['La acción reivindicatoria de propiedad y posesión es objeto del juicio.', ['propiedad', 'posesion']],
  ])('resolves multiple source-backed issues: %s', (text, expected) => {
    expect(resolveCivilIssues([page(text)]).map(i => i.issue)).toEqual(expect.arrayContaining(expected));
  });
  it('does not establish issues from generic legal citations or excluded claims', () => {
    expect(resolveCivilIssues([page('El manual enumera arrendamiento, propiedad y daño moral. No se reclama incumplimiento contractual.')])).toEqual([]);
  });
  it('does not infer a debt claim from compensation requested for moral harm or a negated claim', () => {
    expect(resolveCivilIssues([page('La actora reclama el pago de una indemnización por daño moral.')]).map(i => i.issue)).toEqual(['dano_moral']);
    expect(resolveCivilIssues([page('La actora no reclama daño moral.')])).toEqual([]);
  });
  it('requires issue, facts, posture and applicable authority before a default rule executes', () => {
    const quote = 'Se reclama incumplimiento contractual. El contrato celebrado impone pago vencido. Este tribunal determina que la legislación sustantiva de Jalisco aplicable al fondo del juicio exige interpelación previa.';
    const pages = [page(quote)];
    const context = { issues: resolveCivilIssues(pages), pages, facts: [{ key: 'contract_exists', source_refs: [ref(quote)] }, { key: 'breach_alleged', source_refs: [ref(quote)] }], procedural_context: { status: 'VERIFIED', value: 'underlying_merits', source_refs: [ref(quote)] }, authorities: [{ id: 'local-rule', issue: 'incumplimiento_contractual', entity: 'Jalisco', status: 'AUTHORITY_APPLICABLE', role: 'substantive', entity_verified: true, applicability_verified: true, required_predicates: ['prior_demand_required'], source_refs: [ref(quote)] }] };
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, context).apply).toBe(true);
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, { ...context, authorities: [] }).apply).toBe(false);
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, { ...context, procedural_context: null }).apply).toBe(false);
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, { ...context, facts: [] }).apply).toBe(false);
    const unrelated = 'Este tribunal determina que la legislación sustantiva de Jalisco es aplicable al fondo del juicio.';
    const falseFacts = context.facts.map(f => ({ ...f, source_refs: [ref(unrelated)] }));
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, { ...context, pages: [...pages, page(unrelated)], facts: falseFacts }).apply).toBe(false);
    const falseAuthority = { ...context.authorities[0], source_refs: [ref(unrelated)] };
    expect(civilRuleApplicability(CIVIL_RULES.contractual_default, { ...context, pages: [...pages, page(unrelated)], authorities: [falseAuthority] }).apply).toBe(false);
    expect(resolveActLexicon('civil', context).gaps.some(g => g.act === 'incumplimiento_alegado')).toBe(true);
  });
  it.each([
    ['La acción por daño moral es objeto del juicio.', 'contractual_default'],
    ['Se reclama incumplimiento contractual.', 'moral_harm'],
    ['La acción de propiedad es objeto del juicio.', 'lease_performance'],
    ['Se reclama el pago de la deuda.', 'property_title'],
  ])('isolates incompatible issue %s from %s', (text, key) => {
    expect(civilRuleApplicability(CIVIL_RULES[key], { issues: resolveCivilIssues([page(text)]), pages: [page(text)] }).apply).toBe(false);
  });
  it('routes Civil specialists only to established issue families', () => {
    const docs = [{ id: 'source', text: 'La acción por daño moral es objeto del juicio.' }];
    expect(civilSpecialistScope('contract_analysis_ambiguity', docs).run).toBe(false);
    expect(civilSpecialistScope('liability_damages_assessment', docs).run).toBe(true);
    expect(civilSpecialistScope('contract_analysis_ambiguity', [{ id: 'source', text: 'Se reclama incumplimiento contractual.' }]).run).toBe(true);
  });
});
