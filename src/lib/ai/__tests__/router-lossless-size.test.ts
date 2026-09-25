import { expect, it, vi } from "vitest";
vi.mock("../providers/factory", () => ({ buildProvider: vi.fn(), resolveApiKey: () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null }),
    order: async () => ({ data: [{ id: "groq", provider_type: "groq", display_name: "Groq", enabled: true, priority: 1, default_model: "openai/gpt-oss-120b" }], error: null }) };
  return chain;
} } }));
import { buildProvider } from "../providers/factory";
import { routeAI, invalidateProviderCaches } from "../router.server";
import {estimateRequestInputTokens} from '../request-budget';

it("returns an actionable size error when no provider fits, without sending truncated evidence", async () => {
  invalidateProviderCaches();
  const chat = vi.fn().mockResolvedValue({ text: "{}", model: "fixture", latencyMs: 1 });
  vi.mocked(buildProvider).mockReturnValue({ chat, supportsJsonMode: () => true } as any);
  await expect(routeAI({ apiKey: "fixture", runtimeProvider: "groq", json: true,
    userContent: "Beginning " + "middle evidence ".repeat(8000) + " ending", maxTokens: 2048,
  })).rejects.toThrow(/payload_too_large|413/);
  expect(chat).not.toHaveBeenCalled();
});
it.each([undefined, 4096, 6000, 512])('fits packed input by bounding output (requested %s), preserving every source byte',async maxTokens=>{
  invalidateProviderCaches();
  const chat=vi.fn().mockResolvedValue({text:'{"complete":true}',model:'fixture',latencyMs:1});
  vi.mocked(buildProvider).mockReturnValue({chat,supportsJsonMode:()=>true} as any);
  const userContent='x'.repeat((5500-32)*3);
  expect(estimateRequestInputTokens({userContent})).toBe(5500);
  await routeAI({apiKey:`fixture-${maxTokens}`,runtimeProvider:'groq',userContent,maxTokens,cache:false});
  expect(chat).toHaveBeenCalledOnce();
  const sent=chat.mock.calls[0][0];expect(sent.userContent).toBe(userContent);
  expect(sent.maxTokens).toBe(maxTokens === 512 ? 512 : 2244);
  expect(estimateRequestInputTokens(sent)+sent.maxTokens+256).toBeLessThanOrEqual(8000);
});
