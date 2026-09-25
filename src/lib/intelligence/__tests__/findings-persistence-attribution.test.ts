import { describe, expect, it, vi } from 'vitest';
vi.mock('../case-classification.server', () => ({ resolveCaseIdentity: async () => ({caseType:'amparo',underlyingMateria:'familiar',proceduralVehicle:'amparo_directo_revision'}) }));
vi.mock('../cross-domain.server', () => ({getActiveDomains:async()=>new Set()}));
vi.mock('../practice-areas', () => ({isFindingAllowed:()=>true,getAllowedFindingModules:()=>new Set(['general_finding'])}));
vi.mock('../grounding.server', () => ({buildCaseGroundingCorpus:async()=>({docs:[{id:'doc',pages:['El tribunal resolvió la compensación económica.']}]})}));
vi.mock('../evidence-gate.server', () => ({getLockedCaseType:async()=> 'amparo',isCivilCaseType:()=>false,stripOmisionProbatoriaForCivil:(r:unknown)=>r,evidenceDependenciesSatisfied:()=>({ok:true})}));
vi.mock('../classify.server', () => ({rankAndClassify:(r:unknown)=>r}));
vi.mock('../../mexico-lock', () => ({getReportLocale:async()=> 'es'}));
vi.mock('../dimension-map.server', () => ({computeDimensionTags:()=>[]}));
import {addFindings} from '../findings.server';

function fixture(extra:Record<string,unknown>={}) {
  return {case_id:'case',user_id:'user',source_module:'agent:witness_credibility',category:'general_finding',title:'El tribunal resolvió la compensación económica',description:'El tribunal resolvió la compensación económica.',severity:'medium',confidence:0.8,evidence_refs:[{document_id:'doc',page:1,quote:'El tribunal resolvió la compensación económica.'}],...extra} as any;
}
function database(existing:any[] = []) {
  const inserted:any[]=[]; const updates:any[]=[];
  return {inserted,updates,db:{from(table:string){let write:any;const q:any={select(){return q},eq(){return q},not(){return q},order(){return q},insert(rows:any[]){inserted.push(...rows);write=rows.map((_,i)=>({id:`new-${i}`}));return q},update(row:any){updates.push(row);write=[];return q},then(resolve:any){return Promise.resolve({data:write??(table==='documents'?[{id:'doc',filename:'judgment.pdf',status:'extracted'}]:existing),error:null}).then(resolve)}};return q}} as any};
}
describe('actual finding persistence preserves judicial attribution',()=>{
  it.each(['rejected','historical','unresolved'])('does not turn a lower court %s holding into an adopted SCJN ruling',async adoption=>{
    const d=database();await addFindings(d.db,[fixture({speaker_role:'tribunal_colegiado',proposition_type:'holding',adoption_status:adoption,audit_classification:'VERIFIED_COURT_HOLDING'})]);
    expect(d.inserted).toHaveLength(1);expect(d.inserted[0]).toMatchObject({speaker_role:'tribunal_colegiado',adoption_status:adoption,authority_level:null});
    expect(d.inserted[0].metadata.is_authority_exempt).toBe(false);
  });
  it('does not invent missing speaker, adoption, verification or authority rank',async()=>{
    const d=database();await addFindings(d.db,[fixture({proposition_type:'holding'})]);
    expect(d.inserted[0]).toMatchObject({speaker_role:null,adoption_status:null,audit_classification:null,authority_level:null});
    expect(d.inserted[0].metadata.is_authority_exempt).toBe(false);
  });
  it('does not undo a party-argument downgrade based on a verified-holding label',async()=>{
    const d=database();await addFindings(d.db,[fixture({speaker_role:'quejoso',proposition_type:'holding',adoption_status:'party_position',audit_classification:'VERIFIED_COURT_HOLDING'})]);
    expect(d.inserted[0]).toMatchObject({speaker_role:'quejoso',proposition_type:'argument',adoption_status:'party_position'});
    expect(d.inserted[0].audit_classification).not.toBe('VERIFIED_COURT_HOLDING');
  });
  it('preserves an explicitly adopted holding while neutralizing an unsupported score effect',async()=>{
    const d=database();await addFindings(d.db,[fixture({speaker_role:'tribunal_colegiado',proposition_type:'court_holding',adoption_status:'adopted',audit_classification:'VERIFIED_COURT_HOLDING',impact_direction:'weakens'})]);
    expect(d.inserted[0]).toMatchObject({speaker_role:'tribunal_colegiado',proposition_type:'court_holding',adoption_status:'adopted',audit_classification:'VERIFIED_COURT_HOLDING',authority_level:null,impact_direction:'neutral'});
    expect(d.inserted[0].metadata.is_authority_exempt).toBe(false);
  });
  it('does not reinsert or overwrite an existing mandatory decision core identity',async()=>{
    const original=fixture({id:'existing',source_module:'decision_core',metadata:{mandatory_decision_core_id:'decision:one'}});
    const d=database([original]);await addFindings(d.db,[fixture({source_module:'decision_core',title:'Otra formulación del resultado',metadata:{mandatory_decision_core_id:'decision:one'}})]);
    expect(d.inserted).toEqual([]);expect(d.updates).toEqual([]);
  });
  it('inserts one row per mandatory core identity in an incoming batch',async()=>{
    const d=database();await addFindings(d.db,[fixture({source_module:'decision_core',metadata:{mandatory_decision_core_id:'decision:one'}}),fixture({source_module:'decision_core',title:'Otro resultado con distinto título',metadata:{mandatory_decision_core_id:'decision:one'}})]);
    expect(d.inserted).toHaveLength(1);
  });
});
