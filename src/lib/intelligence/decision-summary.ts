import type { MandatoryDecisionCoreItem } from "./mandatory-decision-core";

/** Recover an empty summary using source passages, never unverified model prose. */
export function groundedDecisionSummary(items: MandatoryDecisionCoreItem[], docs: Array<{ document_id: string; doc_n: number }>): string {
  const passages = new Set<string>();
  for (const item of items) for (const ref of item.source_refs) {
    const doc = docs.find(d => d.document_id === ref.document_id);
    if (!doc || !ref.quote?.trim()) continue;
    const text = item.text.trim(), quote = ref.proposition_supported?.trim() || ref.quote.trim();
    const same = text.replace(/\s+/g, " ") === quote.replace(/\s+/g, " ");
    const page = ref.page ?? (ref as any).page_number ?? (ref as any).page_located ?? (/p\.?\s*(\d+)/i.exec(ref.label ?? "")?.[1]);
    const marker = ref.writer_ref_id ? `[CITE ${ref.writer_ref_id}]` : `[DOC ${doc.doc_n} p.${page}]`;
    passages.add(`${same ? "" : `${text}\n\n`}\u201c${quote}\u201d ${marker}`);
  }
  return [...passages].join("\n\n");
}
