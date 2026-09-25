export function splitScoringFindings<T>(findings: readonly T[], size = 40): T[][] {
  const out:T[][]=[];
  for(let i=0;i<findings.length;i+=size) out.push(findings.slice(i,i+size) as T[]);
  return out.length ? out : [[]];
}

export function scoringSynthesisPrompt(parts: readonly unknown[]): string {
  return `Synthesize these partial legal scorecards into one JSON scorecard. Average numeric dimension scores conservatively, merge and deduplicate contributors, and preserve finding_id references. Output only the same scorecard schema. PARTIAL SCORECARDS:\n${JSON.stringify(parts)}`;
}
