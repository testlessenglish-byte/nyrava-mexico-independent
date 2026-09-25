import { expect, it } from "vitest";
import * as scope from "../specialist-law-scope";

const decide = (agent: string, input: unknown) => (scope as any).specialistLawScopeDecision(agent, input);
const docs = (text: string) => [{ id: "decision", text }];

it("does not select federal law from CDMX geography or a federal reviewing court", () => {
  for (const jurisdiction of ["CDMX", "Federal", "Estatal", null]) {
    expect(decide("administrative_nullity_analysis", { jurisdiction, documents: docs("Multa impuesta por alcaldía de la Ciudad de México.") }).run).toBe(false);
    expect(decide("sat_audit_review", { jurisdiction, documents: docs("Crédito de impuesto predial de la Ciudad de México, impugnado en amparo federal.") }).run).toBe(false);
  }
});
it("does not treat a bare federal citation as the applicable procedural regime", () => {
  expect(decide("administrative_nullity_analysis", { documents: docs("Se cita por analogía la Ley Federal de Procedimiento Contencioso Administrativo en este asunto local.") }).run).toBe(false);
});
it("admits a documented federal administrative proceeding without equating its location with scope", () => {
  const result = decide("administrative_nullity_analysis", { documents: docs("Este juicio se tramita conforme a la Ley Federal de Procedimiento Contencioso Administrativo ante el Tribunal Federal de Justicia Administrativa.") });
  expect(result.run).toBe(true);
  expect(result.evidence[0].documentId).toBe("decision");
});
it("allows documented federal tax delegation while preserving a local authority", () => {
  const result = decide("sat_audit_review", { jurisdiction: "Estatal", documents: docs("La Secretaría de Finanzas local ejerce facultades fiscales federales delegadas conforme al Convenio de Colaboración Administrativa en Materia Fiscal Federal. Determina ISR con fundamento en el Código Fiscal de la Federación.") });
  expect(result.run).toBe(true);
});
it("requires a federal-tax anchor and does not activate SAT from unrelated mentions", () => {
  expect(decide("sat_audit_review", { documents: docs("Impuesto predial. Se menciona al SAT y al Código Fiscal de la Federación por analogía.") }).run).toBe(false);
  expect(decide("sat_audit_review", { documents: docs("El Servicio de Administración Tributaria determina ISR con fundamento en el Código Fiscal de la Federación.") }).run).toBe(true);
});
it("restricts Article105 specialist to its actual procedure", () => {
  for (const proceduralVehicle of [null, "amparo_directo_revision", "cndh_queja", "amparo_indirecto"]) {
    expect(decide("constitutional_controversy_analysis", { proceduralVehicle, documents: docs("Se cita una controversia constitucional como antecedente.") }).run).toBe(false);
  }
  expect(decide("constitutional_controversy_analysis", { proceduralVehicle: "accion_inconstitucionalidad" }).run).toBe(true);
  expect(decide("constitutional_controversy_analysis", { proceedingType: "CONTROVERSIA CONSTITUCIONAL 12/2026" }).run).toBe(true);
});
it("keeps general competence review available and explains blocked specialized scope", () => {
  expect(decide("authority_competence_notification_review", {}).run).toBe(true);
  expect(decide("administrative_due_process_review", {}).reason).toBe("law_scope_unverified:LFPA");
  expect(decide("prodecon_opportunity_detection", {}).reason).toBe("law_scope_unverified:federal_tax");
});
