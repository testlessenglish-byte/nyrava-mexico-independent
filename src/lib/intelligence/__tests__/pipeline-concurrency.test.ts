import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEngine, DuplicateEngineActiveError, StaleExecutionError } from '../engine-audit.server';

const createChain = (dataToReturn: any) => {
  const chain: any = {};
  ['select', 'eq', 'order', 'limit', 'update', 'insert', 'gte', 'lt', 'not'].forEach(method => {
    chain[method] = vi.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: dataToReturn, error: null });
  return chain;
};

const createMockDb = (customChain?: (table: string) => any) => {
  return {
    from: vi.fn((table: string) => {
      if (customChain) return customChain(table);
      if (table === 'cases') return createChain({ execution_id: 'exec-1' });
      return createChain(null);
    })
  };
};

describe('Pipeline Concurrency and Stale Worker Protections', () => {
  it('Fix 7 - Duplicate active engine blocks instead of swallowing', async () => {
    const dbMock = createMockDb((table) => {
      if (table === 'pipeline_engine_runs') return createChain({ id: 'run-123', started_at: new Date().toISOString() });
      return createChain(null);
    });

    const runPromise = runEngine(dbMock, {
      caseId: 'case-1',
      userId: 'user-1',
      engine: 'extraction',
      executionId: 'exec-1'
    }, async () => ({ value: 'done', stats: {} }));

    await expect(runPromise).rejects.toThrow(DuplicateEngineActiveError);
  });

  it('Fix 8 - Stale worker cannot write completed row for new execution', async () => {
    let pipelineRunMaybeSingleCalls = 0;

    const dbMock = createMockDb((table) => {
      const chain = createChain(null);
      chain.insert = vi.fn().mockReturnValue(chain);

      chain.maybeSingle = vi.fn().mockImplementation(() => {
        if (table === 'cases') {
          return Promise.resolve({
            data: { execution_id: 'exec-2' },
            error: null,
          });
        }

        if (table === 'pipeline_engine_runs') {
          pipelineRunMaybeSingleCalls += 1;

          // 1. Active-run pre-check: no duplicate is running.
          // 2. Queued-row claim: no checkpoint row exists.
          // 3. Insert(...).select(...).maybeSingle(): ledger row created.
          if (pipelineRunMaybeSingleCalls <= 2) {
            return Promise.resolve({ data: null, error: null });
          }

          return Promise.resolve({
            data: { id: 'row-1' },
            error: null,
          });
        }

        return Promise.resolve({ data: null, error: null });
      });

      return chain;
    });

    const runPromise = runEngine(dbMock, {
      caseId: 'case-1',
      userId: 'user-1',
      engine: 'extraction',
      executionId: 'exec-1' // Worker thinks it is exec-1
    }, async () => ({ value: 'done', stats: {} }));

    await expect(runPromise).rejects.toThrow(StaleExecutionError);
    await expect(runPromise).rejects.toThrow('Stale worker: case execution exec-2 vs worker exec-1');
  });
});
