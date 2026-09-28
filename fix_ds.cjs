@
const fs = require("fs");
let f = fs.readFileSync("src/lib/intelligence/decision-summary.ts", "utf8");
f = f.replace(
  /if \(!doc \|\| !ref\.quote\?\.trim\(\) \|\| !ref\.writer_ref_id\) continue;/,
  "if (!doc || !ref.quote?.trim()) continue;"
);
f = f.replace(
  /passages\.add\(`\$\{same \? "" : `\$\{text\}\\n`\}"\$\{quote\}" \[CITE \$\{ref\.writer_ref_id\}\]`\);/,
  "const marker = ref.writer_ref_id ? `[CITE ${ref.writer_ref_id}]` : `[DOC ${doc.doc_n} p.${ref.page}]`; passages.add(`${same ? \"\" : `${text}\\n`}\"${quote}\" ${marker}`);"
);
fs.writeFileSync("src/lib/intelligence/decision-summary.ts", f);
@
