/** Civil-owned provenance. A judicial document is a container, not a speaker. */
export const CIVIL_ATTRIBUTION_TYPES = ['COURT_HOLDING', 'LOWER_COURT_HOLDING', 'PARTY_ALLEGATION', 'PROCEDURAL_HISTORY', 'DOCUMENTED_FACT', 'EXPERT_OPINION', 'NYRAVA_INFERENCE', 'UNRESOLVED'] as const;
export type CivilAttributionType = typeof CIVIL_ATTRIBUTION_TYPES[number];
export interface CivilSourceEvidence {
  source_document: string | null;
  source_page: number | null;
  supporting_excerpt: string;
}
export interface CivilPropositionAttribution extends CivilSourceEvidence {
  speaker: string | null;
  procedural_context: string | null;
  attribution_type: CivilAttributionType;
  source_verified: boolean;
  safe_proposition: string;
}
export interface CivilSourcePage { document_id: string; page: number; text: string }
export const civilRecord = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const civilText = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const norm = (v: string) => v.replace(/\s+/g, ' ').trim();
export function civilSourcePages(input: unknown): CivilSourcePage[] {
  if (Array.isArray(input)) return input.flatMap(p => {
    const r = civilRecord(p); const page = Number(r.page ?? r.page_number ?? r.source_page);
    const id = civilText(r.document_id ?? r.source_document ?? r.filename);
    const text = civilText(r.text ?? r.content ?? r.extracted_text);
    return id && Number.isInteger(page) && page > 0 && text ? [{ document_id: id, page, text }] : [];
  });
  const r = civilRecord(input);
  return ['source_pages', 'sourcePages', 'pages', 'pre_release_source_pages', 'full_report', 'report'].flatMap(k => r[k] ? civilSourcePages(r[k]) : []);
}
export function verifiedCivilSource(evidence: CivilSourceEvidence, pages: CivilSourcePage[]): CivilSourcePage | undefined {
  if (!evidence.source_document || !evidence.source_page || !evidence.supporting_excerpt) return;
  return pages.find(p => p.document_id === evidence.source_document && p.page === evidence.source_page && norm(p.text).includes(norm(evidence.supporting_excerpt)));
}
const PARTY = /\b((?:(?:las?|los?)\s+)?(?:partes?\s+actoras?|partes?\s+demandadas?|quejos[oa]s?|actor[ae]s?|actoras?|demandad[oa]s?|recurrentes?|apelantes?|promoventes?))\s+(?:aduce[n]?|adujeron|adujo|alega[n]?|alegaron|alegó|sostiene[n]?|sostuvieron|sostuvo|afirma[n]?|afirmaron|afirmó|manifiesta[n]?|manifestaron|manifestó|señala[n]?|señalaron|señaló|argumenta[n]?|argumentaron|argumentó|refiere[n]?|refirieron|refirió|expresa[n]?|expresaron|expresó|expone[n]?|expusieron|expuso|denuncia[n]?|reclama[n]?|se duelen|se duele|hacen valer|hace valer)/i;
export function civilPartyScope(text: string): string | null { return PARTY.exec(text)?.[1] ?? null; }

export function attributeCivilProposition(finding: unknown, sourcePages?: unknown): CivilPropositionAttribution {
  const f = civilRecord(finding); const nested = civilRecord(f.attribution);
  const refs = Array.isArray(f.source_refs) ? f.source_refs : Array.isArray(f.evidence_refs) ? f.evidence_refs : [];
  const ref = civilRecord(refs[0]);
  const source_document = civilText(nested.source_document ?? f.source_document ?? f.source_document_id ?? f.document_id ?? ref.document_id ?? ref.source_document) || null;
  const page = Number(nested.source_page ?? f.source_page ?? f.page ?? ref.page ?? ref.page_number);
  const supporting_excerpt = civilText(nested.supporting_excerpt ?? f.supporting_excerpt ?? f.source_quote ?? f.quote ?? ref.quote);
  const base = { source_document, source_page: Number.isInteger(page) && page > 0 ? page : null, supporting_excerpt };
  const source = verifiedCivilSource(base, civilSourcePages(sourcePages ?? f));
  const unresolved: CivilPropositionAttribution = { ...base, speaker: civilText(nested.speaker ?? f.speaker) || null,
    procedural_context: civilText(nested.procedural_context ?? f.procedural_context) || null,
    attribution_type: 'UNRESOLVED', source_verified: Boolean(source), safe_proposition: 'Atribución pendiente de verificar en la fuente.' };
  if (!source) return unresolved;
  // Include the preceding paragraph: a clipped inner quote must retain its outer speaker.
  const normalized = norm(source.text); const start = normalized.indexOf(norm(supporting_excerpt));
  const globalPrefix = normalized.slice(0, start);
  const openQuotation = (text: string) => {
    const stack: string[] = [];
    for (const char of text) {
      if (char === '«' || char === '“') stack.push(char);
      else if (char === '»' || char === '”') stack.pop();
      else if (char === '"') { if (stack.at(-1) === '"') stack.pop(); else stack.push(char); }
    }
    return stack.length > 0;
  };
  const paragraph = source.text.split(/\n\s*\n/).map(norm).find(part => part.includes(norm(supporting_excerpt)));
  const paragraphPrefix = paragraph?.slice(0, paragraph.indexOf(norm(supporting_excerpt)));
  // A closed quotation/paragraph does not carry its speaker into a new
  // explicit holding. An open quotation or introduction still does.
  const introduced = /:\s*[«“"]?\s*$/.test(globalPrefix);
  const prefix = !openQuotation(globalPrefix) && !introduced && paragraphPrefix !== undefined ? paragraphPrefix : globalPrefix;
  const ownHolding = /^(?:este|esta)\s+(?:tribunal|sala|juzgado)\s+(?:resuelve|determina|concluye|considera|declara)\b/i.test(supporting_excerpt);
  const scope = ownHolding && !openQuotation(prefix) && !introduced && /[.»”"]\s*$/.test(prefix)
    ? norm(supporting_excerpt) : prefix + norm(supporting_excerpt);
  const party = civilPartyScope(scope);
  let attribution_type: CivilAttributionType = 'UNRESOLVED'; let speaker: string | null = unresolved.speaker;
  if (party) { attribution_type = 'PARTY_ALLEGATION'; speaker = party; }
  else if (/\b(?:sala|juez|juzgado|tribunal)\s+(?:de origen|de primera instancia|responsable|inferior|a quo)\s+(?:resolvió|determinó|concluyó|sostuvo|consideró|señaló)/i.test(scope)) {
    attribution_type = 'LOWER_COURT_HOLDING'; speaker = 'Órgano jurisdiccional de origen';
  } else if (/\b(?:este|esta)\s+(?:tribunal|sala|juzgado)\s+(?:resuelve|determina|concluye|considera|declara)\b/i.test(supporting_excerpt) && !openQuotation(prefix)) {
    attribution_type = 'COURT_HOLDING'; speaker = 'Órgano jurisdiccional emisor';
  } else if (/\b(?:perit[oa]s?|dictamen pericial)\b.{0,60}\b(?:concluy[eó]|determina|señala|opina)/i.test(scope)) {
    attribution_type = 'EXPERT_OPINION'; speaker = 'Perito';
  } else if (/\b(?:se presentó la demanda|se interpuso el recurso|se admitió la demanda|se dictó sentencia)\b/i.test(supporting_excerpt)) {
    attribution_type = 'PROCEDURAL_HISTORY'; speaker = speaker ?? 'Relato procesal del documento';
  } else if (/\b(?:consta en|se hace constar en)\s+(?:el acta|la certificación|el registro)/i.test(supporting_excerpt)) {
    attribution_type = 'DOCUMENTED_FACT'; speaker = speaker ?? 'Registro documental';
  } else if ((nested.attribution_type ?? f.attribution_type) === 'NYRAVA_INFERENCE') {
    attribution_type = 'NYRAVA_INFERENCE'; speaker = 'NYRAVA';
  }
  const label: Record<CivilAttributionType, string> = { COURT_HOLDING: 'Determinación del órgano emisor', LOWER_COURT_HOLDING: 'Determinación atribuida al órgano de origen', PARTY_ALLEGATION: 'Alegación de parte', PROCEDURAL_HISTORY: 'Antecedente procesal documentado', DOCUMENTED_FACT: 'Hecho registrado en documento', EXPERT_OPINION: 'Opinión pericial', NYRAVA_INFERENCE: 'Inferencia de NYRAVA', UNRESOLVED: 'Atribución no resuelta' };
  return { ...unresolved, speaker, attribution_type, safe_proposition: `${label[attribution_type]}${speaker ? ` (${speaker})` : ''}: ${supporting_excerpt}` };
}
