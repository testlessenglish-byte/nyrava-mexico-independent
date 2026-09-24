import {describe,it,expect} from 'vitest';
import {auditMatterCaptions} from '../source-matter-audit';
import {extractCaseNumbers} from '../case-identity-generator.server';
const page=(text:string,document_id='d1',page=1)=>({text,document_id,page,filename:document_id+'.pdf'});
describe('source matter isolation',()=>{
 it('uses opening AR caption rather than a later cited ADR',()=>{const text='AMPARO EN REVISIÓN 81/2023\n'+ 'Antecedentes. '.repeat(150)+'AMPARO DIRECTO EN REVISIÓN 400/2018';expect(extractCaseNumbers(text)[0].normalized).toBe('Amparo en Revisión 81/2023');expect(auditMatterCaptions([page(text)]).selected?.number).toBe('81/2023');});
 it.each(['AMPARO DIRECTO EN REVISIÓN','AMPARO EN REVISIÓN','AMPARO INDIRECTO','PROCEDIMIENTO ADMINISTRATIVO MIGRATORIO'])('distinguishes %s',type=>{expect(auditMatterCaptions([page(type+' 52/2022')]).selected?.proceeding).toBe(type.normalize('NFD').replace(/[\u0300-\u036f]/g,''));});
 it('blocks mismatching cached metadata',()=>{expect(auditMatterCaptions([page('AMPARO EN REVISIÓN 81/2023')],'ADR 400/2018').status).toBe('IDENTITY_CONFLICT');});
 it('shows source pages for conflicting document captions',()=>{const r=auditMatterCaptions([page('AMPARO EN REVISIÓN 81/2023'),page('AMPARO EN REVISIÓN 82/2023','d2',5)]);expect(r.status).toBe('IDENTITY_CONFLICT');expect(r.candidates.map(c=>c.page)).toEqual([1,5]);});
 it('does not carry state between concurrent matters',async()=>{const results=await Promise.all([1,2].map(async n=>auditMatterCaptions([page(`EXPEDIENTE ${n}/2026`,`doc${n}`)])));expect(results.map(r=>r.selected?.number)).toEqual(['1/2026','2/2026']);});
 it('does not invent a caption for unnumbered evidence',()=>expect(auditMatterCaptions([page('Pasaporte y constancia de residencia')]).status).toBe('IDENTITY_UNVERIFIED'));
});
import {classifyCaseFromDocuments} from '../case-classification.server';
import {detectProceduralPosture} from '../procedural-posture';
it('keeps immigration subject matter separate from amparo and a mention of the public prosecutor',()=>{
 const text='AMPARO EN REVISIÓN 81/2023\nProcedimiento administrativo migratorio. Interviene el Ministerio Público. Se cita después amparo directo.';
 const r=classifyCaseFromDocuments([{id:'a',filename:'immigration.pdf',extracted_text:text,pages:[{page:7,text}]}]);
 expect(r.fields.find(f=>f.field==='case_type')?.value).toBe('migratorio');
 expect(r.fields.find(f=>f.field==='underlying_materia')?.value).toBe('migratorio');
 expect(r.fields.find(f=>f.field==='procedural_vehicle')?.value).toBe('amparo_revision');
 expect(r.fields.find(f=>f.field==='expediente_number')?.source?.page).toBe(7);
 expect(detectProceduralPosture({corpusText:text}).decision_type).toBe('ejecutoria_amparo_en_revision');
});
