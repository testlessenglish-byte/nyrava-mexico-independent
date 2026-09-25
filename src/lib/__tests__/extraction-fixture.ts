// In-memory persistence adapter. Binary PDF parsing remains real; no provider
// or customer database is used by the benchmark.
export function extractionFixture(files: Array<{id: string; bytes: Uint8Array; status?: string}>) {
  const tables: Record<string, any[]> = {
    cases: [{id:'case',cancel_requested:false}],
    documents: files.map(f => ({id:f.id,case_id:'case',filename:`${f.id}.pdf`,mime_type:'application/pdf',storage_path:f.id,
      content_hash:f.id,status:f.status ?? 'pending',extraction_retry_count:0,metadata:{}})),
    document_pages: [], ai_usage: [],
  };
  const downloads: string[] = [];
  const writes: Array<{table:string;op:string;value:any}> = [];
  let failPages = false;
  const db: any = {
    storage: {from: () => ({download: async (id:string) => { downloads.push(id); return {data:new Blob([files.find(f=>f.id===id)!.bytes as any]),error:null}; }})},
    from(table:string) {
      let op = 'select', value:any, single = false;
      const filters: Array<(r:any)=>boolean> = [];
      const q:any = {
        select:()=>q, order:()=>q, limit:()=>q,
        eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},
        gt:(k:string,v:any)=>{filters.push(r=>r[k]>v);return q;},
        lt:(k:string,v:any)=>{filters.push(r=>r[k]<v);return q;},
        or:()=>q,
        maybeSingle:()=>{single=true;return q;},
        update:(v:any)=>{op='update';value=v;return q;},
        insert:(v:any)=>{op='insert';value=v;return q;},
        upsert:(v:any)=>{op='upsert';value=v;return q;},
        delete:()=>{op='delete';return q;},
        then(resolve:any,reject:any) {return Promise.resolve().then(()=>{
          const rows=tables[table]??(tables[table]=[]);
          const matches=rows.filter(r=>filters.every(f=>f(r)));
          if(op!=='select')writes.push({table,op,value:structuredClone(value??null)});
          if(table==='document_pages'&&failPages&&op!=='select')return {data:null,error:{message:'injected page-index failure'}};
          if(op==='update') matches.forEach(r=>Object.assign(r,structuredClone(value)));
          if(op==='delete')tables[table]=rows.filter(r=>!matches.includes(r));
          if(op==='insert')rows.push(...structuredClone(Array.isArray(value)?value:[value]));
          if(op==='upsert')for(const r of value){const old=rows.find(x=>x.document_id===r.document_id&&x.page===r.page);if(old)Object.assign(old,structuredClone(r));else rows.push(structuredClone(r));}
          return {data:structuredClone(single?matches[0]??null:matches),error:null};
        }).then(resolve,reject);},
      };return q;
    },
  };
  return {db,tables,downloads,writes,setPageFailure:(v:boolean)=>{failPages=v;}};
}
