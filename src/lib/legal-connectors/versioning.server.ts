// Version history for ingested legal authorities — Phase 20 "Version
// History" requirement: every statute keeps current text, previous text,
// effective date, and amendment history, so analysis can reference the law
// as it stood at the relevant date rather than only the current text.
//
// Storage approach: public.legal_authorities holds the CURRENT version of
// each authority (one row per externalId). Every prior version is archived
// into public.legal_authority_versions (created by the migration below)
// before the row is overwritten, keyed by (authority_id, version_number).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { IngestedDocument, LegalSourceConnector } from "./types";
import { deriveAuthorityLevel } from "./authority-level";
import { sha256Hex } from "@/lib/intelligence/evidence-provenance.server";

type Db = SupabaseClient<Database>;

/**
 * Upsert an ingested document into legal_authorities. If a row with this
 * externalId already exists AND the text actually changed, the prior
 * version is archived first — this is what makes "the law as it stood on
 * date X" queries possible later.
 */
export async function upsertAuthorityWithVersioning(
  db: Db,
  connector: LegalSourceConnector,
  doc: IngestedDocument,
): Promise<{ authorityId: string; versioned: boolean }> {
  const connectorCode = connector.code;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: lookupError } = await (db as any)
    .from("legal_authorities")
    .select("id,body,metadata,authority_level,source_url,published_at,effective_at,verification_status,content_hash")
    .eq("metadata->>external_id", doc.externalId)
    .eq("metadata->>connector_code", connectorCode)
    .maybeSingle();
  if (lookupError) throw new Error(`Authority lookup failed: ${lookupError.message}`);

  const metadata: Record<string, unknown> = { ...(existing?.metadata ?? {}), ...(doc.metadata ?? {}), external_id: doc.externalId, connector_code: connectorCode };
  // Connector payloads cannot manufacture or replace a review attestation.
  delete metadata.review_attestation;
  if (existing?.metadata?.review_attestation) metadata.review_attestation = existing.metadata.review_attestation;

  if (!existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (db as any)
      .from("legal_authorities")
      .insert({
        kind: doc.kind,
        jurisdiction: doc.jurisdiction,
        title: doc.title,
        short_title: doc.shortTitle ?? null,
        issuer: doc.issuer ?? null,
        citation: doc.citation ?? null,
        published_at: doc.publishedAt ?? null,
        effective_at: doc.effectiveAt ?? null,
        source_url: doc.sourceUrl,
        body: doc.rawText,
        metadata,
        authority_level: deriveAuthorityLevel(doc.kind, doc.jurisdiction),
        content_hash: sha256Hex(doc.rawText),
        // Transport format does not establish legal/source verification.
        verification_status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Insert failed for ${doc.externalId}: ${error.message}`);
    return { authorityId: inserted.id as string, versioned: false };
  }

  const textChanged = existing.body !== doc.rawText;
  const provenanceChanged = (existing.source_url ?? null) !== (doc.sourceUrl ?? null)
    || (existing.published_at ?? null) !== (doc.publishedAt ?? null)
    || (existing.effective_at ?? null) !== (doc.effectiveAt ?? null);
  const reviewChanged = textChanged || provenanceChanged;
  if (reviewChanged) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: archiveError } = await (db as any).from("legal_authority_versions").insert({
      authority_id: existing.id,
      body: existing.body,
      metadata: { ...(existing.metadata ?? {}), version_snapshot: {
        source_url: existing.source_url, published_at: existing.published_at,
        effective_at: existing.effective_at, verification_status: existing.verification_status,
        authority_level: existing.authority_level,
      } },
      archived_at: new Date().toISOString(),
      // Hash of the version being ARCHIVED (the outgoing text), not the
      // incoming one — this row is the historical snapshot.
      content_hash: sha256Hex(existing.body ?? ""),
    });
    if (archiveError) throw new Error(`Authority archive failed: ${archiveError.message}`);
    delete metadata.review_attestation;
    metadata.review_invalidated = { reason: textChanged ? 'source_text_changed' : 'source_provenance_changed', previous_content_hash: sha256Hex(existing.body ?? ''), at: new Date().toISOString() };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update = (db as any)
    .from("legal_authorities")
    .update({
      title: doc.title,
      short_title: doc.shortTitle ?? null,
      issuer: doc.issuer ?? null,
      citation: doc.citation ?? null,
      published_at: doc.publishedAt ?? null,
      effective_at: doc.effectiveAt ?? null,
      body: doc.rawText,
      metadata,
      source_url: doc.sourceUrl,
      ...(reviewChanged ? { verification_status: 'pending' } : {}),
      updated_at: new Date().toISOString(),
      content_hash: sha256Hex(doc.rawText),
      // Never overwrite a level that's already set — either this same
      // function set it on a prior ingest, or a human reviewer corrected
      // it; either way it's not this run's call to change.
      authority_level: existing.authority_level ?? deriveAuthorityLevel(doc.kind, doc.jurisdiction),
    })
    .eq("id", existing.id);
  // Compare-and-swap prevents an older ingestion from overwriting a concurrent
  // body change. Archiving is fail-closed; a fully transactional RPC remains a
  // separate migration so this patch requires no live schema change.
  update = existing.content_hash == null ? update.is('content_hash', null) : update.eq('content_hash', existing.content_hash);
  const { data: updated, error: updateErr } = await update.select('id');
  if (updateErr) throw new Error(`Update failed for ${doc.externalId}: ${updateErr.message}`);
  if (!updated?.length) throw new Error(`Authority changed concurrently: ${doc.externalId}`);

  return { authorityId: existing.id as string, versioned: reviewChanged };
}
