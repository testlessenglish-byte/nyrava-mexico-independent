import { expect,it } from 'vitest';
import { projectDocument } from '../projection.server';
it('archives changed article text and resets review; archive failure prevents replacement',async()=>{
  const old={id:'article',article_number:'1',body:'Old article',verification_status:'verified',effective_at:null,source_url:'source'};
  const writes:any[]=[];let fail=false;
  const db:any={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,
    insert:(rows:any)=>{writes.push({table,rows});return q;},upsert:(rows:any)=>{writes.push({table,rows});return q;},
    then:(resolve:any)=>resolve({data:table==='legal_articles'?[old]:null,error:fail&&table==='legal_amendments'?{message:'archive unavailable'}:null})};return q;}};
  const connector:any={extractArticles:async()=>[{articleNumber:'1',text:'New article'}]};
  const doc:any={kind:'federal_statute',sourceUrl:'source',externalId:'law'};
  expect((await projectDocument(db,connector,doc,'authority')).errors).toEqual([]);
  expect(writes.find(w=>w.table==='legal_amendments').rows[0].previous_body).toBe('Old article');
  expect(writes.find(w=>w.table==='legal_articles').rows[0].verification_status).toBe('pending');
  writes.length=0;fail=true;
  expect((await projectDocument(db,connector,doc,'authority')).errors.join(' ')).toContain('archive unavailable');
  expect(writes.some(w=>w.table==='legal_articles')).toBe(false);
});
