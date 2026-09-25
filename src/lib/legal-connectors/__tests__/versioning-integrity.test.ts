import { describe, expect, it } from 'vitest';
import { upsertAuthorityWithVersioning } from '../versioning.server';
import type { IngestedDocument, LegalSourceConnector } from '../types';

const doc = { externalId:'law-1',kind:'federal_statute',jurisdiction:'federal',title:'Official law',citation:'Law 1',
  sourceUrl:'https://official.example/law',rawText:'Current official text '.repeat(5),effectiveAt:'2026-01-01' } as IngestedDocument;
const connector={code:'test',accessMethod:'official_api'} as LegalSourceConnector;
function fake(existing:any, failArchive=false, failLookup=false) {
  const writes:Array<{table:string,op:string,row:any}>=[];
  const db={from(table:string) {
    let op='read', row:any;
    const q:any={select:()=>q,eq:()=>q,is:()=>q,
      maybeSingle:async()=>({data:existing,error:failLookup?{message:'read failure'}:null}),
      single:async()=>({data:{id:'a'},error:null}),
      insert:(r:any)=>{op='insert';row=r;writes.push({table,op,row});return q;},
      update:(r:any)=>{op='update';row=r;writes.push({table,op,row});return q;},
      then:(resolve:any)=>resolve({data:op==='update'?[{id:'a'}]:null,error:table==='legal_authority_versions'&&failArchive?{message:'archive failure'}:null})};
    return q;
  }};
  return {db:db as any,writes};
}
const prior={id:'a',body:'Old text',metadata:{review_attestation:{reviewer_id:'reviewer'}},authority_level:9,
  source_url:'https://official.example/old',published_at:'2020-01-01',effective_at:'2020-02-01',verification_status:'verified',content_hash:'oldhash'};
describe('legal source version integrity',()=>{
  it('does not verify new text merely because transport is structured',async()=>{
    const f=fake(null); await upsertAuthorityWithVersioning(f.db,connector,doc);
    expect(f.writes[0].row.verification_status).toBe('pending');
  });
  it('fails closed before overwriting when archive fails',async()=>{
    const f=fake(prior,true);
    await expect(upsertAuthorityWithVersioning(f.db,connector,doc)).rejects.toThrow('archive');
    expect(f.writes.some(w=>w.op==='update')).toBe(false);
  });
  it('archives temporal provenance and invalidates changed text review',async()=>{
    const f=fake(prior); await upsertAuthorityWithVersioning(f.db,connector,doc);
    const archive=f.writes.find(w=>w.table==='legal_authority_versions')!.row;
    expect(archive.metadata.version_snapshot).toMatchObject({effective_at:'2020-02-01',source_url:prior.source_url,verification_status:'verified'});
    const changed=f.writes.find(w=>w.op==='update')!.row;
    expect(changed.verification_status).toBe('pending');
    expect(changed.metadata.review_attestation).toBeUndefined();
  });
  it('preserves review metadata for unchanged text and rejects lookup errors',async()=>{
    const f=fake({...prior,body:doc.rawText,source_url:doc.sourceUrl,published_at:null,effective_at:doc.effectiveAt});await upsertAuthorityWithVersioning(f.db,connector,doc);
    expect(f.writes.find(w=>w.op==='update')!.row.metadata.review_attestation).toEqual(prior.metadata.review_attestation);
    const failed=fake(null,false,true);await expect(upsertAuthorityWithVersioning(failed.db,connector,doc)).rejects.toThrow('read failure');
    expect(failed.writes).toEqual([]);
  });
});
