import type { MatterSourcePage } from '../intelligence/source-matter-audit';
import type { MigratorioDisposition } from '../intelligence/migratorio-disposition';
import { auditSourceLocations, relocateSourceRefs } from './source-location-audit';
import { classifyContradiction } from '../intelligence/dispute-classifier.server';

type Row = Record<string, any>;
const norm = (s: unknown) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const fold = (s: unknown) => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** A contradiction is a pair of literal, located passages. A model's boolean
 * and a soft corpus match cannot establish either side of that pair. */
export function verifyContradictionPairs(items: Row[], pages: MatterSourcePage[], index: Array<{document_id:string;doc_n:number}>) {
  const accepted: Row[] = [], rejected: Array<{index:number;reason:string}> = [];
  for (const [i,item] of items.entries()) {
    const sides = [item.document_a,item.document_b];
    if (sides.some(side => !side || !norm(side.quote))) {
      rejected.push({index:i,reason:'missing_source_pair'}); continue;
    }
    // Identity must be supplied, never inferred from a coincidental quotation
    // in a different document when a model used a nonexistent doc number.
    if (sides.some(side => !index.some(d => d.document_id === (side.document_id ?? side.doc_id) || d.doc_n === Number(side.doc_n)))) {
      rejected.push({index:i,reason:'unknown_source'}); continue;
    }
    const refs = relocateSourceRefs(sides,pages,index);
    const audit = auditSourceLocations(refs,pages,index);
    if (!audit.ok || audit.unique_citations !== 2) {
      rejected.push({index:i,reason:'unverified_or_identical_passages'}); continue;
    }
    const pair = {...item,document_a:refs[0],document_b:refs[1],quote_verified:true};
    accepted.push({...pair,kind:classifyContradiction(pair)});
  }
  return {accepted,rejected};
}

/** Only detects an inversion when the source's complete current operative
 * order is a remand. Preserve lower-court history and explicit precedents.
 * This is a rejection rule, never a generator of substitute legal findings. */
export function conflictsWithCurrentDisposition(text: string, disposition?: MigratorioDisposition, role?: unknown, currentNumbers: string[] = []): boolean {
  if (disposition?.status !== 'verified' || !disposition.items.length ||
      !disposition.items.every(o => o.speaker_role === 'scjn' && /devuelvanse|devolver los autos/.test(fold(o.text)))) return false;
  const s = fold(text);
  const subject = /(?:scjn|suprema corte(?: de justicia de la nacion)?|primera sala|segunda sala|sentencia (?:analizada|actual))/g;
  const outcome = /(?:concede|concedio|otorga|otorgo)\s+(?:el\s+)?amparo|declar(?:a|o)\s+(?:la\s+)?inconstitucional/;
  for (const match of s.matchAll(subject)) {
    const clause = s.slice(match.index! + match[0].length).split(/[.;\n]/)[0].slice(0,200);
    if (outcome.test(clause) && !/\b(?:no|nunca|sin|juzgado|precedente)\b/.test(clause.split(outcome)[0])) return true;
  }
  for (const number of currentNumbers) {
    const offset = s.indexOf(number);
    if (offset >= 0 && outcome.test(s.slice(offset + number.length).split(/[.;\n]/)[0].slice(0,100))) return true;
  }
  return role === 'scjn' && outcome.test(s) && !/\b(?:no concede|no concedio|precedente|juzgado)\b/.test(s);
}

const SOURCE_KEYS = new Set(['documents','pre_release_source_pages','source_refs','evidence_refs','citations','quote','source_quote','extracted_text','migratorio_disposition','agent_logs','integrity_audit']);
/** Apply at engine ingestion and again to legacy export inputs. Rejected
 * records remain in the original engine data; only paths/reasons enter the
 * presentation audit, so unsupported text cannot leak through another view. */
export function quarantineDispositionConflicts<T>(input:T, disposition?:MigratorioDisposition, currentNumbers:string[] = []) {
  const rejected: Array<{path:string;reason:string}> = [];
  const reject = (path:string) => {rejected.push({path,reason:'current_disposition_conflict'});return undefined;};
  const visit = (v:any,path:string,key:string,role?:unknown,arrayItem=false):any => {
    if (SOURCE_KEYS.has(key)) return structuredClone(v);
    if (typeof v === 'string') return conflictsWithCurrentDisposition(v,disposition,role,currentNumbers) ? reject(path) : v;
    if (Array.isArray(v)) return v.map((item,i)=>visit(item,`${path}[${i}]`,'',role,true)).filter(item=>item!==undefined);
    if (!v || typeof v !== 'object') return v;
    const speaker = v.speaker_role ?? v.reviewing_court_role ?? role;
    if (arrayItem && ['title','description','text','summary','fact'].some(k => typeof v[k]==='string' && conflictsWithCurrentDisposition(v[k],disposition,speaker,currentNumbers))) return reject(path);
    return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,visit(val,`${path}.${k}`,k,speaker)]).filter(([,val])=>val!==undefined));
  };
  return {data:visit(input,'$','') as T,rejected};
}

/** Strength and risk are different metrics. Bind the explanatory text to the
 * actual persisted metrics, not to a model's stale dashboard prose. */
export function reconcileReportScorePresentation(report:Row, scoresAllowed:boolean, language='es') {
  if (!scoresAllowed) return;
  const full = report.full_report ?? {};
  const dimensions = Object.values(full.deterministic_scorecard?.dimensions ?? {}) as Row[];
  const scores = dimensions.map(d=>d.score).filter(n=>typeof n==='number' && Number.isFinite(n));
  if (!scores.length) return;
  const strength = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  report.case_strength_score = strength;
  const risk = full.deterministic_algorithms?.risk?.score ?? report.risk_score;
  if (typeof risk === 'number') report.risk_score = risk;
  const baselineOnly = dimensions.every(d=>d.contributor_count === 0);
  report.score_breakdown = language === 'en'
    ? `Case strength: ${strength}/100 (mean of ${scores.length} deterministic dimensions).${typeof risk==='number' ? ` Risk: ${risk}/100; a separate measure, not the case-strength score.` : ''}${baselineOnly?' All dimensions remain at their baselines; no verified finding contributed to score movement.':''}`
    : `Fortaleza del expediente: ${strength}/100 (promedio de ${scores.length} dimensiones deterministas).${typeof risk==='number' ? ` Riesgo: ${risk}/100; es una medida distinta de la fortaleza del expediente.` : ''}${baselineOnly?' Todas las dimensiones permanecen en su valor base; ningún hallazgo verificado contribuyó a modificar la puntuación.':''}`;
}

/** A rejected pair must stop affecting the risk meter as well as the table. */
export function reconcileContradictionRisk(report:Row, count:number) {
  const full=report.full_report ?? {}, risk=full.deterministic_algorithms?.risk;
  if (!risk || !Array.isArray(risk.factors)) return;
  const factors=risk.factors.filter((f:Row)=>!/^\d+ x (unresolved contradictions|contradicciones no resueltas)$/.test(f.label));
  if (count) factors.unshift({label:`${count} x contradicciones no resueltas`,delta:count*8});
  const score=Math.max(0,Math.min(100,factors.reduce((n:number,f:Row)=>n+Number(f.delta??0),0)));
  const band=score>=75?'critical':score>=50?'high':score>=25?'medium':'low';
  full.deterministic_algorithms.risk={...risk,score,band,factors};
  full.risk_consistency={...full.risk_consistency,score,band};
  report.risk_score=score;
}
