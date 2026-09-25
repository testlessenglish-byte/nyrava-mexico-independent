import { describe, expect, it } from "vitest";
import { stageAttemptStatus } from "../stage-attempt-status";
import { readFileSync } from "node:fs";

describe("actual stage attempt status", () => {
  it("does not erase a stop request when the worker resumes a checkpoint", () => {
    const source = readFileSync("src/lib/pipeline-runner.server.ts", "utf8");
    expect(source).not.toContain('.update({ cancel_requested: false } as any)');
  });
  it("clears an old error when a fresh stage attempt starts", () => {
    const current = { error: "Old schema error", status: "queued" };
    expect({ ...current, ...stageAttemptStatus("agents", "Agents", 2, 10, []) }).toMatchObject({
      error: null, status: "intelligence_running", next_stage: "agents", progress: 19,
    });
  });
  it("retains unresolved failures from the current invocation", () => {
    expect(stageAttemptStatus("scoring", "Scoring", 3, 10, [
      { key: "timeline", error: "Current source failure" },
    ]).error).toContain("timeline: Current source failure");
  });
  it("does not announce a new attempt or clear errors before the budget checkpoint", () => {
    const source = readFileSync("src/lib/pipeline-runner.server.ts", "utf8");
    const attempt = source.indexOf("stageAttemptStatus(s.key");
    expect(attempt).toBeGreaterThan(source.indexOf('return { kind: "checkpoint_before_start", index: i };'));
    expect(attempt).toBeLessThan(source.indexOf('trace("stage.start",'));
  });
});
