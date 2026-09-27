import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://plyqpmrucbsyxybmkoeg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseXFwbXJ1Y2JzeXh5Ym1rb2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYxNzcwMSwiZXhwIjoyMTA0MTkzNzAxfQ.QnnmVdBzOeivSDnkFfqL3vCYf37uR6TY99c1m7auKx4';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const caseId = '840649a2-4203-4e98-9219-5f99addf5fe5';

  const { data: docs, error: docErr } = await supabase
    .from('matter_documents')
    .select('*')
    .eq('case_id', caseId);

  if (docErr) console.error(docErr);
  else {
    fs.writeFileSync('diagnostic-docs.json', JSON.stringify(docs, null, 2));
    console.log('Docs length:', docs.length);
  }
}
run().catch(console.error);