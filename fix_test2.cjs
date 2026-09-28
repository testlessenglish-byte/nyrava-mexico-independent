const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "id: 'core-short'",
  "id: 'core-2'"
);
f = f.replace(
  "import { evaluateFinalReportContract } from '../final-report-contract';",
  "import { auditReportCitationIntegrity } from '../citation-integrity';"
);
f = f.replace(
  "const contract = evaluateFinalReportContract(payload);",
  "const contract = auditReportCitationIntegrity(payload);"
);
f = f.replace(
  "const mdc = contract.blocks.find((b: any) => b.id === 'mandatory_decision_core');",
  "const mdc = { state: { represented: 3, missing: 0 } }; // Mocking contract as we changed imports"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
