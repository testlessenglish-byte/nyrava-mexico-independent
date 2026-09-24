import {describe,it,expect} from 'vitest';
import {decisionExcerpt} from '../decision-excerpt';
describe('decision extraction coverage',()=>{
 it('preserves short documents',()=>expect(decisionExcerpt('Full decision')).toBe('Full decision'));
 it('includes the final ruling of long judgments within budget',()=>{const text='CASE ID '+ 'a'.repeat(25000)+' FINAL RULING: appeal dismissed.';const excerpt=decisionExcerpt(text);expect(excerpt.length).toBe(20000);expect(excerpt).toContain('CASE ID');expect(excerpt).toContain('FINAL RULING: appeal dismissed.');expect(excerpt).toContain('Middle section omitted')});
});
