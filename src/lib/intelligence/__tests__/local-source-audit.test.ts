import fs from 'node:fs';
import {it,expect} from 'vitest';
import {auditMatterCaptions} from '../source-matter-audit';
import {classifyCaseFromDocuments} from '../case-classification.server';
import {extractCaseNumbers} from '../case-identity-generator.server';
it.skipIf(!process.env.NYRAVA_AUDIT_FIXTURE)('audits the supplied local source fixture without modifying its case',()=>{
 const root=process.env.NYRAVA_AUDIT_FIXTURE!;
 const docs=JSON.parse(fs.readFileSync(root+'/migratorio-source-docs.json','utf8'));
 const pages=JSON.parse(fs.readFileSync(root+'/migratorio-source-pages.json','utf8'));
 const inputs=docs.map((d:any)=>({...d,pages:pages.filter((p:any)=>p.document_id===d.id)}));
 const audit=auditMatterCaptions(pages.map((p:any)=>({...p,filename:docs.find((d:any)=>d.id===p.document_id).filename})));
 const fields=classifyCaseFromDocuments(inputs).fields;
 const numbers=extractCaseNumbers(docs.map((d:any)=>d.extracted_text).join('\n'));
 expect(audit.status).toBe('SOURCE_CAPTION_CONFIRMED');
 expect(numbers[0].normalized).toContain(audit.selected!.number);
 expect(fields.find(f=>f.field==='case_type')?.value).toBe('migratorio');
 expect(fields.find(f=>f.field==='underlying_materia')?.value).not.toBe('penal');
 fs.writeFileSync(root+'/migratorio-source-audit-result.json',JSON.stringify({audit,fields,numbers},null,2));
});
