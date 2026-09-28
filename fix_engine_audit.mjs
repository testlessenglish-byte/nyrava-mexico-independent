import fs from 'fs';

let file = fs.readFileSync('src/lib/intelligence/engine-audit.server.ts', 'utf8');

const errorsHeader = \
export class DuplicateEngineActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateEngineActiveError";
  }
}

export class StaleExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleExecutionError";
  }
}
\;

file = file.replace('export type EngineName =', errorsHeader + '\nexport type EngineName =');

file = file.replace(
  /if \\(activeRun\\?\\.id\\) \\{[^}]*await emitEvent[^}]+\\}[^}]+\\}\\);[^}]*console\\.info\\([^)]+\\);[^}]*return undefined as unknown as T;[^}]*\\}/g,
  \if (activeRun?.id) {
    await emitEvent(db, args.caseId, args.engine, \\\\\\ ejecución duplicada bloqueada\\\, {
      level: "warn",
      meta: { engine: args.engine, status: "duplicate_blocked", active_since: activeRun.started_at },
    });
    console.info(\\\[engine-audit] runEngine(\\\): duplicate run blocked — active since \\\\\\);
    throw new DuplicateEngineActiveError(\\\Engine \\\ is actively running (since \\\)\\\);
  }\
);

file = file.replace(
  /if \\(!rowId && insertErr && isUniqueViolation\\(insertErr\\)\\) \\{[^}]*await emitEvent[^}]+\\}[^}]+\\}\\);[^}]*console\\.info\\([^)]+\\);[^}]*return undefined as unknown as T;[^}]*\\}/g,
  \if (!rowId && insertErr && isUniqueViolation(insertErr)) {
    await emitEvent(db, args.caseId, args.engine, \\\\\\ ejecución duplicada bloqueada\\\, {
      level: "warn",
      meta: { engine: args.engine, status: "duplicate_blocked" },
    });
    console.info(\\\[engine-audit] runEngine(\\\): unique violation duplicate run blocked\\\);
    throw new DuplicateEngineActiveError(\\\Engine \\\ is actively running (concurrent insert blocked)\\\);
  }\
);

const finalizeUpdateStr = \
      if (args.executionId) {
        const { data: curCase } = await (db as any).from("cases").select("execution_id").eq("id", args.caseId).maybeSingle();
        if (curCase && curCase.execution_id !== args.executionId) {
          throw new StaleExecutionError(\\\Stale worker: case execution \\\ vs worker \\\\\\);
        }
      }

      const { error: updErr } = await db
        .from("pipeline_engine_runs")
\;

file = file.replace(
  /\\s*const \\{ error: updErr \\} = await db\\s*\\.from\\("pipeline_engine_runs"\\)/g,
  \\\
);

fs.writeFileSync('src/lib/intelligence/engine-audit.server.ts', file);
console.log('done');
