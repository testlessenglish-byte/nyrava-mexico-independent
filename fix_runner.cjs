const fs = require('fs');

let file = fs.readFileSync('src/lib/pipeline-runner.server.ts', 'utf8');

const dynamicCheck = \
    // Dynamic DB check: if in-memory cache says not done, verify authoritative state.
    // This prevents stale memory from causing dual execution.
    if (!alreadyDone(key)) {
      const { data: liveRun } = await (supabase as any)
        .from("pipeline_engine_runs")
        .select("status")
        .eq("case_id", caseId)
        .eq("engine", engineForStage(key))
        .eq("execution_id", executionId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (liveRun) {
        if (DONE_STATUSES.has(liveRun.status)) {
          completed.add(key);
          skippedThisTick.push(s.key);
          return { kind: "skipped" };
        }
        if (liveRun.status === "running" || liveRun.status === "queued") {
          console.warn(\\\[pipeline] yielding stage \\\: actively running in another worker\\\);
          return { kind: "checkpoint", index: i };
        }
      }
    } else {
      completed.add(key);
      skippedThisTick.push(s.key);
      return { kind: "skipped" };
    }
\;

file = file.replace(
  /if \\(alreadyDone\\(key\\)\\) \\{\\s*completed\\.add\\(key\\);\\s*skippedThisTick\\.push\\(s\\.key\\);\\s*return \\{ kind: "skipped" \\};\\s*\\}/,
  dynamicCheck
);

const catchBlockStr = \
    } catch (e) {
      if (e instanceof Error && e.name === "DuplicateEngineActiveError") {
         console.warn(\\\[pipeline] yielding stage \\\: DuplicateEngineActiveError caught\\\);
         return { kind: "checkpoint", index: i };
      }
      if (e instanceof Error && e.name === "StaleExecutionError") {
         console.warn(\\\[pipeline] aborting stage \\\: StaleExecutionError caught\\\);
         return { kind: "cancelled", index: i };
      }
      const msg = e instanceof Error ? e.message : String(e);
\;

file = file.replace(
  /\\} catch \\(e\\) \\{\\s*const msg = e instanceof Error \\? e\\.message : String\\(e\\);/,
  catchBlockStr
);

fs.writeFileSync('src/lib/pipeline-runner.server.ts', file);
console.log('done');