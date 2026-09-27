import type { CaseExportData } from "../export";
import { composeFinalReportPayload } from "./final-report-contract";

/** Load every auxiliary input consumed by the workspace/export section renderers.
 * Query errors fail closed; an empty table is valid, an unread table is not.
 * Document OCR and raw outcome-model output are intentionally not presentation data. */
export async function loadFinalReportSections(db: any, caseId: string): Promise<Partial<CaseExportData>> {
  const arrayTables: Record<string,string> = {
    agents:"agent_findings",theories:"case_theories",opportunities:"case_opportunities",
    witnesses:"case_witnesses",work_product:"case_work_product",perspectives:"case_perspectives",
    evidence_intel:"evidence_classifications",strategy:"case_strategy",
  };
  const singleTables: Record<string,string> = {
    analysis:"analyses",score:"case_scores",trial_prep:"case_trial_prep",strategy_center:"case_strategy_center",
  };
  const tasks = [
    ...Object.entries(arrayTables).map(async ([key,table]) => [key,await db.from(table).select("*").eq("case_id",caseId)] as const),
    ...Object.entries(singleTables).map(async ([key,table]) => [key,await db.from(table).select("*").eq("case_id",caseId).maybeSingle()] as const),
    (async()=>["agent_logs",await db.from("agent_logs").select("*").eq("case_id",caseId).order("created_at",{ascending:false}).limit(200)] as const)(),
    (async()=>["outcome_assessment",await db.from("case_outcome_assessments")
      .select("id,case_analysis_mode,overall_position,outcome_status,favorable_pct,unfavorable_pct,confidence,no_material_error_identified,principal_strength,principal_weakness,biggest_risk,most_important_missing_evidence,both_sides,factors,what_could_change,finding_reviews,citation_reviews,created_at")
      .eq("case_id",caseId).order("created_at",{ascending:false}).limit(1).maybeSingle()] as const)(),
  ];
  const results=await Promise.all(tasks);
  for(const [key,result] of results) if(result.error) throw new Error("REPORT_SECTION_UNAVAILABLE:"+key+":"+result.error.message);
  return Object.fromEntries(results.map(([key,result])=>[key,result.data]));
}

/** The report-stage checkpoint must see the same stored sections as the final
 * release check. Canonical case, source, report and finding snapshots supplied
 * by the current execution take precedence over auxiliary database rows. */
export async function composeReportStagePayload(
  db: any,
  caseId: string,
  current: Pick<CaseExportData, "case" | "documents" | "report" | "findings">,
  sourceReviewFindings = current.findings,
) {
  const sections = await loadFinalReportSections(db, caseId);
  const report = current.report && {
    ...current.report,
    full_report: {
      ...((current.report.full_report as Record<string, unknown> | undefined) ?? {}),
      reviewed_sections: sections,
    },
  };
  return composeFinalReportPayload({
    analysis: null, agents: [], score: null,
    ...sections,
    ...current,
    report,
  }, sourceReviewFindings);
}
