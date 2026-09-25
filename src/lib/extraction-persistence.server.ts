import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Row = Record<string, any>;
// Cache the parser output before indexing. A failed page write can then resume
// indexing without downloading or parsing the same PDF again.
export function cachedExtraction(document: Row) {
  const cache = document.metadata?.extraction_checkpoint;
  if (cache?.version !== 1 || !document.content_hash || cache.content_hash !== document.content_hash ||
      !Array.isArray(cache.pageTexts) || !cache.pageTexts.every((p: unknown) => typeof p === 'string') ||
      typeof document.extracted_text !== 'string') return null;
  return { text: document.extracted_text, pageTexts: cache.pageTexts as string[], entities: document.entities ?? [] };
}

export async function persistExtraction(db: SupabaseClient<Database>, args: {
  document: Row; caseId: string; userId: string; text: string; pageTexts: string[];
  metadata: Row; entities: any; reused: boolean;
}) {
  const { document, caseId, userId, text, pageTexts, entities, reused } = args;
  const checked = (error: {message:string} | null, action:string) => { if(error)throw Error(`${action}: ${error.message}`); };
  const metadata = { ...args.metadata };
  if (!reused) {
    const {error} = await db.from('documents').update({
      extracted_text:text, entities, metadata:{...metadata,extraction_checkpoint:{version:1,content_hash:document.content_hash,pageTexts}},
    }).eq('id',document.id);
    checked(error,'Save extraction checkpoint');
  }
  // A stable (document_id,page) key makes retries idempotent. Never delete the
  // good index before its replacement has been written successfully.
  for(let offset=0;offset<pageTexts.length;offset+=200) {
    const rows=pageTexts.slice(offset,offset+200).map((text,i)=>({document_id:document.id,case_id:caseId,user_id:userId,page:offset+i+1,text,char_count:text.length}));
    const {error}=await db.from('document_pages').upsert(rows,{onConflict:'document_id,page'});
    checked(error,'Index extracted pages');
  }
  const {error:trimError}=await db.from('document_pages').delete().eq('document_id',document.id).gt('page',pageTexts.length);
  checked(trimError,'Remove obsolete page index entries');
  delete metadata.extraction_checkpoint;
  const {error}=await db.from('documents').update({status:'extracted',extracted_text:text,entities,metadata,error:null}).eq('id',document.id);
  checked(error,'Complete indexed document');
}
