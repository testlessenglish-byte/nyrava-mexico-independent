/** A provider failure is not a completed analysis with zero findings. */
export function assertAnalyzerBatchCompletion(
  successfulBatches: number, resumedCompletedBatches: number, errors: readonly string[],
): void {
  if (successfulBatches + resumedCompletedBatches > 0) return;
  throw new Error(`No successful analyzer batch. Analyzers failed on every batch. Details:\n${
    errors.length ? errors.join("\n") : "No provider failure diagnostics were recorded."
  }`);
}
