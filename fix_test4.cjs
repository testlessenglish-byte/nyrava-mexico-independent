const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "const payload = { report: { full_report: { mandatory_decision_core: { items: result } } }, findings: [] } as any;",
  "const payload = { report: { full_report: { mandatory_decision_core: { items: result } } }, findings: [], report_presentation: { capability: {}, governance: {} } } as any;"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
