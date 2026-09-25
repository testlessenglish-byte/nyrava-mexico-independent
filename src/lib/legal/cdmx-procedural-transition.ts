/** Primary texts inspected 2026-09-24. A source inspection is not professional case validation. */
export const CDMX_TRANSITION_SOURCES = {
  original2024: {
    url: 'https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/f0c60d340528be09c3f10da316c56561.pdf',
    publicationDate: '2024-08-09', effectiveDate: '2024-08-10',
    locator: 'G.O. 1420 Bis, pp. 11–15; art. 1 A.I/B.I; considerando séptimo; transitorio segundo',
    verification: 'primary_text_inspected',
  },
  reform2026: {
    url: 'https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/cb9e153b7cd0b722dfc3bc41e3d9e703.pdf',
    publicationDate: '2026-05-29', effectiveDate: '2026-05-30',
    locator: 'G.O. 1869, pp. 38–39; art. 1 A.II–IV/B.II–III; transitorio segundo',
    verification: 'primary_text_inspected',
  },
} as const;

export const CDMX_PROCEEDING_TYPES = [
  'civil_hipotecario_oral', 'civil_arrendamiento_oral', 'civil_jurisdiccion_voluntaria',
  'civil_providencia_precautoria', 'civil_ejecutivo_oral', 'civil_ordinario_oral', 'civil_apremio',
  'familiar_jurisdiccion_voluntaria', 'familiar_sin_divorcio', 'familiar_justicia_restaurativa',
  'familiar_divorcio', 'familiar_sucesorio',
] as const;
export type CdmxProceedingType = typeof CDMX_PROCEEDING_TYPES[number];
export interface CdmxTransitionInput {
  /** Forum entity, never the substantive applicable-law entity. */
  courtEntity: string | null;
  courtOrder: 'local' | 'federal' | null;
  proceedingType: CdmxProceedingType | null;
  /** Original commencement, not appeal filing or a later procedural act. */
  proceedingStartedOn: string | null;
  asOf: string;
  evidence?: { startDateRefs: string[]; proceedingTypeRefs: string[] };
  jointElection?: { electedOn: string; allParties: boolean; evidenceRefs: string[] };
}
export interface CdmxTransitionResult {
  status: 'cnpcf' | 'legacy' | 'pending' | 'out_of_scope';
  reason: string;
  /** Category commencement; election date is retained in input, not substituted here. */
  effectiveFrom: string | null;
  sourceIds: (keyof typeof CDMX_TRANSITION_SOURCES)[];
  evidenceRefs: string[];
}
const firstPhase = new Set<CdmxProceedingType>(['civil_hipotecario_oral','civil_arrendamiento_oral',
  'familiar_jurisdiccion_voluntaria','familiar_sin_divorcio','familiar_justicia_restaurativa']);
function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
const refs = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((r): r is string => typeof r === 'string' && r.trim().length > 0) : [];

/** Limited local civil/family route assessment; not a calendar, deadline, or merits decision.
 * No suppletory, transferred, mixed/ambiguous, or generic 'other' route is inferred.
 * Future assessments are projections of these inspected texts and require source refresh.
 */
export function evaluateCdmxProceduralTransition(input: CdmxTransitionInput): CdmxTransitionResult {
  let effectiveFrom: string | null = null;
  const sourceIds: CdmxTransitionResult['sourceIds'] = ['original2024','reform2026'];
  const evidenceRefs = [...new Set([...refs(input.evidence?.startDateRefs), ...refs(input.evidence?.proceedingTypeRefs)])];
  const result = (status: CdmxTransitionResult['status'], reason: string): CdmxTransitionResult =>
    ({ status, reason, effectiveFrom, sourceIds, evidenceRefs });
  if (input.courtOrder === 'federal') return result('out_of_scope','federal_forum_not_local_declaration');
  if (!input.courtEntity || !input.courtOrder) return result('pending','court_scope_missing');
  if (!['CMX','ciudad_de_mexico','cdmx'].includes(input.courtEntity)) return result('out_of_scope','other_entity');
  if (!input.proceedingType || !CDMX_PROCEEDING_TYPES.includes(input.proceedingType)) return result('pending','proceeding_type_missing_or_unsupported');
  effectiveFrom = firstPhase.has(input.proceedingType) ? '2024-12-01' : '2027-04-01';
  if (!validDate(input.asOf) || !validDate(input.proceedingStartedOn) || input.proceedingStartedOn > input.asOf)
    return result('pending','commencement_or_assessment_date_invalid');
  if (input.asOf < '2026-05-30') return result('pending','historical_version_requires_separate_review');
  if (!refs(input.evidence?.startDateRefs).length || !refs(input.evidence?.proceedingTypeRefs).length)
    return result('pending','commencement_or_type_evidence_missing');
  if (input.proceedingStartedOn >= effectiveFrom) return result('cnpcf','commenced_on_or_after_category_start');
  if (input.jointElection) {
    const election = input.jointElection;
    if (election.allParties !== true || !refs(election.evidenceRefs).length || !validDate(election.electedOn)
      || election.electedOn < effectiveFrom || election.electedOn < input.proceedingStartedOn || election.electedOn > input.asOf)
      return result('pending','joint_election_not_proven_or_temporally_invalid');
    evidenceRefs.push(...refs(election.evidenceRefs).filter(ref => !evidenceRefs.includes(ref)));
    return result('cnpcf','documented_joint_election_after_category_start');
  }
  return result('legacy', input.asOf < effectiveFrom ? 'category_not_yet_commenced' : 'original_regime_preserved_no_documented_joint_election');
}
