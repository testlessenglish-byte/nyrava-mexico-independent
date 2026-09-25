import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mergeStrategyBatches, runStrategyBatches, strategyFragments, type StrategyCache, type StrategyRecord } from "../strategy-batches";
const quote = "La notificación consta en la página fuente.";
const ref = { document_id: "doc-1", page: 1, quote };
const output = { summary: "Invented conclusion", case_strength_score: 99, motion_rankings: [{ motion: "Review", source_refs: [ref] }] };
describe("strategy evidence-preserving batching", () => {
  it("retains all Unicode source characters and document/page identity", () => {
    const record = { id: "page-1", kind: "source_page", document_id: "doc-1", page: 1, text: "niña⚖️".repeat(100) };
    const chunks = strategyFragments([record], 17);
    expect(chunks.map(c => c.text).join("")).toBe(record.text);
    expect(chunks.every(c => c.id === record.id && c.document_id === "doc-1" && c.page === 1)).toBe(true);
  });
  it("deduplicates evidence and does not add scores or unsupported summaries/actions", () => {
    const merged = mergeStrategyBatches([{ ...output, next_actions: [{ action: "Uncited" }] }, output], r => r.quote === quote);
    expect(merged.motion_rankings).toHaveLength(1);
    expect(merged.next_actions).toEqual([]);
    expect(merged.case_strength_score).toBeNull();
    expect(merged.summary).not.toContain("Invented");
    expect(merged.summary).toContain(quote);
  });
  it("drops fabricated or misattributed source references and extra model fields", () => {
    const merged = mergeStrategyBatches([{ motion_rankings: [
      { motion: "Wrong page", source_refs: [{ ...ref, page: 2 }] },
      { motion: "Invented quote", source_refs: [{ ...ref, quote: "An invented factual assertion" }] },
      { motion: "Review", probability: 99, source_refs: [ref] },
    ] }], source => source.page === 1 && source.quote === quote);
    expect(merged.motion_rankings).toHaveLength(1);
    expect((merged.motion_rankings as any[])[0]).not.toHaveProperty("probability");
  });
  it("persists completed batches before checkpoint and reuses only matching execution/content", async () => {
    const cache = new Map<string, StrategyCache>(); let calls = 0; let checkpoint = false;
    const records: StrategyRecord[] = [1, 2].map(page => ({ id: `page-${page}`, kind: "source_page", document_id: "doc-1", page, text: quote.repeat(12) }));
    const options = { scope: "case-1:execution-1", records, system: "Rules", prefix: "Schema", maxInputTokens: 280,
      load: async (key: string) => cache.get(key), save: async (key: string, value: StrategyCache) => { cache.set(key, value); },
      verify: () => true,
      call: async () => { calls++; return output; },
      checkpoint: () => { if (checkpoint && calls > 0) throw new Error("Checkpoint"); },
    };
    checkpoint = true;
    await expect(runStrategyBatches(options)).rejects.toThrow("Checkpoint");
    expect([...cache.values()].some(value => "output" in value)).toBe(true);
    const before = calls; checkpoint = false;
    await runStrategyBatches(options);
    const after = calls; expect(after).toBeGreaterThan(before);
    await runStrategyBatches(options); expect(calls).toBe(after);
    await runStrategyBatches({ ...options, scope: "case-1:execution-2" }); expect(calls).toBeGreaterThan(after);
    const changed = calls;
    await runStrategyBatches({ ...options, records: [{ ...records[0], text: records[0].text + "new evidence" }] });
    expect(calls).toBeGreaterThan(changed);
  });
  it("splits actual413 recursively and never drops source characters", async () => {
    const source = quote.repeat(20); const accepted: string[] = []; const cache = new Map<string, StrategyCache>();
    await runStrategyBatches({ scope: "case:execution", records: [{ id: "p", kind: "source_page", ...ref, text: source }],
      system: "Rules", prefix: "Schema", maxInputTokens: 10000, checkpoint: () => {}, verify: () => true,
      load: async key => cache.get(key), save: async (key, value) => { cache.set(key, value); },
      call: async prompt => { const records = JSON.parse(prompt.slice(prompt.indexOf("\n["))) as StrategyRecord[];
        if (records[0].text.length > 300) throw new Error("groq HTTP 413 TPM limit");
        accepted.push(records[0].text); return output; },
    });
    expect(accepted.join("")).toBe(source);
    expect([...cache.values()].some(value => "split" in value)).toBe(true);
  });
  it("wires strategy to durable batches without the old 20000-character source slices", () => {
    const source = readFileSync("src/lib/intelligence/litigation.server.ts", "utf8");
    const strategy = source.slice(source.indexOf("export async function runStrategyEngine"), source.indexOf("export async function", source.indexOf("export async function runStrategyEngine") + 30));
    expect(strategy).toContain("runStrategyBatches");
    expect(strategy).not.toContain("slice(0, 20000)");
    expect(strategy).toContain('engine: "strategy_batch"');
  });
});
