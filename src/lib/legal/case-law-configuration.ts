import { STATE_JURISDICTION_OPTIONS } from '../intelligence/jurisdictions';
import { CDMX_PROCEEDING_TYPES, type CdmxProceedingType } from './cdmx-procedural-transition';

export function parseProceedingStartedOn(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid original commencement date');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || value > new Date().toISOString().slice(0,10))
    throw new Error('Original commencement must be a real date no later than today');
  return value;
}

export function parseCivilFamilyProceeding(value: unknown): CdmxProceedingType | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !CDMX_PROCEEDING_TYPES.includes(value as CdmxProceedingType)) throw new Error('Unsupported civil/family proceeding');
  return value as CdmxProceedingType;
}

export function needsCivilFamilyProcedure(materia: string | null, underlying: string | null): boolean {
  return [materia, underlying].some(value => ['civil','familiar','inmobiliario'].includes(value ?? ''));
}

export function parseApplicableLawState(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !STATE_JURISDICTION_OPTIONS.some(s => s.value === value)) {
    throw new Error('Invalid applicable-law entity');
  }
  return value;
}

/** Changes to either law or forum invalidate analyses built under the old scope. */
export function legalScopeChanged(before: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  const metadata = (before.matter_metadata ?? {}) as Record<string, unknown>;
  return ['jurisdiction','procedural_vehicle','underlying_materia'].some(key =>
    patch[key] !== undefined && (patch[key] || null) !== (before[key] || null)) ||
    ['applicable_law_state','proceeding_started_on','civil_family_proceeding'].some(key =>
      patch[key] !== undefined && (patch[key] || null) !== (metadata[key] || null));
}
