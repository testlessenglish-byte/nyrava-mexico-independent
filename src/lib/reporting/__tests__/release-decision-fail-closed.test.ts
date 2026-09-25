import { expect, it } from "vitest";
import { resolveFinalReleaseDecision } from "../final-release-decision";

it("keeps a failed contract blocked even when the validator supplies no diagnostics", () => {
  const result = resolveFinalReleaseDecision({
    report: { full_report: {} }, contract: { ok: false, blocking_errors: [] },
  });
  expect(result.released).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});
