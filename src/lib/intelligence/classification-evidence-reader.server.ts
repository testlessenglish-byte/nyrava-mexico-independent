import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export async function readLatestClassificationEvidenceValue(db: SupabaseClient<Database>, caseId:string, field:string): Promise<string | null> {
  const { data, error } = await db.from('case_classification_evidence').select('value')
    .eq('case_id',caseId).eq('field',field).order('detected_at',{ascending:false}).limit(1).maybeSingle();
  if (error) throw new Error(`Classification evidence unavailable (${field}): ${error.message}`);
  return data?.value ?? null;
}
