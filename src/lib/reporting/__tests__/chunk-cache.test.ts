import {it,expect} from 'vitest';
import {readReportChunkCache} from '../chunk-cache';
it('rejects legacy, different-case, different-execution and changed-document caches',()=>{
 const value={__context:'case-a:run-1:document-a',narrative:{summary:'private A'}};
 for(const key of ['case-b:run-1:document-a','case-a:run-2:document-a','case-a:run-1:document-b'])expect(readReportChunkCache(value,key)).toEqual({});
 expect(readReportChunkCache({narrative:value.narrative},value.__context)).toEqual({});
 expect(readReportChunkCache({...value,__regenerate:true},value.__context)).toEqual({});
 expect(readReportChunkCache(value,value.__context)).toEqual({narrative:value.narrative});
});
