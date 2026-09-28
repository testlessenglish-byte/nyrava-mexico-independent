const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "id: 'core-short'",
  "id: 'core-short'"
);
f = f.replace(
  "const findings = [",
  "const findings = [\\n    { id: 'f-short', metadata: { mandatory_decision_core_id: 'core-short', semantic_support_review: { version: 1, verdict: 'supported', hash: 'h-short', supporting_quote: pages[1].text } }, evidence_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }], description: 'Se desecha el recurso de revisión.' },"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
