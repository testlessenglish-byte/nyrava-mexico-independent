import { describe, expect, it } from 'vitest';
import { structuredMatterDomains } from '../composed-matter-scope';
import { detectMatterSubtype, isEngineAllowedForSubtype } from '../matter-subtype';
import { isAnalyzerAllowed } from '../../intelligence/practice-areas';
import { effectiveMxProfile, isStageRelevantForCaseType } from '../../execution/mx-pipeline';
import { deriveActivations } from '../../intelligence/cross-domain.server';

describe('explicit amparo vehicle retains substantive family law', () => {
  it.each(['amparo_directo_revision','amparo_directo_en_revision','amparo_en_revision','amparo_revision','amparo_indirecto_en_revision'])('composes %s without requiring a duplicate underlying field', proceduralVehicle => {
    const identity = { caseType:'familiar', underlyingMateria:null, proceduralVehicle };
    const domains = structuredMatterDomains(identity);
    expect(domains).toEqual(['familiar','amparo']);
    expect(isAnalyzerAllowed('familiar','agent:constitutional_rights_mapping',domains)).toBe(true);
    expect(isAnalyzerAllowed('familiar','agent:custody_best_interest_analysis',domains)).toBe(true);
    expect(isAnalyzerAllowed('familiar','agent:sat_audit_review',domains)).toBe(false);
    expect(effectiveMxProfile('familiar',null,null,proceduralVehicle,null)).toBe('constitucional');
    expect(isStageRelevantForCaseType('familiar','constitutional',null,proceduralVehicle,null)).toBe(true);
    const subtype = detectMatterSubtype('familiar','guarda y custodia', { proceduralVehicle, activeMaterias:domains });
    expect(isEngineAllowedForSubtype(subtype,'agent:constitutional_rights_mapping')).toBe(true);
    expect(isEngineAllowedForSubtype(subtype,'agent:authority_notification_validation')).toBe(false);
    expect(isEngineAllowedForSubtype(subtype,'agent:standing_procedencia')).toBe(false);
  });
  it.each(['amparo_directo','amparo_indirecto','directo','indirecto'])('keeps trial specialists available for %s', proceduralVehicle => {
    const domains=structuredMatterDomains({ caseType:'familiar', proceduralVehicle });
    const subtype=detectMatterSubtype('familiar','guarda y custodia', { proceduralVehicle,activeMaterias:domains });
    expect(domains).toEqual(['familiar','amparo']);
    expect(isEngineAllowedForSubtype(subtype,'agent:standing_procedencia')).toBe(true);
  });
  it('preserves explicit subject behind outer amparo and does not invent one', () => {
    expect(structuredMatterDomains({caseType:'amparo',underlyingMateria:'familiar'})).toEqual(['amparo','familiar']);
    expect(structuredMatterDomains({caseType:'amparo'})).toEqual(['amparo']);
    expect(structuredMatterDomains({caseType:'familiar',proceduralVehicle:'ordinario'})).toEqual(['familiar']);
    expect(structuredMatterDomains({caseType:null,proceduralVehicle:'amparo_revision'})).toEqual([]);
  });
  it('creates an auditable identity activation without needing earlier amparo findings', () => {
    const activations = deriveActivations({ baseArea:'familiar',caseType:'familiar',underlyingMateria:null,
      proceduralVehicle:'amparo_directo_revision',additionalDomains:[],findings:[],documents:[] });
    expect(activations).toEqual([expect.objectContaining({ domain:'amparo',source:'hybrid',
      trigger_id:'identity:amparo:amparo_directo_revision',evidence_finding_ids:[] })]);
    expect(deriveActivations({baseArea:'amparo',caseType:'amparo',underlyingMateria:'familiar',
      additionalDomains:[],findings:[]})).toEqual([expect.objectContaining({domain:'familiar',source:'hybrid'})]);
  });
});
