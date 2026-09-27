import { civilPartyScope, civilRecord, civilSourcePages, civilText, verifiedCivilSource, type CivilSourceEvidence } from './proposition-attribution';

export interface CivilResolvedField<T> { value: T | null; status: 'VERIFIED' | 'UNRESOLVED' | 'CONFLICT'; evidence: CivilSourceEvidence[] }
export interface CivilProceduralContext {
  underlying_materia: CivilResolvedField<string>;
  underlying_proceeding_type: CivilResolvedField<string>;
  originating_court: CivilResolvedField<string>;
  originating_jurisdiction: CivilResolvedField<string>;
  current_procedural_posture: CivilResolvedField<string>;
  reviewing_court: CivilResolvedField<string>;
  applicable_substantive_law_entity: CivilResolvedField<string>;
  applicable_procedural_law: CivilResolvedField<string>;
  status: CivilResolvedField<string>;
  concluded: CivilResolvedField<boolean>;
  evidentiary_record_closed: CivilResolvedField<boolean>;
}
type Field = keyof CivilProceduralContext;
const LABELS: Record<Field, string> = {
  underlying_materia: 'materia de origen|materia subyacente', underlying_proceeding_type: 'procedimiento de origen|juicio de origen',
  originating_court: 'órgano de origen|juzgado de origen|tribunal de origen', originating_jurisdiction: 'jurisdicción de origen',
  current_procedural_posture: 'postura procesal actual|etapa procesal actual', reviewing_court: 'órgano revisor|tribunal revisor',
  applicable_substantive_law_entity: 'entidad de la legislación sustantiva aplicable|entidad del derecho sustantivo aplicable',
  applicable_procedural_law: 'legislación procesal aplicable|ley procesal aplicable', status: 'estado procesal',
  concluded: 'procedimiento concluido', evidentiary_record_closed: 'periodo probatorio|período probatorio|registro probatorio',
};
const normalized = (v: unknown) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const booleanValue = (field: Field, v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  const t = normalized(v);
  if (field === 'concluded') return /^(si|true|concluido|concluida|archivado|archivada|firme|terminado|terminada)$/.test(t) ? true : /^(no|false|en tramite|pendiente|activo|activa)$/.test(t) ? false : null;
  return /^(si|true|cerrado|cerrada|concluido|concluida)$/.test(t) ? true : /^(no|false|abierto|abierta)$/.test(t) ? false : null;
};

/** Resolves each field independently. Intake labels and the reviewing court's seat are not applicable-law evidence. */
export function resolveCivilProceduralContext(input: unknown): CivilProceduralContext {
  const pages = civilSourcePages(input);
  const candidates = new Map<Field, { value: string | boolean; evidence: CivilSourceEvidence }[]>();
  const add = (field: Field, value: unknown, evidence: CivilSourceEvidence) => {
    const v = field === 'concluded' || field === 'evidentiary_record_closed' ? booleanValue(field, value) : civilText(value);
    if (v === null || v === '') return;
    candidates.set(field, [...(candidates.get(field) ?? []), { value: v, evidence }]);
    if (field === 'status') { const closed = booleanValue('concluded', v); if (closed !== null) add('concluded', closed, evidence); }
  };
  for (const page of pages) {
    for (const field of Object.keys(LABELS) as Field[]) {
      const re = new RegExp(`(?:${LABELS[field]})\\s*:\\s*([^.;\\n\\r»”]+)`, 'gi');
      for (const match of page.text.matchAll(re)) {
        // A party's assertion about a procedural field cannot verify that field.
        if (civilPartyScope(page.text.slice(0, (match.index ?? 0) + match[0].length)) || /[«“"]/.test(page.text.slice(0, match.index))) continue;
        add(field, match[1].trim(), { source_document: page.document_id, source_page: page.page, supporting_excerpt: match[0] });
      }
    }
    const prose: { field: Field; pattern: RegExp; value?: string | boolean; group?: number }[] = [
      { field: 'underlying_proceeding_type', pattern: /(?:juicio de origen es (?:un |el )?|derivad[oa] del |proveniente del |en el juicio de origen,?\s*)(juicio (?:ordinario|ejecutivo|especial|sumario) civil)/gi },
      { field: 'current_procedural_posture', pattern: /(?:se resuelve el presente |presente asunto corresponde a (?:un |el )?)(amparo directo en revisión|amparo directo|recurso de apelación|recurso de revisión|juicio ordinario civil)/gi },
      { field: 'current_procedural_posture', pattern: /^\s*(amparo directo en revisión|amparo directo|recurso de apelación|recurso de revisión)\s+(?:n[uú]mero\s*)?\d+\s*\//gi },
      { field: 'originating_court', pattern: /(?:el órgano de origen es|el juzgado de origen es|el juicio de origen se tramitó ante)\s+(?:el |la )?([^.;\n]+)/gi },
      { field: 'reviewing_court', pattern: /(?:el órgano revisor es|el tribunal revisor es|el presente recurso es resuelto por)\s+(?:el |la )?([^.;\n]+)/gi },
      { field: 'concluded', pattern: /(?:el presente (?:asunto|procedimiento|juicio) (?:está|se encuentra) concluido|la sentencia (?:del|en el) presente (?:asunto|juicio) (?:es firme|ha causado ejecutoria))/gi, value: true },
      { field: 'evidentiary_record_closed', pattern: /(?:en el presente (?:juicio|procedimiento) se cerró el (?:periodo|período) probatorio|el (?:periodo|período) probatorio del presente (?:juicio|procedimiento) (?:está|se encuentra) cerrado)/gi, value: true },
    ];
    for (const spec of prose) for (const match of page.text.matchAll(spec.pattern)) {
      const prefix = page.text.slice(0, (match.index ?? 0) + match[0].length);
      // Quoted history and allegations cannot independently settle the current posture.
      if (civilPartyScope(prefix) || /[«“"]/.test(prefix.slice(0, match.index))) continue;
      const evidence = { source_document: page.document_id, source_page: page.page, supporting_excerpt: match[0] };
      const value = spec.value ?? match[spec.group ?? 1].trim();
      add(spec.field, value, evidence);
      if (spec.field === 'underlying_proceeding_type' && /civil$/i.test(String(value))) add('underlying_materia', 'civil', evidence);
    }
  }
  const visit = (raw: unknown, depth = 0) => {
    if (depth > 4) return;
    const r = civilRecord(raw);
    if (Array.isArray(r.procedural_context_evidence)) for (const rawEvidence of r.procedural_context_evidence) {
      const e = civilRecord(rawEvidence); const field = civilText(e.field) as Field;
      if (!(field in LABELS) || e.verified !== true) continue;
      const evidence: CivilSourceEvidence = { source_document: civilText(e.source_document ?? e.document_id) || null, source_page: Number(e.source_page ?? e.page) || null, supporting_excerpt: civilText(e.supporting_excerpt ?? e.quote) };
      const page = verifiedCivilSource(evidence, pages);
      if (!page || civilPartyScope(page.text.slice(0, page.text.indexOf(evidence.supporting_excerpt) + evidence.supporting_excerpt.length))) continue;
      // The caller-verified value must also occur literally; booleans require a parsed source label.
      if (typeof e.value !== 'string' || !normalized(evidence.supporting_excerpt).includes(normalized(e.value))) continue;
      add(field, e.value, evidence);
    }
    for (const key of ['case', 'report', 'full_report']) if (r[key]) visit(r[key], depth + 1);
  };
  visit(input);
  const result: Record<string, CivilResolvedField<string | boolean>> = {};
  for (const field of Object.keys(LABELS) as Field[]) {
    const list = candidates.get(field) ?? []; const unique = new Set(list.map(c => normalized(c.value)));
    result[field] = { value: unique.size === 1 ? list[0].value : null, status: unique.size === 1 ? 'VERIFIED' : unique.size > 1 ? 'CONFLICT' : 'UNRESOLVED', evidence: list.map(c => c.evidence) };
  }
  return result as unknown as CivilProceduralContext;
}

export const CIVIL_EVIDENCE_AVAILABILITY = ['LOCATE_EXISTING_RECORD', 'VERIFY_EXISTING_RECORD', 'OBTAIN_CERTIFIED_RECORD', 'INVESTIGATE_IF_PROCEDURALLY_AVAILABLE', 'POTENTIALLY_ADMISSIBLE_NEW_EVIDENCE', 'NOT_PROCEDURALLY_AVAILABLE', 'UNRESOLVED'] as const;
export type CivilEvidenceAvailability = typeof CIVIL_EVIDENCE_AVAILABILITY[number];
export interface CivilVerifiedEvidenceRule extends CivilSourceEvidence {
  verified: boolean;
  applicable_procedural_law: string;
  procedural_posture: string;
  permits_new_evidence?: boolean;
  permits_investigation?: boolean;
}
export interface CivilEvidenceAvailabilityResult { classification: CivilEvidenceAvailability; reason: string; requires_rule_verification: boolean }

/** Rules are supplied only after external legal-source verification; metadata alone never opens a closed record. */
export function classifyCivilEvidenceAvailability(gap: unknown, context: CivilProceduralContext, verifiedRules: CivilVerifiedEvidenceRule[] = []): CivilEvidenceAvailabilityResult {
  const g = civilRecord(gap); const intent = normalized(civilText(g.action ?? g.requested_action ?? g.availability_action) || (typeof gap === 'string' ? gap : ''));
  const out = (classification: CivilEvidenceAvailability, reason: string, requires_rule_verification = false) => ({ classification, reason, requires_rule_verification });
  if (/certif|copia certificada/.test(intent)) return out('OBTAIN_CERTIFIED_RECORD', 'Obtener copia certificada de una constancia existente; no supone su nueva admisión.');
  if (/verify|verific|cotej/.test(intent)) return out('VERIFY_EXISTING_RECORD', 'Verificar la constancia en el expediente existente.');
  if (/locate|localiz|existing|existente/.test(intent)) return out('LOCATE_EXISTING_RECORD', 'Localizar la constancia dentro del expediente existente.');
  const wantsNew = /new_evidence|nueva|ofrecer|aportar|admis/.test(intent);
  const wantsInvestigation = /investig/.test(intent);
  const closed = context.concluded.value === true || context.evidentiary_record_closed.value === true;
  if (closed) return wantsNew || wantsInvestigation
    ? out('NOT_PROCEDURALLY_AVAILABLE', 'El procedimiento concluido o periodo probatorio cerrado no habilita nueva prueba con la información verificada.')
    : out('LOCATE_EXISTING_RECORD', 'Revisar las constancias existentes del expediente concluido o cerrado.');
  const review = /amparo|revision|apelacion|casacion/.test(normalized(context.current_procedural_posture.value ?? ''));
  if (!wantsNew && !wantsInvestigation) return out('LOCATE_EXISTING_RECORD', review ? 'La revisión exige comenzar por las constancias del expediente existente.' : 'Localizar primero la constancia existente.');
  const open = context.current_procedural_posture.status === 'VERIFIED' && context.concluded.value === false && context.evidentiary_record_closed.value === false && context.applicable_procedural_law.status === 'VERIFIED';
  if (!open) return out('UNRESOLVED', 'Falta verificar la postura, la apertura probatoria o la legislación procesal aplicable.', true);
  const applicable = verifiedRules.filter(r => r.verified === true && r.source_document && r.source_page && r.supporting_excerpt.trim() && normalized(r.applicable_procedural_law) === normalized(context.applicable_procedural_law.value) && normalized(r.procedural_posture) === normalized(context.current_procedural_posture.value));
  const permission = wantsInvestigation ? 'permits_investigation' : 'permits_new_evidence';
  if (applicable.some(r => r[permission] === true) && applicable.some(r => r[permission] === false)) return out('UNRESOLVED', 'Las reglas verificadas contienen permisos incompatibles; se requiere resolver el conflicto.', true);
  if (applicable.some(r => r[permission] === false)) return out('NOT_PROCEDURALLY_AVAILABLE', 'La regla verificada no habilita la actuación solicitada.');
  if (!applicable.some(r => r[permission] === true)) return out('UNRESOLVED', 'Falta una regla aplicable verificada que habilite la actuación.', true);
  return wantsInvestigation ? out('INVESTIGATE_IF_PROCEDURALLY_AVAILABLE', 'La regla verificada permite investigar en esta postura, sujeto a sus requisitos.') : out('POTENTIALLY_ADMISSIBLE_NEW_EVIDENCE', 'La postura y regla verificadas permiten valorar nueva prueba, sujeta a requisitos de admisión.');
}
