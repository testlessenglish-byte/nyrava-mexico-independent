import { createHash } from "node:crypto";
import { estimateRequestInputTokens } from "../ai/request-budget";

export type StrategyRecord = { id: string; kind: string; text: string; document_id?: string; page?: number; offset?: number };
type Ref = { document_id: string; page: number; quote: string };
type Item = Record<string, unknown> & { source_refs: Ref[]; supporting_evidence: string[] };
type Output = Record<string, unknown>;
export type StrategyCache = { split: true } | { output: Output };
const fields = ["motion_rankings", "anticipated_opposing", "counter_arguments", "next_actions"] as const;
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const itemKeys = {
  motion_rankings: ["motion", "strength", "rationale", "draft_outline"],
  anticipated_opposing: ["argument", "likelihood", "impact"],
  counter_arguments: ["counter", "for_argument"],
  next_actions: ["action", "priority", "owner", "due_window"],
};

/** All records and source characters survive partitioning. Identity accompanies
 * every fragment, including fragments of a page too large for one request. */
export function strategyFragments(records: StrategyRecord[], maxChars: number): StrategyRecord[] {
  if (maxChars < 1) throw new Error("Strategy source budget is empty");
  return records.flatMap(record => {
    const characters = Array.from(record.text);
    if (!characters.length) return [record];
    const fragments: StrategyRecord[] = [];
    for (let offset = 0; offset < characters.length; offset += maxChars) {
      fragments.push({ ...record, offset: (record.offset ?? 0) + offset, text: characters.slice(offset, offset + maxChars).join("") });
    }
    return fragments;
  });
}

export function mergeStrategyBatches(outputs: Output[], verify: (ref: Ref) => boolean): Output {
  const result: Output = { confidence_label: "unknown", case_strength_score: null, risk_score: null };
  const summaryQuotes = new Set<string>();
  for (const field of fields) {
    const unique = new Map<string, Item>();
    for (const output of outputs) for (const raw of Array.isArray(output[field]) ? output[field] as unknown[] : []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (typeof item[itemKeys[field][0]] !== "string" || !String(item[itemKeys[field][0]]).trim()) continue;
      const refs = (Array.isArray(item.source_refs) ? item.source_refs : []).filter((ref): ref is Ref =>
        !!ref && typeof ref === "object" && typeof ref.document_id === "string" &&
        Number.isInteger(ref.page) && ref.page > 0 && typeof ref.quote === "string" && ref.quote.trim().length >= 12 && verify(ref));
      if (!refs.length) continue;
      const normalizedRefs = [...new Map(refs.map(ref => [JSON.stringify(ref), ref])).values()];
      const content = Object.fromEntries(Object.entries(item).filter(([key]) => itemKeys[field].includes(key)));
      const key = hash(content);
      const previous = unique.get(key);
      const combined = [...new Map([...(previous?.source_refs ?? []), ...normalizedRefs].map(ref => [JSON.stringify(ref), ref])).values()];
      unique.set(key, { ...content, source_refs: combined, supporting_evidence: combined.map(ref => ref.quote) });
    }
    const items = [...unique.values()];
    for (const item of items) for (const ref of item.source_refs) summaryQuotes.add(`“${ref.quote}” (${ref.document_id}, p. ${ref.page})`);
    result[field] = field === "next_actions" ? items.map((item, i) => ({ ...item, step: i + 1 })) : items;
  }
  // No synthetic cross-batch holding, recommendation, confidence, or score.
  result.summary = [...summaryQuotes].join("\n") || null;
  return result;
}

export async function runStrategyBatches(args: {
  scope: string; records: StrategyRecord[]; system: string; prefix: string; maxInputTokens: number;
  load: (key: string) => Promise<StrategyCache | undefined>;
  save: (key: string, value: StrategyCache) => Promise<void>;
  call: (userContent: string) => Promise<Output>;
  checkpoint: () => void;
  verify: (ref: Ref) => boolean;
}): Promise<Output> {
  const scope = hash({ version: 1, scope: args.scope, records: args.records, system: args.system, prefix: args.prefix });
  const prompt = (records: StrategyRecord[]) => `${args.prefix}\nSOURCE RECORDS (only this portion; do not infer absence elsewhere):\n${JSON.stringify(records)}`;
  const fits = (records: StrategyRecord[]) => estimateRequestInputTokens({ systemInstruction: args.system, userContent: prompt(records) }) <= args.maxInputTokens;
  if (!fits([])) throw new Error("Strategy instructions exceed provider budget; no source text was omitted");
  const outputs: Output[] = [];
  async function process(records: StrategyRecord[]): Promise<void> {
    const key = hash({ scope, records });
    const cached = await args.load(key);
    if (cached && "output" in cached) { outputs.push(cached.output); return; }
    const split = async () => {
      let left: StrategyRecord[], right: StrategyRecord[];
      if (records.length > 1) {
        const half = Math.ceil(records.length / 2); left = records.slice(0, half); right = records.slice(half);
      } else {
        const record = records[0]; const characters = Array.from(record.text);
        if (characters.length < 128) throw new Error("Strategy payload_too_large: source fragment cannot fit; no source omitted");
        const half = Math.ceil(characters.length / 2);
        left = [{ ...record, offset: record.offset ?? 0, text: characters.slice(0, half).join("") }];
        right = [{ ...record, offset: (record.offset ?? 0) + half, text: characters.slice(half).join("") }];
      }
      await args.save(key, { split: true });
      await process(left); await process(right);
    };
    if (cached && "split" in cached || !fits(records)) { await split(); return; }
    args.checkpoint();
    let output: Output;
    try { output = await args.call(prompt(records)); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A reasoning model can exhaust its completion budget even when the
      // input fits. Treat that like an oversized batch: split the source,
      // preserve completed sibling caches, and retry only this subtree.
      if (/HTTP 413|payload_too_large|request too large|finish_reason\s*=\s*length|incomplete response/i.test(message)) {
        await split(); return;
      }
      throw error;
    }
    // Require literal evidence to occur in the material actually sent on this
    // batch as well as the independently supplied current document-page corpus.
    const verified = mergeStrategyBatches([output], ref => args.verify(ref) && records.some(record =>
      record.kind === "source_page" && record.document_id === ref.document_id && record.page === ref.page && record.text.includes(ref.quote)));
    await args.save(key, { output: verified }); // durable before next checkpoint
    outputs.push(verified);
  }
  if (!args.records.length) throw new Error("Strategy source records are empty");
  await process(args.records);
  return mergeStrategyBatches(outputs, args.verify);
}
