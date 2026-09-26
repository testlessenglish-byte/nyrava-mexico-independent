/**
 * Specialist Finding Reconciliation — pure module.
 *
 * Ensures that chunk processing over large documents never produces
 * competing, redundant, or contradictory findings for the same legal issue.
 * Merges chunk outputs BEFORE claim creation into exactly ONE canonical
 * result per specialist topic.
 */

export interface RawSpecialistFinding {
  title?: string;
  description?: string;
  severity?: "low" | "medium" | "high" | "critical" | string;
  confidence?: number;
  legal_significance?: string;
  potential_impact?: string;
  affected_party?: string;
  evidence_refs?: Array<{ doc_n?: number; doc_id?: string; quote: string }>;
  [key: string]: unknown;
}

export interface ReconciledSpecialistFinding {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  legal_significance: string;
  potential_impact: string;
  affected_party: string;
  evidence_refs: Array<{ doc_n?: number; doc_id?: string; quote: string }>;
  [key: string]: unknown;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function foldText(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derives a normalized cluster key for a specialist finding based on its
 * title, legal significance, or core legal principle.
 */
function deriveTopicClusterKey(f: RawSpecialistFinding, agentType?: string): string {
  const title = foldText(f.title);
  const significance = foldText(f.legal_significance);
  const combined = `${title} ${significance}`;

  if (/\b(salida definitiva|orden de salida|deportacion|retorno asistido)\b/.test(combined)) {
    return "orden_salida_deportacion";
  }
  if (/\b(detencion migratoria|alojamiento|estacion migratoria|privacion de la libertad)\b/.test(combined)) {
    return "detencion_migratoria";
  }
  if (/\b(no devolucion|non refoulement|riesgo de persecucion|temor fundado|persecucion)\b/.test(combined)) {
    return "principio_no_devolucion";
  }
  if (/\b(refugio|condicion de refugiado|comar|proteccion complementaria)\b/.test(combined)) {
    return "refugio_proteccion_comar";
  }
  if (/\b(nacionalidad|naturalizacion|declaratoria de nacionalidad|certificado de nacionalidad)\b/.test(combined)) {
    return "nacionalidad_naturalizacion";
  }
  if (/\b(debido proceso|notificacion defectuosa|falta de notificacion|garantia de audiencia)\b/.test(combined)) {
    return "debido_proceso_notificacion";
  }
  if (/\b(fundamentacion y motivacion|falta de fundamentacion|indebida motivacion)\b/.test(combined)) {
    return "fundamentacion_motivacion";
  }
  if (/\b(interes superior de la ninez|menor de edad|nna|vulnerabilidad.*menor|unidad familiar.*menor)\b/.test(combined)) {
    return "interes_superior_ninez";
  }
  if (/\b(condicion de estancia|regularizacion|residencia temporal|residencia permanente|renovacion)\b/.test(combined)) {
    return "condicion_estancia_regularizacion";
  }
  if (/\b(plazo|computo|termino|dias habiles|vencimiento|caducidad|prescripcion)\b/.test(combined)) {
    return "plazos_computo_continuidad";
  }

  const tokens = title.split(" ").filter((t) => t.length > 3);
  return tokens.slice(0, 4).join("_") || (agentType ? `topic_${agentType}` : "general_finding");
}

export function reconcileSpecialistFindings(
  findings: unknown[],
  agentType?: string,
): ReconciledSpecialistFinding[] {
  if (!Array.isArray(findings) || findings.length === 0) return [];

  const clusters = new Map<string, RawSpecialistFinding[]>();

  for (const item of findings) {
    if (!item || typeof item !== "object") continue;
    const f = item as RawSpecialistFinding;
    if (!f.title && !f.description) continue;

    const clusterKey = deriveTopicClusterKey(f, agentType);
    const existing = clusters.get(clusterKey) ?? [];
    existing.push(f);
    clusters.set(clusterKey, existing);
  }

  const result: ReconciledSpecialistFinding[] = [];

  for (const [, group] of clusters) {
    if (group.length === 1) {
      const single = group[0];
      result.push({
        title: String(single.title || "Hallazgo verificado").trim(),
        description: String(single.description || "").trim(),
        severity: (["critical", "high", "medium", "low"].includes(String(single.severity))
          ? single.severity
          : "medium") as "low" | "medium" | "high" | "critical",
        confidence: typeof single.confidence === "number" ? single.confidence : 0.85,
        legal_significance: String(single.legal_significance || "").trim(),
        potential_impact: String(single.potential_impact || "").trim(),
        affected_party: String(single.affected_party || "persona_migrante"),
        evidence_refs: Array.isArray(single.evidence_refs) ? single.evidence_refs : [],
      });
      continue;
    }

    let maxSev: "low" | "medium" | "high" | "critical" = "low";
    let maxSevVal = 0;
    let bestTitle = "";
    let longestDesc = "";
    let bestSignificance = "";
    let bestImpact = "";
    let confTotal = 0;
    const allEvidenceRefs: Array<{ doc_n?: number; doc_id?: string; quote: string }> = [];
    const seenQuotes = new Set<string>();

    for (const f of group) {
      const sev = String(f.severity || "medium").toLowerCase();
      const val = SEVERITY_ORDER[sev] ?? 2;
      if (val > maxSevVal) {
        maxSevVal = val;
        maxSev = sev as "low" | "medium" | "high" | "critical";
      }

      const t = String(f.title || "").trim();
      if (t.length > bestTitle.length) bestTitle = t;

      const d = String(f.description || "").trim();
      if (d.length > longestDesc.length) longestDesc = d;

      const sig = String(f.legal_significance || "").trim();
      if (sig.length > bestSignificance.length) bestSignificance = sig;

      const imp = String(f.potential_impact || "").trim();
      if (imp.length > bestImpact.length) bestImpact = imp;

      confTotal += typeof f.confidence === "number" ? f.confidence : 0.85;

      if (Array.isArray(f.evidence_refs)) {
        for (const ref of f.evidence_refs) {
          if (ref && typeof ref.quote === "string" && ref.quote.trim().length > 0) {
            const key = `${ref.doc_n ?? ref.doc_id ?? ""}:${ref.quote.trim()}`;
            if (!seenQuotes.has(key)) {
              seenQuotes.add(key);
              allEvidenceRefs.push(ref);
            }
          }
        }
      }
    }

    result.push({
      title: bestTitle || "Hallazgo migratorio verificado",
      description: longestDesc,
      severity: maxSev,
      confidence: Math.round((confTotal / group.length) * 100) / 100,
      legal_significance: bestSignificance,
      potential_impact: bestImpact,
      affected_party: String(group[0]?.affected_party || "persona_migrante"),
      evidence_refs: allEvidenceRefs,
    });
  }

  return result;
}
