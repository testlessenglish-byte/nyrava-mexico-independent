import { describe, expect, it } from 'vitest';
import { packRequestChunks, requestBatchKey } from '../corpus-request-budget';
import { estimateRequestInputTokens } from '../request-budget';

describe('complete analyzer request packing', () => {
  it('fits UTF-8 evidence, large instructions, schema and completion reserve without losing source text', () => {
    const system = 'Existing unchanged analysis rules. '.repeat(450);
    const build = (text: string) => 'Existing JSON schema. '.repeat(150) + '\nCASE CORPUS:\n' + text;
    const source = 'Declaración: México, niño, resolución ⚖️. '.repeat(4000);
    const chunk = {docId:'source-1',filename:'expediente.pdf',index:1,text:source,size:source.length};
    const batches = packRequestChunks([chunk],system,build,12000);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) expect(estimateRequestInputTokens({systemInstruction:system,userContent:build(batch.map(c=>c.text).join('\n\n'))})).toBeLessThanOrEqual(12000);
    const restored = batches.flat().map(c=>c.text.replace(/^=== DOCUMENT 1 \(id=source-1\) \[cont\.\]: expediente\.pdf ===\n/,'')).join('');
    expect(restored).toBe(source);
    expect(new Set(batches.map(b=>requestBatchKey(b,system,build))).size).toBe(batches.length);
    expect(requestBatchKey(batches[0],system+' changed',build)).not.toBe(requestBatchKey(batches[0],system,build));
  });
  it('fails locally when fixed instructions cannot fit instead of cropping rules or evidence',()=>{
    expect(()=>packRequestChunks([{docId:'a',filename:'a',index:1,text:'evidence',size:8}], 'x'.repeat(30000),x=>x,5500)).toThrow(/instructions exceed/);
  });
});
