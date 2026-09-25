import { sha256Hex } from '../intelligence/evidence-provenance.server';

/** Called only after admin authorization. Attests the selected source record,
 * never case applicability or binding effect. Uses the existing metadata column. */
export async function recordAuthorityReview(db: any, authorityId: string, reviewerId: string, decision: 'verified'|'failed_verification') {
  const {data:source,error} = await db.from('legal_authorities')
    .select('body,source_url,metadata,content_hash').eq('id',authorityId).maybeSingle();
  if(error || !source) throw new Error(`Authority review source unavailable: ${error?.message ?? 'not found'}`);
  if(decision==='verified' && (!source.body?.trim() || !source.source_url?.trim()))
    throw new Error('Source text and official source reference are required for review.');
  const attestation={ reviewer_id:reviewerId, reviewed_at:new Date().toISOString(), decision,
    content_hash:sha256Hex(source.body ?? ''), source_url:source.source_url,
    scope:'source_record_review', applicability_reviewed:false, binding_effect_reviewed:false };
  let update=db.from('legal_authorities').update({verification_status:decision,
    metadata:{...(source.metadata??{}),review_attestation:attestation}}).eq('id',authorityId);
  update=source.content_hash==null?update.is('content_hash',null):update.eq('content_hash',source.content_hash);
  const result=await update.select('id');
  if(result.error) throw new Error(`Authority review failed: ${result.error.message}`);
  if(!result.data?.length) throw new Error('Source changed during review; reload and review the new version.');
}
