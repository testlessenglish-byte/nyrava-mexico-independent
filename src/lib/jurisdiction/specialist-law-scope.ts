export type SpecialistLawScopeInput = {
  /** Court/territorial metadata is retained but never used as governing law. */
  jurisdiction?: string | null;
  proceduralVehicle?: string | null;
  proceedingType?: string | null;
  documents?: readonly { id: string; text: string }[];
  caseType?: string | null;
  matterMetadata?: Record<string, unknown> | null;
  matterSubtype?: string | null;
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

/**
 * Conservative specialist admission; routing driven by verified procedural signals and
 * substantive evidence rather than raw keywords alone.
 */
export function specialistLawScopeDecision(agent: string, input: SpecialistLawScopeInput): SpecialistLawScopeDecision {
  const evidence: SpecialistLawScopeDecision["evidence"] = [];
  const isMigratorio = input.caseType === "migratorio";

  // 1. Constitutional controversy analysis
  if (agent === "constitutional_controversy_analysis") {
    const vehicle = fold(input.proceduralVehicle).trim();
    const explicitVehicle = ["controversia_constitucional", "accion_inconstitucionalidad", "accion_de_inconstitucionalidad"].includes(vehicle);
    const caption = /^(controversia constitucional|accion(?: de)? inconstitucionalidad)\b/.test(fold(input.proceedingType).trim());
    const run = explicitVehicle || (!vehicle && caption);
    return { run, reason: run ? null : "procedure_scope_unverified:article_105", evidence, scopeStatus: run ? "procedure_supported" : "unresolved" };
  }

  // 2. Migratorio specialist routing
  if (isMigratorio) {
    const subtypeKey = fold(String(input.matterSubtype ?? input.matterMetadata?.immigration_subtype ?? ""));
    const corpusHead = (input.documents ?? []).map((d) => fold(d.text.slice(0, 4000))).join("\n");
    const fullCorpus = (input.documents ?? []).map((d) => fold(d.text)).join("\n");

    // 2a. Refugee & Non-Refoulement Analysis
    if (agent === "refugee_non_refoulement_analysis") {
      const isRefugeeSubtype = /\b(refugio|asilo|comar|proteccion_complementaria|no_devolucion|razones_humanitarias)\b/.test(subtypeKey);
      const hasRefugeeClaim = /\b(comision mexicana de ayuda a refugiados|solicitud de(?:l reconocimiento de la)? condicion de refugiado|condicion de refugiado|proteccion complementaria|asilo politico|temor fundado de persecucion|riesgo fundado|principio de no devolucion)\b/.test(fullCorpus);

      if (isRefugeeSubtype || hasRefugeeClaim) {
        return { run: true, reason: null, evidence, scopeStatus: isRefugeeSubtype ? "procedure_supported" : "documentary_candidate" };
      }
      return { run: false, reason: "refugee_protection_not_at_issue", evidence: [], scopeStatus: "unresolved" };
    }

    // 2b. Nationality & Naturalization Analysis
    if (agent === "nationality_naturalization_analysis") {
      const isNationalitySubtype = /\b(nacionalidad|naturalizacion|declaratoria|doble_nacionalidad|certificado_nacionalidad)\b/.test(subtypeKey);
      const hasNationalityClaim = /\b(carta de naturalizacion|solicitud de naturalizacion|declaratoria de nacionalidad|certificado de nacionalidad mexicana|adquisicion de nacionalidad mexicana|renuncia a nacionalidad extranjera|articulo 30 de la constitucion)\b/.test(fullCorpus);

      if (isNationalitySubtype || hasNationalityClaim) {
        return { run: true, reason: null, evidence, scopeStatus: isNationalitySubtype ? "procedure_supported" : "documentary_candidate" };
      }
      return { run: false, reason: "nationality_naturalization_not_at_issue", evidence: [], scopeStatus: "unresolved" };
    }

    // 2c. Child / Family Vulnerability Protection
    if (agent === "child_vulnerability_protection") {
      // Must ONLY run when minors or child vulnerability are substantiated in the evidence
      const hasMinorsInEvidence = /\b(menor(?:es)? de edad|menor(?:es)? hij[oa]s?|hij[oa]s? menor(?:es)?|nin[oa]s?|nna|adolescente(?:s)?|infante(?:s)?|no acompanad[oa]s?|lactante(?:s)?|acta de nacimiento(?: de(?:l| la))? menor|guarda y custodia|patria potestad|procuraduria de proteccion)\b/.test(fullCorpus);
      const isChildVulnerabilitySubtype = /\b(interes_superior|menor|ninez|adolescente|unidad_familiar|reunificacion_familiar)\b/.test(subtypeKey);

      if (hasMinorsInEvidence || isChildVulnerabilitySubtype) {
        return { run: true, reason: null, evidence, scopeStatus: "documentary_candidate" };
      }
      return { run: false, reason: "minor_vulnerability_not_substantiated_in_evidence", evidence: [], scopeStatus: "unresolved" };
    }

    // 2d. Constitutional and amparo agents in Migratorio
    if (["agent:standing_procedencia", "standing_procedencia", "agent:suspension_analysis", "suspension_analysis"].includes(agent)) {
      const vehicle = fold(input.proceduralVehicle).trim();
      const hasAmparo = /amparo/.test(vehicle) || /\b(juicio de amparo|amparo indirecto|amparo directo|juzgado de distrito|tribunal colegiado|suspension del acto)\b/.test(corpusHead);
      if (hasAmparo) {
        return { run: true, reason: null, evidence, scopeStatus: "procedure_supported" };
      }
      return { run: false, reason: "amparo_procedure_not_applicable_to_administrative_stage", evidence: [], scopeStatus: "unresolved" };
    }

    if (["agent:constitutional_rights_mapping", "constitutional_rights_mapping", "agent:conventionality_pro_persona", "conventionality_pro_persona", "agent:international_human_rights_analysis", "international_human_rights_analysis"].includes(agent)) {
      // Constitutional and conventional human rights analysis is always available in Migratorio
      return { run: true, reason: null, evidence, scopeStatus: "procedure_supported" };
    }
  }

  // 3. Administrative and federal tax statutory gates
  const required = agent === "administrative_due_process_review" ? "LFPA"
    : agent === "administrative_nullity_analysis" ? "LFPCA"
    : ["sat_audit_review", "cfdi_accounting_tax_validation", "prodecon_opportunity_detection"].includes(agent) ? "federal_tax" : null;
  if (!required) return { run: true, reason: null, evidence, scopeStatus: "not_required" };

  for (const document of input.documents ?? []) {
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
