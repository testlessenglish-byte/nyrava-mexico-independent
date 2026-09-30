import { describe, expect, it } from "vitest";
import { caseStatusSummary } from "@/lib/case-status-summary";

describe("case status summaries", () => {
  it("preserves concise user-facing status messages", () => {
    expect(caseStatusSummary("running", "Analysis is in progress.")).toBe("Analysis is in progress.");
  });

  it("hides detailed report diagnostics from case status surfaces", () => {
    expect(
      caseStatusSummary(
        "needs_revision",
        "Report needs review: final_report_contract:citation_integrity:report.full_report",
      ),
    ).toBe("Report needs review before release.");
  });

  it("returns null for missing messages and generic text for overlong messages", () => {
    expect(caseStatusSummary("running", null)).toBeNull();
    expect(caseStatusSummary("running", "x".repeat(181))).toBe("Open the case to review its current status.");
  });
});
