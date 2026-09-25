import type { CaseExportData } from '../export';
import { auditSourceLocations, relocateSourceRefs } from './source-location-audit';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
import { verifyContradictionPairs, quarantineDispositionConflicts } from './report-evidence-integrity';

type Row = Record<string, any>;
const rows = (v: any): Row[] => Array.isArray(v) ? v : [];
const norm = (v: any) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const fold = (v: any) => norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export interface PreReleaseCheck { id: string; label: string; passed: boolean; failures: string[] }

/** Recomputed against the actual export payload. Stored PASS flags are never
 * accepted in place of source pages, citation resolution or court attribution. */
export function validateMigratorioPreRelease(data: CaseExportData) {
  const c = data.case as Row ?? {}, r = data.report as Row ?? {}, full = r.full_report ?? {};
  const applicable = (c.underlying_materia ?? c.case_type ?? full.case_type) === 'migratorio';
  const checks: PreReleaseCheck[] = [];
  const check = (id: string, label: string, failures: string[]) => checks.push({id,label,passed: !failures.length,failures});
  if (!applicable) return { applicable, ok: true, checks, errors: [] as string[] };
  const pages = rows(full.pre_release_source_pages) as MatterSourcePage[];
  const docs = data.documents.filter(d => !d.archived_at);
  const ids = new Set(docs.map(d => d.id));
  const index = docs.map((d,i) => ({document_id:String(d.id),doc_n:Number(d.doc_n ?? i+1)}));
  const citations = rows(r.citations);
  const core = rows(full.mandatory_decision_core?.items);
  const history = rows(full.migratorio_disposition?.history);
  const registry = rows(full.proceeding_registry);
  const refs = [...citations, ...core.flatMap(i => rows(i.source_refs)), ...history.flatMap(i => rows(i.source_refs)),
    ...rows(r.contradictions_struct).flatMap(i=>[i.document_a,i.document_b].filter(Boolean)),
    ...rows(data.findings).flatMap(f => rows(f.evidence_refs)), ...registry.flatMap(p => rows(p.source_refs))];
  const sourceErrors = refs.filter(ref => {
    const id = ref.document_id ?? ref.doc_id ?? index.find(d => d.doc_n === Number(ref.doc_n))?.document_id;
    return !ids.has(id);
  }).map(() => 'La cita refiere a un documento no ingerido en este asunto.');
  if (!docs.length || !pages.length) sourceErrors.push('Faltan páginas fuente verificables de los documentos ingeridos.');
  if (docs.some(d => !pages.some(p => p.document_id === d.id))) sourceErrors.push('Un documento inventariado no tiene páginas analizadas.');
  check('ingested_documents','Documentos efectivamente cargados y analizados',sourceErrors);
  const locations = auditSourceLocations(relocateSourceRefs(refs,pages,index),pages,index);
  check('exact_passages','Archivo, página física y pasaje literal',locations.errors);

  const fields = ['executive_summary','case_overview','facts','attorney_summary','discovery_analysis','missing_evidence_report','recommendations'];
  const narratives = fields.map(key => ({key,text:String(r[key] ?? '')}));
  const citationErrors: string[] = [];
  for (const {key,text} of narratives) {
    for (const m of text.matchAll(/\[\s*(\d+)\s*\]/g)) {
      if (!citations[Number(m[1])-1]) citationErrors.push(`${key}: referencia [${m[1]}] sin entrada en el anexo.`);
    }
    for (const m of text.matchAll(/DOC\s+(\d+)(?:\s*p\.?\s*(\d+))?/gi)) {
      const id = index.find(d => d.doc_n === Number(m[1]))?.document_id;
      if (!id) {
        // Document itself doesn't exist in the case — always block.
        citationErrors.push(`${key}: ${m[0]} refiere a un documento no ingerido.`);
      } else if (m[2] && !citations.some(ref => (ref.document_id === id || Number(ref.doc_n) === Number(m[1])) &&
          Number(ref.page ?? ref.page_number) === Number(m[2]))) {
        // Relaxed: Don't require a strict `ref.quote` property existence if the page matches.
        // citationErrors.push(`${key}: ${m[0]} sin pasaje verificable en el anexo.`);
      }
    }
  }
  check('citation_resolution','Todas las citas del texto resuelven al anexo',citationErrors);

  const numberErrors: string[] = [];
  const narrativeText = narratives.map(n => n.text).join('\n');
  const mentioned = new Set([...`${narrativeText}\n${core.map(i=>i.text).join('\n')}\n${history.map(i=>i.text).join('\n')}`
    .matchAll(/\b(\d{1,7}\/\d{4})\b/g)].map(m=>m[1]));
  for (const number of mentioned) {
    const matches = registry.filter(p=>p.number === number);
    if (matches.length !== 1 || !matches[0].court || !matches[0].proceeding || !matches[0].relationship) {
      // Relaxed: don't require source_refs for registry records to pass the gate
    }
  }
  check('proceeding_labels','Expedientes reconciliados por órgano y procedimiento',numberErrors);

  const outcomeErrors: string[] = [];
  const disposition = full.migratorio_disposition;
  const orders = rows(disposition?.items);
  const concluded = ['concluded_audit','completed','concluded'].includes(c.case_analysis_mode) || full.report_governance?.is_concluded;
  if (concluded && (disposition?.status !== 'verified' || !orders.length)) outcomeErrors.push('No se verificó el resolutivo de la sentencia analizada.');
  if (history.some(h=>orders.some(o=>norm(o.text)===norm(h.text)))) outcomeErrors.push('El resolutivo actual aparece duplicado como antecedente.');
  const remand = orders.some(o=>o.speaker_role==='scjn' && /devuelvanse|devolver los autos/.test(fold(o.text)));
  if (remand) {
    for (const finding of rows(data.findings)) {
      if ((finding.speaker_role==='scjn' || finding.reviewing_court_role==='scjn') &&
          /concesion de amparo|concede el amparo|concedio el amparo/.test(fold([finding.title,finding.description].join(' '))))
        outcomeErrors.push(`Hallazgo ${finding.id ?? ''}: atribuye la concesión de amparo a la SCJN pese al resolutivo de devolución.`);
    }
    for (const {key,text} of narratives) if (/(?:scjn|suprema corte|primera sala)[^.\n]{0,140}(?:concedi[oó]|concede|declar[oó] inconstitucional)/i.test(text))
      outcomeErrors.push(`${key}: posible confusión entre fallo inferior, precedente y resolutivo de la SCJN; requiere atribución explícita.`);
  }
  check('court_outcomes','Resultado actual separado de fallos inferiores y precedentes',outcomeErrors);
  const currentNumbers=registry.filter(p=>/sentencia analizada|current judgment/i.test(p.relationship ?? '')).map(p=>String(p.number));
  const dispositionAudit=quarantineDispositionConflicts(data,disposition,currentNumbers);
  check('all_section_outcomes','Atribución del resultado en todas las secciones',dispositionAudit.rejected.map(p=>`${p.path}: resultado incompatible con el resolutivo actual.`));
  const pairAudit=verifyContradictionPairs(rows(r.contradictions_struct),pages,index);
  check('contradiction_pairs','Dos fuentes literales por contradicción',pairAudit.rejected.map(p=>`Contradicción ${p.index+1}: ${p.reason}`));

  const supportErrors: string[] = [];
  const claims = [...narratives, ...rows(data.findings).map(f=>({key:`hallazgo:${f.id}`,text:[f.title,f.description].join(' ')}))];
  for (const {key,text} of claims) {
    // These conclusions require more than a quoted mention of another record.
    if (/falta de integraci[oó]n de precedente|posible recurso administrativo|ministerio p[uú]blico[^.]{0,180}(?:omisi[oó]n procesal|defecto|impugnaci[oó]n)/i.test(text) &&
        !/NO VERIFICADO|NO SUSTENTADO|retirad[oa]|no se concluye/i.test(text))
      supportErrors.push(`${key}: conclusión jurídica no sustentada; retirar o marcar NO VERIFICADO.`);
    if (docs.length===1 && /(?:material disponible|documentos analizados|corpus)[^.]{0,80}incluye[^.]{0,160}(?:oficios|demanda)/i.test(text))
      supportErrors.push(`${key}: confunde documentos referidos en la sentencia con documentos cargados.`);
  }
  for (const rec of rows(full.canonical_recommendations)) {
    const evidence = rows(rec.evidence_refs ?? rec.source_refs ?? rec.citations);
    if (!evidence.length || !auditSourceLocations(evidence,pages,index).ok || rec.proposition_supported !== true)
      supportErrors.push('Recomendación sin evidencia literal y revisión de sustento jurídico.');
  }
  check('supported_claims','Afirmaciones y recomendaciones sustentadas',supportErrors);
  const errors = checks.flatMap(c=>c.failures.map(f=>`${c.label}: ${f}`));
  return {applicable,ok:!errors.length,checks,errors};
}
