export type SpecialistLawScopeInput = {
  /** Court/territorial metadata is retained but never used as governing law. */
  jurisdiction?: string | null;
  proceduralVehicle?: string | null;
  proceedingType?: string | null;
  documents?: readonly { id: string; text: string }[];
};
export type SpecialistLawScopeDecision = {
  run: boolean;
  reason: string | null;
  evidence: { documentId: string; quote: string }[];
  /** Documentary routing support is not professional validation of applicable law. */
  scopeStatus: "not_required" | "procedure_supported" | "documentary_candidate" | "unresolved";
};
const fold = (value: string | null | undefined) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Conservative specialist admission; no state/federal default from an address or forum. */
export function specialistLawScopeDecision(agent: string, input: SpecialistLawScopeInput): SpecialistLawScopeDecision {
  const evidence: SpecialistLawScopeDecision["evidence"] = [];
  if (agent === "constitutional_controversy_analysis") {
    const vehicle = fold(input.proceduralVehicle).trim();
    const explicitVehicle = ["controversia_constitucional", "accion_inconstitucionalidad", "accion_de_inconstitucionalidad"].includes(vehicle);
    const caption = /^(controversia constitucional|accion(?: de)? inconstitucionalidad)\b/.test(fold(input.proceedingType).trim());
    const run = explicitVehicle || (!vehicle && caption);
    return { run, reason: run ? null : "procedure_scope_unverified:article_105", evidence, scopeStatus: run ? "procedure_supported" : "unresolved" };
  }
  const required = agent === "administrative_due_process_review" ? "LFPA"
    : agent === "administrative_nullity_analysis" ? "LFPCA"
    : ["sat_audit_review", "cfdi_accounting_tax_validation", "prodecon_opportunity_detection"].includes(agent) ? "federal_tax" : null;
  if (!required) return { run: true, reason: null, evidence, scopeStatus: "not_required" };

  for (const document of input.documents ?? []) {
    // Work on bounded passages from actual source documents, not generated
    // classification prose or a concatenation of unrelated citations.
    const passages = document.text.split(/\n\s*\n/).filter((p) => p.length <= 2400);
    for (const passage of passages) {
      const text = fold(passage);
      if (/\b(por analogia|no (?:es |resulta )?aplicable|no se aplica)\b/.test(text)) continue;
      let supported = false;
      if (required === "LFPCA") {
        supported = /(?:este|presente) juicio[\s\S]{0,100}(?:se tramita|se rige|conforme|fundamento)/.test(text) &&
          /ley federal de procedimiento contencioso administrativo/.test(text) &&
          /tribunal federal de justicia (?:fiscal y )?administrativa/.test(text);
      } else if (required === "LFPA") {
        supported = /(?:este|presente) procedimiento[\s\S]{0,100}(?:se tramita|se rige|conforme|fundamento)/.test(text) &&
          /ley federal de procedimiento administrativo/.test(text);
      } else {
        const federalTax = /\b(isr|iva|ieps|impuesto sobre la renta|impuesto al valor agregado|contribuciones federales)\b/.test(text);
        const code = /codigo fiscal de la federacion/.test(text);
        const application = /\b(determina|determino|revisa|fiscaliza|ejerce|liquida|requiere)\b/.test(text);
        const federalAuthority = /servicio de administracion tributaria/.test(text);
        const delegated = /convenio de colaboracion administrativa en materia fiscal federal/.test(text) &&
          /facultades fiscales federales delegadas/.test(text);
        supported = federalTax && code && application && (federalAuthority || delegated);
      }
      if (supported) evidence.push({ documentId: document.id, quote: passage });
    }
  }
  const run = evidence.length > 0;
  return { run, reason: run ? null : `law_scope_unverified:${required}`, evidence, scopeStatus: run ? "documentary_candidate" : "unresolved" };
}
