export function reportRecoveryKind(reasons: readonly string[]): "summary" | "quota" | "evidence" | "general" {
  const text = reasons.join(" ");
  if (/executive summary.*(missing|short)/i.test(text)) return "summary";
  if (/429|quota|rate.limit|503|provider.*unavailable/i.test(text)) return "quota";
  if (/missing.*(document|evidence)|extraction.*fail|citation.*(missing|invalid|fail)/i.test(text)) return "evidence";
  return "general";
}
