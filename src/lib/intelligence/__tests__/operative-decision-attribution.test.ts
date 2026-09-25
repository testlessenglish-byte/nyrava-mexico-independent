import { describe, expect, it } from 'vitest';
import { extractOperativeOrders, reconcileOperativeDisposition } from '../operative-source';
import { alignDecisionCoreFindings, buildMandatoryDecisionCore, mandatoryDecisionCoreToFindings } from '../mandatory-decision-core';
import { emptyReconstruction, sourced } from '../decision-reconstruction';

const page = (page:number,text:string,document_id='doc-adr') => ({page,text,document_id,filename:'ADR.pdf'});
const pages = [
  page(7,'En sentencia dictada el doce de noviembre de dos mil diecinueve por el Juzgado Décimo Séptimo de lo Familiar se determinó lo siguiente:\nSe resuelve:\nPRIMERO. Se absuelve al demandado de la pensión solicitada.\nNotifíquese.'),
  page(53,'AMPARO DIRECTO EN REVISIÓN\nPor todo lo expuesto y fundado, se resuelve:\nPRIMERO. En la materia de la revisión, se modifica la sentencia recurrida.\nSEGUNDO. La justicia de la Unión ampara y protege a la quejosa contra la sentencia definitiva.\nTERCERO. Es infundado el recurso de revisión adhesivo.\nNotifíquese.'),
];
describe('operative decision attribution and core identity', () => {
  it('replaces a cached PRESENT historical outcome and fails closed without an operative source', () => {
    const previous=emptyReconstruction('case','2026-09-24');
    previous.disposition_remedy=sourced('Se absuelve al demandado.',[{document_id:'doc-adr',quote:'Se absuelve al demandado.'}]);
    const repaired=reconcileOperativeDisposition(previous,pages);
    expect(repaired.disposition_remedy.value).toContain('se modifica');
    expect(repaired.disposition_remedy.value).not.toContain('absuelve');
    expect(repaired.disposition_remedy.source_refs.every(ref=>ref.label==='p.53')).toBe(true);
    expect(reconcileOperativeDisposition(previous,[pages[0]]).disposition_remedy.status).toBe('NOT_FOUND_IN_CORPUS');
  });
  it('chooses final resolving court orders rather than quoted first-instance absolution', () => {
    const orders=extractOperativeOrders(pages);
    expect(orders).toHaveLength(3);
    expect(orders.every(order=>order.page===53)).toBe(true);
    expect(orders[0].text).toContain('se modifica');
    expect(orders.some(order=>order.text.includes('absuelve'))).toBe(false);
  });
  it('does not promote the only historical quoted order or choose between two decisions', () => {
    expect(extractOperativeOrders([pages[0]])).toEqual([]);
    expect(extractOperativeOrders([...pages,page(1,pages[1].text,'other')])).toEqual([]);
  });
  it('keeps operative orders spanning successive physical pages', () => {
    const result=extractOperativeOrders([page(51,'Por lo expuesto se resuelve:\nPRIMERO. Se modifica la sentencia recurrida.'),
      page(52,'SEGUNDO. La justicia de la Unión ampara y protege a la quejosa.\nNotifíquese.')]);
    expect(result.map(order=>order.page)).toEqual([51,52]);
  });
  it('does not rewrite different core propositions through a shared evidence substring', () => {
    const reconstruction=emptyReconstruction('case','2026-09-24');
    const quote='La justicia de la Unión ampara y protege a la quejosa contra la sentencia definitiva recurrida.';
    reconstruction.disposition_remedy=sourced(quote,[{document_id:'doc-adr',quote}]);
    const core=buildMandatoryDecisionCore(reconstruction);
    const holding={id:'holding',case_id:'case',user_id:'u',source_module:'decision_core',title:'Historic holding',
      metadata:{mandatory_decision_core_id:'distinct-holding'},evidence_refs:[{document_id:'doc-adr',quote}]};
    expect(alignDecisionCoreFindings([holding],core)[0].title).toBe('Historic holding');
    expect(alignDecisionCoreFindings([{...holding,metadata:{mandatory_decision_core_id:'stale-outcome',mandatory_decision_kind:'DISPOSITION'}}],core)).toEqual([]);
    const generated=mandatoryDecisionCoreToFindings({core,caseId:'case',userId:'u'});
    const duplicates=Array.from({length:9},(_,i)=>({...generated[0],id:`id${i}`}));
    expect(alignDecisionCoreFindings(duplicates,core)).toHaveLength(1);
  });
});
