type Row = Record<string, any>;
export type LogicalStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'NOT_APPLICABLE';
const logicalEngine = (r: Row) => String(r.engine).replace(/_batch$/, '');
export function logicalAgentStatus(attempts: Row[]): LogicalStatus {
  const ordered = [...attempts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const final = ordered.find(r => !r.meta?.internal_batch && !String(r.engine).endsWith('_batch'));
  if (final?.status === 'skipped') return /not_applicable|not_completed_case_mode/.test(final.skipped_reason ?? '') ? 'NOT_APPLICABLE' : 'SKIPPED';
  if (final?.status === 'completed' && final.db_write_confirmed === true && final.meta?.logical_result === 'COMPLETE') return 'COMPLETE';
  if (final?.meta?.logical_result === 'PARTIAL' || ordered.some(r => r.meta?.internal_batch && r.status === 'completed') ||
      ['running', 'queued'].includes(final?.status)) return 'PARTIAL';
  return 'FAILED';
}
export function aggregateLogicalAgents(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = [row.case_id, row.execution_id ?? 'unscoped', logicalEngine(row)].join(':');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map(attempts => ({ ...attempts[0], engine: logicalEngine(attempts[0]),
    logical_status: logicalAgentStatus(attempts), attempts }));
}
export type SpecialistRequirement = { engine: string; applicable: boolean; critical: boolean; reason?: string };
export function criticalSpecialistFailures(requirements: SpecialistRequirement[], rows: Row[], executionId: string): string[] {
  return requirements.filter(r => r.applicable && r.critical &&
    logicalAgentStatus(rows.filter(a => a.execution_id === executionId && logicalEngine(a) === r.engine)) !== 'COMPLETE')
    .map(r => 'CRITICAL_SPECIALIST_INCOMPLETE:' + r.engine);
}
export const FAMILIAR_CRITICAL_SPECIALISTS = new Set([
  'agent:child_support_calculation', 'agent:custody_best_interest_analysis',
  'agent:domestic_violence_assessment', 'agent:child_vulnerability_protection',
]);
