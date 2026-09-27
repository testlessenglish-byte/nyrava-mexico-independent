import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterFindingsForExecution } from '../finding-selection';
import { mandatoryDecisionCoreToFindings } from '../mandatory-decision-core';

describe('execution-specific finding provenance', () => {
  it('keeps only the current execution and excludes legacy unscoped rows', () => {
    const rows = [
      { id: 'current', metadata: { execution_id: 'current-run' } },
      { id: 'old', execution_id: 'old-run' },
      { id: 'legacy', metadata: {} },
    ];
    expect(filterFindingsForExecution(rows, 'current-run').map(row => row.id)).toEqual(['current']);
    expect(filterFindingsForExecution(rows, 'old-run').map(row => row.id)).toEqual(['old']);
    expect(filterFindingsForExecution(rows, '').map(row => row.id)).toEqual([]);
  });

  it('stamps a newly produced decision-core finding with the execution ID', () => {
    const [finding] = mandatoryDecisionCoreToFindings({
      caseId: 'case', userId: 'user', executionId: 'new-run',
      core: [{
        id: 'core-1', kind: 'COURT_HOLDING', text: 'Se desecha el recurso de revisión.',
        speaker_role: 'scjn', source_refs: [{
          document_id: 'doc', page: 27,
          quote: 'Se desecha por improcedente el recurso de revisión.',
        }],
      }],
    } as any);
    expect(finding.metadata?.execution_id).toBe('new-run');
    expect(filterFindingsForExecution([finding], 'new-run')).toHaveLength(1);
  });

  if (process.env.NYRAVA_RELEASE_REPLAY) {
    it('excludes the two pre-current ADR decision-core rows in the saved capture', () => {
      const saved = JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY!, 'utf8'));
      const executionId = saved.cases[0].execution_id;
      const selected = filterFindingsForExecution(saved.case_findings, executionId);
      expect(selected).toHaveLength(13);
      expect(selected.some((row: any) => row.source_module === 'decision_core')).toBe(false);
      expect(saved.case_findings.filter((row: any) => row.source_module === 'decision_core'))
        .toHaveLength(2);
    });
  }
});
