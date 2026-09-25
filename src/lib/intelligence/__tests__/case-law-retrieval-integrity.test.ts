import { expect,it } from 'vitest';
import { searchCaseLaw } from '../case-law.server';
function db(rows:any[],error:any=null) { return {from:()=>{const q:any={select:()=>q,in:()=>q,eq:()=>q,textSearch:()=>q,order:()=>q,limit:()=>q,
  then:(resolve:any)=>resolve({data:rows,error})};return q;}} as any; }
const body='Irrelevant administrative heading.\n\n'+'Background. '.repeat(90)+'\n\nEl interés superior de la niñez exige examinar la custodia y la convivencia.';
const source={id:'authority',kind:'jurisprudencia',title:'Custodia',issuer:'SCJN',jurisdiction:'federal',verification_status:'verified',body,
  source_url:'https://official.example/authority',content_hash:sha256Hex(body),published_at:'2020-01-01',effective_at:'2020-01-02'};
it('retrieves an exact relevant passage with source/version provenance',async()=>{
 const results=await searchCaseLaw(db([source]),'custodia convivencia',{caseDate:'2024-01-01'});
 expect(results).toHaveLength(1);expect(results[0].snippet).toContain('interés superior');
 expect(results[0].provenance).toMatchObject({authority_id:'authority',content_hash:sha256Hex(body),source_url:source.source_url});
 const p=results[0].provenance!;expect(body.slice(p.passage_start,p.passage_end)).toBe(results[0].snippet);
});
it('rejects pending/superseded sources and unknown or later historical versions',async()=>{
 for(const patch of [{verification_status:'pending'},{verification_status:'superseded'},{superseded_by_id:'new'},
   {effective_at:null},{effective_at:'2025-01-01'},{source_url:null}])
   expect(await searchCaseLaw(db([{...source,...patch}]),'custodia',{caseDate:'2024-01-01'})).toEqual([]);
});
it('does not reuse stale verified results and surfaces source outages',async()=>{
 const database=db([source]);expect(await searchCaseLaw(database,'custodia')).toHaveLength(1);
 expect(await searchCaseLaw(db([{...source,verification_status:'pending'}]),'custodia')).toEqual([]);
 await expect(searchCaseLaw(db([],{message:'offline'}),'custodia')).rejects.toThrow('offline');
});
import { sha256Hex } from '../evidence-provenance.server';
it('rejects altered hashes, repealed sources, and ambiguous citation versions',async()=>{
 expect(await searchCaseLaw(db([{...source,content_hash:'tampered'}]),'custodia')).toEqual([]);
 expect(await searchCaseLaw(db([{...source,repealed_at:'2023-01-01'}]),'custodia',{caseDate:'2024-01-01'})).toEqual([]);
 expect(await searchCaseLaw(db([{...source,citation:'Registro 123'}, {...source,id:'other',citation:'Registro 123',body:body+' changed',content_hash:sha256Hex(body+' changed')}]),'custodia')).toEqual([]);
});

