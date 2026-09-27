
const fs = require("fs");
let lines = fs.readFileSync("src/lib/reporting/migratorio-pre-release.ts", "utf8").split("\n");
lines[54] = "        citationErrors.push(`${key}: ${m[0]} sin pasaje verificable en el anexo.`);";
fs.writeFileSync("src/lib/reporting/migratorio-pre-release.ts", lines.join("\n"));
