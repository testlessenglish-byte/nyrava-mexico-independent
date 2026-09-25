import { describe, expect, it } from "vitest";
import { shouldCheckOptionalOutput } from "../optional-output-applicability";

describe("optional output diagnostics", () => {
  it.each(["concluded_audit", "judgment_audit"])("does not require new work product for %s", mode => {
    expect(shouldCheckOptionalOutput("work_product", mode, { status: "completed" })).toBe(false);
  });
  it.each(["ongoing", "appeal_routes", null])("keeps eligible work-product empty output visible for %s", mode => {
    expect(shouldCheckOptionalOutput("work_product", mode, { status: "completed" })).toBe(true);
  });
  it("preserves an explicit not-applicable ledger decision", () => {
    expect(shouldCheckOptionalOutput("witness", "ongoing", {
      status: "skipped", skipped_reason: "skipped_not_applicable:no_witnesses",
    })).toBe(false);
  });
  it("does not hide an unexplained skip or failure", () => {
    expect(shouldCheckOptionalOutput("witness", "ongoing", { status: "skipped" })).toBe(true);
    expect(shouldCheckOptionalOutput("strategy", "concluded_audit", { status: "failed" })).toBe(true);
  });
});
