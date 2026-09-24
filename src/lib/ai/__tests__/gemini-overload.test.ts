import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../pipeline-trace.server',()=>({traceAsync:vi.fn()}));
import {makeGemini} from '../providers/gemini';
afterEach(()=>vi.unstubAllGlobals());
const success=()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'verified result'}]}}]}),{status:200});
describe('Gemini temporary overload fallback',()=>{
 it('tries another model after 503 and returns its result',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(new Response('UNAVAILABLE',{status:503})).mockResolvedValueOnce(success());vi.stubGlobal('fetch',fetcher);const p=makeGemini({type:'gemini',apiKey:'test-only',defaultModel:'primary-model'});const result=await p.chat({userContent:'test'});expect(result.text).toBe('verified result');expect(result.model).toBe('gemini-flash-latest');expect(fetcher).toHaveBeenCalledTimes(2);});
 it('bounds persistent overload to three models',async()=>{const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response('UNAVAILABLE',{status:503})));vi.stubGlobal('fetch',fetcher);await expect(makeGemini({type:'gemini',apiKey:'test-only',defaultModel:'primary-model'}).chat({userContent:'test'})).rejects.toThrow('503');expect(fetcher).toHaveBeenCalledTimes(3);});
 it('does not rotate models for invalid credentials',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response('invalid key',{status:401}));vi.stubGlobal('fetch',fetcher);await expect(makeGemini({type:'gemini',apiKey:'test-only',defaultModel:'primary-model'}).chat({userContent:'test'})).rejects.toThrow('401');expect(fetcher).toHaveBeenCalledTimes(1);});
});
