import { describe, expect, it } from 'vitest';
import { applyAutomaticCaseIdentity } from '../case-identity-generator.server';

describe('uploaded document identity is not client identity', () => {
  it.each([null, 'legal_research', 'client_matter_evidence'])('does not promote %s document parties into the client record', async (purpose) => {
    const writes: Record<string, any>[] = [];
    const row = {name:'Client matter', description:'Attorney description', case_type:'familiar', matter_metadata:{test_fixture:true}};
    const db = { from: () => ({
      select: () => ({eq: () => ({maybeSingle: async () => ({data:row,error:null})})}),
      update: (patch: Record<string, any>) => { writes.push(patch); return {eq: async () => ({error:null})}; },
    })};
    const result = await applyAutomaticCaseIdentity(db as never, 'case', [{id:'doc',filename:'judgment.pdf',extracted_text:'AMPARO DIRECTO EN REVISIÓN 311/2015',metadata:{analysis_purpose:purpose,client_connection_note:'Submitted by client'}}], {
      fields:[{field:'parties',value:JSON.stringify([{role:'QUEJOSA',name:'MARÍA LÓPEZ'}])}],
    } as never);
    expect(result.case_identity_verified).toBe(false);
    expect(writes[0]).not.toHaveProperty('name');
    expect(writes[0]).not.toHaveProperty('description');
    expect(writes[0].matter_metadata).not.toHaveProperty('case_identity');
    expect(writes[0].matter_metadata.document_analysis_identity.primary_party_name).toBe('MARÍA LÓPEZ');
    expect(writes[0].matter_metadata.document_analysis_identity.document_scopes[0].client_identity_verified).toBe(false);
  });
  it('preserves attorney identity while removing legacy automatic verification', async () => {
    let patch: any;
    const identity = {primary_party_name:'My client',case_display_name_source:'user',case_identity_verified:true};
    const db = {from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data:{name:'My client',matter_metadata:{case_identity:identity}},error:null})})}),update:(value:any)=>{patch=value;return{eq:async()=>({error:null})};}})};
    await applyAutomaticCaseIdentity(db as never,'case',[]);
    expect(patch.matter_metadata.case_identity).toEqual(identity);
  });
});
