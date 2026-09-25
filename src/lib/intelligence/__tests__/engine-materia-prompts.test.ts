import { beforeEach, expect, it, vi } from 'vitest';
import { MX_CASE_TYPES } from '../../jurisdiction/mexico-types';

const state = vi.hoisted(() => ({
  matter: 'civil', underlying: null as string | null, procedure: null as string | null,
  requests: [] as Array<Record<string, any>>, writes: [] as Array<Record<string, any>>,
  response: null as Record<string, any> | null,
}));
vi.mock('../../groq.server', () => ({
  GROQ_DEFAULT_MODEL: 'test-model',
  parseJsonLoose: (text: string) => JSON.parse(text),
  callGroq: async (request: Record<string, any>) => {
    state.requests.push(request);
    if (!state.response) throw new Error('MODEL_BOUNDARY_REACHED');
    return { text: JSON.stringify(state.response), model: 'test-model' };
  },
}));
vi.mock('../../pipeline.server', () => ({ resolveCaseType: async () => state.matter, isCriminalCaseType: (s: string) => s === 'penal' }));
vi.mock('../findings.server', () => ({
  listFindings: async () => [], clearFindingsByModule: async () => {}, addFindings: async () => {},
  addGatedFindings: async () => ({ audit: {}, mode: 'full', corpus: {}, findings: [] }),
  normalizeLlmFindings: () => [],
}));
vi.mock('../evidence-gate.server', () => ({
  getAnalysisMode: async () => 'full', getLockedCaseType: async () => state.matter,
  isCivilCaseType: (s: string) => ['civil', 'mercantil'].includes(s),
  textMatchesCaseType: () => true,
  applyEvidenceGate: () => { throw new Error('Unexpected post-model evidence gate'); },
  diagnoseEvidenceGate: () => { throw new Error('Unexpected post-model evidence gate'); },
  filterByCaseType: () => { throw new Error('Unexpected post-model evidence filter'); },
  evidenceDependenciesSatisfied: () => ({ ok: true }), stripOmisionProbatoriaForCivil: (row: unknown) => row,
}));
vi.mock('../grounding.server', () => ({ buildCaseGroundingCorpus: async () => ({ docs: [] }) }));
vi.mock('../cross-domain.server', () => ({ getActiveDomains: async () => [], isCriminalEffective: (s: string) => s === 'penal' }));
vi.mock('../../mexico-lock', () => ({ mexicoLock: () => 'México', getReportLocale: async () => 'es' }));
vi.mock('../../legal/case-law-context.server', () => ({ loadLegalReasoningContext: async () => 'LEGAL CONFIGURATION — NOT SOURCE EVIDENCE\n{"source_status":"pending_verification"}' }));

import { runTheoryEngine, runOpportunityEngine, runDiscoveryGapEngine, runTrialPrepEngine } from '../engines.server';

function db() {
  return {
    from(table: string) {
      const data = table === 'documents' ? [{ id: 'd', filename: 'fuente.pdf', status: 'extracted', extracted_text: 'Hechos documentados.' }]
        : table === 'cases' ? { case_type: state.matter, underlying_materia: state.underlying, procedural_vehicle: state.procedure }
        : [];
      const query: any = {
        select: () => query, eq: () => query, order: () => query, maybeSingle: () => query,
        update: () => query, insert: () => query,
        upsert: (row: Record<string, any>) => { if (table === 'case_trial_prep') state.writes.push(row); return query; },
        then: (resolve: (value: unknown) => void) => resolve({ data, error: null }),
      };
      return query;
    },
  };
}
const args = () => ({ db: db() as never, caseId: 'case', userId: 'user', apiKey: 'test' });
beforeEach(() => { state.matter = 'civil'; state.underlying = null; state.procedure = null; state.requests = []; state.writes = []; state.response = null; });

for (const [name, engine] of Object.entries({ theory: runTheoryEngine, opportunity: runOpportunityEngine, evidence: runDiscoveryGapEngine, hearing: runTrialPrepEngine })) {
  it.each(MX_CASE_TYPES)(`${name} sends the actual %s matter instead of a civil/penal substitute`, async matter => {
    state.matter = matter;
    await expect(engine(args())).rejects.toThrow('MODEL_BOUNDARY_REACHED');
    const prompt = state.requests.at(-1)!.userContent as string;
    expect(state.requests.at(-1)!.systemInstruction).toContain('LEGAL CONFIGURATION — NOT SOURCE EVIDENCE');
    expect(prompt.split('CASE CORPUS:')[1] ?? '').not.toContain('LEGAL CONFIGURATION');
    expect(prompt).toContain(`Materia principal: ${matter}`);
    if (matter !== 'penal') expect(prompt).not.toMatch(/This is a MEXICAN PENAL matter|asunto PENAL mexicano/);
    if (matter !== 'civil') expect(prompt).not.toMatch(/This is a CIVIL matter|asunto CIVIL\/no penal/);
  });
}

it('keeps underlying penal substance distinct from an amparo review procedure', async () => {
  state.matter = 'amparo'; state.underlying = 'penal'; state.procedure = 'amparo_directo';
  await expect(runOpportunityEngine(args())).rejects.toThrow('MODEL_BOUNDARY_REACHED');
  const prompt = state.requests[0].userContent;
  expect(prompt).toContain('Materia principal: amparo');
  expect(prompt).toContain('Materia de origen: penal');
  expect(prompt).toContain('Procedimiento: amparo_directo');
  expect(prompt).not.toContain('This is a MEXICAN PENAL matter');
});

it('does not persist model-invented outcome percentages in hearing preparation', async () => {
  state.matter = 'penal';
  state.response = { opening_themes: ['Examinar las constancias citadas.'], sentencia_condenatoria_pct: 99,
    sentencia_absolutoria_pct: 1, recurso_exito_pct: 80, vinculacion_proceso_pct: 90,
    procedimiento_abreviado_pct: 60, jury_conviction_pct: 99, plaintiff_success_pct: 95 };
  const result = await runTrialPrepEngine(args());
  expect((result as Record<string, unknown> | undefined)?.sentencia_condenatoria_pct).toBeNull();
  expect(state.writes).toHaveLength(1);
  for (const field of ['jury_conviction_pct', 'jury_acquittal_pct', 'jury_appeal_pct', 'jury_settlement_pct']) expect(state.writes[0][field]).toBeNull();
  expect(state.writes[0].penal_metrics).toBeNull();
  expect(state.writes[0].civil_metrics).toBeNull();
  expect(state.requests[0].userContent).not.toContain('number (0-100)');
});
