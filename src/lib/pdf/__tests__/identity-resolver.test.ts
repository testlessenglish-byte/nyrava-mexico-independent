import { describe, it, expect } from "vitest";
import { resolveReportIdentity, cleanClientMatterName, isUserInstructionOrPrompt } from "@/lib/pdf/identity-resolver";

describe("cover identity", () => {
  it("fills proceeding, court, materia from stored case data", () => {
    const r = resolveReportIdentity({
      id: "abc12345",
      case_type: "amparo",
      jurisdiction: "federal",
      procedural_vehicle: "amparo_revision",
      matter_metadata: { case_identity: { tribunal_level: "scjn", case_number: "Amparo en revisión 388/2022" } },
    });
    expect(r.proceedingType).toBe("amparo_revision");
    expect(r.matterType).toBe("amparo");
    expect(r.court).toBe("scjn");
    expect(r.jurisdiction).toBe("federal");
    expect(r.caseNumber).toBe("Amparo en revisión 388/2022");
  });

  it("leaves fields undefined when truly absent", () => {
    const r = resolveReportIdentity({ id: "zz" });
    expect(r.proceedingType).toBeUndefined();
    expect(r.court).toBeUndefined();
  });

  it("cleans appended materia from client and matter names across all materias", () => {
    expect(cleanClientMatterName("New Family 1 - Familiar", "familiar")).toBe("New Family 1");
    expect(cleanClientMatterName("New Family 1 — Familiar")).toBe("New Family 1");
    expect(cleanClientMatterName("Corporativo Norte - Mercantil", "mercantil")).toBe("Corporativo Norte");
    expect(cleanClientMatterName("Sindicato Minero — Laboral")).toBe("Sindicato Minero");
    expect(cleanClientMatterName("Predio San Isidro - Agrario", "agrario")).toBe("Predio San Isidro");
    expect(cleanClientMatterName("Caso Penal 45 - Penal")).toBe("Caso Penal 45");
    expect(cleanClientMatterName("Lic. Roberto González M.")).toBe("Lic. Roberto González M.");
  });

  it("detects and filters out user instructions and prompts", () => {
    expect(isUserInstructionOrPrompt("Analiza si la sentencia de apelación violó el debido proceso")).toBe(true);
    expect(isUserInstructionOrPrompt("Por favor revisar los agravios en materia familiar")).toBe(true);
    expect(isUserInstructionOrPrompt("Instrucciones: dar prioridad a la pensión alimenticia")).toBe(true);
    expect(isUserInstructionOrPrompt("Prompt: extraer todas las citas del documento 1")).toBe(true);
    expect(isUserInstructionOrPrompt("Pregunta jurídica: ¿Se acreditó el daño patrimonial?")).toBe(true);
    expect(isUserInstructionOrPrompt("Controversia del orden familiar sobre régimen de convivencias")).toBe(false);
    expect(isUserInstructionOrPrompt("Juicio oral mercantil sobre incumplimiento de contrato")).toBe(false);
  });

  it("extracts clean factual description and rejects user instructions from case description", () => {
    const rPrompt = resolveReportIdentity({
      id: "case-1",
      name: "New Family 1 - Familiar",
      case_type: "familiar",
      description: "Analiza exhaustivamente las violaciones procesales cometidas por el juez de primera instancia",
    });
    expect(rPrompt.matterName).toBe("New Family 1");
    expect(rPrompt.description).toBeUndefined();

    const rFactual = resolveReportIdentity({
      id: "case-2",
      name: "Asunto Pérez",
      case_type: "familiar",
      description: "Controversia del orden familiar sobre custodia compartida y pensión de alimentos",
    });
    expect(rFactual.matterName).toBe("Asunto Pérez");
    expect(rFactual.description).toBe("Controversia del orden familiar sobre custodia compartida y pensión de alimentos");
  });
});
