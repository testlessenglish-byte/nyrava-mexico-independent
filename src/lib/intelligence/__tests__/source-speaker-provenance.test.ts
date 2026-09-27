import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { attributeFindingsFromSource, validateSourceAttribution } from '../source-speaker-provenance';
import { evaluateAttribution, evaluateClaimEntailment } from '../claim-evidence-entailment';
import { supportInput } from '../claim-support-review';

// Verbatim excerpt and page boundary from the saved ADR 7286/2017 extraction.
const pages = [
  {
    document_id: 'adr-source', page: 10,
    text: '35. Hasta aquí la reseña de las consideraciones del tribunal colegiado.\n' +
      '36. Amparo directo en revisión 7286/2017. Inconformes con la anterior resolución, ' +
      'los quejosos, por propio derecho interpusieron recurso de revisión formulando cinco motivos de agravio, ' +
      'con los siguientes razonamientos:\n37. Primero. Alega que el Tribunal Colegiado efectuó un análisis erróneo.',
  },
  {
    document_id: 'adr-source', page: 11,
    text: '41. Lo referido por el órgano colegiado parte de un análisis incorrecto, pues –estiman los recurrentes– ' +
      'las opiniones emitidas en el ejercicio del derecho de defensa no deben coartarse.\n' +
      '43. Segundo. El Tribunal Colegiado omitió realizar una interpretación del\n' +
      'artículo 17 constitucional, consistente en el derecho fundamental de\n' +
      'defensa.\n44. No se comparte la idea del Tribunal Colegiado.',
  },
];
const quote = 'El Tribunal Colegiado omitió realizar una interpretación del\nartículo 17 constitucional, consistente en el derecho fundamental de\ndefensa.';
const ref = { document_id: 'adr-source', page: 11, quote };

describe('ADR recurrentes attribution at the source boundary', () => {
  it('qualifies the saved finding as a party argument without dropping the Article 17 proposition', () => {
    const [finding] = attributeFindingsFromSource([{
      id: 'saved-finding', source_document_id: 'adr-source', source_page: 11, source_quote: quote,
      title: 'Falta de análisis del derecho fundamental de defensa',
      description: 'El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional.',
      speaker_role: null, proposition_type: null, adoption_status: null,
    }], pages);
    expect(finding.speaker_role).toBe('quejoso');
    expect(finding.proposition_type).toBe('allegation');
    expect(finding.adoption_status).toBe('party_position');
    expect(finding.description).toContain('Los recurrentes sostuvieron que el Tribunal Colegiado omitió');
    expect(finding.metadata?.semantic_support_review).toBeUndefined();
    expect(evaluateClaimEntailment({
      id: finding.id, title: finding.title, description: finding.description,
      source_document_id: 'adr-source', source_page: 11, source_quote: quote,
      speaker_role: finding.speaker_role,
    })).toMatchObject({ speaker: 'party', attribution_type: 'party_allegation', final_reportable: true });
  });

  it('accepts correct attribution and blocks the same passage misreported as a court finding', () => {
    expect(validateSourceAttribution(
      'Los recurrentes sostuvieron que el Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional.',
      ref, pages,
    ).ok).toBe(true);
    expect(validateSourceAttribution(
      'El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional.',
      ref, pages,
    )).toMatchObject({ ok: false, reason: 'party_argument_misattributed_as_court_fact' });
  });

  it('does not treat a named tribunal as the speaker of a grievance', () => {
    const claim = 'El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional.';
    expect(evaluateAttribution(claim, quote, null).speaker).toBe('unattributed');
    expect(evaluateAttribution(claim, quote, 'recurrente').speaker).toBe('party');
    expect(evaluateAttribution('El Tribunal Colegiado resolvió la cuestión.',
      'Se niega el amparo.', 'lower_court').speaker).toBe('lower_court');
  });

  it('does not carry a party label across a later court-reasoning heading', () => {
    const later = [
      pages[0],
      { document_id: 'adr-source', page: 11,
        text: 'Los recurrentes alegan una omisión.\nIII. PROCEDENCIA DEL RECURSO\n' +
          'Esta Primera Sala considera que no se actualizan los requisitos.\n' +
          'Se desecha por improcedente el recurso de revisión.' },
    ];
    expect(validateSourceAttribution('La Primera Sala desechó el recurso de revisión.', {
      document_id: 'adr-source', page: 11,
      quote: 'Se desecha por improcedente el recurso de revisión.',
    }, later).ok).toBe(true);
  });

  if (process.env.NYRAVA_RELEASE_REPLAY) {
    it('replays the actual saved ADR finding against the actual extracted pages', () => {
      const saved = JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY!, 'utf8'));
      const finding = saved.case_findings.find((row: any) =>
        row.id === 'd7cf8f4c-6a90-498c-8ef3-7aa44bdb2467');
      expect(finding).toBeDefined();
      const [qualified] = attributeFindingsFromSource([finding], saved.document_pages);
      expect(qualified.speaker_role).toBe('quejoso');
      expect(qualified.description).toMatch(/^Los recurrentes sostuvieron que el Tribunal Colegiado omitió/);
      expect(supportInput(qualified, saved.document_pages).context).toContain('estiman los recurrentes');
      const source = {
        document_id: finding.source_document_id,
        page: finding.source_page,
        quote: finding.source_quote,
      };
      expect(validateSourceAttribution(qualified.description, source, saved.document_pages).ok).toBe(true);
      expect(validateSourceAttribution(finding.description, source, saved.document_pages).ok).toBe(false);
    });
  }
});
