import type { MandatoryDecisionCoreItem } from "./mandatory-decision-core";

/** Use canonical publication objects, never a location-only source reference. */
export function groundedDecisionSummary(items: MandatoryDecisionCoreItem[], docs: Array<{ document_id: string; doc_n: number }>): string {
  const passages = new Set<string>();
  for (const item of items) for (const source of item.source_refs) {
    const ref = source as any;
    const doc = docs.find(d => d.document_id === ref.document_id);
    if (!doc || ref.verification_status !== 'verified' || ref.publication_status === 'QUARANTINED' ||
        ref.source_location_verified !== true || !ref.canonical_source_id || !ref.writer_ref_id ||
        !ref.proposition_supported?.trim() || !Number.isSafeInteger(ref.page)) continue;
    passages.add(`${ref.proposition_supported.trim()} [DOC ${doc.doc_n} p.${ref.page}]`);
  }
  return [...passages].join("\n\n");
}
