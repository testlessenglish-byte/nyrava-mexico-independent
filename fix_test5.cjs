const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', 'utf8');
f = f.replace(
  "findings: [], report_presentation: { capability: {}, governance: {} } } as any;",
  "findings: [], report_presentation: { capability: {}, governance: {}, finding_cards: [], render_sections: [], unresolved_source_ids: [] } } as any;"
);
fs.writeFileSync('src/lib/reporting/__tests__/decision-core-certification.test.ts', f);
