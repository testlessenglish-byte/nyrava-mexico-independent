const fs = require('fs');
let code = fs.readFileSync('src/lib/pipeline-runner.server.ts', 'utf8');

const replacement = \
      if (FATAL_STAGES.has(key)) {
        const isSubstantive = /REPORT_WRITER_CITATION_UNRESOLVED|CITATION_INTEGRITY|hallucination|not supported|verificable|sin pasaje/i.test(msg);
        if (!isSubstantive) {
          const { data: cRow } = await (supabase as any).from("cases").select("stall_auto_retry_count").eq("id", caseId).maybeSingle();
          const retries = cRow?.stall_auto_retry_count ?? 0;
          if (retries < 3) {
            await (supabase as any).from("cases").update({ stall_auto_retry_count: retries + 1 }).eq("id", caseId);
            console.warn(\\\[pipeline] Technical failure at \, auto-retrying (\/3): \\\\);
            try {
              const { requeueForContinuation } = await import("@/lib/pipeline-stall.server");
              await requeueForContinuation(supabase, caseId, s.key);
            } catch (rqErr) {
              console.warn(\\\[pipeline] re-queue failed after technical error\\\, rqErr);
            }
            return { kind: "checkpoint", index: i };
          }
        }
        await updateCase(
          {
            status: "failed",
            status_message: key === "report"
              ? "Revisión requerida: el informe requiere atención."
              : \\\Revisión requerida en \\\\,
            error: msg.slice(0, 2000),
            next_stage: s.key,
          },
          \\\stage.failed:\\\\,
        );
        return { kind: "fatal_failed", message: \\\[\] \\\\ };
      }
\;

// We replace the original FATAL_STAGES.has(key) block
code = code.replace(
  /if \(FATAL_STAGES\.has\(key\)\) \{\s*await updateCase\([\s\S]*?return \{ kind: "fatal_failed"[^\n]+\n\s*\}/,
  replacement.trim()
);
fs.writeFileSync('src/lib/pipeline-runner.server.ts', code);