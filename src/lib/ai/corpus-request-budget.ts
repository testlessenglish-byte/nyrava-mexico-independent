import { createHash } from 'node:crypto';
import { estimateRequestInputTokens, GROQ_REQUEST_TOKEN_LIMIT, REQUEST_TOKEN_HEADROOM, groqOutputTokens } from './request-budget';

export type BudgetedChunk = { docId: string; filename: string; index: number; text: string; size: number };
export const PIPELINE_INPUT_TOKEN_BUDGET = GROQ_REQUEST_TOKEN_LIMIT - REQUEST_TOKEN_HEADROOM - groqOutputTokens({ json: true });

/** Measure the actual instructions, schema, separators and UTF-8 source text. */
export function packRequestChunks<T extends BudgetedChunk>(chunks: T[], systemInstruction: string,
  buildPrompt: (corpus: string) => string, maxInputTokens = PIPELINE_INPUT_TOKEN_BUDGET): T[][] {
  const fits = (batch: T[]) => estimateRequestInputTokens({ systemInstruction,
    userContent: buildPrompt(batch.map(c => c.text).join('\n\n')) }) <= maxInputTokens;
  if (!fits([])) throw new Error(`Prompt instructions exceed ${maxInputTokens} input tokens before source text; shorten the instruction template.`);
  const pieces: T[] = [];
  const split = (chunk: T): void => {
    if (fits([chunk])) { pieces.push(chunk); return; }
    const prefix = `=== DOCUMENT ${chunk.index} (id=${chunk.docId}) [cont.]: ${chunk.filename} ===\n`;
    const body = chunk.text.startsWith(prefix) ? chunk.text.slice(prefix.length) : chunk.text;
    const chars = Array.from(body);
    if (chars.length < 2) throw new Error('Prompt leaves no room for a source fragment and document attribution.');
    const mid = Math.floor(chars.length / 2);
    const left = (chunk.text.startsWith(prefix) ? prefix : '') + chars.slice(0, mid).join('');
    const right = prefix + chars.slice(mid).join('');
    split({ ...chunk, text: left, size: left.length });
    split({ ...chunk, text: right, size: right.length });
  };
  chunks.forEach(split);
  const batches: T[][] = [];
  let current: T[] = [];
  for (const piece of pieces) {
    if (current.length && !fits([...current, piece])) { batches.push(current); current = []; }
    current.push(piece);
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Distinguish source slices and prompt versions when resuming completed work. */
export function requestBatchKey(chunks: BudgetedChunk[], system: string, buildPrompt: (text: string) => string): string {
  return createHash('sha256').update(JSON.stringify({ system, prompt: buildPrompt(chunks.map(c => c.text).join('\n\n')) })).digest('hex');
}
