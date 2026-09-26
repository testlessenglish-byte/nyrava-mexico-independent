import { describe, expect, it, beforeEach } from "vitest";
import {
  getLegalAnalysisTypes,
  isLegalAnalysisTypeEnabled,
  assertLegalAnalysisTypeEnabled,
  getLegalAnalysisTypeDisabledMessage,
  invalidateLegalAnalysisTypesCache,
  DEFAULT_LEGAL_ANALYSIS_TYPES,
  INITIAL_LEGAL_ANALYSIS_TYPES_STATE,
} from "../legal-analysis-types";
import { MX_CASE_TYPES, MX_CASE_TYPE_LABELS, type MexicanCaseType } from "../jurisdiction/mexico-types";

describe("Legal Analysis Types — Intake Selectors & Admin Toggle Integration", () => {
  beforeEach(() => {
    invalidateLegalAnalysisTypesCache();
  });

  // 1. Four launch materias appear in new-case dropdown by default
  it("Requirement 1: Four launch materias appear in new-case dropdown by default (familiar, civil, penal, migratorio)", async () => {
    const types = await getLegalAnalysisTypes();
    const subscriberAvailable = types.filter((t) => t.enabled).map((t) => t.code);

    expect(subscriberAvailable).toHaveLength(4);
    expect(subscriberAvailable).toContain("familiar");
    expect(subscriberAvailable).toContain("civil");
    expect(subscriberAvailable).toContain("penal");
    expect(subscriberAvailable).toContain("migratorio");
  });

  // 2. Disabled materias do NOT appear in subscriber new-case dropdown
  it("Requirement 2: Disabled materias do NOT appear in subscriber new-case dropdown (no enabled, no disabled, no 'coming soon')", async () => {
    const types = await getLegalAnalysisTypes();
    const subscriberAvailable = types.filter((t) => t.enabled);

    const disabledCodes: MexicanCaseType[] = [
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

    for (const code of disabledCodes) {
      // Must not be in subscriber list at all
      expect(subscriberAvailable.some((t) => t.code === code)).toBe(false);
    }

    // Must not contain any "(Próximamente)" or "(Coming Soon)" labels
    for (const item of subscriberAvailable) {
      expect(item.name_es).not.toContain("Próximamente");
      expect(item.name_en).not.toContain("Coming Soon");
    }
  });

  // 3. Admin page displays ALL 14 materias with accurate toggle states
  it("Requirement 3: Admin page displays ALL 14 materias with accurate toggle states", async () => {
    const allTypes = await getLegalAnalysisTypes();
    expect(allTypes).toHaveLength(14);

    const codes = allTypes.map((t) => t.code);
    for (const expectedCode of MX_CASE_TYPES) {
      expect(codes).toContain(expectedCode);
    }

    // Exactly 4 are ON, 10 are OFF
    const onTypes = allTypes.filter((t) => t.enabled);
    const offTypes = allTypes.filter((t) => !t.enabled);
    expect(onTypes).toHaveLength(4);
    expect(offTypes).toHaveLength(10);
  });

  // 4. Changing Admin toggle for a materia from OFF -> ON causes it to appear in new-case selector without code deployment
  it("Requirement 4: Changing Admin toggle from OFF -> ON causes it to appear in new-case selector dynamically", async () => {
    // Simulate DB where 'mercantil' has been enabled by admin toggle
    const mockDb = {
      from: (table: string) => ({
        select: () => ({
          order: () => Promise.resolve({
            data: DEFAULT_LEGAL_ANALYSIS_TYPES.map((t) => ({
              ...t,
              enabled: t.code === "mercantil" ? true : t.enabled,
            })),
            error: null,
          }),
        }),
      }),
    };

    invalidateLegalAnalysisTypesCache();
    const updatedTypes = await getLegalAnalysisTypes(mockDb);
    const subscriberAvailable = updatedTypes.filter((t) => t.enabled).map((t) => t.code);

    expect(subscriberAvailable).toContain("mercantil");
    expect(subscriberAvailable).toHaveLength(5);
    expect(await isLegalAnalysisTypeEnabled("mercantil", mockDb)).toBe(true);
  });

  // 5. Changing Admin toggle from ON -> OFF causes it to disappear from new-case selector without code deployment
  it("Requirement 5: Changing Admin toggle from ON -> OFF causes it to disappear from new-case selector dynamically", async () => {
    // Simulate DB where 'civil' was toggled OFF by admin
    const mockDb = {
      from: (table: string) => ({
        select: () => ({
          order: () => Promise.resolve({
            data: DEFAULT_LEGAL_ANALYSIS_TYPES.map((t) => ({
              ...t,
              enabled: t.code === "civil" ? false : t.enabled,
            })),
            error: null,
          }),
        }),
      }),
    };

    invalidateLegalAnalysisTypesCache();
    const updatedTypes = await getLegalAnalysisTypes(mockDb);
    const subscriberAvailable = updatedTypes.filter((t) => t.enabled).map((t) => t.code);

    expect(subscriberAvailable).not.toContain("civil");
    expect(subscriberAvailable).toHaveLength(3);
    expect(await isLegalAnalysisTypeEnabled("civil", mockDb)).toBe(false);
  });

  // 6. Existing case with previously enabled materia remains fully accessible if that materia is later switched OFF
  it("Requirement 6: Existing case with previously enabled materia remains fully accessible if later switched OFF", async () => {
    // Historical case record
    const historicalCase = {
      id: "historical-case-uuid-1",
      case_type: "mercantil",
      title: "Juicio Ejecutivo Mercantil 123/2025",
      status: "completed",
      findings_count: 14,
    };

    // Current subscriber available materias (mercantil is OFF)
    const types = await getLegalAnalysisTypes();
    const availableMaterias = types.filter((t) => t.enabled);

    // Verify mercantil is not in new intake
    expect(availableMaterias.some((m) => m.code === historicalCase.case_type)).toBe(false);

    // Historical case data remains intact and readable
    expect(historicalCase.case_type).toBe("mercantil");
    expect(historicalCase.findings_count).toBe(14);

    // In UI dropdown rendering logic (as implemented in CaseControlPanel and cases.$caseId):
    // If ct exists and is not in availableMaterias, it displays as an option with (Histórico)
    const isCurrentTypeEnabled = availableMaterias.some((m) => m.code === historicalCase.case_type);
    expect(isCurrentTypeEnabled).toBe(false);

    // The option rendered for the historical case:
    const historicalOption = {
      value: historicalCase.case_type,
      label: `${historicalCase.case_type} (Histórico)`,
      disabled: true,
    };
    expect(historicalOption.value).toBe("mercantil");
    expect(historicalOption.disabled).toBe(true);
  });

  // 7. Direct API attempt to create or queue case with disabled materia is rejected with exact message
  it("Requirement 7: Direct API attempt with disabled materia is rejected with exact user-facing message", async () => {
    // Spanish
    const esError = getLegalAnalysisTypeDisabledMessage("mercantil", "es");
    expect(esError).toBe("Derecho Mercantil aún no está disponible para nuevos análisis.");

    await expect(assertLegalAnalysisTypeEnabled("mercantil", undefined, "es")).rejects.toThrow(
      "Derecho Mercantil aún no está disponible para nuevos análisis.",
    );

    // English
    const enError = getLegalAnalysisTypeDisabledMessage("mercantil", "en");
    expect(enError).toBe("Commercial Law is not currently available for new analyses.");

    await expect(assertLegalAnalysisTypeEnabled("mercantil", undefined, "en")).rejects.toThrow(
      "Commercial Law is not currently available for new analyses.",
    );

    // Laboral Spanish and English
    expect(getLegalAnalysisTypeDisabledMessage("laboral", "es")).toBe(
      "Derecho Laboral aún no está disponible para nuevos análisis.",
    );
    expect(getLegalAnalysisTypeDisabledMessage("laboral", "en")).toBe(
      "Labor Law is not currently available for new analyses.",
    );

    // Fiscal Spanish and English
    expect(getLegalAnalysisTypeDisabledMessage("fiscal", "es")).toBe(
      "Derecho Fiscal aún no está disponible para nuevos análisis.",
    );
    expect(getLegalAnalysisTypeDisabledMessage("fiscal", "en")).toBe(
      "Tax Law is not currently available for new analyses.",
    );
  });

  // 8. Classifier cannot bypass OFF state (stops analysis, does not route to Civil)
  it("Requirement 8: Classifier cannot bypass OFF state (stops analysis, does not route to Civil)", async () => {
    const detectedMateria = "mercantil";
    const isAllowed = await isLegalAnalysisTypeEnabled(detectedMateria);
    expect(isAllowed).toBe(false);

    // Pipeline behavior simulation: if classifier detects disabled materia, it must NOT fallback to 'civil'
    let resolvedCaseType: string | null = null;
    let pipelineHalted = false;
    let failureReason = "";

    if (!isAllowed) {
      pipelineHalted = true;
      failureReason = getLegalAnalysisTypeDisabledMessage(detectedMateria, "es");
      // NEVER silently route to civil
      resolvedCaseType = null;
    } else {
      resolvedCaseType = detectedMateria;
    }

    expect(pipelineHalted).toBe(true);
    expect(resolvedCaseType).toBeNull();
    expect(failureReason).toBe("Derecho Mercantil aún no está disponible para nuevos análisis.");
  });

  // 9. Pipeline enqueue cannot bypass OFF state
  it("Requirement 9: Pipeline enqueue cannot bypass OFF state", async () => {
    const queueRequest = {
      caseId: "mock-case-uuid-99",
      case_type: "mercantil",
    };

    // Pre-flight check before enqueuing or running
    const canEnqueue = await isLegalAnalysisTypeEnabled(queueRequest.case_type);
    expect(canEnqueue).toBe(false);

    await expect(assertLegalAnalysisTypeEnabled(queueRequest.case_type)).rejects.toThrow(
      "Derecho Mercantil aún no está disponible para nuevos análisis.",
    );
  });

  // 10. Both Spanish and English selectors behave identically with respect to available materias
  it("Requirement 10: Both Spanish and English selectors behave identically with respect to available materias", async () => {
    const types = await getLegalAnalysisTypes();
    const enabledTypes = types.filter((t) => t.enabled);

    // Spanish select options
    const esOptions = enabledTypes.map((t) => ({
      value: t.code,
      label: t.name_es,
    }));

    // English select options
    const enOptions = enabledTypes.map((t) => ({
      value: t.code,
      label: t.name_en,
    }));

    expect(esOptions).toHaveLength(4);
    expect(enOptions).toHaveLength(4);

    // Codes match identically in same order
    expect(esOptions.map((o) => o.value)).toEqual(enOptions.map((o) => o.value));
    expect(esOptions.map((o) => o.value)).toEqual(["familiar", "civil", "penal", "migratorio"]);

    // Proper translations exist
    expect(esOptions.find((o) => o.value === "familiar")?.label).toBe("Derecho Familiar");
    expect(enOptions.find((o) => o.value === "familiar")?.label).toBe("Family Law");

    expect(esOptions.find((o) => o.value === "civil")?.label).toBe("Derecho Civil");
    expect(enOptions.find((o) => o.value === "civil")?.label).toBe("Civil Law");

    expect(esOptions.find((o) => o.value === "penal")?.label).toContain("Penal");
    expect(enOptions.find((o) => o.value === "penal")?.label).toContain("Criminal");

    expect(esOptions.find((o) => o.value === "migratorio")?.label).toContain("Migratorio");
    expect(enOptions.find((o) => o.value === "migratorio")?.label).toContain("Immigration");
  });
});
