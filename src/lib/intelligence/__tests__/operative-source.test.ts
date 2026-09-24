import { expect, it } from 'vitest';
import { extractOperativeOrders } from '../operative-source';
it('keeps orders across physical pages and excludes votes and footer',()=>{
 const pages=[{document_id:'a',filename:'original.pdf',page:106,text:'Por lo expuesto, se resuelve:\nPRIMERO. Se sobresee respecto de una norma.\nSEGUNDO. Se concede protección respecto de otra.\n102\nfooter'},
 {document_id:'a',filename:'original.pdf',page:107,text:'CAPTION\nTERCERO. Se reserva jurisdicción al tribunal.\nNotifíquese; así lo resolvió por mayoría.'}];
 const orders=extractOperativeOrders(pages);expect(orders).toHaveLength(3);expect(orders[2].page).toBe(107);
 expect(orders.map(o=>o.text).join(' ')).not.toMatch(/footer|mayoría|102/);
 expect(extractOperativeOrders([...pages,{...pages[0],document_id:'b'}])).toEqual([]);
});
it('does not mistake a numbered discussion for an operative section',()=>{
 expect(extractOperativeOrders([{document_id:'a',filename:'a',page:1,text:'PRIMERO. La parte solicita protección constitucional.'}])).toEqual([]);
});
