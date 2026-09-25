// Administrative witness evidence is permitted by LFPCA article 44.
// Official reform: https://sidof.segob.gob.mx/notas/docFuente/5790177
// Eligibility does not establish that this case has witnesses or uses that law.
import { describe, it, expect } from "vitest";
import { isStageRelevantForCaseType, mxPipelineStageKeys } from "@/lib/execution/mx-pipeline";

describe("administrativo and separate electoral/ambiental pipeline stage relevance", () => {
  it("allows witness analysis for administrativo when evidence is present", () => {
    expect(isStageRelevantForCaseType("administrativo", "witness")).toBe(true);
    // constitutional was already correctly excluded before this fix.
    expect(isStageRelevantForCaseType("administrativo", "constitutional")).toBe(false);
  });

  it("preserves the separate electoral and ambiental stage policies", () => {
    expect(isStageRelevantForCaseType("electoral", "witness")).toBe(false);
    expect(isStageRelevantForCaseType("ambiental", "witness")).toBe(false);
  });

  it("still runs the stages that produce useful output for a contentious-administrative case", () => {
    const keys = mxPipelineStageKeys("administrativo");
    for (const useful of [
      "extraction", "analyzers", "agents", "timeline", "evidence_map",
      "contradictions", "evidence_intel", "jurisdiction_intel",
      "procedural_compliance", "discovery", "theories", "strategy",
      "work_product", "scoring", "legal_qa", "report",
    ]) {
      expect(keys).toContain(useful);
    }
    // trial_prep no longer exists as a stage at all — confirm it's absent
    // from every materia's stage list, not just administrativo's.
    expect(keys).not.toContain("trial_prep");
  });

  it("does NOT exclude witness for a real adversarial-trial materia (penal) — the fix is scoped, not global", () => {
    expect(isStageRelevantForCaseType("penal", "witness")).toBe(true);
  });

  it("still excludes witness for amparo — regression guard against accidentally narrowing the existing exclusion", () => {
    expect(isStageRelevantForCaseType("amparo", "witness")).toBe(false);
  });

  it("trial_prep is absent from every materia's pipeline, not just administrativo's", () => {
    for (const materia of ["penal", "civil", "familiar", "laboral", "administrativo", "amparo", "inmobiliario"]) {
      expect(mxPipelineStageKeys(materia)).not.toContain("trial_prep");
    }
  });
});
