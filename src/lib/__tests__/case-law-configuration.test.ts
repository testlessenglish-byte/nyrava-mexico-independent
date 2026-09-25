import { expect, it } from 'vitest';
import { parseApplicableLawState, legalScopeChanged, parseProceedingStartedOn, parseCivilFamilyProceeding, needsCivilFamilyProcedure } from '../legal/case-law-configuration';
import { CDMX_PROCEEDING_TYPES } from '../legal/cdmx-procedural-transition';
import { STATE_JURISDICTION_OPTIONS } from '../intelligence/jurisdictions';
it('accepts all 32 independent entities without CDMX fallback',()=>{
  expect(STATE_JURISDICTION_OPTIONS).toHaveLength(32);
  for(const state of STATE_JURISDICTION_OPTIONS) expect(parseApplicableLawState(state.value)).toBe(state.value);
  expect(parseApplicableLawState(null)).toBeNull();
  expect(()=>parseApplicableLawState('federal')).toThrow();
});
it('accepts real ISO commencement dates and exact supported categories, preserving unknown inputs as null',()=>{
  expect(parseProceedingStartedOn('2024-02-29')).toBe('2024-02-29');
  for (const invalid of ['2025-02-29','2024-04-31','2024-2-01','not-a-date','9999-01-01']) expect(()=>parseProceedingStartedOn(invalid)).toThrow();
  expect(parseProceedingStartedOn('')).toBeNull();
  expect(parseCivilFamilyProceeding(null)).toBeNull();
  for (const category of CDMX_PROCEEDING_TYPES) expect(parseCivilFamilyProceeding(category)).toBe(category);
  expect(()=>parseCivilFamilyProceeding('civil')).toThrow();
});
it('invalidates old procedure assessments when either declared procedural fact changes or is cleared',()=>{
  const before={matter_metadata:{proceeding_started_on:'2024-12-01',civil_family_proceeding:'civil_hipotecario_oral'}};
  for (const patch of [{proceeding_started_on:'2024-11-30'},{proceeding_started_on:null},{civil_family_proceeding:'civil_ordinario_oral'},{civil_family_proceeding:null}]) expect(legalScopeChanged(before,patch)).toBe(true);
  expect(legalScopeChanged(before,{proceeding_started_on:'2024-12-01',civil_family_proceeding:'civil_hipotecario_oral'})).toBe(false);
});
it('offers procedural facts for relevant principal or underlying areas only',()=>{
  for(const area of ['civil','familiar','inmobiliario']) {
    expect(needsCivilFamilyProcedure(area,null)).toBe(true);
    expect(needsCivilFamilyProcedure('amparo',area)).toBe(true);
  }
  expect(needsCivilFamilyProcedure('penal',null)).toBe(false);
});
it('invalidates derived outputs when law, forum, vehicle or underlying area changes',()=>{
  const before={jurisdiction:'federal',procedural_vehicle:'amparo_indirecto',underlying_materia:'familiar',matter_metadata:{applicable_law_state:'CMX'}};
  for(const patch of [{jurisdiction:'CMX'},{procedural_vehicle:'amparo_directo'},{underlying_materia:'civil'},{applicable_law_state:'JAL'},{applicable_law_state:null}]) expect(legalScopeChanged(before,patch)).toBe(true);
  expect(legalScopeChanged(before,{applicable_law_state:'CMX'})).toBe(false);
  expect(legalScopeChanged(before,{})).toBe(false);
});
