import { describe, expect, it } from 'vitest';
import { logicalAgentStatus, aggregateLogicalAgents, criticalSpecialistFailures } from '../logical-specialists';
const attempt = (status: string, extra = {}) => ({ id: status, case_id: 'c', execution_id: 'e', engine: 'agent:child_support_calculation', status, created_at: '2026-09-27', ...extra });
describe('logical specialist result', () => {
  it('retains failed attempts but accepts a later persisted recovery', () => {
    const rows = [attempt('failed'), attempt('completed', { created_at: '2026-09-28', db_write_confirmed: true, meta: { logical_result: 'COMPLETE' } })];
    expect(logicalAgentStatus(rows)).toBe('COMPLETE');
    expect(aggregateLogicalAgents(rows)[0].attempts).toHaveLength(2);
  });
  it('successful batches alone never prove final persistence', () => {
    expect(logicalAgentStatus([attempt('failed'), attempt('completed', { engine: 'agent:child_support_calculation_batch', meta: { internal_batch: true } })])).toBe('PARTIAL');
  });
  it('does not reuse recovery from another execution', () => {
    expect(aggregateLogicalAgents([attempt('failed'), attempt('completed', { execution_id: 'old', db_write_confirmed: true, meta: { logical_result: 'COMPLETE' } })])).toHaveLength(2);
  });
  it('blocks applicable critical specialists and exempts explicit nonapplicability', () => {
    const requirements = [{ engine: 'agent:child_support_calculation', applicable: true, critical: true }];
    expect(criticalSpecialistFailures(requirements, [attempt('failed')], 'e')).toHaveLength(1);
    expect(criticalSpecialistFailures([{ ...requirements[0], applicable: false }], [], 'e')).toEqual([]);
    expect(logicalAgentStatus([attempt('skipped', { skipped_reason: 'skipped_not_applicable:sucesorio' })])).toBe('NOT_APPLICABLE');
  });
});
