import {it,expect} from 'vitest';import {auditSourceLocations} from '../source-location-audit';
import {relocateSourceRefs} from '../source-location-audit';
const pages=[{document_id:'a',filename:'2_original_firmado.pdf',page:9,text:'Las personas presentaron sus documentos.'}];
const docs=[{doc_n:1,document_id:'a'}];
it('repairs a wrong page only using a unique exact quote in the same document',()=>{
 const refs=relocateSourceRefs([{document_id:'a',page:1,quote:pages[0].text}],pages,docs);
 expect(refs[0].page).toBe(9);expect(refs[0].doc_n).toBe(1);expect(auditSourceLocations(refs,pages,docs).ok).toBe(true);
 expect(relocateSourceRefs([{document_id:'b',page:1,quote:pages[0].text}],pages,docs)[0].page).toBe(1);
 expect(relocateSourceRefs([{document_id:'a',page:1,quote:pages[0].text}],[...pages,{...pages[0],page:10}],docs)[0].page).toBe(1);
});

it.each([
 ['negation', 'La autoridad resolvió sin audiencia previa.', 'La autoridad resolvió con audiencia previa.'],
 ['omitted negation', 'El tribunal no concede el amparo.', 'El tribunal concede el amparo.'],
 ['accent', 'El juez confirmó la resolución.', 'El juez confirmo la resolución.'],
 ['number', 'El plazo es de 15 días.', 'El plazo es de 30 días.'],
 ['decimal punctuation', 'La tasa es 1.5%.', 'La tasa es 15%.'],
 ['operative punctuation', 'No; procede la devolución.', 'No procede la devolución.'],
 ['paraphrase', 'Las personas presentaron sus documentos.', 'Las personas entregaron sus documentos.'],
 ['noncontiguous tokens', 'La autoridad confirmó otros datos la resolución.', 'La autoridad confirmó la resolución.'],
])('rejects altered %s instead of verifying token overlap',(_kind,text,quote)=>{
 const source=[{...pages[0],text}];
 const ref={document_id:'a',page:9,quote};
 expect(auditSourceLocations([ref],source,docs).ok).toBe(false);
 expect(relocateSourceRefs([{...ref,page:1}],source,docs)[0].page).toBe(1);
});

it('accepts whitespace, canonical Unicode accents and typographic quotation marks only',()=>{
 const source=[{...pages[0],text:'El juez\n confirmó\u00a0la «resolución»; indicó “sí”, no “no”.'}];
 const quote='El juez confirmo\u0301 la «resolución»; indicó "sí", no "no".';
 expect(auditSourceLocations([{document_id:'a',page:9,quote}],source,docs).ok).toBe(true);
});

it('does not infer document identity from a unique quotation',()=>{
 const ref={page:1,quote:pages[0].text};
 expect(relocateSourceRefs([ref],pages,docs)).toEqual([ref]);
 expect(auditSourceLocations([{quote:pages[0].text,page:9}],pages,docs).ok).toBe(false);
});

it.each([
 {document_id:'a',doc_id:'b'},
 {document_id:'a',doc_n:2},
 {document_id:'a',doc_n:33},
 {document_id:'a',label:'DOC 2 p.9'},
 {doc_n:1,label:'DOC 2 p.9'},
 {document_id:'a',page_extraction_ref:'b:9'},
])('rejects conflicting or unknown source identity %j',identity=>{
 const index=[...docs,{document_id:'b',doc_n:2}];
 const ref={...identity,page:9,quote:pages[0].text};
 expect(auditSourceLocations([ref],pages,index).ok).toBe(false);
 expect(relocateSourceRefs([ref],pages,index)).toEqual([ref]);
});

it.each([
 {page:9,page_number:1},
 {page:9,label:'p.1'},
 {page:9,citation:'DOC 1 p.1'},
 {page:9,page_located:1},
 {page:9,page_extraction_ref:'a:1'},
 {label:'p.9 y p.1'},
])('does not resolve contradictory physical page references %j',location=>{
 const ref={document_id:'a',...location,quote:pages[0].text};
 expect(auditSourceLocations([ref],pages,docs).ok).toBe(false);
 expect(relocateSourceRefs([ref],pages,docs)).toEqual([ref]);
});

it('resolves doc number or DOC label only through an unambiguous index',()=>{
 for(const identity of [{doc_n:1},{label:'DOC 1'}]) {
  const [ref]=relocateSourceRefs([{...identity,quote:pages[0].text}],pages,docs);
  expect(ref.document_id).toBe('a');
  expect(ref.page).toBe(9);
 }
 const ref={doc_n:1,page:9,quote:pages[0].text};
 const conflicting=[...docs,{doc_n:1,document_id:'b'}];
 expect(auditSourceLocations([ref],pages,conflicting).ok).toBe(false);
 expect(relocateSourceRefs([ref],pages,conflicting)).toEqual([ref]);
});

it('does not attach an ambiguous document number to an otherwise explicit ID',()=>{
 const ref={document_id:'a',page:1,quote:pages[0].text};
 const conflicting=[...docs,{doc_n:1,document_id:'b'}];
 expect(relocateSourceRefs([ref],pages,conflicting)).toEqual([ref]);
});

it('keeps a relocated citation string consistent with the repaired physical page',()=>{
 const [ref]=relocateSourceRefs([{citation:'DOC 1 p.1',quote:pages[0].text}],pages,docs);
 expect(ref.citation).toBe('DOC 1 p.9');
 expect(auditSourceLocations([ref],pages,docs).ok).toBe(true);
});

it('preserves a verified current page when the same quote occurs twice',()=>{
 const repeated=[...pages,{...pages[0],page:31}];
 const [ref]=relocateSourceRefs([{document_id:'a',page:31,label:'p.31',quote:pages[0].text}],repeated,docs);
 expect(ref.page).toBe(31);
 expect(auditSourceLocations([ref],repeated,docs).ok).toBe(true);
});

it('rejects paraphrased excerpt and source_quote aliases as literal proof',()=>{
 for(const field of ['excerpt','source_quote']) {
  const ref={document_id:'a',page:9,[field]:'Las personas entregaron sus documentos.'};
  expect(auditSourceLocations([ref],pages,docs).verified).toEqual([]);
 }
});
it('verifies physical page and preserves full filename',()=>{const r=auditSourceLocations([{doc_n:1,page:9,quote:'Las personas presentaron sus documentos.'}],pages,docs);expect(r.ok).toBe(true);expect(r.verified[0].filename).toBe('2_original_firmado.pdf');expect(r.verified[0].page_extraction_ref).toBe('a:9');});
it('blocks wrong pages, missing quotes, foreign documents and paraphrases',()=>{for(const r of [{doc_n:1,page:1,quote:pages[0].text},{document_id:'b',page:9,quote:pages[0].text},{doc_n:1,page:9},{doc_n:1,page:9,quote:'Mostraron documentos mexicanos.'}])expect(auditSourceLocations([r],pages,docs).ok).toBe(false);});
it('repairs a quote that crosses the extracted PDF page boundary using an exact single-page segment',()=>{
 const source=[
  {document_id:'a',page:1,text:'Encabezado de la resolución. La decisión continúa en la página siguiente.'},
  {document_id:'a',page:2,text:'SEGUNDO. La justicia de la Unión ampara y protege a la quejosa.'},
 ] as any;
 const ref={document_id:'a',label:'p.1',quote:'Encabezado de la resolución. SEGUNDO. La justicia de la Unión ampara y protege a la quejosa.'};
 const repaired=relocateSourceRefs([ref],source,[{document_id:'a',doc_n:1}]);
 expect(repaired[0].page).toBe(2);
 expect(repaired[0].quote).toBe('SEGUNDO. La justicia de la Unión ampara y protege a la quejosa.');
 expect(auditSourceLocations(repaired,source,[{document_id:'a',doc_n:1}]).ok).toBe(true);
});
it('does not repair a wrong literal or an explicitly wrong page',()=>{
 const source=[{document_id:'a',page:1,text:'Texto fuente válido.'},{document_id:'a',page:2,text:'Otra página.'}] as any;
 expect(relocateSourceRefs([{document_id:'a',label:'p.1',quote:'Texto inventado.'}],source,[{document_id:'a',doc_n:1}])[0].page).toBeUndefined();
 expect(auditSourceLocations([{document_id:'a',page:2,quote:'Texto fuente válido.'}],source,[{document_id:'a',doc_n:1}]).ok).toBe(false);
});
it('counts an identical quote at the same location once',()=>{const ref={doc_n:1,page:9,quote:pages[0].text};expect(auditSourceLocations([ref,ref],pages,docs).unique_citations).toBe(1);});
it('persists the actual page label used by the executive summary for citation 8',()=>{
 const quote='respecto a la inconstitucionalidad de este artículo';
 const source=[{document_id:'a',filename:'2_253426_6081_firmado.pdf',page:109,text:quote}];
 const [ref]=relocateSourceRefs([{document_id:'a',label:'p.73',quote}],source,docs);
 expect(ref.label).toBe('p.109');expect(ref.page).toBe(109);
 expect(auditSourceLocations([ref],source,docs).ok).toBe(true);
});
