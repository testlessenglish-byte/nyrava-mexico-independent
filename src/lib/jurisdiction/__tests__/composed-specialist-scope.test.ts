import { describe, expect, it } from "vitest";
import { detectMatterSubtype, isEngineAllowedForSubtype } from "../matter-subtype";

describe("independent substantive and procedural specialist scope", () => {
  it("preserves support alongside custody", () => {
    const scope = detectMatterSubtype("familiar", "Guarda y custodia y pensión alimenticia");
    expect(isEngineAllowedForSubtype(scope, "agent:child_support_calculation")).toBe(true);
    expect(isEngineAllowedForSubtype(scope, "agent:custody_best_interest_analysis")).toBe(true);
  });
  it("keeps the custody-only narrowing", () => {
    expect(isEngineAllowedForSubtype(detectMatterSubtype("familiar", "Guarda y custodia"), "agent:child_support_calculation")).toBe(false);
  });
  it("preserves support and violence when both issues are present", () => {
    const scope = detectMatterSubtype("familiar", "Pensión alimenticia y violencia familiar");
    expect(isEngineAllowedForSubtype(scope, "agent:child_support_calculation")).toBe(true);
    expect(isEngineAllowedForSubtype(scope, "agent:domestic_violence_assessment")).toBe(true);
  });
  it("narrows underlying succession even when the outer case is amparo", () => {
    const scope = detectMatterSubtype("amparo", "Juicio sucesorio testamentario", { underlyingMateria: "familiar" });
    for (const agent of ["custody_best_interest_analysis", "child_support_calculation", "domestic_violence_assessment"])
      expect(isEngineAllowedForSubtype(scope, `agent:${agent}`)).toBe(false);
  });
  it("combines revision exclusions with underlying support scope", () => {
    const scope = detectMatterSubtype("amparo", "Pensión alimenticia", { underlyingMateria: "familiar", proceduralVehicle: "amparo_directo_revision" });
    expect(isEngineAllowedForSubtype(scope, "agent:child_support_calculation")).toBe(true);
    expect(isEngineAllowedForSubtype(scope, "agent:custody_best_interest_analysis")).toBe(false);
    expect(isEngineAllowedForSubtype(scope, "agent:suspension_analysis")).toBe(false);
  });
  it("does not short-circuit procedural text after a substantive match", () => {
    const scope = detectMatterSubtype("familiar", "Amparo Directo en Revisión 5/2026 sobre pensión alimenticia");
    expect(isEngineAllowedForSubtype(scope, "agent:suspension_analysis")).toBe(false);
    expect(isEngineAllowedForSubtype(scope, "agent:child_support_calculation")).toBe(true);
  });
});
