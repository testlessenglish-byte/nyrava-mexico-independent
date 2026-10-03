import { prepareCivilReport } from '../../civil/report-contract';
import { bindAttributedFindingCitations } from '../citation-integrity';
import { describe, expect, it } from 'vitest';
import { supportInput } from '../../intelligence/claim-support-review';
import { findingCitationReviews, completedFindingsCitations } from '../citation-production';
import { canonicalizeReportCitations, auditReportCitationIntegrity } from '../citation-integrity';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';

function fixture(): any {
  const quote='La parte recurrente cuenta con legitimación para presentar el recurso de revisión.';
  const pages=[{document_id:'doc',page:2,text:quote}];
  const findings=Array.from({length:5},(_,i)=>({id:'finding-'+i,case_id:'case',execution_id:'execution',
    title:'Legitimación '+i,description:'La parte recurrente tiene legitimación para interponer el recurso.',
    source_document_id:'doc',source_page:2,source_quote:quote,speaker_role:null,proposition_type:null,adoption_status:null,
    legal_significance:'Acceso al recurso.',potential_impact:'Permite revisar la resolución.',
    severity:'high',verification_status:'verified',finding_status:'verified',
    evidence_refs:[{document_id:'doc',page:2,quote}],metadata:{execution_id:'execution'}}));
  for(const f of findings) (f.metadata as any).semantic_support_review={version:1,verdict:'supported',
    hash:supportInput(f,pages).hash,supporting_quote:quote,reason:'Completed independent review fixture.'};
  return {case:{id:'case',execution_id:'execution',case_type:'familiar',report_language:'es'},
    findings,documents:[{id:'doc',doc_n:1,canonical_source_id:'source',filename:'source.pdf'}],agents:[],analysis:null,score:null,
    report:{report_mode:'LIMITED',executive_summary:'El informe recoge las determinaciones documentadas en las fuentes aportadas para revisión jurídica.',
      citations:[],full_report:{pre_release_source_pages:pages}}};
}
describe('publication finding projection',()=>{
  it('withholds strategy-only theories when the report forbids their publication',()=>{
    const d=fixture();d.theories=[{summary:'Una teoría estratégica sin apoyo.',citations:[{document_id:'doc',page:3,quote:'Una cita inventada.',publication_status:'QUARANTINED'}]}];
    const out=composeFinalReportPayload(d);
    expect(out.theories ?? []).toEqual([]);
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
    // The citation audit still rejects such content if a caller supplies it for publication.
    out.theories=d.theories;
    expect(auditReportCitationIntegrity(out).ok).toBe(false);
  });

  it('cannot disable a registered claim review by stripping caller-side markers',()=>{
    const out=composeFinalReportPayload(fixture());
    const card=out.report_presentation.finding_cards[0];card.finding=structuredClone(card.finding);
    delete card.finding.metadata.semantic_support_review;
    card.finding.title='Este tribunal condena al recurrente a pagar diez millones de pesos.';
    card.finding.description=card.finding.source_quote;
    card.finding.proposition_supported=card.finding.source_quote;
    delete card.finding.proposition_verification;
    for(const ref of card.finding.evidence_refs){delete ref.proposition_verification;ref.proposition_supported=ref.quote;}
    expect(auditReportCitationIntegrity(out).ok).toBe(false);
  });
  it('rejects a finding card whose identity no longer matches its authoritative finding',()=>{
    const out=composeFinalReportPayload(fixture());
    out.report_presentation.finding_cards[0].finding=structuredClone(out.report_presentation.finding_cards[0].finding);
    out.report_presentation.finding_cards[0].finding.id='impostor';
    out.report_presentation.finding_cards[0].finding.title='Este tribunal condena al recurrente a pagar diez millones de pesos.';
    expect(auditReportCitationIntegrity(out).ok).toBe(false);
  });
  it.each(['title','legal_significance','potential_impact'])('rejects unsupported Civil %s changes after literal attribution',field=>{
    const data=fixture();
    const quote='Este tribunal resuelve que se confirma la sentencia.';
    data.case.case_type='civil';
    data.report.full_report.pre_release_source_pages[0].text=quote;
    data.findings=data.findings.slice(0,1);
    const f=data.findings[0];f.source_quote=quote;f.description=quote;
    f.evidence_refs=[{document_id:'doc',page:2,quote}];
    f.metadata.semantic_support_review={version:1,verdict:'supported',hash:supportInput(f,data.report.full_report.pre_release_source_pages).hash,supporting_quote:quote,reason:'Original completed review.'};
    data.citation_review_registry=findingCitationReviews(data.findings);
    prepareCivilReport(data);
    bindAttributedFindingCitations(data);
    const out=canonicalizeReportCitations(data);
    expect(auditReportCitationIntegrity(out).ok).toBe(true);
    out.findings[0][field]='Este tribunal condena al recurrente a pagar diez millones de pesos.';
    expect(auditReportCitationIntegrity(out).ok).toBe(false);
  });

  it('uses the entire hash-bound finding in the producer',()=>{
    const input=fixture();
    const out=completedFindingsCitations(input.findings,input.report.full_report.pre_release_source_pages,
      [{document_id:'doc',doc_n:1,canonical_source_id:'source'}]);
    expect(out.every(f=>f.evidence_refs[0].verification_status==='verified')).toBe(true);
    expect(out[0].evidence_refs[0].proposition_verification.claim).toMatchObject({case_id:'case',execution_id:'execution',potential_impact:'Permite revisar la resolución.'});
  });
  it('carries five certified cards through restricted presentation and both section transforms',()=>{
    const input=fixture(),original=structuredClone(input),out=composeFinalReportPayload(input);
    expect(input).toEqual(original);
    expect(out.report_presentation.finding_cards).toHaveLength(5);
    for(const card of out.report_presentation.finding_cards){
      expect(card.finding.potential_impact).toBeUndefined();
      expect(card.finding.evidence_refs[0]).toMatchObject({verification_status:'verified',source_location_verified:true,canonical_source_id:'source',finding_id:card.finding.id});
      expect(card.finding.evidence_refs[0].citation_id).toMatch(/^citation_/);
    }
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
  });
  it.each(['title','description','document','page','case','execution','attribution','review'])('blocks a stale or changed %s with otherwise valid cards',change=>{
    const input=fixture(),f=input.findings[4];
    if(change==='title')f.title='Different claim';
    if(change==='description')f.description='Se admite el recurso.';
    if(change==='document')f.source_document_id='other';
    if(change==='page')f.source_page=3;
    if(change==='case')f.case_id='other';
    if(change==='execution')f.execution_id='old';
    if(change==='attribution')f.speaker_role='quejoso';
    if(change==='review')f.metadata.semantic_support_review.hash='stale';
    expect(validateFinalReportContract(composeFinalReportPayload(input)).ok).toBe(false);
  });
  it('blocks a quote changed on a card after section transforms',()=>{
    const out=composeFinalReportPayload(fixture());
    out.report_presentation.finding_cards[4].finding.source_quote='Different quote';
    expect(validateFinalReportContract(out).ok).toBe(false);
  });
  it('withholds an upstream claim whose quote contradicts its evidence reference',()=>{
    const input=fixture();input.findings[4].source_quote='Different quote';
    const out=composeFinalReportPayload(input);
    expect(out.report_presentation.finding_cards.some(c=>c.finding.id==='finding-4')).toBe(false);
  });
  it.each(['unverified','QUARANTINED'])('never rehabilitates an explicitly %s reference',status=>{
    const input=fixture(); const ref=input.findings[4].evidence_refs[0];
    if(status==='unverified')ref.verification_status=status;else ref.publication_status=status;
    const out=composeFinalReportPayload(input);
    expect(validateFinalReportContract(out).ok).toBe(false);
    expect(out.findings!.find(f=>f.id==='finding-4')!.evidence_refs[0].proposition_supported).toBeUndefined();
  });
  it('does not let a section id impersonate a selected finding',()=>{
    const input=fixture();
    input.citation_review_registry=findingCitationReviews(input.findings);
    input.report.extra={...structuredClone(input.findings[0]),metadata:undefined};
    const out=canonicalizeReportCitations(input);
    expect(out.report.extra.evidence_refs[0].proposition_supported).toBeUndefined();
    expect(auditReportCitationIntegrity(out).ok).toBe(false);
  });
});

describe('reviewed party finding publication',()=>{
  function partyFixture(){
    const d=fixture();d.findings=d.findings.slice(0,1);
    const f=d.findings[0];
    f.title='Omisión en el análisis del derecho de defensa';
    f.description='Los recurrentes sostuvieron que el Tribunal Colegiado no realizó un análisis del derecho fundamental de defensa.';
    f.source_quote='El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional, consistente en el derecho fundamental de defensa.';
    f.speaker_role='quejoso';f.proposition_type='allegation';f.adoption_status='party_position';
    d.report.full_report.pre_release_source_pages[0].text=f.source_quote;
    f.evidence_refs=[{document_id:'doc',page:2,quote:f.source_quote,speaker_role:'quejoso',proposition_type:'allegation',adoption_status:'party_position'}];
    f.metadata.claim_entailment_diagnostic={claim_action:'RECLASSIFY',final_reportable:true,entailment_status:'ENTAILED',repaired_description:f.description,repaired_claim:f.title};
    f.metadata.semantic_support_review={version:1,verdict:'supported',hash:supportInput(f,d.report.full_report.pre_release_source_pages).hash,supporting_quote:f.source_quote,reason:'Independent review of the repaired party claim.'};
    return d;
  }
  it('preserves a completed review of the repaired party claim through report taxonomy and restricted presentation',()=>{
    const out=composeFinalReportPayload(partyFixture());
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
    expect(out.report_presentation.finding_cards[0].finding.proposition_type).toBe('party_argument');
    expect(out.report_presentation.finding_cards[0].finding.evidence_refs[0].citation_id).toMatch(/^citation_/);
  });
  it('rebinds a legacy literal source citation to its independently reviewed party proposition',()=>{
    const d=partyFixture(),f=d.findings[0];
    f.evidence_refs[0].proposition_supported=f.source_quote;
    f.evidence_refs[0].verification_status='verified';
    const out=composeFinalReportPayload(d);
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
    expect(out.report_presentation.finding_cards[0].finding.evidence_refs[0].proposition_supported).toBe(f.description);
  });
  it.each(['review','description','speaker','adoption','repair'])('rejects a repaired party claim with changed %s',change=>{
    const d=partyFixture(),f=d.findings[0];
    if(change==='review')f.metadata.semantic_support_review.hash='stale';
    if(change==='description')f.description='El tribunal violó el derecho de defensa.';
    if(change==='speaker')f.speaker_role='reviewing_court';
    if(change==='adoption')f.adoption_status='adopted';
    if(change==='repair')f.metadata.claim_entailment_diagnostic.repaired_description='Otra afirmación.';
    expect(validateFinalReportContract(composeFinalReportPayload(d)).ok).toBe(false);
  });
});
