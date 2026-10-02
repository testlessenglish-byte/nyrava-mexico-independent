import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pipeline = readFileSync(join(root, "src/lib/pipeline.server.ts"), "utf8");
const runner = readFileSync(join(root, "src/lib/pipeline-runner.server.ts"), "utf8");
const derivedEngines = readFileSync(
  join(root, "src/lib/intelligence/derived-engines.server.ts"),
  "utf8",
);

function chunkCacheClearBlock(): string {
  const marker = ".update({ report_chunk_cache: {} })";
  const update = pipeline.indexOf(marker);
  expect(update).toBeGreaterThan(-1);

  const start = pipeline.lastIndexOf('let clearQuery = db', update);
  const end = pipeline.indexOf("const { error: clearChunkCacheError }", update);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(update);
  return pipeline.slice(start, end);
}

describe("report persistence invariants", () => {
  it("the chunk cache clear is update-only and can never author a report row", () => {
    const block = chunkCacheClearBlock();
    expect(block).toContain('.from("reports")');
    expect(block).toContain(".update({ report_chunk_cache: {} })");
    expect(block).toContain('.eq("case_id", caseId)');
    expect(block).not.toContain(".insert(");
    expect(block).not.toContain(".upsert(");
  });

  it("the chunk cache clear scopes to execution_id when one is available", () => {
    const block = chunkCacheClearBlock();
    expect(block).toContain("if (executionId)");
    expect(block).toContain('.eq("execution_id", executionId)');
    expect(block).not.toContain("execution_id: executionId ?? null");
  });

  it("the chunk cache clear can never write full_report", () => {
    const block = chunkCacheClearBlock()
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(block).not.toContain("full_report");
    expect(block).toContain("report_chunk_cache");
  });


  it("report_generator completion requires a same-execution, non-empty report", () => {
    const block = runner.slice(runner.indexOf('if (s.key === "report")'));
    expect(block).toContain("full_report");
    expect(block).toContain("REPORT_PERSISTENCE_INVARIANT_FAILED");
    expect(block).toContain("persistedReport.execution_id !== executionId");
  });

  it("the report save verifies read-back before completing", () => {
    expect(pipeline).toContain("REPORT_PERSISTENCE_INVARIANT_FAILED: full_report is empty after upsert");
    expect(pipeline).toContain("REPORT_PERSISTENCE_INVARIANT_FAILED: execution_id mismatch");
  });

  it("a report can never be saved or read back with a null execution_id", () => {
    expect(pipeline).toContain(
      "REPORT_PERSISTENCE_INVARIANT_FAILED: no execution_id available for the report being saved",
    );
    expect(pipeline).toContain(
      "REPORT_PERSISTENCE_INVARIANT_FAILED: execution_id is null after upsert",
    );
    // Stamping failure must recover the execution id instead of continuing with null.
    expect(pipeline).toContain("if (!reportRow.execution_id) {");
  });

  it("finalExecutionId is hoisted before try block and remains in scope for citation reconciliation and provenance", () => {
    // Verify lexical scope hoisting before the try block
    const hoistingIndex = pipeline.indexOf("let finalExecutionId: string | null = executionId ?? null;");
    const tryIndex = pipeline.indexOf("try {", hoistingIndex);
    const citeIndex = pipeline.indexOf("executionId: finalExecutionId", tryIndex);
    const provIndex = pipeline.indexOf("execution_id: finalExecutionId", citeIndex);

    expect(hoistingIndex).toBeGreaterThan(-1);
    expect(tryIndex).toBeGreaterThan(hoistingIndex);
    expect(citeIndex).toBeGreaterThan(tryIndex);
    expect(provIndex).toBeGreaterThan(citeIndex);

    // Verify there are no declarations of 'const finalExecutionId' (which caused the scoping bug)
    expect(pipeline).not.toContain("const finalExecutionId");
  });


  it("a needs-revision report is preserved during derived-engine diagnostics", () => {
    const invalidation = derivedEngines.slice(
      derivedEngines.indexOf("async function invalidateReleasedSnapshot"),
      derivedEngines.indexOf("export async function deriveContradictions"),
    );
    expect(invalidation).toContain('new Set(["released", "complete"])');
    expect(invalidation).not.toContain('"needs_revision"]');
  });
});
