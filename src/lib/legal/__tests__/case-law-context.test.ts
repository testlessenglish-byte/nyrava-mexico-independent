import {beforeEach,describe,expect,it,vi} from 'vitest';
const identity = vi.hoisted(()=>({caseType:'familiar',jurisdiction:null as string|null,underlyingMateria:null,proceduralVehicle:null}));
vi.mock('../../intelligence/case-classification.server',()=>({resolveCaseIdentity:vi.fn(async()=>identity)}));
import { loadCaseLawProfile, loadLegalReasoningContext } from '../case-law-context.server';

function database(row:Record<string,unknown>, court:{value:string;status:string}|null) {
  const reads:Array<{table:string;filters:Record<string,unknown>}>=[];
  return {reads,from:(table:string)=>{
    const filters:Record<string,unknown>={}; reads.push({table,filters});
    const q={select:()=>q,is:()=>q,range:async()=>({data:[],error:null}),eq:(k:string,v:unknown)=>{filters[k]=v;return q;},order:(column:string)=>{expect(column).toBe(table==='documents'?'id':'detected_at');return q;},limit:()=>q,
      maybeSingle:async()=>({data:table==='cases'?row:court?.status===filters.status?court:null,error:null})};return q;
  }};
}
beforeEach(()=>{identity.jurisdiction=null;});
describe('shared legal context uses the same verified court as jurisdiction stage',()=>{
  it('uses confirmed court evidence without inferring its governing local law',async()=>{
    const db=database({jurisdiction:null,matter_metadata:{}},{value:'Juzgado de Primera Instancia de Ciudad de México',status:'CONFIRMED'});
    const p=await loadCaseLawProfile(db as never,'case-1');
    expect(p.court_jurisdiction).toEqual({level:'state',entity:'CMX'});
    expect(p.applicable_law.local_state).toBeNull();
    expect(db.reads[1].filters.status).toBe('CONFIRMED');
  });
  it('does not promote unconfirmed court text into competence',async()=>{
    const db=database({jurisdiction:null,matter_metadata:{}},{value:'Juzgado de Distrito',status:'INFERRED'});
    expect((await loadCaseLawProfile(db as never,'case-1')).jurisdiction_level).toBe('unresolved');
  });
  it('keeps user declared procedure/date pending without authentic source proof',async()=>{
    const db=database({jurisdiction:'CMX',matter_metadata:{applicable_law_state:'JAL',civil_family_proceeding:'familiar_sin_divorcio',proceeding_started_on:'2026-01-01'}},null);
    const p=await loadCaseLawProfile(db as never,'case-1');
    expect(p.applicable_law.local_state).toBe('JAL');
    expect(p.procedural_transition.reason).toBe('commencement_or_type_evidence_missing');
    expect(await loadLegalReasoningContext(db as never,'case-1')).toContain('NOT SOURCE EVIDENCE');
  });
});
