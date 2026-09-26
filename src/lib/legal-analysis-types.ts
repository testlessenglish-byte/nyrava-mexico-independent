import {
  MX_CASE_TYPES,
  MX_CASE_TYPE_LABELS,
  isMexicanCaseType,
  type MexicanCaseType,
} from "./jurisdiction/mexico-types";

export const LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_ES =
  "Este tipo de análisis jurídico aún no está disponible para nuevos análisis.";
export const LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_EN =
  "This legal analysis type is not currently available for new analyses.";

export function getLegalAnalysisTypeDisabledMessage(
  materiaOrLocale?: string | null,
  maybeLocale?: string,
): string {
  let materiaCode: MexicanCaseType | undefined;
  let locale = maybeLocale;
  if (materiaOrLocale === "es" || materiaOrLocale === "en") {
    locale = materiaOrLocale;
  } else if (materiaOrLocale) {
    const norm = materiaOrLocale.toLowerCase().trim();
    if (isMexicanCaseType(norm)) {
      materiaCode = norm;
    }
  }

  const isEn = Boolean(locale?.startsWith("en"));
  if (materiaCode && MX_CASE_TYPE_LABELS[materiaCode]) {
    const labels = MX_CASE_TYPE_LABELS[materiaCode];
    return isEn
      ? `${labels.en} is not currently available for new analyses.`
      : `${labels.es} aún no está disponible para nuevos análisis.`;
  }

  return isEn
    ? LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_EN
    : LEGAL_ANALYSIS_TYPE_DISABLED_MESSAGE_ES;
}

export interface LegalAnalysisTypeConfig {
  code: MexicanCaseType;
  name_es: string;
  name_en: string;
  enabled: boolean;
  display_order: number;
  updated_at?: string;
}

/**
 * Initial launch configuration:
 * Only Familiar, Civil, Penal, and Migratorio are ON.
 * All other 10 Mexican materias are OFF (Coming Soon).
 */
export const INITIAL_LEGAL_ANALYSIS_TYPES_STATE: Record<MexicanCaseType, boolean> = {
  familiar: true,
  civil: true,
  penal: true,
  migratorio: true,
  mercantil: false,
  laboral: false,
  administrativo: false,
  fiscal: false,
  amparo: false,
  electoral: false,
  agrario: false,
  constitucional: false,
  ambiental: false,
  inmobiliario: false,
};

export const DEFAULT_LEGAL_ANALYSIS_TYPES: LegalAnalysisTypeConfig[] = [
  {
    code: "familiar",
    name_es: MX_CASE_TYPE_LABELS.familiar.es,
    name_en: MX_CASE_TYPE_LABELS.familiar.en,
    enabled: true,
    display_order: 1,
  },
  {
    code: "civil",
    name_es: MX_CASE_TYPE_LABELS.civil.es,
    name_en: MX_CASE_TYPE_LABELS.civil.en,
    enabled: true,
    display_order: 2,
  },
  {
    code: "penal",
    name_es: MX_CASE_TYPE_LABELS.penal.es,
    name_en: MX_CASE_TYPE_LABELS.penal.en,
    enabled: true,
    display_order: 3,
  },
  {
    code: "migratorio",
    name_es: MX_CASE_TYPE_LABELS.migratorio.es,
    name_en: MX_CASE_TYPE_LABELS.migratorio.en,
    enabled: true,
    display_order: 4,
  },
  {
    code: "mercantil",
    name_es: MX_CASE_TYPE_LABELS.mercantil.es,
    name_en: MX_CASE_TYPE_LABELS.mercantil.en,
    enabled: false,
    display_order: 5,
  },
  {
    code: "laboral",
    name_es: MX_CASE_TYPE_LABELS.laboral.es,
    name_en: MX_CASE_TYPE_LABELS.laboral.en,
    enabled: false,
    display_order: 6,
  },
  {
    code: "administrativo",
    name_es: MX_CASE_TYPE_LABELS.administrativo.es,
    name_en: MX_CASE_TYPE_LABELS.administrativo.en,
    enabled: false,
    display_order: 7,
  },
  {
    code: "fiscal",
    name_es: MX_CASE_TYPE_LABELS.fiscal.es,
    name_en: MX_CASE_TYPE_LABELS.fiscal.en,
    enabled: false,
    display_order: 8,
  },
  {
    code: "amparo",
    name_es: MX_CASE_TYPE_LABELS.amparo.es,
    name_en: MX_CASE_TYPE_LABELS.amparo.en,
    enabled: false,
    display_order: 9,
  },
  {
    code: "electoral",
    name_es: MX_CASE_TYPE_LABELS.electoral.es,
    name_en: MX_CASE_TYPE_LABELS.electoral.en,
    enabled: false,
    display_order: 10,
  },
  {
    code: "agrario",
    name_es: MX_CASE_TYPE_LABELS.agrario.es,
    name_en: MX_CASE_TYPE_LABELS.agrario.en,
    enabled: false,
    display_order: 11,
  },
  {
    code: "constitucional",
    name_es: MX_CASE_TYPE_LABELS.constitucional.es,
    name_en: MX_CASE_TYPE_LABELS.constitucional.en,
    enabled: false,
    display_order: 12,
  },
  {
    code: "ambiental",
    name_es: MX_CASE_TYPE_LABELS.ambiental.es,
    name_en: MX_CASE_TYPE_LABELS.ambiental.en,
    enabled: false,
    display_order: 13,
  },
  {
    code: "inmobiliario",
    name_es: MX_CASE_TYPE_LABELS.inmobiliario.es,
    name_en: MX_CASE_TYPE_LABELS.inmobiliario.en,
    enabled: false,
    display_order: 14,
  },
];

// In-memory cache with 5s TTL
interface CacheEntry {
  map: Record<MexicanCaseType, boolean>;
  list: LegalAnalysisTypeConfig[];
  timestamp: number;
}
let memoryCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5000;

export function invalidateLegalAnalysisTypesCache(): void {
  memoryCache = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLegalAnalysisTypesMap(dbClient?: any): Promise<Record<MexicanCaseType, boolean>> {
  const configs = await getLegalAnalysisTypes(dbClient);
  const map = { ...INITIAL_LEGAL_ANALYSIS_TYPES_STATE };
  for (const c of configs) {
    map[c.code] = c.enabled;
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLegalAnalysisTypes(dbClient?: any): Promise<LegalAnalysisTypeConfig[]> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache.list;
  }

  // Resolve DB client (supports server-side service role client or caller-provided client)
  let client = dbClient;
  if (!client && typeof window === "undefined") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin;
    } catch {
      // Fallback
    }
  }

  if (!client) {
    // Return default launch configuration when client is unavailable (e.g. offline/isolated test)
    return DEFAULT_LEGAL_ANALYSIS_TYPES;
  }

  try {
    // 1. First attempt: legal_analysis_types table
    const { data: tableData, error: tableError } = await client
      .from("legal_analysis_types")
      .select("code,name_es,name_en,enabled,display_order,updated_at")
      .order("display_order", { ascending: true });

    if (!tableError && tableData && tableData.length > 0) {
      const result: LegalAnalysisTypeConfig[] = tableData
        .filter((row: any) => isMexicanCaseType(row.code))
        .map((row: any) => ({
          code: row.code as MexicanCaseType,
          name_es: row.name_es,
          name_en: row.name_en,
          enabled: Boolean(row.enabled),
          display_order: Number(row.display_order ?? 99),
          updated_at: row.updated_at,
        }));

      // Ensure all 14 MX case types exist in the result
      const seen = new Set(result.map((r) => r.code));
      for (const def of DEFAULT_LEGAL_ANALYSIS_TYPES) {
        if (!seen.has(def.code)) {
          result.push(def);
        }
      }
      result.sort((a, b) => a.display_order - b.display_order);

      const map = { ...INITIAL_LEGAL_ANALYSIS_TYPES_STATE };
      for (const r of result) map[r.code] = r.enabled;
      memoryCache = { map, list: result, timestamp: now };
      return result;
    }

    // 2. Second attempt: feature_flags table with keys "legal_analysis_type:<materia>"
    const { data: flagData, error: flagError } = await client
      .from("feature_flags")
      .select("key,enabled,description,updated_at")
      .like("key", "legal_analysis_type:%");

    if (!flagError && flagData && flagData.length > 0) {
      const flagMap = new Map<string, { enabled: boolean; updated_at?: string }>();
      for (const f of flagData) {
        const code = (f.key as string).replace(/^legal_analysis_type:/, "");
        flagMap.set(code, { enabled: Boolean(f.enabled), updated_at: f.updated_at });
      }

      const result: LegalAnalysisTypeConfig[] = DEFAULT_LEGAL_ANALYSIS_TYPES.map((def) => {
        const flag = flagMap.get(def.code);
        return {
          ...def,
          enabled: flag !== undefined ? flag.enabled : def.enabled,
          updated_at: flag?.updated_at,
        };
      });

      const map = { ...INITIAL_LEGAL_ANALYSIS_TYPES_STATE };
      for (const r of result) map[r.code] = r.enabled;
      memoryCache = { map, list: result, timestamp: now };
      return result;
    }
  } catch (err) {
    console.warn("[legal-analysis-types] Failed to fetch database flags, using launch defaults", err);
  }

  // Fallback to default launch config
  return DEFAULT_LEGAL_ANALYSIS_TYPES;
}

/**
 * Authoritative check whether a materia is enabled for subscribers in Nyrava México.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isLegalAnalysisTypeEnabled(
  materiaCode: string | null | undefined,
  dbClient?: any,
): Promise<boolean> {
  if (!materiaCode) return false;
  const normalized = materiaCode.toLowerCase().trim();
  if (!isMexicanCaseType(normalized)) return false;

  const map = await getLegalAnalysisTypesMap(dbClient);
  return Boolean(map[normalized as MexicanCaseType]);
}

/**
 * Asserts that a materia is enabled. Throws user-facing bilingual error if not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertLegalAnalysisTypeEnabled(
  materiaCode: string | null | undefined,
  dbClient?: any,
  locale?: string,
): Promise<void> {
  const enabled = await isLegalAnalysisTypeEnabled(materiaCode, dbClient);
  if (!enabled) {
    throw new Error(getLegalAnalysisTypeDisabledMessage(materiaCode, locale));
  }
}

/**
 * Returns only the currently enabled legal analysis types for subscribers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEnabledLegalAnalysisTypes(
  dbClient?: any,
): Promise<LegalAnalysisTypeConfig[]> {
  const types = await getLegalAnalysisTypes(dbClient);
  return types.filter((t) => t.enabled);
}

