import type { MatterSourcePage } from '../intelligence/source-matter-audit';
const normalize = (s: string) => String(s ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u2010-\u2015]/g, " ")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[^a-z0-9'"$.%/]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Repair location only when an exact quote has a matching page in its own document. */
export function relocateSourceRefs(refs: Array<Record<string, any>>, pages: MatterSourcePage[], docIndex: Array<{doc_n:number;document_id:string}>) {
  return refs.map(ref => {
    const quote = normalize(String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ''));
    const id = ref.document_id ?? ref.doc_id ?? docIndex.find(d => d.doc_n === Number(ref.doc_n))?.document_id;
    if (!quote) return ref;
    const matches = pages.filter(p => (!id || p.document_id === id) && normalize(p.text).includes(quote));
    // Preserve a genuine existing physical location even when the same passage
    // is repeated elsewhere (for example a summary and the operative ruling).
    // A label is only accepted after its exact quote is checked on that page.
    const candidates = [ref.page_number, ref.page, String(ref.label ?? '').match(/p\.?\s*(\d+)/i)?.[1]];
    const located = id ? candidates.map(Number).map(page => matches.find(p => p.page === page)).find(Boolean) : undefined;
    const source = located ?? (matches.length === 1 ? matches[0] : undefined);
    if (!source) return ref;
    const sourceId = source.document_id;
    return { ...ref, document_id: sourceId, doc_n: docIndex.find(d => d.document_id === sourceId)?.doc_n ?? ref.doc_n,
      page: source.page, page_number: source.page, page_located: source.page, label: `p.${source.page}`, filename: source.filename,
      page_extraction_ref: `${sourceId}:${source.page}` };
  });
}
/** Exact source verification; does not use fuzzy/semantic similarity as quotation proof. */
export function auditSourceLocations(refs: Array<Record<string, any>>, pages: MatterSourcePage[], docIndex: Array<{doc_n:number;document_id:string}>) {
  const errors: string[] = [], verified: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  for (const [index, ref] of refs.entries()) {
    const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? '').trim();
    const label = String(ref.label ?? ref.citation ?? '');
    const docN = Number(ref.doc_n ?? label.match(/DOC\s*(\d+)/i)?.[1]);
    const id = ref.document_id ?? ref.doc_id ?? docIndex.find(d=>d.doc_n===docN)?.document_id;
    const page = Number(ref.page ?? ref.page_number ?? label.match(/p\.?\s*(\d+)/i)?.[1]);
    const source = pages.find(p=>p.document_id===id && p.page===page);
    if (!quote || !source || !normalize(source.text).includes(normalize(quote))) {
      errors.push(`Cita ${index+1}: no se pudo verificar la cita literal en el documento y la página indicados.`);
      continue;
    }
    const key = `${id}:${page}:${normalize(quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({...ref, document_id:id, filename:source.filename, page, quote,
      page_extraction_ref:`${id}:${page}`, verification_status:'verified'});
  }
  return {ok:errors.length===0, errors, verified, unique_citations:verified.length, checked:refs.length};
}
