import { describe, expect, it } from "vitest";
import {
  isLegalAnalysisTypeEnabled,
  assertLegalAnalysisTypeEnabled,
  getLegalAnalysisTypesMap,
  getLegalAnalysisTypes,
  INITIAL_LEGAL_ANALYSIS_TYPES_STATE,
  LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_ES,
  LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_EN,
} from "../legal-analysis-types";
import {
  specialistLawScopeDecision,
  verifySpecialistMateriaLock,
  MATERIA_SPECIALIST_MAP,
} from "../jurisdiction/specialist-law-scope";
import { MX_CASE_TYPES, type MexicanCaseType } from "../jurisdiction/mexico-types";

describe("Legal Analysis Types Feature Flags & Initial Launch Configuration", () => {
  it("initial launch configuration enables exactly Familiar, Civil, Penal, and Migratorio", () => {
    expect(INITIAL_LEGAL_ANALYSIS_TYPES_STATE.familiar).toBe(true);
    expect(INITIAL_LEGAL_ANALYSIS_TYPES_STATE.civil).toBe(true);
    expect(INITIAL_LEGAL_ANALYSIS_TYPES_STATE.penal).toBe(true);
    expect(INITIAL_LEGAL_ANALYSIS_TYPES_STATE.migratorio).toBe(true);

    const offMaterias: MexicanCaseType[] = [
      "mercantil",
      "laboral",
      "administrativo",
      "fiscal",
      "amparo",
      "electoral",
      "agrario",
      "constitucional",
      "ambiental",
      "inmobiliario",
    ];

    for (const materia of offMaterias) {
      expect(INITIAL_LEGAL_ANALYSIS_TYPES_STATE[materia]).toBe(false);
    }
  });

  it("getLegalAnalysisTypes returns all 14 Mexican materias with proper default states", async () => {
    const list = await getLegalAnalysisTypes();
    expect(list.length).toBe(14);
    const codes = list.map((l) => l.code);
    for (const type of MX_CASE_TYPES) {
      expect(codes).toContain(type);
    }

    const familiar = list.find((l) => l.code === "familiar");
    expect(familiar?.enabled).toBe(true);

    const civil = list.find((l) => l.code === "civil");
    expect(civil?.enabled).toBe(true);

    const penal = list.find((l) => l.code === "penal");
    expect(penal?.enabled).toBe(true);

    const migratorio = list.find((l) => l.code === "migratorio");
    expect(migratorio?.enabled).toBe(true);

    const mercantil = list.find((l) => l.code === "mercantil");
    expect(mercantil?.enabled).toBe(false);
  });

  it("isLegalAnalysisTypeEnabled validates allowed and disallowed materias", async () => {
    expect(await isLegalAnalysisTypeEnabled("familiar")).toBe(true);
    expect(await isLegalAnalysisTypeEnabled("civil")).toBe(true);
    expect(await isLegalAnalysisTypeEnabled("penal")).toBe(true);
    expect(await isLegalAnalysisTypeEnabled("migratorio")).toBe(true);

    expect(await isLegalAnalysisTypeEnabled("mercantil")).toBe(false);
    expect(await isLegalAnalysisTypeEnabled("laboral")).toBe(false);
    expect(await isLegalAnalysisTypeEnabled("amparo")).toBe(false);
    expect(await isLegalAnalysisTypeEnabled("invalid_materia")).toBe(false);
    expect(await isLegalAnalysisTypeEnabled(null)).toBe(false);
  });

  it("assertLegalAnalysisTypeEnabled passes for enabled materias and throws exact user-facing message for disabled", async () => {
    await expect(assertLegalAnalysisTypeEnabled("familiar")).resolves.toBeUndefined();
    await expect(assertLegalAnalysisTypeEnabled("civil")).resolves.toBeUndefined();
    await expect(assertLegalAnalysisTypeEnabled("penal")).resolves.toBeUndefined();
    await expect(assertLegalAnalysisTypeEnabled("migratorio")).resolves.toBeUndefined();

    await expect(assertLegalAnalysisTypeEnabled("mercantil")).rejects.toThrow(
      "Derecho Mercantil aún no está disponible para nuevos análisis.",
    );
    await expect(assertLegalAnalysisTypeEnabled("mercantil", undefined, "en")).rejects.toThrow(
      "Commercial Law is not currently available for new analyses.",
    );
  });
});

describe("Strict Execution Materia Lock", () => {
  // Test 1: Familiar cannot invoke Civil/Penal/Migratorio specialists
  it("Familiar execution cannot invoke Civil, Penal, or Migratorio specialists", () => {
    const familiarInput = { caseType: "familiar" };

    // Familiar specialists are allowed
    expect(verifySpecialistMateriaLock("custody_best_interest_analysis", familiarInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("child_support_calculation", familiarInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("domestic_violence_assessment", familiarInput).allowed).toBe(true);

    // Civil specialists are forbidden
    const civilInFamiliar = verifySpecialistMateriaLock("contract_analysis_ambiguity", familiarInput);
    expect(civilInFamiliar.allowed).toBe(false);
    expect(civilInFamiliar.reason).toBe("materia_lock_forbidden:civil_specialist_in_familiar");

    expect(verifySpecialistMateriaLock("liability_damages_assessment", familiarInput).allowed).toBe(false);
    expect(verifySpecialistMateriaLock("payment_insurance_analysis", familiarInput).allowed).toBe(false);

    // Penal specialists are forbidden
    const penalInFamiliar = verifySpecialistMateriaLock("search_warrant_arrest_legality", familiarInput);
    expect(penalInFamiliar.allowed).toBe(false);
    expect(penalInFamiliar.reason).toBe("materia_lock_forbidden:penal_specialist_in_familiar");

    expect(verifySpecialistMateriaLock("chain_of_custody", familiarInput).allowed).toBe(false);
    expect(verifySpecialistMateriaLock("forensic_digital_evidence_analysis", familiarInput).allowed).toBe(false);

    // Migratorio specialists are forbidden
    const migratorioInFamiliar = verifySpecialistMateriaLock("refugee_non_refoulement_analysis", familiarInput);
    expect(migratorioInFamiliar.allowed).toBe(false);
    expect(migratorioInFamiliar.reason).toBe("materia_lock_forbidden:migratorio_specialist_in_familiar");

    expect(verifySpecialistMateriaLock("immigration_eligibility_analysis", familiarInput).allowed).toBe(false);
    expect(verifySpecialistMateriaLock("nationality_naturalization_analysis", familiarInput).allowed).toBe(false);
  });

  // Test 2: Civil cannot invoke Familiar/Penal/Migratorio specialists
  it("Civil execution cannot invoke Familiar, Penal, or Migratorio specialists", () => {
    const civilInput = { caseType: "civil" };

    // Civil specialists are allowed
    expect(verifySpecialistMateriaLock("contract_analysis_ambiguity", civilInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("liability_damages_assessment", civilInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("statute_of_limitations_analysis", civilInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("settlement_opportunity_analyzer", civilInput).allowed).toBe(true);

    // Familiar specialists are forbidden
    const familiarInCivil = verifySpecialistMateriaLock("custody_best_interest_analysis", civilInput);
    expect(familiarInCivil.allowed).toBe(false);
    expect(familiarInCivil.reason).toBe("materia_lock_forbidden:familiar_specialist_in_civil");

    expect(verifySpecialistMateriaLock("child_support_calculation", civilInput).allowed).toBe(false);
    expect(verifySpecialistMateriaLock("domestic_violence_assessment", civilInput).allowed).toBe(false);

    // Penal specialists are forbidden
    const penalInCivil = verifySpecialistMateriaLock("search_warrant_arrest_legality", civilInput);
    expect(penalInCivil.allowed).toBe(false);
    expect(penalInCivil.reason).toBe("materia_lock_forbidden:penal_specialist_in_civil");

    // Migratorio specialists are forbidden
    const migratorioInCivil = verifySpecialistMateriaLock("immigration_eligibility_analysis", civilInput);
    expect(migratorioInCivil.allowed).toBe(false);
    expect(migratorioInCivil.reason).toBe("materia_lock_forbidden:migratorio_specialist_in_civil");
  });

  // Test 3: Penal cannot invoke Familiar/Civil/Migratorio specialists
  it("Penal execution cannot invoke Familiar, Civil, or Migratorio specialists", () => {
    const penalInput = { caseType: "penal" };

    // Penal specialists are allowed
    expect(verifySpecialistMateriaLock("search_warrant_arrest_legality", penalInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("forensic_digital_evidence_analysis", penalInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("reasonable_doubt_defense_theory", penalInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("sentencing_analysis", penalInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("chain_of_custody", penalInput).allowed).toBe(true);

    // Familiar specialists are forbidden
    const familiarInPenal = verifySpecialistMateriaLock("custody_best_interest_analysis", penalInput);
    expect(familiarInPenal.allowed).toBe(false);
    expect(familiarInPenal.reason).toBe("materia_lock_forbidden:familiar_specialist_in_penal");

    // Civil specialists are forbidden
    const civilInPenal = verifySpecialistMateriaLock("contract_analysis_ambiguity", penalInput);
    expect(civilInPenal.allowed).toBe(false);
    expect(civilInPenal.reason).toBe("materia_lock_forbidden:civil_specialist_in_penal");

    // Migratorio specialists are forbidden
    const migratorioInPenal = verifySpecialistMateriaLock("refugee_non_refoulement_analysis", penalInput);
    expect(migratorioInPenal.allowed).toBe(false);
    expect(migratorioInPenal.reason).toBe("materia_lock_forbidden:migratorio_specialist_in_penal");
  });

  // Test 4: Migratorio cannot invoke Familiar/Civil/Penal specialists
  it("Migratorio execution cannot invoke Familiar, Civil, or Penal specialists", () => {
    const migratorioInput = { caseType: "migratorio" };

    // Migratorio specialists are allowed through the materia lock
    expect(verifySpecialistMateriaLock("immigration_eligibility_analysis", migratorioInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("immigration_deadline_continuity", migratorioInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("refugee_non_refoulement_analysis", migratorioInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("nationality_naturalization_analysis", migratorioInput).allowed).toBe(true);
    expect(verifySpecialistMateriaLock("child_vulnerability_protection", migratorioInput).allowed).toBe(true);

    // Familiar specialists are forbidden
    const familiarInMigratorio = verifySpecialistMateriaLock("custody_best_interest_analysis", migratorioInput);
    expect(familiarInMigratorio.allowed).toBe(false);
    expect(familiarInMigratorio.reason).toBe("materia_lock_forbidden:familiar_specialist_in_migratorio");

    // Civil specialists are forbidden
    const civilInMigratorio = verifySpecialistMateriaLock("contract_analysis_ambiguity", migratorioInput);
    expect(civilInMigratorio.allowed).toBe(false);
    expect(civilInMigratorio.reason).toBe("materia_lock_forbidden:civil_specialist_in_migratorio");

    // Penal specialists are forbidden
    const penalInMigratorio = verifySpecialistMateriaLock("search_warrant_arrest_legality", migratorioInput);
    expect(penalInMigratorio.allowed).toBe(false);
    expect(penalInMigratorio.reason).toBe("materia_lock_forbidden:penal_specialist_in_migratorio");
  });

  // Test 5: Keyword matches alone may NEVER override the materia lock
  it("Corpus containing keywords of other materias cannot override the materia lock", () => {
    // A familiar case with keywords mentioning crimes, contracts, and immigration
    const familiarWithKeywords = {
      caseType: "familiar",
      documents: [
        {
          id: "doc-1",
          text: `El demandado cometió fraude y falsificación de documentos penales con orden de aprehensión y cateo ministerial.
                 Además firmó un contrato mercantil de arrendamiento y pagaré con el Servicio de Administración Tributaria.
                 Solicitó condición de refugiado ante COMAR y asilo político de no devolución.`,
        },
      ],
    };

    // Even with heavy criminal keywords in the corpus, penal specialists remain strictly blocked
    const penalDecision = specialistLawScopeDecision("search_warrant_arrest_legality", familiarWithKeywords);
    expect(penalDecision.run).toBe(false);
    expect(penalDecision.reason).toBe("materia_lock_forbidden:penal_specialist_in_familiar");

    // Civil contract specialists remain strictly blocked
    const civilDecision = specialistLawScopeDecision("contract_analysis_ambiguity", familiarWithKeywords);
    expect(civilDecision.run).toBe(false);
    expect(civilDecision.reason).toBe("materia_lock_forbidden:civil_specialist_in_familiar");

    // Refugee specialists remain strictly blocked in Familiar
    const refugeeDecision = specialistLawScopeDecision("refugee_non_refoulement_analysis", familiarWithKeywords);
    expect(refugeeDecision.run).toBe(false);
    expect(refugeeDecision.reason).toBe("materia_lock_forbidden:migratorio_specialist_in_familiar");

    // Tax SAT specialists remain strictly blocked in Familiar
    const satDecision = specialistLawScopeDecision("sat_audit_review", familiarWithKeywords);
    expect(satDecision.run).toBe(false);
    expect(satDecision.reason).toBe("materia_lock_forbidden:fiscal_specialist_in_familiar");
  });

  // Test 6: Cross-cutting constitutional capabilities run across materias
  it("Approved cross-cutting constitutional capabilities are eligible across launch materias", () => {
    for (const materia of ["familiar", "civil", "penal", "migratorio"] as const) {
      const input = { caseType: materia };

      expect(verifySpecialistMateriaLock("constitutional_compliance", input).allowed).toBe(true);
      expect(verifySpecialistMateriaLock("conventionality_pro_persona", input).allowed).toBe(true);
      expect(verifySpecialistMateriaLock("constitutional_rights_mapping", input).allowed).toBe(true);
      expect(verifySpecialistMateriaLock("international_human_rights_analysis", input).allowed).toBe(true);
    }
  });

  // Test 7: Amparo procedural specialists require verified Amparo procedure
  it("Amparo procedural specialists run only when verified amparo procedure is present", () => {
    // Ordinary family proceeding without amparo procedure -> blocked
    const ordinaryFamiliar = {
      caseType: "familiar",
      proceduralVehicle: "juicio_ordinario_familiar",
    };
    const standingOrdinary = verifySpecialistMateriaLock("standing_procedencia", ordinaryFamiliar);
    expect(standingOrdinary.allowed).toBe(false);
    expect(standingOrdinary.reason).toBe("amparo_procedure_not_applicable_to_ordinary_stage");

    // Familiar case under verified Amparo Directo -> allowed
    const amparoFamiliar = {
      caseType: "familiar",
      proceduralVehicle: "amparo_directo",
    };
    const standingAmparo = verifySpecialistMateriaLock("standing_procedencia", amparoFamiliar);
    expect(standingAmparo.allowed).toBe(true);

    // But Amparo procedure does NOT unlock unrelated specialists (e.g. Penal or Mercantil)
    expect(verifySpecialistMateriaLock("search_warrant_arrest_legality", amparoFamiliar).allowed).toBe(false);
    expect(verifySpecialistMateriaLock("bankruptcy_concurso_review", amparoFamiliar).allowed).toBe(false);
  });
});
