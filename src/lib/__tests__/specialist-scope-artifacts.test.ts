import { expect, it } from "vitest";
import * as pipeline from "../pipeline.server";

// In-memory database boundary: real cleanup determines which persisted rows
// disappear. A missing case/type filter would remove the unrelated fixtures.
function database() {
  const tables: Record<string, Record<string, unknown>[]> = {
    agent_findings: [
      { case_id: "c", agent_type: "custody_best_interest_analysis" },
      { case_id: "c", agent_type: "child_support_calculation" },
      { case_id: "other", agent_type: "custody_best_interest_analysis" },
    ],
    case_findings: [
      { case_id: "c", source_module: "agent:custody_best_interest_analysis" },
      { case_id: "c", source_module: "agent:child_support_calculation" },
      { case_id: "other", source_module: "agent:custody_best_interest_analysis" },
    ],
    pipeline_engine_runs: [
      { case_id: "c", engine: "agent:custody_best_interest_analysis_batch" },
      { case_id: "c", engine: "agent:child_support_calculation_batch" },
      { case_id: "other", engine: "agent:custody_best_interest_analysis_batch" },
    ],
  };
  const db = { from(table: string) {
    const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
    const query = {
      delete() { return query; },
      eq(key: string, value: unknown) { predicates.push((row) => row[key] === value); return query; },
      like(key: string, value: string) { predicates.push((row) => String(row[key]).startsWith(value.replace(/%$/, ""))); return query; },
      then(resolve: (value: unknown) => unknown) {
        tables[table] = tables[table].filter((row) => !predicates.every((p) => p(row)));
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return query;
  } };
  return { db, tables };
}

it("removes excluded specialist findings and resumable batches without deleting another specialist or case", async () => {
  const cleanup = (pipeline as any).clearSpecialistScopeArtifacts;
  expect(typeof cleanup).toBe("function");
  const { db, tables } = database();
  await cleanup(db, "c", "custody_best_interest_analysis", "agent:custody_best_interest_analysis");
  expect(tables.agent_findings).toEqual([
    { case_id: "c", agent_type: "child_support_calculation" },
    { case_id: "other", agent_type: "custody_best_interest_analysis" },
  ]);
  expect(tables.case_findings).toHaveLength(2);
  expect(tables.case_findings.some((r) => r.case_id === "c" && r.source_module === "agent:custody_best_interest_analysis")).toBe(false);
  expect(tables.pipeline_engine_runs).toHaveLength(2);
  expect(tables.pipeline_engine_runs.some((r) => r.case_id === "c" && r.engine === "agent:custody_best_interest_analysis_batch")).toBe(false);
});

it("does not reuse unchanged documents after a scope or prompt correction", async () => {
  const key = (pipeline as any).specialistBatchContextKey;
  expect(typeof key).toBe("function");
  const before = { area: "amparo", underlying: "familiar", subtype: "custodia", vehicle: "amparo_directo", mode: "ongoing", system: "version 1" };
  const original = await key(before);
  expect(await key({ ...before })).toBe(original);
  for (const patch of [{ underlying: "penal" }, { subtype: "sucesorio" }, { vehicle: "amparo_revision" }, { mode: "concluded_audit" }, { system: "version 2" }]) {
    expect(await key({ ...before, ...patch })).not.toBe(original);
  }
});

it("rejects historical matching checkpoints when newer output came from a different scope", () => {
  const reusable = (pipeline as any).hasCurrentSpecialistCheckpoint;
  expect(typeof reusable).toBe("function");
  const rows = [
    { engine: "agent:a", status: "completed", meta: { scopeContextKey: "scope-b" } },
    { engine: "agent:a", status: "completed", meta: { scopeContextKey: "scope-a" } },
  ];
  expect(reusable(rows, "agent:a", "scope-a")).toBe(false);
  expect(reusable(rows, "agent:a", "scope-b")).toBe(true);
  expect(reusable([{ engine: "agent:a", status: "completed", meta: {} }], "agent:a", "scope-a")).toBe(false);
});
