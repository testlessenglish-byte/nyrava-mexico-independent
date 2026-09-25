import { describe, expect, it } from 'vitest';
import { evaluateCdmxProceduralTransition as evaluate, CDMX_TRANSITION_SOURCES } from '../cdmx-procedural-transition';

const base = { courtEntity: 'ciudad_de_mexico', courtOrder: 'local' as const,
  proceedingType: 'familiar_sin_divorcio' as const, proceedingStartedOn: '2024-12-01', asOf: '2026-09-24',
  evidence: { startDateRefs: ['filing:1'], proceedingTypeRefs: ['claim:2'] } };
describe('CDMX limited verified procedural transition', () => {
  it('uses the original December family boundary', () => {
    expect(evaluate(base).status).toBe('cnpcf');
    expect(evaluate({ ...base, proceedingStartedOn: '2024-11-30' }).status).toBe('legacy');
  });
  it.each(['civil_hipotecario_oral', 'civil_arrendamiento_oral'] as const)('covers original %s', proceedingType => {
    expect(evaluate({ ...base, proceedingType }).effectiveFrom).toBe('2024-12-01');
  });
  it.each(['civil_ordinario_oral','civil_jurisdiccion_voluntaria','familiar_divorcio','familiar_sucesorio'] as const)('postpones %s and does not revive superseded dates', proceedingType => {
    expect(evaluate({ ...base, proceedingType, proceedingStartedOn: '2026-06-01' }).status).toBe('legacy');
    expect(evaluate({ ...base, proceedingType, proceedingStartedOn: '2027-04-01', asOf: '2027-04-01' }).status).toBe('cnpcf');
  });
  it('grandfathers existing proceedings after rollout', () => {
    expect(evaluate({ ...base, proceedingType: 'civil_ordinario_oral', proceedingStartedOn: '2027-03-31', asOf: '2027-04-02' }).status).toBe('legacy');
  });
  it('requires joint election proof and does not permit premature election', () => {
    const old = { ...base, proceedingStartedOn: '2024-11-30' };
    expect(evaluate({ ...old, jointElection: { electedOn:'2025-01-01', allParties:true, evidenceRefs:['signed:1'] } }).status).toBe('cnpcf');
    expect(evaluate({ ...old, jointElection: { electedOn:'2025-01-01', allParties:true, evidenceRefs:[] } }).status).toBe('pending');
    expect(evaluate({ ...old, jointElection: { electedOn:'2024-11-30', allParties:true, evidenceRefs:['signed:1'] } }).status).toBe('pending');
  });
  it('keeps missing facts, invalid dates and unproven facts pending', () => {
    for (const patch of [{ proceedingStartedOn:null }, { proceedingType:null }, { proceedingStartedOn:'2025-02-30' }, { evidence:undefined }, { asOf:'2024-01-01' }])
      expect(evaluate({ ...base, ...patch }).status).toBe('pending');
  });
  it('does not infer local procedural law from physical federal forum location', () => {
    expect(evaluate({ ...base, courtEntity:'CMX' }).status).toBe('cnpcf');
    expect(evaluate({ ...base, courtOrder:'federal' }).status).toBe('out_of_scope');
    expect(evaluate({ ...base, courtEntity:'jalisco' }).status).toBe('out_of_scope');
    expect(evaluate({ ...base, courtOrder:null }).status).toBe('pending');
  });
  it('returns audit evidence and the actual local publication/effect dates', () => {
    expect(evaluate(base).evidenceRefs).toContain('filing:1');
    expect(CDMX_TRANSITION_SOURCES.reform2026).toMatchObject({ publicationDate:'2026-05-29', effectiveDate:'2026-05-30', verification:'primary_text_inspected' });
  });
});
