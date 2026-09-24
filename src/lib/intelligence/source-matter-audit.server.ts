import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { auditMatterCaptions, type MatterSourcePage } from './source-matter-audit';

export async function loadCaseSourcePages(db: SupabaseClient<Database>, caseId: string) {
  const { data: docs, error } = await db.from('documents').select('id,filename').eq('case_id', caseId).is('archived_at', null);
  if (error) throw new Error('No se pudieron consultar los documentos del asunto.');
  const names = new Map((docs ?? []).map(d => [d.id, d.filename]));
  const pages: MatterSourcePage[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error: pageError } = await db.from('document_pages').select('document_id,page,text')
      .eq('case_id', caseId).order('document_id').order('page').range(offset, offset + 499);
    if (pageError) throw new Error('No se pudieron verificar las páginas fuente.');
    for (const p of data ?? []) if (names.has(p.document_id)) pages.push({ ...p, text: p.text ?? '', filename: names.get(p.document_id)! });
    if (!data || data.length < 500) break;
  }
  return pages;
}

export async function loadSourceMatterAudit(db: SupabaseClient<Database>, caseId: string, claimedNumber?: string | null) {
  return auditMatterCaptions(await loadCaseSourcePages(db, caseId), claimedNumber);
}
