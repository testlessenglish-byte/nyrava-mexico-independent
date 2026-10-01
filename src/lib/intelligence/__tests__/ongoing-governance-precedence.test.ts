import { describe, expect, it } from "vitest";
import { resolveReportGovernance } from "../concluded-case-governance";

describe("explicit case analysis mode governance precedence", () => {
  it("keeps subscriber-selected ongoing mode active when documents infer concluded posture", () => {
    const governance = resolveReportGovernance({
      case_analysis_mode: "ongoing",
      procedural_posture: "concluded",
    });

    expect(governance.governance_mode).toBe("active_litigation");
    expect(governance.is_concluded).toBe(false);
    expect(governance.disposition_required).toBe(false);
    expect(governance.decision_core_priority).toBe(false);
  });

  it("keeps subscriber-selected ongoing mode active when a final resolution is detected", () => {
    const governance = resolveReportGovernance({
      case_analysis_mode: "ongoing",
      procedural_posture: "concluded",
      is_final_resolution: true,
    });

    expect(governance.governance_mode).toBe("active_litigation");
    expect(governance.disposition_required).toBe(false);
  });

  it("preserves explicit concluded audit mode", () => {
    const governance = resolveReportGovernance({
      case_analysis_mode: "concluded_audit",
    });

    expect(governance.governance_mode).toBe("concluded_decision_audit");
    expect(governance.is_concluded).toBe(true);
    expect(governance.disposition_required).toBe(true);
    expect(governance.decision_core_priority).toBe(true);
  });

  it("still infers concluded governance when no explicit mode was selected", () => {
    const governance = resolveReportGovernance({
      procedural_posture: "concluded",
    });

    expect(governance.governance_mode).toBe("concluded_decision_audit");
    expect(governance.disposition_required).toBe(true);
  });
});
