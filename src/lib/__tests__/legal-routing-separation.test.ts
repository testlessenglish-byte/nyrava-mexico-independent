import { describe, expect, it } from 'vitest';
import { resolveLegalContext } from '../legal/jurisdiction-resolver';
import { authorityValidity, getApplicableAuthority } from '../legal/legal-validity';
import { buildJurisdictionProfile } from '../intelligence/mx-jurisdiction';

describe('court competence is separate from applicable law', () => {
  it('retains the declared family subject when amparo review is a separate vehicle', () => {
    const p=buildJurisdictionProfile({caseType:'familiar',proceduralVehicle:'amparo_directo_revision',jurisdictionField:'federal',underlyingMateria:null});
    expect(p.applicable_law.substantive_materia).toBe('familiar');
    expect(p.applicable_law.procedural_materia).toBe('amparo');
    expect(p.procedural_codes).toContain('Ley de Amparo');
    expect(p.applicable_law.local_state).toBeNull();
  });
  it('does not make missing jurisdiction federal or location local', () => {
    expect(resolveLegalContext({materia:'civil'}).jurisdiction_level).toBe('unresolved');
    expect(resolveLegalContext({materia:'mercantil', state:'Ciudad de México'}).jurisdiction_level).toBe('unresolved');
  });
  it('allows commercial federal law in an explicitly local court', () => {
    const ctx=resolveLegalContext({materia:'mercantil',court:'Tribunal Superior de Justicia',state:'Ciudad de México'});
    expect(ctx.jurisdiction_level).toBe('state');
    expect(ctx.applicable_authorities).toContain('ccom');
  });
  it('retains underlying family law in a federal court without inventing amparo', () => {
    const ctx=resolveLegalContext({materia:'familiar',jurisdictionValue:'federal',state:'Ciudad de México'});
    expect(ctx.state).toBe('Ciudad de México');
    expect(ctx.applicable_authorities).not.toContain('ley_amparo');
    expect(getApplicableAuthority(null,ctx,'2026-09-23').authorities.map(a=>a.id)).toContain('codigo_familiar_estatal');
  });
  it('does not claim malformed dates were checked', () => {
    for(const date of ['nonsense','2026-02-30',new Date(NaN)]) {
      expect(authorityValidity('cpeum',date).reason).toBe('unknown_date');
      expect(getApplicableAuthority(null,null,date).validity_checked).toBe(false);
    }
  });
  it('does not attach amparo procedure to an ordinary federal commercial matter', () => {
    const p=buildJurisdictionProfile({caseType:'mercantil',jurisdictionField:'federal'});
    expect(p.procedural_codes).not.toContain('Ley de Amparo');
  });
  it('does not derive commercial competence from a city mentioned in evidence', () => {
    const p=buildJurisdictionProfile({caseType:'mercantil',corpusText:'Contrato celebrado en Ciudad de México'});
    expect(p.jurisdiction_level).toBe('unresolved');
    expect(p.summary).not.toContain('Ley aplicable:');
  });
  it('does not substitute court entity for missing applicable-law entity', () => {
    const p=buildJurisdictionProfile({caseType:'familiar',jurisdictionField:'CMX'});
    expect(p.court_jurisdiction).toEqual({level:'state',entity:'CMX'});
    expect(p.applicable_law.local_state).toBeNull();
    expect(p.substantive_codes.join(' ')).not.toContain('Ciudad de México');
  });
  it('keeps a local forum separate from another entity governing the underlying law', () => {
    const p=buildJurisdictionProfile({caseType:'civil',jurisdictionField:'CMX',applicableState:'JAL'});
    expect(p.court_jurisdiction.entity).toBe('CMX');
    expect(p.applicable_law.local_state).toBe('JAL');
  });
});
