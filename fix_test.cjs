const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "description: '¿En el caso se satisfacen",
  "evidence_refs: [{ document_id: 'doc-1', page: 1, quote: pages[0].text }], description: '¿En el caso se satisfacen"
);
f = f.replace(
  "description: 'PRIMERO. Se desecha",
  "evidence_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }], description: 'PRIMERO. Se desecha"
);
f = f.replace(
  "description: 'SEGUNDO. Queda",
  "evidence_refs: [{ document_id: 'doc-1', page: 28, quote: pages[2].text }], description: 'SEGUNDO. Queda"
);
f = f.replace(
  "import { reportFinalContract } from '../final-report-contract';",
  "import { evaluateFinalReportContract } from '../final-report-contract';"
);
f = f.replace(
  "reportFinalContract(payload)",
  "evaluateFinalReportContract(payload)"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
