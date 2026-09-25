import {expect,it} from 'vitest';
import {parseDocumentAnalysisPurpose,buildDocumentAnalysisMetadata,resolveDocumentAnalysisScope,parseLegalQuestion,parseTestFixture,matterAnalysisScopeChanged} from '../document-analysis-purpose';
it('leaves legacy and malformed purpose unresolved instead of guessing from titles or parties',()=>{
  for(const metadata of [{},{analysis_purpose:'test_fixture'},{document_type:'judgment',parties:['Client']}])
    expect(resolveDocumentAnalysisScope({metadata}).source_scope).toBe('unresolved');
});
it('requires an explicit connection declaration for client evidence and never certifies identity or truth',()=>{
  expect(resolveDocumentAnalysisScope({metadata:{analysis_purpose:'client_matter_evidence'}}).source_scope).toBe('unresolved');
  expect(resolveDocumentAnalysisScope({metadata:{analysis_purpose:'client_matter_evidence',client_connection_note:'Filed in our matter'}})).toMatchObject({source_scope:'declared_client_evidence',connection_status:'declared',client_identity_verified:false});
});
it('research cannot inherit a previous client link and preserves unrelated extraction metadata',()=>{
  const metadata=buildDocumentAnalysisMetadata({pages:53,client_connection_note:'old link'},'legal_research','old link');
  expect(metadata).toMatchObject({pages:53,analysis_purpose:'legal_research',client_connection_note:null});
  expect(resolveDocumentAnalysisScope({metadata}).source_scope).toBe('research');
});
it('test fixture is independent from document purpose and never changes scope',()=>{
  for(const test_fixture of [false,true]) expect(resolveDocumentAnalysisScope({metadata:{analysis_purpose:'legal_research',test_fixture}}).source_scope).toBe('research');
  expect(parseTestFixture('false')).toBe(false);expect(parseTestFixture('true')).toBe(true);
  expect(()=>parseTestFixture('yes')).toThrow();expect(()=>parseDocumentAnalysisPurpose('test_fixture')).toThrow();
});
it('validates legal questions and tracks substantive changes without conflating the fixture flag',()=>{
  expect(parseLegalQuestion('  What rule applies?  ')).toBe('What rule applies?');
  expect(()=>parseLegalQuestion('x'.repeat(4001))).toThrow();
  expect(matterAnalysisScopeChanged({legal_question:'old'},{legal_question:'new'})).toBe(true);
  expect(matterAnalysisScopeChanged({test_fixture:false},{test_fixture:true})).toBe(false);
});
