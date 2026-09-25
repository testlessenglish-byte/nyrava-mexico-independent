// Real case-law grounding for legal issue hits (Report Intelligence).
// Mexican-only: queries the local legal_authorities corpus populated by the
// government-source connectors. No U.S. case-law source is used here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LegalIssueHit } from "./report-augment.server";
import { sha256Hex } from "./evidence-provenance.server";

type Db = SupabaseClient<Database>;

export type CaseLawResult = {
  case_name: string;
  citation: string | null;
  court: string | null;
  date_filed: string | null;
  url: string;
  snippet: string;
  provenance?: {authority_id:string;content_hash:string;source_url:string;passage_start:number;passage_end:number;
    effective_at:string|null;temporal_status:'date_supported'|'unresolved';binding_status:'not_determined'};
};

// Curated expansions where a compact issue label benefits from Mexican legal
// vocabulary. IMPORTANT: this map is an optimization, not an allowlist. An
// issue not present here MUST still query the knowledge library using its own
// Spanish issue text; the previous allowlist behavior meant Amparo, fiscal,
// administrativo, familiar, laboral, civil, mercantil, agrario, electoral,
// ambiental and inmobiliario issues silently received zero legal-authority
// grounding while penal labels happened to work.
const ISSUE_QUERY_MAP: Record<string, string> = {
  "Cateo y Detención": "cateo orden judicial detención flagrancia caso urgente exclusión prueba ilícita",
  "Declaración del Imputado sin Garantías":
    "declaración imputado defensor adecuado derecho guardar silencio coacción nulidad",
  "Irregularidad en Solicitud de Cateo": "orden de cateo datos falsos omisión sustancial nulidad diligencia",
  "Omisión en el Deber de Aportación Probatoria":
    "principio de objetividad Ministerio Público carpeta de investigación datos de prueba ocultos",
  "Declaraciones Previas de Testigo":
    "entrevista previa testigo contradicción interrogatorio contrainterrogatorio credibilidad",
  "Cadena de Custodia": "cadena de custodia indicio ruptura valor probatorio exclusión",
  "Fundamentación Probatoria": "licitud de la prueba incorporación de prueba valoración probatoria juicio oral",
  "Impugnación Pericial": "dictamen pericial metodología perito acreditación valor probatorio impugnación",
  "Procedencia del recurso de revisión": "amparo directo revisión procedencia cuestión constitucional importancia trascendencia",
  "Legitimación": "legitimación interés jurídico interés legítimo amparo recurso revisión",
  "Notificación": "notificación personal sentencia amparo plazo recurso revisión debido proceso",
  "Interpretación constitucional": "interpretación directa constitución amparo directo revisión Suprema Corte",
  "Definitividad": "principio definitividad amparo excepciones procedencia",
  "Suspensión": "suspensión acto reclamado apariencia buen derecho interés social amparo",
  "Competencia": "competencia jurisdicción órgano jurisdiccional amparo federal",
};

export function buildCaseLawSearchQuery(issueType: string, materia?: string): string {
  const issue = String(issueType ?? "").trim();
  if (!issue) return "";
  const curated = ISSUE_QUERY_MAP[issue];
  if (curated) return curated;
  // Generic fallback is what makes the knowledge network platform-wide.
  // Keep it close to the issue wording instead of inventing doctrine. Adding
  // the materia gives PostgreSQL websearch useful context for common labels
  // such as "competencia" or "notificación" without changing the proposition.
  const m = String(materia ?? "").trim();
  return m ? `${issue} ${m}` : issue;
}

const foldText=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Lexical relevance chooses a source passage, never paraphrases its contents. */
function relevantPassage(body:string,query:string) {
  const tokens=[...new Set(foldText(query).split(/[^a-z0-9]+/).filter(t=>t.length>=4))];
  const paragraphs=[...body.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)];
  const ranked=paragraphs.map(m=>({text:m[0],start:m.index!,score:tokens.filter(t=>foldText(m[0]).includes(t)).length}))
    .filter(p=>p.score>0).sort((a,b)=>b.score-a.score);
  const best=ranked[0];if(!best) return null;
  const first=tokens.map(t=>foldText(best.text).indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0];
  const start=best.start+Math.max(0,first-150),end=Math.min(best.start+best.text.length,start+700);
  return {text:body.slice(start,end),start,end};
}

const FEDERAL_ISSUER_RE =
  /suprema corte|scjn|pleno (regional|de circuito)|primera sala|segunda sala|tribunal(es)? colegiado|tribunal(es)? unitario|colegiado de circuito|juzgado de distrito|consejo de la judicatura federal|\bcjf\b|tribunal federal de justicia administrativa|\btfja\b|tribunal electoral del poder judicial|\btepjf\b|tribunal (unitario|superior) agrario|poder judicial de la federaci/i;

export function isFederalIssuer(issuer: string | null | undefined): boolean {
  return FEDERAL_ISSUER_RE.test(String(issuer ?? ""));
}

export async function searchCaseLaw(
  db: Db,
  query: string,
  opts: { maxResults?: number; materia?: string; federalOnly?: boolean; caseDate?:string|null; jurisdiction?:string|null } = {},
): Promise<CaseLawResult[]> {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) return [];
  const max = opts.maxResults ?? 3;
  const fetchLimit = Math.max(max * 6, 18);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (db as any)
      .from("legal_authorities")
      .select("id,title,short_title,citation,issuer,jurisdiction,published_at,effective_at,repealed_at,source_url,body,metadata,authority_level,content_hash,verification_status,superseded_by_id")
      .in("kind", ["jurisprudencia", "court_decision", "electoral_ruling", "administrative_ruling"])
      .eq("verification_status", "verified")
      .textSearch("body", normalizedQuery, { type: "websearch", config: "spanish" })
      .order("authority_level", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false })
      .limit(fetchLimit);

    const { data, error } = await q;
    if (error) {
      throw new Error(`Legal source lookup unavailable: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (Array.isArray(data) ? data : []) as any[];
    // Competing content under one citation is an unresolved version identity.
    const hashesByCitation = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.citation) continue;
      const key = foldText(String(row.citation)).trim();
      const hashes = hashesByCitation.get(key) ?? new Set<string>();
      hashes.add(String(row.content_hash ?? ''));
      hashesByCitation.set(key, hashes);
    }
    let mapped: CaseLawResult[] = rows.flatMap((r) => {
      if(r.verification_status!=='verified' || r.superseded_by_id || !r.id || !r.content_hash || !r.source_url) return [];
      if(sha256Hex(String(r.body ?? '')) !== r.content_hash) return [];
      if(r.citation && (hashesByCitation.get(foldText(String(r.citation)).trim())?.size ?? 0)>1) return [];
      if(r.repealed_at && (!opts.caseDate || !Number.isFinite(Date.parse(r.repealed_at)) || Date.parse(opts.caseDate)>=Date.parse(r.repealed_at))) return [];
      if(opts.jurisdiction && r.jurisdiction!==opts.jurisdiction) return [];
      if(opts.caseDate && (!Number.isFinite(Date.parse(opts.caseDate)) || !r.effective_at
        || !Number.isFinite(Date.parse(r.effective_at)) || Date.parse(r.effective_at)>Date.parse(opts.caseDate))) return [];
      const passage=relevantPassage(String(r.body??''),normalizedQuery);if(!passage) return [];
      return [{
      case_name: String(r.short_title ?? r.title ?? "Tesis/Jurisprudencia sin título"),
      citation: r.citation ? String(r.citation) : null,
      court: r.issuer ? String(r.issuer) : null,
      date_filed: r.published_at ?? null,
      url: String(r.source_url),
      snippet: passage.text,
      provenance:{authority_id:r.id,content_hash:r.content_hash,source_url:r.source_url,passage_start:passage.start,
        passage_end:passage.end,effective_at:r.effective_at??null,temporal_status:opts.caseDate?'date_supported' as const:'unresolved' as const,
        binding_status:'not_determined' as const},
    }];});

    if (opts.federalOnly) {
      const federal = mapped.filter((r) => isFederalIssuer(r.court));
      mapped = federal;
    }

    const results = mapped.slice(0, max);
    return results;
  } catch (err) {
    console.warn(
      `[case-law] lookup threw for query "${normalizedQuery}":`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

/**
 * Attach verified Mexican legal authorities to every detected legal issue.
 * Unknown issue labels are searched by their own text instead of being
 * silently discarded because they were absent from a hand-maintained map.
 */
export async function attachCaseLaw(
  db: Db,
  issues: LegalIssueHit[],
  materia?: string,
  opts: { federalOnly?: boolean; caseDate?:string|null; jurisdiction?:string|null } = {},
): Promise<LegalIssueHit[]> {
  const uniqueIssueTypes = Array.from(new Set(issues.map((i) => i.issue)));
  const byIssueType = new Map<string, CaseLawResult[]>();

  await Promise.all(
    uniqueIssueTypes.map(async (issueType) => {
      const query = buildCaseLawSearchQuery(issueType, materia);
      const cases = query
        ? await searchCaseLaw(db, query, {
            maxResults: 3,
            materia,
            federalOnly: opts.federalOnly === true,
            caseDate:opts.caseDate,jurisdiction:opts.jurisdiction,
          })
        : [];
      byIssueType.set(issueType, cases);
    }),
  );

  return issues.map((i) => ({
    ...i,
    case_law: byIssueType.get(i.issue) ?? [],
  }));
}
