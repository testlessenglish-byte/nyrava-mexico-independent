import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../pipeline-trace.server',()=>({traceAsync:vi.fn()}));
import { makeGemini } from '../providers/gemini';
afterEach(()=>vi.unstubAllGlobals());

it.each([
  ['gemini-flash-latest',{thinkingLevel:'low'}],
  ['gemini-3.5-flash-lite',{thinkingLevel:'low'}],
  ['gemini-3.1-pro',{thinkingLevel:'low'}],
  ['gemini-2.5-flash',{thinkingBudget:0}],
  ['gemini-2.5-pro',{thinkingBudget:128}],
  ['unknown-model',undefined],
])('uses compatible JSON thinking settings for %s',async(model,expected)=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  await makeGemini({type:'gemini',apiKey:'test',defaultModel:model as string}).chat({userContent:'Return JSON',json:true});
  const init=(fetcher.mock.calls as unknown as Array<[string,RequestInit]>)[0][1];
  const body=JSON.parse(init.body as string);
  expect(body.generationConfig.thinkingConfig).toEqual(expected);
  expect(body.generationConfig.responseMimeType).toBe('application/json');
});
