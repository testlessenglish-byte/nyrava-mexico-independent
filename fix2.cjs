const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/citation-production.ts', 'utf8');
f = f.replace(
  'createCanonicalCitation(ref, String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ""), pages, index, proof)',
  "(() => {\n" +
  "  const atomicFinding = findings.find(f => f.metadata?.mandatory_decision_core_id === item.id && \n" +
  "    Array.isArray(f.evidence_refs) && f.evidence_refs.some((r) => \n" +
  "      r.document_id === ref.document_id && String(r.quote).trim() === String(ref.quote ?? ref.source_quote).trim()\n" +
  "    ));\n" +
  "  const atomicProposition = atomicFinding && atomicFinding.description ? String(atomicFinding.description) : item.text;\n" +
  "  const atomicProof = atomicFinding && atomicFinding.metadata?.semantic_support_review ? \n" +
  "    { claim: Object.fromEntries(['id','title','description','source_document_id','source_page','source_quote'].filter(k => atomicFinding[k] !== undefined).map(k => [k, atomicFinding[k]])), review: atomicFinding.metadata.semantic_support_review } : proof;\n" +
  "  return createCanonicalCitation(ref, atomicProposition, pages, index, atomicProof);\n" +
  "})()"
);
fs.writeFileSync('src/lib/reporting/citation-production.ts', f);
