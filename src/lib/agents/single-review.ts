// Compare review content, not runtime statistics or object key ordering.
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !["agent_stats", "analysis_mode", "created_at", "updated_at", "run_id"].includes(key),
    ).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  }
  return value;
}

export function agentReviewChanged(
  previous: { status: string; output?: unknown; errors?: unknown } | null,
  current: { status: string; output?: unknown; errors?: unknown },
): boolean {
  if (!previous) return true;
  const content = (row: typeof current) => normalized({ status: row.status, output: row.output ?? null, errors: row.errors ?? [] });
  return JSON.stringify(content(previous)) !== JSON.stringify(content(current));
}
