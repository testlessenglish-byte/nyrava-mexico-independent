import { expect, it } from 'vitest';
import { formatPdfSourceQuote, pdfSafe } from '../../export';

it('reflows physical PDF line endings without losing the complete quoted order',()=>{
  const quote='ÚNICO. Devuélvanse los autos al Vigésimo Tercer Tribunal Colegiado\nen Materia Administrativa del Primer Circuito para que dicte la\nsentencia que corresponda en el amparo en revisión 118/2021 de su\níndice.';
  expect(formatPdfSourceQuote(quote)).toBe('ÚNICO. Devuélvanse los autos al Vigésimo Tercer Tribunal Colegiado en Materia Administrativa del Primer Circuito para que dicte la sentencia que corresponda en el amparo en revisión 118/2021 de su índice.');
});
it('preserves Spanish accents supplied as decomposed Unicode before font encoding',()=>{
  expect(pdfSafe('revisio\u0301n, u\u0301nico, Me\u0301xico')).toBe('revisión, único, México');
});
it('does not silently drop ellipsis and glue omitted source words together',()=>{
  expect(pdfSafe('Presidente…defiende')).toBe('Presidente...defiende');
});
