import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("final release gate order", () => {
  it("runs hallucination reconciliation before Judge", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/agents/orchestrator.server.ts"),
      "utf8",
    );
    const finalReview = source.slice(source.indexOf("async function _runFinalReleaseReview"));
    const runnersStart = finalReview.indexOf("const gateRunners = [");
    const gateRunners = finalReview.slice(runnersStart, finalReview.indexOf(";", runnersStart));
    const hallucination = gateRunners.indexOf("'hallucination'");
    const judge = gateRunners.indexOf("'judge'");
    expect(hallucination).toBeGreaterThan(-1);
    expect(judge).toBeGreaterThan(-1);
    expect(hallucination).toBeLessThan(judge);
  });
});
