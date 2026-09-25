import { describe, expect, it } from 'vitest';
import { selectClassificationDocuments } from '../document-analysis-purpose';
const research = { id: 'r', metadata: { analysis_purpose: 'legal_research' } };
const linked = { id: 'c', metadata: { analysis_purpose: 'client_matter_evidence', client_connection_note: 'Filed in this client matter' } };
const unknown = { id: 'u', metadata: { test_fixture: true } };
describe('classification document purpose boundary', () => {
  it('classifies an entirely explicit research corpus as research subject', () => {
    expect(selectClassificationDocuments([research], {})).toEqual({ scope: 'research_subject', documents: [research] });
  });
  it('uses only linked evidence in a mixed client workflow', () => {
    expect(selectClassificationDocuments([research, unknown, linked], {})).toEqual({ scope: 'client_matter', documents: [linked] });
  });
  it('cannot convert a client matter into the subject of its research attachment', () => {
    for (const c of [{client_id:'crm-client'}, {matter_metadata:{client_name:'Client'}}])
      expect(selectClassificationDocuments([research], c)).toEqual({scope:'unresolved',documents:[]});
  });
  it('unknown, unlinked and test fixture documents cannot establish research workflow', () => {
    for (const docs of [[],[unknown],[research,unknown],[{metadata:{analysis_purpose:'client_matter_evidence'}}]])
      expect(selectClassificationDocuments(docs, {matter_metadata:{document_purpose_default:'legal_research',test_fixture:true}})).toEqual({scope:'unresolved',documents:[]});
  });
});
