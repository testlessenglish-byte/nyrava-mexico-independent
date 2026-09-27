/** Civil issue admission is separate from proof of liability or applicable law. */
import { attributeCivilProposition } from './proposition-attribution';
export type CivilRow = Record<string, any>;
export const civilFold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const CIVIL_ISSUES: Record<string, RegExp> = {
  dano_moral: /\bdano moral\b/,
  responsabilidad_contractual: /\bresponsabilidad (?:civil )?contractual\b/,
  responsabilidad_extracontractual: /\bresponsabilidad (?:civil )?extracontractual\b/,
  incumplimiento_contractual: /\bincumplimiento (?:del contrato|contractual)\b/,
  cumplimiento: /\bcumplimiento (?:del contrato|contractual|de (?:la )?obligacion)\b/,
  rescision: /\brescision\b/, nulidad: /\bnulidad\b/, obligaciones: /\bobligaciones?\b/,
  pago_cobro_deuda: /\b(deuda|adeudo|cobro de (?:pesos|cantidad)|pago (?:del precio|de rentas)|obligacion de pago)\b/,
  arrendamiento: /\barrendamiento\b/, propiedad: /\b(propiedad|reivindicatoria)\b/,
  posesion: /\bposesion\b/, prescripcion: /\bprescripcion\b/,
};
export interface CivilIssue { issue: string; status: 'VERIFIED'; source_refs: CivilRow[] }
export function civilSourceVerified(ref: CivilRow, pages: CivilRow[]): boolean {
  const quote = civilFold(ref.quote ?? ref.supporting_excerpt);
  const id = ref.document_id ?? ref.source_document;
  const page = Number(ref.page ?? ref.source_page);
  return Boolean(id && page > 0 && quote.length >= 12 && pages.some(p =>
    (p.document_id ?? p.id) === id && Number(p.page ?? p.page_number) === page && civilFold(p.text ?? p.content).includes(quote)));
}
/** A pleaded/decided issue must occur in a source assertion, not merely a
 * keyword in a law list, filename, case title or a rejected hypothetical. */
export function resolveCivilIssues(pages: CivilRow[]): CivilIssue[] {
  const found = new Map<string, CivilIssue>();
  for (const p of pages) {
    if (!p.document_id || !(Number(p.page) > 0)) continue;
    for (const excerpt of String(p.text ?? '').split(/(?<=[.;!?])\s+|\n+/)) {
      const text = civilFold(excerpt);
      if (!/\b(reclama[n]?|demanda[n]?|accion|controversia|litigio|pretension|juicio|se resuelve|se condena)\b/.test(text) ||
          /\b(no (?:se )?reclama|no es objeto|ajeno a la controversia|hipotetic|a modo de ejemplo|manual|enumera|descarta)\b/.test(text)) continue;
      for (const [issue, pattern] of Object.entries(CIVIL_ISSUES)) {
        if (!pattern.test(text)) continue;
        const ref = { document_id: p.document_id, page: Number(p.page), quote: excerpt.trim() };
        if (!civilSourceVerified(ref, pages)) continue;
        const existing = found.get(issue) ?? { issue, status: 'VERIFIED' as const, source_refs: [] };
        existing.source_refs.push(ref); found.set(issue, existing);
      }
    }
  }
  return [...found.values()];
}
export interface CivilRule {
  id: string; applicable_issue_types: string[]; required_facts: string[];
  required_procedural_context: string[]; required_authority_context: string[]; exclusions: string[];
}
export function civilFindingReportable(f: CivilRow): boolean {
  const m = f.metadata ?? {}, diagnostic = m.claim_entailment_diagnostic ?? {};
  return !f.superseded_at && !f.quarantined && !f.stale && !m.quarantined &&
    !['suppressed', 'quarantined', 'superseded', 'rejected'].includes(f.lifecycle_status) && f.finding_status !== 'suppressed' &&
    !['quarantined', 'rejected', 'unverified'].includes(f.verification_status) &&
    ![f.publication_status, m.publication_status, m.published_claim?.publication_status].some(s => ['SUPPRESSED', 'QUARANTINED'].includes(s)) &&
    diagnostic.final_reportable !== false && !['REMOVE', 'QUARANTINE'].includes(diagnostic.claim_action);
}
/** An asserted verification flag is not source evidence of applicable law. */
export function civilAuthorityContextVerified(a: CivilRow, pages: CivilRow[]): boolean {
  if (!a.source_refs?.length || !a.source_refs.every((r: CivilRow) => civilSourceVerified(r, pages))) return false;
  if (!a.source_refs.every((r: CivilRow) => attributeCivilProposition({ evidence_refs: [r] }, pages).attribution_type === 'COURT_HOLDING')) return false;
  const quotes = a.source_refs.map((r: CivilRow) => civilFold(r.quote)).join(' ');
  if (/\b(?:no (?:es |resulta |se considera )?aplicable|no (?:rige|se aplica)|inaplicable)\b/.test(quotes)) return false;
  const roles = a.role === 'substantive' ? /\bsustantiv[oa]\b/ : a.role === 'procedural' ? /\bprocesal\b/ : /$a/;
  return a.entity_verified === true && a.applicability_verified === true && Boolean(a.entity) &&
    quotes.includes(civilFold(a.entity)) && roles.test(quotes) && /\b(aplicable|rige|se aplica)\b/.test(quotes) &&
    /\b(este tribunal|esta sala|este juzgado)\b/.test(quotes) &&
    !/\b(alega[n]?|afirma[n]?|argumenta[n]?|aduce[n]?)\b/.test(quotes);
}
const rule = (id: string, issues: string[], facts: string[], authorities: string[]): CivilRule => ({
  id, applicable_issue_types: issues, required_facts: facts,
  required_procedural_context: ['underlying_merits'], required_authority_context: authorities,
  exclusions: ['excluded_by_verified_authority'],
});
export const CIVIL_RULES: Record<string, CivilRule> = {
  contractual_default: rule('contractual_default', ['incumplimiento_contractual', 'responsabilidad_contractual', 'obligaciones'], ['contract_exists', 'breach_alleged'], ['prior_demand_required']),
  moral_harm: rule('moral_harm', ['dano_moral'], ['harm_alleged'], ['moral_harm_elements']),
  lease_performance: rule('lease_performance', ['arrendamiento'], ['lease_exists'], ['lease_performance_elements']),
  property_title: rule('property_title', ['propiedad', 'posesion'], ['property_interest_alleged'], ['property_title_elements']),
};
export function civilRuleApplicability(rule: CivilRule, context: CivilRow) {
  const pages = context.pages ?? [];
  const evidenced = (item: CivilRow) => Array.isArray(item?.source_refs) && item.source_refs.length > 0 && item.source_refs.every((r: CivilRow) => civilSourceVerified(r, pages));
  const issues = (context.issues ?? []).filter((i: CivilRow) => i.status === 'VERIFIED' && evidenced(i));
  const factPatterns: Record<string, RegExp> = {
    contract_exists: /contrato celebrado|celebraron (?:el|un) contrato/,
    breach_alleged: /reclama.{0,50}incumplimiento contractual/,
    harm_alleged: /reclama.{0,60}dano moral/,
    lease_exists: /contrato de arrendamiento celebrado|celebraron (?:el|un) contrato de arrendamiento/,
    property_interest_alleged: /reclama.{0,60}(?:propiedad|posesion)/,
    excluded_by_verified_authority: /(?:este tribunal|esta sala|este juzgado).{0,100}(?:excluye|no es aplicable)/,
  };
  const facts = (context.facts ?? []).filter((f: CivilRow) => evidenced(f) && factPatterns[f.key] &&
    f.source_refs.some((r: CivilRow) => civilFold(r.quote).split(/(?<=[.;!?])\s+/).some(sentence =>
      factPatterns[f.key].test(sentence) && !/\bno (?:se )?(?:reclama|celebraron|existe)|no hay contrato/.test(sentence))));
  const authorities = (context.authorities ?? []).filter((a: CivilRow) =>
    ['AUTHORITY_APPLICABLE', 'AUTHORITY_CONTROLLING'].includes(a.status) && a.role === 'substantive' &&
    issues.some((i: CivilRow) => i.issue === a.issue && rule.applicable_issue_types.includes(i.issue)) &&
    civilAuthorityContextVerified(a, pages));
  const reasons: string[] = [];
  if (!issues.some((i: CivilRow) => rule.applicable_issue_types.includes(i.issue))) reasons.push('issue_unresolved');
  if (!rule.required_facts.every(key => facts.some((f: CivilRow) => f.key === key))) reasons.push('required_facts_unresolved');
  const posture = context.procedural_context;
  if (!posture || posture.status !== 'VERIFIED' || !evidenced(posture) || !rule.required_procedural_context.includes(posture.value)) reasons.push('procedural_context_unresolved');
  if (!rule.required_authority_context.every(key => authorities.some((a: CivilRow) => a.required_predicates?.includes(key) &&
    a.source_refs.some((r: CivilRow) => key === 'prior_demand_required'
      ? /exige (?:la )?interpelacion previa/.test(civilFold(r.quote)) && !/no exige (?:la )?interpelacion previa/.test(civilFold(r.quote))
      : /elementos?\s+(?:aplicables\s+)?(?:son|incluyen|requieren)/.test(civilFold(r.quote)))))) reasons.push('applicable_authority_unresolved');
  if (rule.exclusions.some(key => facts.some((f: CivilRow) => f.key === key))) reasons.push('exclusion_established');
  return { apply: reasons.length === 0, decision: reasons.length ? 'DO_NOT_APPLY' as const : 'APPLY' as const, reasons };
}
const SPECIALIST_ISSUES: Record<string, string[]> = {
  contract_analysis_ambiguity: ['responsabilidad_contractual', 'incumplimiento_contractual', 'cumplimiento', 'rescision', 'nulidad', 'arrendamiento'],
  liability_damages_assessment: ['dano_moral', 'responsabilidad_contractual', 'responsabilidad_extracontractual'],
  payment_insurance_analysis: ['pago_cobro_deuda', 'obligaciones', 'arrendamiento'],
  statute_of_limitations_analysis: ['prescripcion'],
  settlement_opportunity_analyzer: Object.keys(CIVIL_ISSUES),
};
/** Specialist admission permits issue investigation only; it never declares
 * that an article, obligation or remedy is applicable. */
export function civilSpecialistScope(agent: string, documents: readonly { id: string; text: string }[]) {
  const allowed = SPECIALIST_ISSUES[agent.replace(/^agent:/, '')];
  if (!allowed) return { run: true, reason: null, evidence: [], scopeStatus: 'not_required' as const };
  const issues = resolveCivilIssues(documents.map(d => ({ document_id: d.id, page: 1, text: d.text })));
  const matched = issues.filter(i => allowed.includes(i.issue));
  return { run: matched.length > 0, reason: matched.length ? null : 'civil_issue_applicability_unresolved',
    evidence: matched.flatMap(i => i.source_refs.map(r => ({ documentId: String(r.document_id), quote: String(r.quote) }))),
    scopeStatus: matched.length ? 'documentary_candidate' as const : 'unresolved' as const };
}
