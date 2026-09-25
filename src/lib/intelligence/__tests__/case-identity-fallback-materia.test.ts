import { describe, it, expect } from "vitest";
import { normalizePracticeArea, isFindingAllowed } from "@/lib/intelligence/practice-areas";
import { mxPartyRoleEnum, isStageRelevantForCaseType, resolveMxProfile } from "@/lib/execution/mx-pipeline";
import { buildJurisdictionProfile } from "@/lib/intelligence/mx-jurisdiction";

describe("case-identity-fallback-materia: the exact production crash on ADR-4640-2017-180212", () => {
  it("reproduces why the old fallback sentinels crashed the strict validators", () => {
    expect(() => normalizePracticeArea("general_civil")).toThrow();
    expect(() => normalizePracticeArea("unverified")).toThrow();
    expect(() => mxPartyRoleEnum("general_civil")).toThrow();
  });

  it("a confirmed civil materia is accepted by strict validators", () => {
    expect(() => normalizePracticeArea("civil")).not.toThrow();
    expect(normalizePracticeArea("civil")).toBe("civil");
    expect(() => mxPartyRoleEnum("civil")).not.toThrow();
    expect(mxPartyRoleEnum("civil")).toContain("parte_actora");
  });

  it("buildCaseTypeManifest also requires a real materia and now gets one", async () => {
    const { buildCaseTypeManifest } = await import("@/lib/intelligence/practice-areas");
    expect(() => buildCaseTypeManifest("unverified", [])).toThrow();
    expect(() => buildCaseTypeManifest("civil", [])).not.toThrow();
  });

  it("the schema fallback never leaks into policy decisions — an unverified identity (null) still degrades to universal-only findings, not civil-specific ones", () => {
    // A civil-specific finding module must be allowed once "civil" is
    // actually resolved/confirmed...
    expect(isFindingAllowed("civil", "analyzer:contrato")).toBe(true);
    // ...but must NOT be allowed just because the schema fallback happens
    // to be "civil" — the policy check must be fed the real (possibly
    // null) identity value, never the schema-generation fallback.
    expect(isFindingAllowed(null, "analyzer:contrato")).toBe(false);
    // A universal module stays allowed regardless.
    expect(isFindingAllowed(null, "analyzer:extraction")).toBe(true);
  });

  it("an unverified identity (null) also stays permissive for stage-selection, unaffected by the schema fallback", () => {
    expect(isStageRelevantForCaseType(null, "constitutional")).toBe(true);
    expect(isStageRelevantForCaseType(null, "witness")).toBe(true);
  });
});

describe("jurisdiction profile with unresolved identity", () => {
  it("keeps strict validation separate from unresolved jurisdiction support", () => {
    expect(() => resolveMxProfile(null)).toThrow();
    expect(() => resolveMxProfile(undefined)).toThrow();
  });
  it("preserves null materia and unresolved competence without civil law candidates", () => {
    const profile = buildJurisdictionProfile({ caseType: null });
    expect(profile).toMatchObject({ materia: null, fuero: "unresolved", jurisdiction_level: "unresolved" });
    expect(profile.substantive_codes).toEqual([]);
    expect(profile.procedural_codes).toEqual([]);
    expect(profile.courts).toEqual([]);
    expect(profile.applicable_law.substantive_materia).toBeNull();
  });
  it("uses civil when it is the supplied confirmed materia", () => {
    const profile = buildJurisdictionProfile({ caseType: "civil" });
    expect(profile.materia).toBe("civil");
    expect(profile.applicable_law.substantive_materia).toBe("civil");
  });
});
