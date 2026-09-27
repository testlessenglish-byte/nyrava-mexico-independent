
const fs = require("fs");
let code = fs.readFileSync("src/lib/pipeline-runner.server.ts", "utf8");
const replacement = `      if (FATAL_STAGES.has(key)) {
        const isSubstantive = /REPORT_WRITER_CITATION_UNRESOLVED|CITATION_INTEGRITY|hallucination|not supported|verificable|sin pasaje/i.test(msg);
        if (!isSubstantive) {
          const { data: cRow } = await (supabase as any).from("cases").select("stall_auto_retry_count").eq("id", caseId).maybeSingle();
          const retries = cRow?.stall_auto_retry_count ?? 0;
          if (retries < 3) {
            await (supabase as any).from("cases").update({ stall_auto_retry_count: retries + 1 }).eq("id", caseId);
            console.warn(\`[pipeline] Technical failure at ${s.key}, auto-retrying (${retries + 1}/3): ${msg}\`);
            try {
              const { requeueForContinuation } = await import("@/lib/pipeline-stall.server");
              await requeueForContinuation(supabase, caseId, s.key);
            } catch (rqErr) {
              console.warn(\`[pipeline] re-queue failed after technical error\`, rqErr);
            }
            return { kind: "checkpoint", index: i };
          }
        }
        await updateCase(
          {
            status: "failed",
            status_message: key === "report"
              ? "Revisión requerida: el informe requiere atención."
              : \`Revisión requerida en ${s.label}\`,
            error: msg.slice(0, 2000),
            next_stage: s.key,
          },
          \`stage.failed:${s.key}\`,
        );
        return { kind: "fatal_failed", message: \`[${s.label}] ${msg}\` };
      }`;
code = code.replace(
  /if \(FATAL_STAGES\.has\(key\)\) \{\s*await updateCase\([\s\S]*?return \{ kind: "fatal_failed"[^\n]+\n\s*\}/,
  replacement
);
fs.writeFileSync("src/lib/pipeline-runner.server.ts", code);
