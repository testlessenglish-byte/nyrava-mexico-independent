import {describe,it,expect} from 'vitest';
import {locateQuoteInText} from '../evidence-provenance.server';
import {buildGroundingCorpus,verifyEvidenceRefs} from '../grounding.server';
import {relocateSourceRefs,auditSourceLocations} from '../../reporting/source-location-audit';
describe('source citation contract',()=>{
 it('locates whitespace-normalized text with exact raw offsets',()=>{
  const text='Antes. El tribunal\n   concede el amparo. Después.';
  const loc=locateQuoteInText('El tribunal concede el amparo.',text)!;
  expect(text.slice(loc.start,loc.end)).toBe('El tribunal\n   concede el amparo.');
 });
 it('rejects token overlap without a contiguous quotation',()=>{
  const corpus=buildGroundingCorpus([{id:'a',filename:'a.pdf',extracted_text:'solicitud otros datos regularización otros datos humanitarias otros datos presentada otros datos tiempo otros datos forma otros datos delegación otros datos Instituto otros datos Nacional otros datos Migración'}]);
  expect(verifyEvidenceRefs([{doc_n:1,quote:'solicitud regularización humanitarias presentada tiempo forma delegación Instituto Nacional Migración'}],corpus)).toEqual([]);
 });
 it('retains a verified physical label for a repeated operative order',()=>{
  const quote='ÚNICO. Devuélvanse los autos al tribunal.';
  const pages=[2,31].map(page=>({document_id:'a',filename:'a.pdf',page,text:quote}));
  const refs=relocateSourceRefs([{document_id:'a',page:1,label:'p.31',page_located:21,quote}],pages,[]);
  expect(refs[0].page).toBe(31);expect(auditSourceLocations(refs,pages,[]).ok).toBe(true);
 });
 it('recovers a quote-only reference only from one exact source location',()=>{
  const quote='La autoridad concedió el amparo.';
  const pages=[{document_id:'a',filename:'a.pdf',page:4,text:quote}];
  const refs=relocateSourceRefs([{quote}],pages,[]);
  expect(refs[0].document_id).toBe('a');expect(refs[0].page).toBe(4);
  const ambiguous=relocateSourceRefs([{quote}],[...pages,{...pages[0],document_id:'b'}],[]);
  expect(auditSourceLocations(ambiguous,pages,[]).ok).toBe(false);
 });
});
