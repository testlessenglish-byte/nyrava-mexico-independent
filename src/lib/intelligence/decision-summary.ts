import type { MandatoryDecisionCoreItem } from "./mandatory-decision-core";

/** Recover an empty summary using source passages, never unverified model prose. */
export function groundedDecisionSummary(items: MandatoryDecisionCoreItem[], docs: Array<{ document_id: string; doc_n: number }>): string {
  const passages = new Set<string>();
  for (const item of items) for (const ref of item.source_refs) {
    const doc = docs.find(d => d.document_id === ref.document_id);
    if (!doc || !ref.quote?.trim()) continue;
    const text = item.text.trim(), quote = ref.quote.trim();
    const same = text.replace(/\s+/g, " ") === quote.replace(/\s+/g, " ");
    passages.add(`${same ? "" : `${text}\n`}“${quote}” [DOC ${doc.doc_n}${ref.label ? ` ${ref.label}` : ""}]`);
  }
  return [...passages].join("\n\n");
}
