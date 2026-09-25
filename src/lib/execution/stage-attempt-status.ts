/** Current case status is distinct from the immutable engine-attempt history. */
export function stageAttemptStatus(
  key: string, label: string, index: number, total: number,
  currentFailures: ReadonlyArray<{ key: string; error: string }>,
) {
  return {
    status: "intelligence_running",
    status_message: `${label} (${index + 1}/${total})`,
    progress: Math.floor((index / total) * 95),
    next_stage: key,
    error: currentFailures.length
      ? currentFailures.map(f => `${f.key}: ${f.error}`).join("; ").slice(0, 2000)
      : null,
  };
}
