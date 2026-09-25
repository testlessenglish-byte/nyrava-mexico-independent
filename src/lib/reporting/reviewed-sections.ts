import type {CaseExportData} from '../export';
export const REVIEWED_SECTION_KEYS = ['agents','theories','opportunities','witnesses','work_product','perspectives','evidence_intel','strategy','analysis','score','trial_prep','strategy_center','agent_logs','outcome_assessment'] as const;
/** Frozen auxiliary inputs never replace live case, findings or document sources. */
export function withReviewedSections<T extends CaseExportData>(input:T):T {
 const full=input.report?.full_report as Record<string,unknown>|undefined;
 const snapshot=full?.reviewed_sections;
 if(snapshot===undefined)return input;
 if(!snapshot || typeof snapshot!=='object' || Array.isArray(snapshot))throw new Error('REVIEWED_SECTIONS_INVALID');
 const selected:Record<string,unknown>={};
 for(const key of REVIEWED_SECTION_KEYS) selected[key]=(snapshot as Record<string,unknown>)[key] ?? null;
 return {...input,...structuredClone(selected)};
}
export function reportRenderTimestamp(input:CaseExportData):string {
 const report=input.report as Record<string,any>|null;
 const value=report?.full_report?.reviewed_at ?? report?.created_at;
 const timestamp=typeof value==='string'?Date.parse(value):NaN;
 // Legacy drafts without a persisted timestamp use a stable neutral date.
 return Number.isFinite(timestamp)?new Date(timestamp).toISOString():'1970-01-01T00:00:00.000Z';
}
