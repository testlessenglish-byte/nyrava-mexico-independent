import { describe, expect, it } from "vitest";
import { assertAnalyzerBatchCompletion } from "../analyzer-completion";
import { readFileSync } from "node:fs";

describe("analyzer completion requires a successful batch", () => {
  it.each(["Gemini HTTP 400 invalid request", "HTTP 503 unavailable", "Malformed JSON", "HTTP 401 unauthorized"])("rejects all failed batches: %s", error => {
    expect(() => assertAnalyzerBatchCompletion(0, 0, [error])).toThrow(error);
  });
  it("rejects zero success even when error diagnostics are missing", () => {
    expect(() => assertAnalyzerBatchCompletion(0, 0, [])).toThrow("No successful analyzer batch");
  });
  it("accepts a successful empty-findings batch and previously completed resumed batches", () => {
    expect(() => assertAnalyzerBatchCompletion(1, 0, [])).not.toThrow();
    expect(() => assertAnalyzerBatchCompletion(0, 1, [])).not.toThrow();
  });
  it("enforces completion before synthesis and persistence", () => {
    const source = readFileSync("src/lib/pipeline.server.ts", "utf8");
    expect(source.indexOf("assertAnalyzerBatchCompletion(successes")).toBeGreaterThan(0);
    expect(source.indexOf("assertAnalyzerBatchCompletion(successes")).toBeLessThan(source.indexOf("const SYNTHESIS_DIGEST_CHARS_PER_DOC"));
  });
});
