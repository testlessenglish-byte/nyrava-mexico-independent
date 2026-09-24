import type { MatterSourcePage } from './source-matter-audit';
/** Read numbered orders only after an explicit operative-section heading. */
export function extractOperativeOrders(pages: MatterSourcePage[]) {
  const orders: Array<{text:string;document_id:string;page:number;filename:string}> = [];
  const documents = new Set(pages.filter(p => /(?:se\s+resuelve|R\s*E\s*S\s*U\s*E\s*L\s*V\s*E)\s*:/i.test(p.text)).map(p=>p.document_id));
  if (documents.size !== 1) return orders;
  const documentId = [...documents][0];
  let active = false;
  for (const page of pages.filter(p=>p.document_id===documentId).sort((a,b)=>a.page-b.page)) {
    const heading = /(?:se\s+resuelve|R\s*E\s*S\s*U\s*E\s*L\s*V\s*E)\s*:/i.exec(page.text);
    if (heading) active = true;
    if (!active) continue;
    const text = heading ? page.text.slice(heading.index+heading[0].length) : page.text;
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
