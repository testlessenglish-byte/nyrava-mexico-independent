import type { MexicanCaseType } from "./mexico-types";

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

const fold = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Complete registry mapping every specialist investigator agent to its native home materia.
 * Keyword matches alone can NEVER override these boundaries.
 */
export const MATERIA_SPECIALIST_MAP: Record<string, MexicanCaseType> = {
  // Derecho Familiar
  custody_best_interest_analysis: "familiar",
  child_support_calculation: "familiar",
  domestic_violence_assessment: "familiar",

  // Derecho Civil
  contract_analysis_ambiguity: "civil",
  liability_damages_assessment: "civil",
  payment_insurance_analysis: "civil",
  statute_of_limitations_analysis: "civil",
  settlement_opportunity_analyzer: "civil",

  // Derecho Penal
  search_warrant_arrest_legality: "penal",
  forensic_digital_evidence_analysis: "penal",
  reasonable_doubt_defense_theory: "penal",
  sentencing_analysis: "penal",
  appeal_opportunity_detection: "penal",
  chain_of_custody: "penal",
  procedural_violations: "penal",

  // Derecho Migratorio, Refugio y Nacionalidad
  immigration_eligibility_analysis: "migratorio",
  immigration_deadline_continuity: "migratorio",
  refugee_non_refoulement_analysis: "migratorio",
  nationality_naturalization_analysis: "migratorio",
  immigration_due_process_remedies: "migratorio",
  child_vulnerability_protection: "migratorio",

  // Mercantil
  corporate_governance_shareholder_rights: "mercantil",
  commercial_contract_intelligence: "mercantil",
  financial_fraud_commercial_risk: "mercantil",
  bankruptcy_concurso_review: "mercantil",

  // Laboral
  lft_compliance_review: "laboral",
  payroll_overtime_imss_audit: "laboral",
  wrongful_termination_analysis: "laboral",
  union_discrimination_review: "laboral",

  // Administrativo
  administrative_due_process_review: "administrativo",
  authority_competence_notification_review: "administrativo",
  administrative_nullity_analysis: "administrativo",

  // Fiscal
  sat_audit_review: "fiscal",
  cfdi_accounting_tax_validation: "fiscal",
  prodecon_opportunity_detection: "fiscal",

  // Electoral
  ine_documentation_candidate_eligibility: "electoral",
  campaign_finance_review: "electoral",
  vote_counting_chain_of_custody: "electoral",
  political_violence_gender_parity: "electoral",
  electoral_nullity_analysis: "electoral",

  // Agrario
  ran_record_certificate_review: "agrario",
  ejido_assembly_analysis: "agrario",
  communal_land_indigenous_rights: "agrario",
  boundary_possession_analysis: "agrario",
  agrarian_jurisdiction_restitution: "agrario",

  // Ambiental
  mia_impact_assessment_review: "ambiental",
  profepa_asea_compliance_review: "ambiental",
  conagua_water_rights_review: "ambiental",
  pollution_remediation_analysis: "ambiental",
  protected_species_areas_review: "ambiental",

  // Inmobiliario
  property_verification: "inmobiliario",
  closing_readiness_scoring: "inmobiliario",

  // Constitucional (Controversia / Acción)
  constitutional_controversy_analysis: "constitucional",
};

/**
 * Universal agents that belong to the shared platform pipeline and may run
 * across any materia subject to evidence/audit conditions.
 */
export const UNIVERSAL_AGENTS = new Set<string>([
  "witness_credibility",
  "ways_out_analysis",
]);

/**
 * Cross-cutting specialist capabilities approved to run across materias
 * when verified constitutional or procedural eligibility conditions are met.
 */
export const CROSS_CUTTING_CONSTITUTIONAL_AGENTS = new Set<string>([
  "constitutional_compliance",
  "conventionality_pro_persona",
  "constitutional_rights_mapping",
  "international_human_rights_analysis",
]);

export const CROSS_CUTTING_AMPARO_PROCEDURAL_AGENTS = new Set<string>([
  "standing_procedencia",
  "suspension_analysis",
  "authority_notification_validation",
]);

/**
 * Strict execution materia lock.
 * Enforces that once an execution's materia is established, only:
 * 1. The universal/shared pipeline
 * 2. Specialist agents native to that exact materia
 * 3. Explicitly approved cross-cutting capabilities (with verified procedural grounds)
 * may run. Specialists from another materia are strictly forbidden and cannot be
 * unlocked by keyword matches alone.
 */
export function verifySpecialistMateriaLock(
  agent: string,
  input: SpecialistLawScopeInput,
): { allowed: boolean; reason: string | null } {
  const rawAgent = String(agent ?? "").trim();
  const cleanAgent = rawAgent.replace(/^agent:/, "");
  const executionMateria = fold(input.caseType).trim();

  // If no case type established yet, do not block at this layer
  if (!executionMateria) {
    return { allowed: true, reason: null };
  }

  // 1. Universal shared pipeline agents are always allowed through the materia lock
  if (UNIVERSAL_AGENTS.has(cleanAgent) || UNIVERSAL_AGENTS.has(rawAgent)) {
    return { allowed: true, reason: null };
  }

  // 2. Cross-cutting constitutional and international human rights analysis
  if (
    CROSS_CUTTING_CONSTITUTIONAL_AGENTS.has(cleanAgent) ||
    CROSS_CUTTING_CONSTITUTIONAL_AGENTS.has(rawAgent)
  ) {
    return { allowed: true, reason: null };
  }

  // 3. Cross-cutting amparo procedural agents (require verified Amparo procedure)
  if (
    CROSS_CUTTING_AMPARO_PROCEDURAL_AGENTS.has(cleanAgent) ||
    CROSS_CUTTING_AMPARO_PROCEDURAL_AGENTS.has(rawAgent)
  ) {
    if (executionMateria === "amparo") {
      return { allowed: true, reason: null };
    }
    const vehicle = fold(input.proceduralVehicle).trim();
    const proceeding = fold(input.proceedingType).trim();
    const corpusHead = (input.documents ?? []).map((d) => fold(d.text.slice(0, 4000))).join("\n");
    const isAmparoProcedure =
      vehicle.includes("amparo") ||
      proceeding.includes("amparo") ||
      /\b(juicio de amparo|amparo indirecto|amparo directo|juzgado de distrito|tribunal colegiado|suspension del acto)\b/.test(
        corpusHead,
      );
    if (isAmparoProcedure) {
      return { allowed: true, reason: null };
    }
    return {
      allowed: false,
      reason: "amparo_procedure_not_applicable_to_ordinary_stage",
    };
  }

  // 4. Materia-specific specialist agents
  const homeMateria = MATERIA_SPECIALIST_MAP[cleanAgent] ?? MATERIA_SPECIALIST_MAP[rawAgent];
  if (homeMateria) {
    if (homeMateria === executionMateria) {
      return { allowed: true, reason: null };
    }
    // Strict block: specialist belongs to another materia
    return {
      allowed: false,
      reason: `materia_lock_forbidden:${homeMateria}_specialist_in_${executionMateria}`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Conservative specialist admission; routing driven by verified procedural signals and
 * substantive evidence rather than raw keywords alone.
 */
export function specialistLawScopeDecision(
  agent: string,
  input: SpecialistLawScopeInput,
): SpecialistLawScopeDecision {
  const evidence: SpecialistLawScopeDecision["evidence"] = [];
  const cleanAgent = String(agent ?? "").replace(/^agent:/, "");

  // 0. Strict execution materia lock
  const lock = verifySpecialistMateriaLock(agent, input);
  if (!lock.allowed) {
    return {
      run: false,
      reason: lock.reason ?? "materia_lock_forbidden",
      evidence: [],
      scopeStatus: "unresolved",
    };
  }

  const isMigratorio = input.caseType === "migratorio";

  // 1. Constitutional controversy analysis (Article 105 CPEUM only)
  if (cleanAgent === "constitutional_controversy_analysis") {
    const vehicle = fold(input.proceduralVehicle).trim();
    const explicitVehicle = [
      "controversia_constitucional",
      "accion_inconstitucionalidad",
      "accion_de_inconstitucionalidad",
    ].includes(vehicle);
    const caption = /^(controversia constitucional|accion(?: de)? inconstitucionalidad)\b/.test(
      fold(input.proceedingType).trim(),
    );
    const run = explicitVehicle || (!vehicle && caption);
    return {
      run,
      reason: run ? null : "procedure_scope_unverified:article_105",
      evidence,
      scopeStatus: run ? "procedure_supported" : "unresolved",
    };
  }

  // 2. Migratorio specialist routing
  if (isMigratorio) {
    const subtypeKey = fold(
      String(input.matterSubtype ?? input.matterMetadata?.immigration_subtype ?? ""),
    );
    const corpusHead = (input.documents ?? []).map((d) => fold(d.text.slice(0, 4000))).join("\n");
    const fullCorpus = (input.documents ?? []).map((d) => fold(d.text)).join("\n");

    // 2a. Refugee & Non-Refoulement Analysis
    if (cleanAgent === "refugee_non_refoulement_analysis") {
      const isRefugeeSubtype =
        /\b(refugio|asilo|comar|proteccion_complementaria|no_devolucion|razones_humanitarias)\b/.test(
          subtypeKey,
        );
      const hasRefugeeClaim =
        /\b(comision mexicana de ayuda a refugiados|solicitud de(?:l reconocimiento de la)? condicion de refugiado|condicion de refugiado|proteccion complementaria|asilo politico|temor fundado de persecucion|riesgo fundado|principio de no devolucion)\b/.test(
          fullCorpus,
        );

      if (isRefugeeSubtype || hasRefugeeClaim) {
        return {
          run: true,
          reason: null,
          evidence,
          scopeStatus: isRefugeeSubtype ? "procedure_supported" : "documentary_candidate",
        };
      }
      return {
        run: false,
        reason: "refugee_protection_not_at_issue",
        evidence: [],
        scopeStatus: "unresolved",
      };
    }

    // 2b. Nationality & Naturalization Analysis
    if (cleanAgent === "nationality_naturalization_analysis") {
      const isNationalitySubtype =
        /\b(nacionalidad|naturalizacion|declaratoria|doble_nacionalidad|certificado_nacionalidad)\b/.test(
          subtypeKey,
        );
      const hasNationalityClaim =
        /\b(carta de naturalizacion|solicitud de naturalizacion|declaratoria de nacionalidad|certificado de nacionalidad mexicana|adquisicion de nacionalidad mexicana|renuncia a nacionalidad extranjera|articulo 30 de la constitucion)\b/.test(
          fullCorpus,
        );

      if (isNationalitySubtype || hasNationalityClaim) {
        return {
          run: true,
          reason: null,
          evidence,
          scopeStatus: isNationalitySubtype ? "procedure_supported" : "documentary_candidate",
        };
      }
      return {
        run: false,
        reason: "nationality_naturalization_not_at_issue",
        evidence: [],
        scopeStatus: "unresolved",
      };
    }

    // 2c. Child / Family Vulnerability Protection
    if (cleanAgent === "child_vulnerability_protection") {
      const hasMinorsInEvidence =
        /\b(menor(?:es)? de edad|menor(?:es)? hij[oa]s?|hij[oa]s? menor(?:es)?|nin[oa]s?|nna|adolescente(?:s)?|infante(?:s)?|no acompanad[oa]s?|lactante(?:s)?|acta de nacimiento(?: de(?:l| la))? menor|guarda y custodia|patria potestad|procuraduria de proteccion)\b/.test(
          fullCorpus,
        );
      const isChildVulnerabilitySubtype =
        /\b(interes_superior|menor|ninez|adolescente|unidad_familiar|reunificacion_familiar)\b/.test(
          subtypeKey,
        );

      if (hasMinorsInEvidence || isChildVulnerabilitySubtype) {
        return { run: true, reason: null, evidence, scopeStatus: "documentary_candidate" };
      }
      return {
        run: false,
        reason: "minor_vulnerability_not_substantiated_in_evidence",
        evidence: [],
        scopeStatus: "unresolved",
      };
    }

    // 2d. Constitutional and amparo agents in Migratorio
    if (
      ["standing_procedencia", "suspension_analysis", "authority_notification_validation"].includes(
        cleanAgent,
      )
    ) {
      const vehicle = fold(input.proceduralVehicle).trim();
      const hasAmparo =
        /amparo/.test(vehicle) ||
        /\b(juicio de amparo|amparo indirecto|amparo directo|juzgado de distrito|tribunal colegiado|suspension del acto)\b/.test(
          corpusHead,
        );
      if (hasAmparo) {
        return { run: true, reason: null, evidence, scopeStatus: "procedure_supported" };
      }
      return {
        run: false,
        reason: "amparo_procedure_not_applicable_to_administrative_stage",
        evidence: [],
        scopeStatus: "unresolved",
      };
    }

    if (
      [
        "constitutional_rights_mapping",
        "conventionality_pro_persona",
        "international_human_rights_analysis",
      ].includes(cleanAgent)
    ) {
      return { run: true, reason: null, evidence, scopeStatus: "procedure_supported" };
    }
  }

  // 3. Administrative and federal tax statutory gates
  const required =
    cleanAgent === "administrative_due_process_review"
      ? "LFPA"
      : cleanAgent === "administrative_nullity_analysis"
        ? "LFPCA"
        : [
              "sat_audit_review",
              "cfdi_accounting_tax_validation",
              "prodecon_opportunity_detection",
            ].includes(cleanAgent)
          ? "federal_tax"
          : null;
  if (!required) return { run: true, reason: null, evidence, scopeStatus: "not_required" };

  for (const document of input.documents ?? []) {
    const passages = document.text.split(/\n\s*\n/).filter((p) => p.length <= 2400);
    for (const passage of passages) {
      const text = fold(passage);
      if (/\b(por analogia|no (?:es |resulta )?aplicable|no se aplica)\b/.test(text)) continue;
      let supported = false;
      if (required === "LFPCA") {
        supported =
          /(?:este|presente) juicio[\s\S]{0,100}(?:se tramita|se rige|conforme|fundamento)/.test(
            text,
          ) &&
          /ley federal de procedimiento contencioso administrativo/.test(text) &&
          /tribunal federal de justicia (?:fiscal y )?administrativa/.test(text);
      } else if (required === "LFPA") {
        supported =
          /(?:este|presente) procedimiento[\s\S]{0,100}(?:se tramita|se rige|conforme|fundamento)/.test(
            text,
          ) && /ley federal de procedimiento administrativo/.test(text);
      } else {
        const federalTax =
          /\b(isr|iva|ieps|impuesto sobre la renta|impuesto al valor agregado|contribuciones federales)\b/.test(
            text,
          );
        const code = /codigo fiscal de la federacion/.test(text);
        const application =
          /\b(determina|determino|revisa|fiscaliza|ejerce|liquida|requiere)\b/.test(text);
        const federalAuthority = /servicio de administracion tributaria/.test(text);
        const delegated =
          /convenio de colaboracion administrativa en materia fiscal federal/.test(text) &&
          /facultades fiscales federales delegadas/.test(text);
        supported = federalTax && code && application && (federalAuthority || delegated);
      }
      if (supported) evidence.push({ documentId: document.id, quote: passage });
    }
  }
  const run = evidence.length > 0;
  return {
    run,
    reason: run ? null : `law_scope_unverified:${required}`,
    evidence,
    scopeStatus: run ? "documentary_candidate" : "unresolved",
  };
}
