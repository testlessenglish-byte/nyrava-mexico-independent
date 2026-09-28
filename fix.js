const fs = require('fs');
let f = fs.readFileSync('src/lib/reporting/citation-production.ts', 'utf8');
f = f.replace(
  'createCanonicalCitation(ref, item.text, pages, index, proof)',
  'createCanonicalCitation(ref, String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ""), pages, index, proof)'
);
fs.writeFileSync('src/lib/reporting/citation-production.ts', f);
