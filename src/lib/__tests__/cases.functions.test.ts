import { describe, it, expect, vi } from "vitest";
import { autoRequeueStalledCase } from "../cases.functions";
import { PIPELINE_STAGES } from "../execution/canonical";

vi.mock("@/lib/execution/canonical", () => {
  return {
    PIPELINE_STAGES: [
      { key: "extraction" },
      { key: "analyzers" },
      { key: "timeline" },
      { key: "report" }
    ],
    CANONICAL_STAGES: [
      { key: "extraction", requirement: "blocking" },
      { key: "analyzers", requirement: "blocking" },
      { key: "timeline", requirement: "optional" },
      { key: "report", requirement: "blocking" }
    ],
    PIPELINE_STAGE_TO_ENGINE: {
      extraction: "extraction",
      analyzers: "analyzers",
      timeline: "timeline",
      report: "report"
    }
  };
});

vi.mock("../execution/mx-pipeline", () => {
  return {
    isStageRelevantForCaseType: (t: any, key: string) => {
      // For this test, 'timeline' is irrelevant, the rest are relevant
      return key !== "timeline";
    }
  };
});

describe("autoRequeueStalledCase fallback behavior", () => {
  it("does not queue extraction when genuinely incomplete stage is something else", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { next_stage: null, stall_auto_retry_count: 0, case_type: "civil" }
            }),
            then: (cb: any) => cb({ data: [
              { engine: "extraction", status: "completed" }
            ] })
          })
        })
      })
    };
    
    // Override the pipeline_engine_runs query specifically
    supabase.from = vi.fn().mockImplementation((table) => {
      const q = { 
        select: vi.fn().mockReturnThis(), 
        eq: vi.fn().mockReturnThis(), 
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(), 
        then: (cb: any) => cb({ data: [] }) 
      };
      if (table === "cases") {
        q.maybeSingle = vi.fn().mockResolvedValue({ data: { next_stage: null, stall_auto_retry_count: 0, case_type: "civil" } });
        q.update = vi.fn().mockReturnThis();
      }
      if (table === "documents") {
        q.then = (cb: any) => cb({ data: [{ status: "extracted", filename: "test.pdf" }] });
      }
      if (table === "pipeline_engine_runs") {
        q.then = (cb: any) => cb({ data: [
          { engine: "extraction", status: "completed" }
        ] });
      }
      return q;
    });

    const result = await autoRequeueStalledCase(supabase as any, "case-1");
    // "analyzers" should be the next incomplete relevant stage
    expect(result.ok).toBe(true);
    expect((result as any).resumeKey).toBe("analyzers");
  });

  it("returns alreadyComplete if all relevant stages are complete", async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        const q = { 
          select: vi.fn().mockReturnThis(), 
          eq: vi.fn().mockReturnThis(), 
          in: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(), 
          then: (cb: any) => cb({ data: [] }) 
        };
        if (table === "cases") {
          q.maybeSingle = vi.fn().mockResolvedValue({ data: { next_stage: null, stall_auto_retry_count: 0, case_type: "civil" } });
          q.update = vi.fn().mockReturnThis();
        }
        if (table === "documents") {
          q.then = (cb: any) => cb({ data: [{ status: "extracted", filename: "test.pdf" }] });
        }
        if (table === "pipeline_engine_runs") {
          q.then = (cb: any) => cb({ data: [
            { engine: "extraction", status: "completed" },
            { engine: "analyzers", status: "completed" },
            { engine: "report", status: "completed" }
          ] });
        }
        return q;
      })
    };

    const result = await autoRequeueStalledCase(supabase as any, "case-1");
    expect(result.ok).toBe(true);
    expect(result.alreadyComplete).toBe(true);
  });
});
