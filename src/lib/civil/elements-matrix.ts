import { civilSourceVerified, resolveCivilIssues, civilFindingReportable, civilAuthorityContextVerified, civilFold, CIVIL_ISSUES, type CivilRow } from './issue-contract';
export type CivilElementStatus = 'SUPPORTED' | 'DISPUTED' | 'UNSUPPORTED' | 'UNRESOLVED' | 'NOT_APPLICABLE';
export type CivilAuthorityStatus = 'AUTHORITY_MENTIONED' | 'AUTHORITY_CANDIDATE' | 'AUTHORITY_APPLICABLE' | 'AUTHORITY_CONTROLLING';
/** Conservative source producer: do not infer the governing entity from a
 * court's address, a filename, a code citation, or a party's legal argument. */
export function extractCivilAuthorityCandidates(pages: CivilRow[]): CivilRow[] {
  const candidates: CivilRow[] = [];
  for (const p of pages) for (const paragraph of String(p.text ?? '').split(/\n\s*\n/)) {
    const text = civilFold(paragraph);
    if (!/\b(?:este tribunal|esta sala|este juzgado)\s+(?:determina|considera|declara|resuelve)/.test(text) || /\b(?:alega[n]?|argumenta[n]?|aduce[n]?)\b/.test(text)) continue;
    const context = /legislaci[oó]n\s+(sustantiva|procesal)\s+de\s+([^.;,:]+?)(?=\s+para\s|[.;,:])/i.exec(paragraph);
    if (!context || !/\b(aplicable|rige|se aplica)\b/.test(text)) continue;
    const declared = /elementos?\s+(?:aplicables\s+)?(?:son|incluyen|requieren)\s*:?\s*([^.;\n]+)/i.exec(paragraph);
    const elements = declared ? declared[1].split(/,|\s+y\s+/).map(s => s.trim()).filter(Boolean) : [];
    for (const [issue, pattern] of Object.entries(CIVIL_ISSUES)) {
      if (!pattern.test(text)) continue;
      const candidate = { id: `civil-authority:${p.document_id}:${p.page}:${issue}`, issue,
        name: context[0], entity: context[2].trim(), role: context[1].toLowerCase() === 'sustantiva' ? 'substantive' : 'procedural',
        entity_verified: true, applicability_verified: true, controlling_verified: /criterio obligatorio|rige la decision/.test(text),
        elements, source_refs: [{ document_id: p.document_id, page: p.page, quote: paragraph.trim() }] };
      if (civilAuthorityContextVerified(candidate, pages)) candidates.push(candidate);
    }
  }
  return candidates;
}
export function classifyCivilAuthority(authority: CivilRow, pages: CivilRow[]): CivilRow & { status: CivilAuthorityStatus } {
  const located = authority.source_refs?.length > 0 && authority.source_refs.every((r: CivilRow) => civilSourceVerified(r, pages));
  const applicable = civilAuthorityContextVerified(authority, pages);
  const scopeText = civilFold((authority.source_refs ?? []).map((r: CivilRow) => r.quote).join(' '));
  const status: CivilAuthorityStatus = applicable ? authority.controlling_verified === true && /criterio obligatorio|rige la decision/.test(scopeText) ? 'AUTHORITY_CONTROLLING' : 'AUTHORITY_APPLICABLE'
    : located ? 'AUTHORITY_CANDIDATE' : 'AUTHORITY_MENTIONED';
  return { ...authority, status };
}
export interface CivilElementRow {
  issue: string; element: string; authority: CivilRow[]; supporting_evidence: CivilRow[];
  contrary_evidence: CivilRow[]; party_allegations: CivilRow[]; court_findings: CivilRow[];
  missing_corpus_evidence: string[]; procedural_availability: string; status: CivilElementStatus;
  status_reason: string;
}
/** These are inquiry headings, not a federal-code checklist. Only a verified
 * applicable source may supply the governing legal elements. */
export function buildCivilElementsMatrix(input: { pages: CivilRow[]; authorities?: CivilRow[]; findings?: CivilRow[] }): CivilElementRow[] {
  const issues = resolveCivilIssues(input.pages);
  const authorities = (input.authorities ?? []).map(a => classifyCivilAuthority(a, input.pages));
  const located = (f: CivilRow) => civilFindingReportable(f) &&
    f.canonical_attribution?.source_verified === true && (f.evidence_refs ?? []).some((r: CivilRow) => civilSourceVerified(r, input.pages));
  return issues.flatMap(issue => {
    const applicable = authorities.filter(a => a.issue === issue.issue && a.role === 'substantive' && ['AUTHORITY_APPLICABLE', 'AUTHORITY_CONTROLLING'].includes(a.status));
    const elements = [...new Set<string>(applicable.flatMap(a => Array.isArray(a.elements) ? a.elements.filter((v: unknown) => typeof v === 'string' && v.trim() &&
      a.source_refs.some((r: CivilRow) => /elementos|requisitos|debe acreditarse/.test(civilFold(r.quote)) && civilFold(r.quote).includes(civilFold(v)))) : []))];
    if (!elements.length) elements.push('elementos_juridicos_por_verificar');
    return elements.map(element => {
      const records = (input.findings ?? []).filter(f => (f.civil_issue ?? f.metadata?.civil_issue) === issue.issue &&
        ((f.civil_element ?? f.metadata?.civil_element) === element || f.civil_elements?.includes(element)) && located(f));
      const party = records.filter(f => f.canonical_attribution.attribution_type === 'PARTY_ALLEGATION');
      const court = records.filter(f => ['COURT_HOLDING', 'LOWER_COURT_HOLDING'].includes(f.canonical_attribution.attribution_type));
      const evidentiary = records.filter(f => ['DOCUMENTED_FACT', 'EXPERT_OPINION', 'COURT_HOLDING'].includes(f.canonical_attribution.attribution_type));
      const proofText = (f: CivilRow) => civilFold((f.evidence_refs ?? []).filter((r: CivilRow) => civilSourceVerified(r, input.pages)).map((r: CivilRow) => r.quote).join(' '));
      const negative = /\b(no se acredita|no queda acreditad|no consta|se descarta|no se demuestra)/;
      const supporting = evidentiary.filter(f => f.impact_direction === 'strengthens' && proofText(f).includes(civilFold(element)) &&
        !negative.test(proofText(f)) && /\b(se acredita|queda acreditad|consta en (?:el acta|la certificacion|el registro)|se demuestra)/.test(proofText(f)));
      const contrary = evidentiary.filter(f => f.impact_direction === 'weakens' && proofText(f).includes(civilFold(element)) && negative.test(proofText(f)));
      const excluded = applicable.some(a => a.excluded_elements?.includes(element));
      const status: CivilElementStatus = excluded ? 'NOT_APPLICABLE' : !applicable.length ? 'UNRESOLVED'
        : supporting.length && contrary.length ? 'DISPUTED' : supporting.length ? 'SUPPORTED'
        : contrary.some(f => f.explicit_negative_proof === true) ? 'UNSUPPORTED' : 'UNRESOLVED';
      const reference = (f: CivilRow) => ({ id: f.id, attribution_type: f.canonical_attribution.attribution_type, source_refs: f.evidence_refs });
      return { issue: issue.issue, element, authority: applicable, supporting_evidence: supporting.map(reference), contrary_evidence: contrary.map(reference),
        party_allegations: party.map(reference), court_findings: court.map(reference),
        missing_corpus_evidence: !supporting.length && !excluded ? ['Localizar las constancias existentes que permitan reconstruir este elemento; la ausencia en el corpus no demuestra inexistencia en autos.'] : [],
        procedural_availability: 'UNRESOLVED', status,
        status_reason: !applicable.length ? 'Autoridad y elementos aplicables pendientes de verificación.' : excluded ? 'Exclusión respaldada por autoridad aplicable.' :
          status === 'UNRESOLVED' ? 'El corpus no permite valorar este elemento; una alegación no acredita el hecho.' : 'Valoración limitada a las fuentes verificadas del elemento.' };
    });
  });
}

export function civilSpecialistInstructions(agent: string): string {
  return `You investigate a source-established Civil issue (${agent}). Civil alone does not establish a contract, a default, a lease, a property claim or moral harm. ` +
    'Resolve all pleaded issues independently. Do not import requirements from another issue. Do not use a universal Federal Civil Code checklist or assume substantive law from the reviewing court or its seat. ' +
    'Distinguish AUTHORITY_MENTIONED, AUTHORITY_CANDIDATE, AUTHORITY_APPLICABLE and AUTHORITY_CONTROLLING. An authority requires verified entity, substantive/procedural role and applicable context before supporting a legal conclusion. ' +
    'For each finding supply civil_issue, civil_element, speaker, attribution_type, source_document, source_page, supporting_excerpt and procedural_context. Preserve party allegations and nested quotations as allegations. ' +
    'Assess each element from verified applicable authority, supporting/contrary evidence, party allegations, court findings and missing uploaded records. Use SUPPORTED, DISPUTED, UNSUPPORTED, UNRESOLVED or NOT_APPLICABLE; unknown applicability means DO_NOT_APPLY. ' +
    'A missing uploaded record is not absent trial evidence. Locate or verify existing records; never advise presenting new evidence without verified current posture and an applicable procedural rule. Do not predict future discovery. ' +
    'Output JSON only. Every finding requires a verbatim source excerpt; never invent authority, facts, quotations, amounts or legal outcome scores.';
}
