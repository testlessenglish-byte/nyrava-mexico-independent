import type { MatterSourcePage } from './source-matter-audit';
import { sourced, unsourced, type CaseDecisionReconstruction } from './decision-reconstruction';

/** A cached PRESENT quote is not proof of final-decision attribution. */
export function reconcileOperativeDisposition(reconstruction: CaseDecisionReconstruction, pages: MatterSourcePage[]): CaseDecisionReconstruction {
  const orders = extractOperativeOrders(pages);
  if (!orders.length) return { ...reconstruction, disposition_remedy: unsourced('NOT_FOUND_IN_CORPUS',
    'No unambiguous current operative section was verified in physical source pages.') };
  const refs = orders.map(order => ({document_id:order.document_id,quote:order.text,label:`p.${order.page}`,page:order.page,filename:order.filename}));
  return { ...reconstruction, disposition_remedy: sourced(orders.map(order=>order.text).join('\n\n'), refs) };
}
/** Read the final operative block, never a quoted lower-court ruling in antecedentes.
 * Multiple source decisions remain ambiguous; a physical page number is provenance,
 * not a rule that a later document defeats an earlier one.
 */
export function extractOperativeOrders(pages: MatterSourcePage[]) {
  const orders: Array<{text:string;document_id:string;page:number;filename:string}> = [];
  const headingPattern = /(?:se\s+resuelve|R\s*E\s*S\s*U\s*E\s*L\s*V\s*E)\s*:/gi;
  const candidates = pages.flatMap(page => [...page.text.matchAll(headingPattern)].filter(match => {
    const before = page.text.slice(Math.max(0,match.index!-500),match.index);
    // A cited judgment's quoted resolutivos do not become this court's orders.
    if (/(?:se determin[oó] lo siguiente|resolvi[oó] lo siguiente|puntos resolutivos|sentencia (?:dictada|de fecha))[\s\S]{0,450}$/i.test(before)) return false;
    return /por [\s\S]{0,180}(?:expuesto|fundado)/i.test(before)
      || /(?:^|\n)\s*$/.test(before);
  }).map(match => ({page,index:match.index!,length:match[0].length})));
  const documents = new Set(candidates.map(candidate=>candidate.page.document_id));
  if (documents.size !== 1) return orders;
  const documentId = [...documents][0];
  const selected = candidates.sort((a,b)=>a.page.page-b.page.page || a.index-b.index).at(-1)!;
  let active = false;
  for (const page of pages.filter(p=>p.document_id===documentId).sort((a,b)=>a.page-b.page)) {
    if (page === selected.page) active = true;
    if (!active) continue;
    const text = page === selected.page ? page.text.slice(selected.index+selected.length) : page.text;
    const stop = /Notif[ií]quese|As[ií]\s+lo\s+resolvi[oó]/i.exec(text);
    const body = stop ? text.slice(0,stop.index) : text;
    const re = /(?:^|\n)((?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|ÚNICO)\.[\s\S]*?)(?=\n(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|ÚNICO)\.|\n\d+\s*\n|$)/g;
    for (const match of body.matchAll(re)) {
      const exact = match[1].trim();
      if (exact.length > 20) orders.push({text:exact,document_id:page.document_id,page:page.page,filename:page.filename});
    }
    if (stop) break;
  }
  return orders;
}
