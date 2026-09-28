const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/migratorio-pre-release.ts', 'utf8');
f = f.replace(
  "citationErrors.push(:  sin pasaje verificable en el anexo.);",
  "citationErrors.push(':  sin pasaje verificable en el anexo.');"
);
fs.writeFileSync('src/lib/reporting/migratorio-pre-release.ts', f);
