import { afterEach, describe, expect, it, vi } from "vitest";
import { makeOpenAICompatible } from "../providers/openai-compatible";
import {makeAnthropic} from '../providers/anthropic';
import {makeGemini} from '../providers/gemini';
import {groqRequestOutputBudget} from '../request-budget';
vi.mock("../../pipeline-trace.server", () => ({ traceAsync: vi.fn() }));
vi.mock("../../pipeline-checkpoint.server", () => ({ assertCheckpointBudget: vi.fn(), aiCallTimeoutForCheckpoint: () => 30000 }));
const provider = () => makeOpenAICompatible({ type: "groq", apiKey: "fixture", defaultModel: "openai/gpt-oss-120b" }, { requiresKey: true });
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
describe("Groq request token envelope", () => {
  it('requires a useful output reserve and preserves smaller explicit upper bounds',()=>{
    expect(groqRequestOutputBudget({},7500)).toBeNull();
    expect(groqRequestOutputBudget({maxTokens:128},7500)).toBe(128);
    expect(groqRequestOutputBudget({maxTokens:512},5500)).toBe(512);
  });
  it('fits the actual HTTP completion reservation to a packed input without changing messages',async()=>{
    const fetch=vi.fn().mockResolvedValue(ok());vi.stubGlobal('fetch',fetch);
    const source='x'.repeat((5500-32)*3);
    await provider().chat({userContent:source,maxTokens:4096,json:true});
    const body=JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.max_completion_tokens).toBe(2244);expect(body.messages.at(-1).content).toBe(source);
  });
  it.each(['{"ok":true}', '{"unfinished":'])('rejects length-limited output even when JSON is parseable: %s',async content=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content},finish_reason:'length'}]}),{status:200}));vi.stubGlobal('fetch',fetch);
    await expect(provider().chat({userContent:'Source',json:true,maxTokens:512})).rejects.toThrow(/incomplete.*length/);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not append unreserved reasoning tokens to requested completion", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    await provider().chat({ userContent: "Entire source", maxTokens: 4000, json: true });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.max_completion_tokens).toBe(4000);
  });
  it("uses the router's JSON output default", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    await provider().chat({ userContent: "Entire source", json: true });
    expect(JSON.parse(fetch.mock.calls[0][1].body).max_completion_tokens).toBe(2048);
  });
  it("retries an actual TPM413 by reducing output reservation without changing any source text", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('Request too large: Limit 8000, Requested 9610', { status: 413 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    await provider().chat({ userContent: "HEAD source MIDDLE evidence TAIL", maxTokens: 4000, json: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, second] = fetch.mock.calls.map(call => JSON.parse(call[1].body));
    expect(second.messages).toEqual(first.messages);
    expect(second.max_completion_tokens).toBeLessThanOrEqual(4000 - 1610);
  });
  it("propagates an unsplittable prompt instead of truncating evidence or repeating the same413", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Request too large: Limit 8000, Requested 19610', { status: 413 }));
    vi.stubGlobal("fetch", fetch);
    await expect(provider().chat({ userContent: "Source", maxTokens: 4000 })).rejects.toThrow("413");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
it.each([
  ['anthropic',()=>makeAnthropic({type:'anthropic',apiKey:'fixture'}),{content:[{type:'text',text:'{"ok":true}'}],stop_reason:'max_tokens'}],
  ['gemini',()=>makeGemini({type:'gemini',apiKey:'fixture'}),{candidates:[{content:{parts:[{text:'{"ok":true}'}]},finishReason:'MAX_TOKENS'}]}],
  ['openrouter',()=>makeOpenAICompatible({type:'openrouter',apiKey:'fixture'},{requiresKey:true}),{choices:[{message:{content:'{"ok":true}'},finish_reason:'length'}]}],
] as const)('rejects truncated %s results before they become valid JSON results',async(_provider,build,payload)=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(payload),{status:200}));vi.stubGlobal('fetch',fetch);
  await expect(build().chat({userContent:'Source',json:true})).rejects.toThrow(/incomplete response/);
  expect(fetch).toHaveBeenCalledOnce();
});
