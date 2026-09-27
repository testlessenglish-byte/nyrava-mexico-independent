import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://plyqpmrucbsyxybmkoeg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseXFwbXJ1Y2JzeXh5Ym1rb2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYxNzcwMSwiZXhwIjoyMTA0MTkzNzAxfQ.QnnmVdBzOeivSDnkFfqL3vCYf37uR6TY99c1m7auKx4';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const caseId = '840649a2-4203-4e98-9219-5f99addf5fe5';

  const { data: runs, error: runErr } = await supabase
    .from('pipeline_engine_runs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!runErr && runs?.length) {
    fs.writeFileSync('diagnostic-runs.json', JSON.stringify(runs, null, 2));
    console.log('Wrote diagnostic-runs.json');
  }

  const { data: chunks, error: chunkErr } = await supabase
    .from('report_chunk_cache')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (!chunkErr && chunks?.length) {
    fs.writeFileSync('diagnostic-chunks.json', JSON.stringify(chunks, null, 2));
    console.log('Wrote diagnostic-chunks.json');
  }
}
run().catch(console.error);