import type { MatterSourcePage } from '../intelligence/source-matter-audit';
const normalize = (s: string) => String(s ?? "")
  .normalize("NFC")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\s+/g, " ")
  .trim();

function matchesPageText(quote: string, pageText: string): boolean {
  const qNorm = normalize(quote);
  const pNorm = normalize(pageText);
  // Literal occurrence only. Accents, negation, numbers and punctuation are
  // evidence, not OCR noise to discard. Semantic support is a separate audit.
  return Boolean(qNorm && pNorm && pNorm.includes(qNorm));
}

// A PDF extractor can return a single quote that crosses a physical page
// boundary (the decision-core extractor did this for Citation 13). Such a
// quote is not verifiable against either page as a whole. When the reference
// has no explicit physical page, reduce it only to the longest complete
// sentence/line segment that is literally present on exactly one page. This
// is a repair of an extraction boundary, not fuzzy matching: wrong literals,
// wrong pages, and paraphrases still fail closed.
function pageBoundaryQuote(quote: string, candidates: MatterSourcePage[]) {
  const flat = normalize(quote);
  // Numbered rulings are commonly line-wrapped by PDF extraction. Locate the
  // numbered block in the normalized page text and take only the exact source
  // slice of the same bounded length; no generated words are introduced.
  const markers = [...flat.matchAll(/\b(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\./gi)];
  for (const [i, match] of markers.entries()) {
    const marker = match[0];
    const sourceTail = flat.slice(match.index!, markers[i + 1]?.index ?? flat.length);
    if (sourceTail.length < 32) continue;
    const prefix = sourceTail.split(/\s+/).slice(0, 8).join(" ");
    const found = candidates.filter(page => normalize(page.text).includes(prefix));
    if (found.length === 1) {
      const pageText = normalize(found[0].text);
      const start = pageText.indexOf(marker.trim());
      if (start >= 0) return { page: found[0], quote: pageText.slice(start, start + sourceTail.length).trim() };
    }
  }
  const numbered = [...flat.matchAll(/(?:^|\s)((?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\..*?)(?=\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.|$)/gi)]
    .map(match => match[1].trim());
  const parts = [
    ...quote.matchAll(/(?:^|\s)((?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.\s+[\s\S]*?)(?=\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.\s+|$)/gi),
  ].map(match => match[1].trim()).concat(numbered).concat(
    quote.split(/(?=\b(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.)/i).map(part => part.trim()).filter(part => part.length >= 24),
    quote
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(part => part.length >= 24),
  );
  let best: { page: MatterSourcePage; quote: string } | undefined;
  for (const part of parts) {
    const matches = candidates.filter(page => matchesPageText(part, page.text));
    if (matches.length !== 1) continue;
    if (!best || part.length > best.quote.length) best = { page: matches[0], quote: part };
  }
  return best;
}

type DocIndex = Array<{ doc_n: number; document_id: string }>;

/** Resolve all supplied aliases together, never by picking the first one.
 * Missing identity cannot be recovered from quotation similarity. Conflicting
 * physical locations stay unresolved even if one happens to contain the quote. */
function resolveReference(ref: Record<string, any>, docIndex: DocIndex) {
  const present = (value: unknown) => value !== undefined && value !== null;
  const positiveInteger = (value: unknown) =>
    (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const labels = [ref.label, ref.citation].filter((value): value is string => typeof value === 'string');
  const ids: unknown[] = [ref.document_id, ref.doc_id].filter(present);
  const numbers: unknown[] = [ref.doc_n].filter(present);
  const locations: unknown[] = [ref.page, ref.page_number, ref.page_located].filter(present);
  for (const label of labels) {
    for (const match of label.matchAll(/\bDOC\s*(\d+)\b/gi)) numbers.push(match[1]);
    for (const match of label.matchAll(/\bp\.?\s*(\d+)\b/gi)) locations.push(match[1]);
  }
  if (present(ref.page_extraction_ref)) {
    const extraction = typeof ref.page_extraction_ref === 'string'
      ? /^(.+):(\d+)$/.exec(ref.page_extraction_ref) : null;
    if (!extraction) return undefined;
    ids.push(extraction[1]);
    locations.push(extraction[2]);
  }
  if (ids.some(id => typeof id !== 'string' || !id.trim()) ||
      numbers.some(n => !positiveInteger(n)) || locations.some(p => !positiveInteger(p))) return undefined;
  if (new Set(numbers.map(Number)).size > 1 || new Set(locations.map(Number)).size > 1) return undefined;
  for (const n of numbers) {
    const matches = new Set(docIndex.filter(d => d.doc_n === Number(n)).map(d => d.document_id));
    if (matches.size !== 1) return undefined;
    ids.push([...matches][0]);
  }
  if (new Set(ids).size !== 1) return undefined;
  const id = ids[0] as string;
  const indexedNumbers = new Set(docIndex.filter(d => d.document_id === id).map(d => d.doc_n));
  if (indexedNumbers.size > 1) return undefined;
  if ([...indexedNumbers].some(n => !positiveInteger(n) ||
      docIndex.some(d => d.doc_n === n && d.document_id !== id))) return undefined;
  return { id, page: locations.length ? Number(locations[0]) : undefined,
    doc_n: numbers.length ? Number(numbers[0]) : [...indexedNumbers][0] };
}

/** Repair location only when an exact quote has a matching page in its own document. */
export function relocateSourceRefs(refs: Array<Record<string, any>>, pages: MatterSourcePage[], docIndex: DocIndex) {
  return refs.map(ref => {
    const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? '');
    const location = resolveReference(ref, docIndex);
    if (!quote || !location) return ref;
    const candidates = pages.filter(p => p.document_id === location.id);
    const matches = candidates.filter(p => matchesPageText(quote, p.text));
    // Preserve a genuine existing physical location even when the same passage
    // is repeated elsewhere (for example a summary and the operative ruling).
    // A label is only accepted after its exact quote is checked on that page.
    const located = matches.find(p => p.page === location.page);
    const source = located ?? (matches.length === 1 ? matches[0] : undefined);
    if (!source) {
      const flatQuote = normalize(quote);
      const markerMatches = [...flatQuote.matchAll(/\b(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\./gi)];
      for (const marker of markerMatches) {
        const fragment = flatQuote.slice(marker.index!, marker.index! + 48);
        const candidatesWithFragment = candidates.filter(page => normalize(page.text).includes(fragment));
        if (candidatesWithFragment.length === 1) {
          const page = candidatesWithFragment[0];
          const pageText = normalize(page.text);
          const start = pageText.indexOf(fragment.slice(0, marker[0].length));
          if (start >= 0) {
            const minimumEnd = start + Math.max(48, fragment.length);
            const sentenceEnd = pageText.indexOf('.', minimumEnd);
            const repairedQuote = pageText.slice(start, sentenceEnd >= 0 ? sentenceEnd + 1 : minimumEnd).trim();
            return { ...ref, quote: repairedQuote, document_id: page.document_id, doc_n: location.doc_n,
              page: page.page, page_number: page.page, page_located: page.page, label: `p.${page.page}`, filename: page.filename,
              page_extraction_ref: `${page.document_id}:${page.page}` };
          }
        }
      }
    }
    // A supplied page can be stale when the quote was assembled across a PDF
    // page break; require multiple quote segments before repairing an explicit
    // page so a normal wrong-page citation still fails closed.
    if (!source && (
      quote.split(/(?<=[.!?])\s+|\n+/).filter(part => part.trim().length >= 24).length >= 2 ||
      quote.split(/(?=\b(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.)/i).filter(part => part.trim().length >= 24).length >= 2
    )) {
      const repaired = pageBoundaryQuote(quote, candidates);
      if (repaired) {
        const repairedSource = repaired.page;
        return { ...ref, quote: repaired.quote, document_id: repairedSource.document_id, doc_n: location.doc_n,
          page: repairedSource.page, page_number: repairedSource.page, page_located: repairedSource.page, label: `p.${repairedSource.page}`, filename: repairedSource.filename,
          ...(typeof ref.citation === 'string' ? {citation: ref.citation.replace(/\bp\.?\s*\d+\b/gi, `p.${repairedSource.page}`)} : {}),
          page_extraction_ref: `${repairedSource.document_id}:${repairedSource.page}` };
      }
    }
    if (!source) return ref;
    const sourceId = source.document_id;
    return { ...ref, document_id: sourceId, doc_n: location.doc_n,
      page: source.page, page_number: source.page, page_located: source.page, label: `p.${source.page}`, filename: source.filename,
      ...(typeof ref.citation === 'string' ? {citation: ref.citation.replace(/\bp\.?\s*\d+\b/gi, `p.${source.page}`)} : {}),
      page_extraction_ref: `${sourceId}:${source.page}` };
  });
}
/** Exact source verification; does not use fuzzy/semantic similarity as quotation proof. */
export function auditSourceLocations(refs: Array<Record<string, any>>, pages: MatterSourcePage[], docIndex: DocIndex) {
  const errors: string[] = [], verified: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  for (const [index, ref] of refs.entries()) {
    const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? '').trim();
    const location = resolveReference(ref, docIndex);
    const id = location?.id;
    const page = location?.page;
    const source = pages.find(p=>p.document_id===id && p.page===page);
    
    if (!quote || !source || !matchesPageText(quote, source.text)) {
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
