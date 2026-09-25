import { normalizeMexicanCaseType, type MexicanCaseType } from './mexico';

export function amparoVehicleKind(value: unknown): 'trial' | 'revision' | null {
  const vehicle = String(value ?? '').trim().toLowerCase();
  if (['amparo_directo_revision','amparo_directo_en_revision','amparo_en_revision',
    'amparo_revision','amparo_indirecto_en_revision'].includes(vehicle)) return 'revision';
  if (['amparo_directo','amparo_indirecto','directo','indirecto'].includes(vehicle)) return 'trial';
  return null;
}
/** Explicit dimensions compose. An absent duplicate underlying field never erases caseType. */
export function structuredMatterDomains(identity: { caseType?: unknown; underlyingMateria?: unknown; proceduralVehicle?: unknown }): MexicanCaseType[] {
  const base = normalizeMexicanCaseType(identity.caseType);
  if (!base) return [];
  const domains = new Set<MexicanCaseType>([base]);
  const underlying = normalizeMexicanCaseType(identity.underlyingMateria);
  if (underlying) domains.add(underlying);
  if (amparoVehicleKind(identity.proceduralVehicle)) domains.add('amparo');
  return [...domains];
}
