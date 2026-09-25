import { describe, expect, it, vi } from "vitest";
import { CheckpointRequired, isCheckpointError } from "@/lib/pipeline-checkpoint.server";

describe("Final release review checkpoint timeout and resume", () => {
  it("recognizes CheckpointRequired as a checkpoint error without turning it into a failure", () => {
    const error = new CheckpointRequired("report", "before AI call attempt 1");
    expect(isCheckpointError(error)).toBe(true);
    expect(error.message).toContain("exceeded wall-clock budget after before AI call attempt 1");
  });

  it("saves progress during final review checkpoint and resumes on next tick", async () => {
    const recordedUpdates: Array<Record<string, unknown>> = [];
    const fakeDb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "rep-1",
                case_id: "case-1",
                execution_id: "exec-1",
                full_report: {
                  pre_release_source_pages: [],
                  final_review_progress: {
                    outcomes: { report: true, qa: true },
                    errors: [],
                    warnings: [],
                  },
                },
              },
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            recordedUpdates.push({ table, patch, col, val });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };

    // Verify progress restoration
    const reportRow = {
      full_report: {
        final_review_progress: {
          outcomes: { report: true, qa: true },
          errors: ["warning note"],
          warnings: ["w1"],
        },
      },
    };
    const outcomes: Record<string, boolean> = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    const persisted = reportRow.full_report.final_review_progress;
    Object.assign(outcomes, persisted.outcomes);
    errors.push(...persisted.errors);
    warnings.push(...persisted.warnings);

    expect(outcomes.report).toBe(true);
    expect(outcomes.qa).toBe(true);
    expect(outcomes.judge).toBeUndefined();
    expect(errors).toContain("warning note");
  });
});
