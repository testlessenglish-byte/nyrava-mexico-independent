import {auditSourceLocations,relocateSourceRefs} from './source-location-audit';
import type {MatterSourcePage} from '../intelligence/source-matter-audit';
type Row=Record<string,any>;
const norm=(text:string)=>text.normalize('NFC').replace(/\s+/g,' ').trim();

/** Populate metadata only when the order explicitly names the receiving court,
 * proceeding and docket together. No court is inferred from a docket alone. */
export function receivingProceedings(items:Row[],pages:MatterSourcePage[],index:Array<{document_id:string;doc_n:number}>):Row[] {
  const registry=new Map<string,Row>();
  for(const item of items) {
    if(!['DISPOSITION','RESOLUTIVOS'].includes(item.kind))continue;
    const refs=relocateSourceRefs(item.source_refs??[],pages,index);
    const audit=auditSourceLocations(refs,pages,index);
    if(!audit.ok)continue;
    for(const ref of audit.verified){
      const match=/Devuélvanse\s+los\s+autos\s+al\s+(.+?)\s+para\s+que\s+.+?\s+en\s+el\s+(amparo\s+en\s+revisión)\s+(\d+\/\d{4})\s+de\s+su\s+índice/i.exec(norm(ref.quote));
      if(!match)continue;
      const row={number:match[3],court:match[1],proceeding:match[2].toLowerCase(),relationship:'órgano receptor de los autos',source_refs:[ref]};
      const previous=registry.get(row.number);
      if(previous && previous.court!==row.court)continue;
      registry.set(row.number,row);
    }
  }
  return [...registry.values()];
}

/** Persist the verified physical location to every renderer-facing reference,
 * not just to a temporary array used by an audit. Ambiguity stays unresolved. */
export function relocateReportReferences<T>(input:T,pages:MatterSourcePage[],index:Array<{document_id:string;doc_n:number}>):T {
  const walk=(v:any,key=''):any=>{
    if(key==='pre_release_source_pages'||key==='documents'||key==='agent_logs')return v;
    if(Array.isArray(v))return v.map(x=>walk(x,key));
    if(!v||typeof v!=='object')return v;
    const row=typeof v.quote==='string' && (v.document_id||v.doc_id||v.doc_n)
      ? relocateSourceRefs([v],pages,index)[0] : v;
    return Object.fromEntries(Object.entries(row).map(([k,x])=>[k,walk(x,k)]));
  };
  return walk(input);
}
