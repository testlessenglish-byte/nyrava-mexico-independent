import { attributeCivilProposition } from './proposition-attribution';
import { resolveCivilProceduralContext, classifyCivilEvidenceAvailability } from './procedural-context';
import { buildCivilElementsMatrix, extractCivilAuthorityCandidates, classifyCivilAuthority } from './elements-matrix';
import { civilFold, resolveCivilIssues, civilFindingReportable, CIVIL_RULES, civilRuleApplicability, type CivilRow } from './issue-contract';
const rows = (v: unknown): CivilRow[] => Array.isArray(v) ? v : [];
export const isCivilReport = (data: CivilRow) => (data.case?.underlying_materia ?? data.report?.full_report?.case_identity?.underlying_materia ?? data.case?.case_type) === 'civil';
const unsafeFuture = /(?:presentar|ofrecer|aportar|introducir).{0,60}(?:nuevas? pruebas?|testimonios)|no presenta nuevas evidencias.*futuro/i;
const unresolvedFact = (f: CivilRow) => f.canonical_attribution?.attribution_type === 'UNRESOLVED' &&
  !/atribuci[oó]n.*pendiente|pendiente.*verificar/i.test(String(f.description));
const labels: Record<string, string> = { PARTY_ALLEGATION: 'Alegación de parte', COURT_HOLDING: 'Determinación del órgano emisor', LOWER_COURT_HOLDING: 'Determinación del órgano de origen', DOCUMENTED_FACT: 'Hecho documentado', PROCEDURAL_HISTORY: 'Antecedente procesal', EXPERT_OPINION: 'Opinión pericial', NYRAVA_INFERENCE: 'Inferencia de NYRAVA', UNRESOLVED: 'Atribución pendiente de verificar' };

/** Called before the shared publication pass. Stored raw diagnostic records
 * remain outside the subscriber projection; no other materia is transformed. */
export function prepareCivilReport(data: CivilRow): void {
  if (!isCivilReport(data) || !data.report) return;
  const full = data.report.full_report ??= {};
  const pages = rows(full.pre_release_source_pages);
  const context = resolveCivilProceduralContext(data);
  full.civil_procedural_context = context;
  full.civil_issues = resolveCivilIssues(pages);
  const originalStructuralErrors = auditCivilReport(data).errors.filter(e => ['civil_semantic_content_incomplete', 'civil_cross_subtype_contamination'].includes(e));
  data.findings = rows(data.findings).filter(civilFindingReportable).map(f => {
    const canonical = attributeCivilProposition(f, pages);
    const label = labels[canonical.attribution_type];
    const party = canonical.attribution_type === 'PARTY_ALLEGATION';
    const unresolved = canonical.attribution_type === 'UNRESOLVED';
    const metadata = { ...f.metadata };
    // A stale publication decision must not override current source attribution.
    delete metadata.published_claim;
    const result = { ...f, canonical_attribution: canonical, attribution_type: canonical.attribution_type,
      speaker_role: party ? 'party' : canonical.attribution_type === 'COURT_HOLDING' ? 'reviewing_court'
        : canonical.attribution_type === 'LOWER_COURT_HOLDING' ? 'lower_court' : unresolved ? 'unresolved' : canonical.speaker,
      speaker_role_label: label, metadata,
      title: `${label}: ${canonical.source_verified ? canonical.supporting_excerpt : 'revisar la fuente del hallazgo'}`,
      description: unresolved ? 'Atribución pendiente de verificar en la fuente; no se presenta como hecho establecido.' : canonical.safe_proposition,
      legal_significance: `Alcance limitado a la atribución verificada: ${label}.`, potential_impact: 'El efecto jurídico requiere verificación independiente de autoridad y contexto aplicables.',
      canonical_actions: [],
      ...(party ? { proposition_type: 'party_argument', content_class: 'PARTY_ARGUMENT', adoption_status: 'party_position' } : {}),
    };
    return result;
  });
  const candidates = extractCivilAuthorityCandidates(pages);
  full.civil_authorities = [...rows(full.civil_authorities).filter(a => !String(a.id).startsWith('civil-authority:')), ...candidates];
  const facts: CivilRow[] = [];
  for (const p of pages) {
    const text = civilFold(p.text), source_refs = [{ document_id: p.document_id, page: p.page, quote: String(p.text) }];
    if (/contrato celebrado|celebraron (?:el|un) contrato/.test(text)) facts.push({ key: 'contract_exists', source_refs });
    if (/se reclama.{0,50}incumplimiento contractual/.test(text)) facts.push({ key: 'breach_alleged', source_refs });
    if (/reclama.{0,60}dano moral/.test(text)) facts.push({ key: 'harm_alleged', source_refs });
    if (/contrato de arrendamiento celebrado|celebraron (?:el|un) contrato de arrendamiento/.test(text)) facts.push({ key: 'lease_exists', source_refs });
    if (/reclama.{0,60}(?:propiedad|posesion)/.test(text)) facts.push({ key: 'property_interest_alleged', source_refs });
  }
  const merits = pages.find(p => /(?:fondo del juicio|cuestion de fondo)/.test(civilFold(p.text)));
  full.civil_rule_context = { pages, issues: full.civil_issues, facts,
    procedural_context: merits ? { status: 'VERIFIED', value: 'underlying_merits', source_refs: [{ document_id: merits.document_id, page: merits.page, quote: String(merits.text) }] } : null,
    authorities: full.civil_authorities.map((a: CivilRow) => {
      const predicates: string[] = [];
      if (a.source_refs?.some((r: CivilRow) => /exige (?:la )?interpelacion previa/.test(civilFold(r.quote)) &&
        !/no exige (?:la )?interpelacion previa/.test(civilFold(r.quote)))) predicates.push('prior_demand_required');
      if (a.elements?.length) {
        if (a.issue === 'dano_moral') predicates.push('moral_harm_elements');
        if (a.issue === 'arrendamiento') predicates.push('lease_performance_elements');
        if (['propiedad', 'posesion'].includes(a.issue)) predicates.push('property_title_elements');
      }
      return { ...classifyCivilAuthority(a, pages), required_predicates: predicates };
    }) };
  full.civil_rule_applicability = Object.fromEntries(Object.entries(CIVIL_RULES).map(([key, rule]) => [key, civilRuleApplicability(rule, full.civil_rule_context)]));
  for (const f of data.findings) {
    f.civil_issue ??= f.metadata?.civil_issue ?? (full.civil_issues.length === 1 ? full.civil_issues[0].issue : undefined);
    f.civil_element ??= f.metadata?.civil_element;
    f.civil_elements = full.civil_authorities.filter((a: CivilRow) => a.issue === f.civil_issue).flatMap((a: CivilRow) =>
      rows(a.elements).map(String).filter(element => civilFold(f.canonical_attribution.supporting_excerpt).includes(civilFold(element))));
  }
  const matrix = buildCivilElementsMatrix({ pages, findings: data.findings, authorities: full.civil_authorities });
  for (const element of matrix) element.procedural_availability = classifyCivilEvidenceAvailability({ action: 'localizar constancia existente' }, context).classification;
  full.civil_elements_matrix = matrix;
  const gaps: CivilRow[] = rows(data.report.missing_evidence_struct).map(g => {
    const availability = classifyCivilEvidenceAvailability({ action: g.requested_action ?? g.recommendation ?? g.action }, context);
    return { ...g, gap_type: 'ANALYTICAL_CORPUS_GAP', corpus_scope: 'uploaded_documents_only',
      procedural_availability: availability.classification, procedural_reason: availability.reason,
      recommendation: 'Localizar y cotejar las constancias existentes del expediente; verificar por separado cualquier vía procesal disponible.',
      action: 'Localizar las constancias existentes para completar el corpus de análisis.',
    };
  });
  data.report.missing_evidence_struct = gaps;
  // Recommendations derive from the matrix and existing-record gaps, never
  // from a generic missing evidence => introduce new evidence shortcut.
  full.canonical_recommendations = matrix.filter(e => e.status === 'UNRESOLVED').map((e, i) => ({
    id: `civil-element-review-${i}`, title: `Verificar ${e.issue.replace(/_/g, ' ')}: ${e.element.replace(/_/g, ' ')}`,
    reason: e.status_reason, action_type: 'VERIFY_EXISTING_RECORD', owner: 'attorney', priority: 'normal',
    source_refs: full.civil_issues.find((issue: CivilRow) => issue.issue === e.issue)?.source_refs ?? [],
  }));
  const clean = (v: any, key = ''): any => {
    if (['metadata', 'quote', 'source_quote', 'supporting_excerpt', 'evidence_refs', 'source_refs', 'pre_release_source_pages'].includes(key)) return v;
    if (typeof v === 'string') return !unsafeFuture.test(v) ? v : v.split(/(?<=[.!?])\s+|\n/).map(sentence => unsafeFuture.test(sentence)
      ? 'Localizar las constancias existentes y verificar la disponibilidad procesal antes de cualquier actuación.' : sentence).join('\n');
    if (Array.isArray(v)) return v.map(x => clean(x));
    if (!v || typeof v !== 'object') return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, k)]));
  };
  for (const key of ['executive_summary', 'case_overview', 'risk_analysis', 'evidence_gaps', 'missing_evidence', 'recommendations', 'next_actions', 'strategy_recommendations']) {
    if (key in data.report) data.report[key] = clean(data.report[key], key);
  }
  for (const key of ['strategy_center', 'trial_prep', 'opportunities', 'work_product']) if (key in data) data[key] = clean(data[key], key);
  if (full.legal_memorandum) full.legal_memorandum = clean(full.legal_memorandum);
  const recordAbsent = gaps.some(g => g.underlying_record_absent === true || /(?:expediente|registro|constancias).*(?:origen|primera instancia)/.test(civilFold(g.item ?? g.title)));
  full.assessment_limitations = { ...full.assessment_limitations,
    material_authority_unresolved: !matrix.length || matrix.some(e => !e.authority.length),
    material_elements_unresolved: matrix.some(e => e.status === 'UNRESOLVED'), underlying_record_absent: recordAbsent };
  const quality = auditCivilReport(data);
  full.civil_quality = { ok: quality.ok && !originalStructuralErrors.length, errors: [...new Set([...quality.errors, ...originalStructuralErrors])] };
}

export function auditCivilReport(data: CivilRow): { ok: boolean; errors: string[] } {
  if (!isCivilReport(data)) return { ok: true, errors: [] };
  const errors: string[] = [];
  const findings = rows(data.findings);
  const full = data.report?.full_report ?? {};
  const issues = resolveCivilIssues(rows(full.pre_release_source_pages)).map(i => i.issue);
  for (const f of findings) {
    if (['quarantined', 'suppressed', 'superseded', 'rejected'].includes(f.lifecycle_status)) continue;
    const text = [f.title, f.description, f.legal_significance].filter(Boolean).join(' ');
    if (unresolvedFact(f)) errors.push('civil_unresolved_attribution_as_fact');
    if (f.civil_issue && !issues.includes(f.civil_issue)) errors.push('civil_cross_subtype_contamination');
    if (/(?:porque|por lo que|debido a|con fundamento en|therefore|because)\s*$/i.test(text) || /\[(?:TODO|PENDIENTE|INSERTAR)\]/i.test(text)) errors.push('civil_semantic_content_incomplete');
    if (unsafeFuture.test(text)) errors.push('civil_unsupported_procedural_advice');
    if (/\b(?:se acredita|resulta procedente|debe indemnizar|debe pagar)\b/i.test(text) &&
      !['PARTY_ALLEGATION', 'COURT_HOLDING', 'LOWER_COURT_HOLDING'].includes(f.canonical_attribution?.attribution_type) &&
      !rows(full.civil_elements_matrix).some(e => e.issue === f.civil_issue && e.element === f.civil_element && e.status === 'SUPPORTED')) errors.push('civil_unsupported_legal_conclusion');
  }
  const rulePatterns: Record<string, RegExp> = {
    contractual_default: /(?:se requiere|es necesari[oa]|debe acreditarse).{0,60}(?:interpelacion|requerimiento de pago)|interpelacion previa al incumplimiento/,
    moral_harm: /(?:dano moral).{0,45}(?:exige|requiere como requisito)/,
    lease_performance: /(?:arrendatario).{0,45}(?:debe pagar|esta obligado a)/,
    property_title: /(?:propiedad|posesion).{0,45}(?:exige|requiere como requisito)/,
  };
  const walk = (v: any, key = '') => {
    if (['quote', 'source_quote', 'supporting_excerpt', 'source_refs', 'evidence_refs', 'metadata', 'canonical_attribution'].includes(key)) return;
    if (typeof v === 'string') {
      const text = civilFold(v);
      if (unsafeFuture.test(v)) errors.push('civil_unsupported_procedural_advice');
      if (/\b(?:se acredita|resulta procedente|debe indemnizar|debe pagar)\b/.test(text)) {
        const supported = rows(full.pre_release_source_pages).some(p => {
          const attribution = attributeCivilProposition({ source_refs: [{ document_id: p.document_id, page: p.page, quote: v }] }, [p]);
          return attribution.source_verified && ['COURT_HOLDING', 'LOWER_COURT_HOLDING'].includes(attribution.attribution_type);
        });
        if (!supported) errors.push('civil_unsupported_legal_conclusion');
      }
      if (/(?:porque|por lo que|debido a|con fundamento en)\s*$/.test(text) || /\[(?:TODO|PENDIENTE|INSERTAR)\]/i.test(v)) errors.push('civil_semantic_content_incomplete');
      for (const [rule, pattern] of Object.entries(rulePatterns)) if (pattern.test(text) && full.civil_rule_applicability?.[rule]?.apply !== true)
        errors.push(`civil_rule_not_applicable:${rule}`);
    } else if (Array.isArray(v)) v.forEach(item => walk(item, key));
    else if (v && typeof v === 'object') for (const [k, value] of Object.entries(v)) walk(value, k);
  };
  for (const key of ['executive_summary', 'case_overview', 'risk_analysis', 'missing_evidence_struct', 'recommendations', 'next_actions']) walk(data.report?.[key], key);
  walk(full.legal_memorandum, 'legal_memorandum');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
