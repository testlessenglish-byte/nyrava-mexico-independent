import {describe,it,expect} from 'vitest';
import {buildNarrativeReviewInput,resolveNarrativeVerdict,narrativeManifestMatches,createNarrativeManifest} from '../report-narrative-review';
const page={document_id:'d',page:1,text:'La Sala negó el amparo solicitado. Este documento estudia un caso ajeno.',document_scope:{source_scope:'research'}};
const args=(text:string)=>({payload:{report:{executive_summary:text},report_presentation:{}},pages:[page],documents:[{id:'d',doc_n:1}],authorities:[],lawContext:{}});
describe('whole narrative support',async()=>{
 it('invented summary remains a unit despite correct findings',async()=>{
 const input=await buildNarrativeReviewInput({...args('Se concedió el amparo [DOC 1 p.1].'),payload:{report:{executive_summary:'Se concedió el amparo [DOC 1 p.1].'},findings:[{title:'Se negó el amparo'}],report_presentation:{}}});
 expect(input.units.some(u=>u.text.includes('concedió'))).toBe(true);
 });
 it('cannot certify a compound false claim from one supported fragment',async()=>{
 const input=await buildNarrativeReviewInput(args('La Sala negó el amparo y concedió daños [DOC 1 p.1].'));
 expect(resolveNarrativeVerdict(input.units[0],{verdict:'supported',entire_unit_supported:false,client_attribution:false,requires_legal_authority:false,proofs:[{source_id:'d:1',quote:'La Sala negó el amparo solicitado.'}]}).verdict).toBe('unresolved');
 });
 it('research does not prove client attribution',async()=>{
 const unit=(await buildNarrativeReviewInput(args('Nuestro cliente perdió [DOC 1 p.1].'))).units[0];
 expect(resolveNarrativeVerdict(unit,{verdict:'supported',entire_unit_supported:true,client_attribution:true,requires_legal_authority:false,proofs:[{source_id:'d:1',quote:'La Sala negó el amparo solicitado.'}]}).verdict).toBe('unresolved');
 });
 it('unavailable and unknown authority stay unresolved',async()=>{
 const unit=(await buildNarrativeReviewInput(args('Es obligatorio resolver así [DOC 1 p.1].'))).units[0];
 expect(resolveNarrativeVerdict(unit,null).verdict).toBe('unresolved');
 expect(resolveNarrativeVerdict(unit,{verdict:'supported',entire_unit_supported:true,requires_legal_authority:true,proofs:[{source_id:'law:missing',quote:'Una regla inexistente.'}]}).verdict).toBe('unresolved');
 });
 it('changed text invalidates the manifest',async()=>{
 const input=await buildNarrativeReviewInput(args('La Sala negó el amparo [DOC 1 p.1].'));
 const manifest=createNarrativeManifest(input,Object.fromEntries(input.units.map(u=>[u.id,resolveNarrativeVerdict(u,{verdict:'supported',entire_unit_supported:true,requires_legal_authority:false,client_attribution:false,proofs:[{source_id:'d:1',quote:'La Sala negó el amparo solicitado.'}]})])));
 expect(narrativeManifestMatches(input,manifest)).toBe(true);
 expect(narrativeManifestMatches(await buildNarrativeReviewInput(args('La Sala concedió el amparo [DOC 1 p.1].')),manifest)).toBe(false);
 });
});
it('pending legal passages cannot enter the reviewed source set',async()=>{
 const input=await buildNarrativeReviewInput({...args('Una regla [DOC 1 p.1].'),authorities:[{id:'law',content_hash:'x',body:'Una regla jurídica no verificada.',passage:'Una regla jurídica no verificada.',source_url:'https://official.example',verification_status:'pending',effective_at:'2020-01-01',applicability:'reviewed',binding_status:'reviewed'}],relevantDate:'2024-01-01'});
 expect(input.units[0].sources.every(s=>s.kind!=='authority')).toBe(true);
});

it('excludes technical gates and uses structured references only inside the same finding',async()=>{
 const input=await buildNarrativeReviewInput({...args('La Sala negó el amparo [DOC 1 p.1].'),payload:{report:{full_report:{release_gate:{reason:'Technical success'},qa_statuses:[{reason:'Technical pass'}]}},findings:[{title:'La Sala negó el amparo',source_document_id:'d',source_page:1,source_quote:'La Sala negó el amparo solicitado.'},{title:'Una afirmación distinta'}]}});
 expect(input.units).toHaveLength(2);expect(input.units[0].sources).toHaveLength(1);expect(input.units[1].sources).toHaveLength(0);
});
it('explicit mapping is never inferred from array order',async()=>{
 const input=await buildNarrativeReviewInput({...args('La Sala negó el amparo [DOC 1 p.1].'),documents:[{id:'d'}]});
 expect(input.units[0].unresolved_refs).toEqual(['[DOC 1 p.1]']);
});
it('a renderer extension cannot reuse a prior manifest',async()=>{
 const first=await buildNarrativeReviewInput(args('La Sala negó el amparo [DOC 1 p.1].'));
 const second=await buildNarrativeReviewInput({...args('La Sala negó el amparo [DOC 1 p.1].'),renderedFields:[{path:'$.new_section',text:'A new assertion'}]});
 expect(second.units.length).toBe(first.units.length+1);expect(second.report_hash).not.toBe(first.report_hash);
});
it('audits strategy, strategy center and score narratives and binds final rendered text',async()=>{
 const base=args('La Sala negó el amparo [DOC 1 p.1].');
 const a=await buildNarrativeReviewInput({...base,payload:{...base.payload,strategy:[{rationale:'Una estrategia'}],strategy_center:{summary:'Una conclusión'},score:{rationale:'Un puntaje'},report_presentation:{render_output:{format:'pdf',text:'Original output'}}}});
 expect(a.units.some(u=>u.text==='Una estrategia')).toBe(true);expect(a.units.some(u=>u.text==='Una conclusión')).toBe(true);expect(a.units.some(u=>u.text==='Un puntaje')).toBe(true);
 expect(a.units.some(u=>u.text==='Original output')).toBe(false);
 const b=await buildNarrativeReviewInput({...base,payload:{...base.payload,strategy:[{rationale:'Una estrategia'}],strategy_center:{summary:'Una conclusión'},score:{rationale:'Un puntaje'},report_presentation:{render_output:{format:'pdf',text:'Altered output'}}}});
 expect(a.report_hash).not.toBe(b.report_hash);
});
it('rejects malformed cached proofs, including the empty-string substring bypass',async()=>{
 const input=await buildNarrativeReviewInput(args('La Sala negó el amparo [DOC 1 p.1].'));const unit=input.units[0];
 for(const proofs of [[{source_id:'d:1',quote:''}],[{source_id:'d:1',quote:3}],{},null,[{source_id:'d:1',quote:'La Sala'}]]){
 const manifest={...createNarrativeManifest(input,{}),complete:true,units:{[unit.id]:{hash:unit.hash,verdict:'supported',reason:'cached',proofs}}};
 expect(()=>narrativeManifestMatches(input,manifest)).not.toThrow();expect(narrativeManifestMatches(input,manifest)).toBe(false);
 }
});
