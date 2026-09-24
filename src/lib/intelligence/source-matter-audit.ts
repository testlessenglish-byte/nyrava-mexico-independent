/** Document captions identify the matter; cited precedents do not. No model output is trusted here. */
export type MatterSourcePage = { document_id: string; filename: string; page: number; text: string };
export type MatterCaption = { value: string; proceeding: string; number: string; document_id: string; filename: string; page: number; quote: string };
const caption = /(?:^|\n)\s*(AMPARO DIRECTO EN REVISI[ÓO]N|AMPARO EN REVISI[ÓO]N|AMPARO INDIRECTO|AMPARO DIRECTO|JUICIO DE AMPARO|PROCEDIMIENTO ADMINISTRATIVO MIGRATORIO|EXPEDIENTE ADMINISTRATIVO|EXPEDIENTE)\s*(?:N[ÚU]MERO|N[ÚU]M\.?|NO\.?)?\s*:?\s*(\d+[A-Z]?\s*\/\s*\d{4})/gim;
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export function auditMatterCaptions(pages: MatterSourcePage[], claimedNumber?: string | null) {
  const candidates: MatterCaption[] = [];
  for (const p of pages) {
    // Cover/caption or running header. Body precedents remain related references.
    const header = p.text.slice(0, p.page === 1 ? 1200 : 250);
    for (const m of header.matchAll(new RegExp(caption.source, caption.flags))) {
      const proceeding = fold(m[1]), number = m[2].replace(/\s/g, '');
      candidates.push({ value: `${proceeding} ${number}`, proceeding, number,
        document_id: p.document_id, filename: p.filename, page: p.page, quote: m[0].trim() });
    }
  }
  const distinct = [...new Map(candidates.map(c => [c.value, c])).values()];
  const selected = distinct.length === 1 ? candidates[0] : null;
  const claimed = claimedNumber?.match(/\d+[A-Z]?\s*\/\s*\d{4}/)?.[0].replace(/\s/g, '');
  const mismatch = !!(claimed && selected && claimed !== selected.number);
  const status = distinct.length > 1 || mismatch ? 'IDENTITY_CONFLICT' : selected ? 'SOURCE_CAPTION_CONFIRMED' : 'IDENTITY_UNVERIFIED';
  const representativeCandidates = [...new Map(candidates.map(c => [`${c.document_id}:${c.value}`, c])).values()];
  return { version: 1, status, selected, candidates: representativeCandidates, claimed_number: claimedNumber ?? null,
    reasons: distinct.length > 1 ? ['Los encabezados contienen expedientes distintos. Confirme qué documentos pertenecen al asunto.'] : mismatch ?
      ['El expediente guardado no coincide con el encabezado del documento. Se requiere corregir la identidad y volver a analizar.'] : !selected ?
      ['No se pudo verificar el expediente en los encabezados de las páginas fuente.'] : [] };
}
