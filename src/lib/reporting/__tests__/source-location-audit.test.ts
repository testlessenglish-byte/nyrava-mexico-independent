import {it,expect} from 'vitest';import {auditSourceLocations} from '../source-location-audit';
import {relocateSourceRefs} from '../source-location-audit';
const pages=[{document_id:'a',filename:'2_original_firmado.pdf',page:9,text:'Las personas presentaron sus documentos.'}];
const docs=[{doc_n:1,document_id:'a'}];
it('repairs a wrong page only using a unique exact quote in the same document',()=>{
 const refs=relocateSourceRefs([{document_id:'a',doc_n:33,page:1,quote:pages[0].text}],pages,docs);
 expect(refs[0].page).toBe(9);expect(refs[0].doc_n).toBe(1);expect(auditSourceLocations(refs,pages,docs).ok).toBe(true);
 expect(relocateSourceRefs([{document_id:'b',page:1,quote:pages[0].text}],pages,docs)[0].page).toBe(1);
 expect(relocateSourceRefs([{document_id:'a',page:1,quote:pages[0].text}],[...pages,{...pages[0],page:10}],docs)[0].page).toBe(1);
});
it('verifies physical page and preserves full filename',()=>{const r=auditSourceLocations([{doc_n:1,page:9,quote:'Las personas presentaron sus documentos.'}],pages,docs);expect(r.ok).toBe(true);expect(r.verified[0].filename).toBe('2_original_firmado.pdf');expect(r.verified[0].page_extraction_ref).toBe('a:9');});
it('blocks wrong pages, missing quotes, foreign documents and paraphrases',()=>{for(const r of [{doc_n:1,page:1,quote:pages[0].text},{document_id:'b',page:9,quote:pages[0].text},{doc_n:1,page:9},{doc_n:1,page:9,quote:'Mostraron documentos mexicanos.'}])expect(auditSourceLocations([r],pages,docs).ok).toBe(false);});
it('counts an identical quote at the same location once',()=>{const ref={doc_n:1,page:9,quote:pages[0].text};expect(auditSourceLocations([ref,ref],pages,docs).unique_citations).toBe(1);});
it('persists the actual page label used by the executive summary for citation 8',()=>{
 const quote='respecto a la inconstitucionalidad de este artículo';
 const source=[{document_id:'a',filename:'2_253426_6081_firmado.pdf',page:109,text:quote}];
 const [ref]=relocateSourceRefs([{document_id:'a',label:'p.73',quote}],source,docs);
 expect(ref.label).toBe('p.109');expect(ref.page).toBe(109);
 expect(auditSourceLocations([ref],source,docs).ok).toBe(true);
});
