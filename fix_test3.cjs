const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "import { auditReportCitationIntegrity } from '../citation-integrity';",
  "import { validateFinalReportContract } from '../final-report-contract';"
);
f = f.replace(
  "const contract = auditReportCitationIntegrity(payload);",
  "const contract = validateFinalReportContract(payload);"
);
f = f.replace(
  "const mdc = { state: { represented: 3, missing: 0 } }; // Mocking contract as we changed imports",
  "const mdc = contract.blocks.find(b => b.id === 'mandatory_decision_core');"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
