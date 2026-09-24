import { describe, expect, it, vi } from 'vitest';
vi.mock('../versioning.server', () => ({ upsertAuthorityWithVersioning: vi.fn() }));
import { recordIngestRun } from '../ingest-pipeline.server';
function database(runError: unknown = null, cursorError: unknown = null) {
 const insert = vi.fn().mockResolvedValue({ error: runError });
 const eq = vi.fn().mockResolvedValue({ error: cursorError });
 const update = vi.fn(() => ({ eq }));
 return { from: vi.fn(() => ({ insert, update })), insert, update };
}
const result = { connectorCode:'dof', startedAt:'2026-09-22T01:00:00Z', endedAt:'2026-09-22T01:01:00Z', status:'completed' as const, documentsFetched:1, documentsStored:1, documentsVersioned:0, entitiesProjected:0, citationsExtracted:0, citationsResolved:0, errors:[] };
describe('legal ingest checkpoints',()=>{
 it.each(['failed','completed_with_errors'] as const)('does not skip retryable documents after %s',async status=>{ const db=database();await recordIngestRun(db as never,{...result,status});expect(db.insert).toHaveBeenCalledOnce();expect(db.update).not.toHaveBeenCalled(); });
 it('advances after successful ingestion',async()=>{const db=database();await recordIngestRun(db as never,result);expect(db.update).toHaveBeenCalledWith({last_sync_at:result.endedAt});});
 it('surfaces ledger write failures without advancing',async()=>{const db=database({message:'unavailable'});await expect(recordIngestRun(db as never,result)).rejects.toThrow('record legal ingest');expect(db.update).not.toHaveBeenCalled();});
 it('surfaces cursor write failures',async()=>{const db=database(null,{message:'unavailable'});await expect(recordIngestRun(db as never,result)).rejects.toThrow('sync cursor');});
});
