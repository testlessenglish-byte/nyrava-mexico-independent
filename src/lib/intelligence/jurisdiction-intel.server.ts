// Server side of the `jurisdiction_intel` stage ("Inteligencia de
// JurisdicciÃ³n"). Reads the case row + extracted corpus, resolves the Mexican
// jurisdiction profile deterministically, and persists it on
// cases.jurisdiction_profile so every downstream engine and the report can
// cite the correct codes and courts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type JurisdictionProfile } from "./mx-jurisdiction";
import { loadCaseLawProfile } from "../legal/case-law-context.server";

type Db = SupabaseClient<Database>;

const CORPUS_CHAR_LIMIT = 120_000;

export async function loadCaseCorpusText(db: Db, caseId: string, limit = CORPUS_CHAR_LIMIT): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: corpusError } = await (db as any)
    .from("documents")
    .select("extracted_text")
    .eq("case_id", caseId)
    .is("archived_at", null);
  if (corpusError) throw new Error(`Corpus read failed: ${corpusError.message}`);
  const rows = (data ?? []) as { extracted_text: string | null }[];
  let out = "";
  for (const r of rows) {
    if (!r.extracted_text) continue;
    out += `${r.extracted_text}\n\n`;
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export async function runJurisdictionIntelligence(args: {
  db: Db;
  caseId: string;
}): Promise<JurisdictionProfile> {
  const { db, caseId } = args;
  const profile = await loadCaseLawProfile(db, caseId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("cases")
    .update({ jurisdiction_profile: profile as unknown as Record<string, unknown> })
    .eq("id", caseId);
  if (error) throw new Error(`No se pudo guardar el perfil de jurisdicciÃ³n: ${error.message}`);

  return profile;
}

