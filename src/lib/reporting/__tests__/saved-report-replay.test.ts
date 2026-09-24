import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { downloadPdf } from '../../export';
import { validateFinalReportContract } from '../final-report-contract';
const rendered=vi.hoisted(()=>({pdf:null as ArrayBuffer|null,pages:new Map<number,string[]>()}));
vi.mock('jspdf',async original=>{
 const actual=await original<typeof import('jspdf')>();
 function Pdf(options:any){const pdf=new actual.jsPDF(options);
 const text=pdf.text.bind(pdf);pdf.text=((value:any,...args:any[])=>{
  const page=(pdf.internal as any).getCurrentPageInfo().pageNumber,lines=rendered.pages.get(page)??[];
  lines.push(Array.isArray(value)?value.join(' '):String(value));rendered.pages.set(page,lines);
  return (text as any)(value,...args);
 }) as typeof pdf.text;
 pdf.save=(()=>{rendered.pdf=pdf.output('arraybuffer');return pdf;}) as typeof pdf.save;return pdf;}
 Object.assign(Pdf,actual.jsPDF);return {...actual,default:Pdf};
});
describe.skipIf(!process.env.REPORT_REPLAY_INPUT)('saved-case report replay through the actual PDF renderer',()=>{
 it('revalidates all sections and writes the exact PDF bytes for inspection',async()=>{
  const input=JSON.parse(fs.readFileSync(process.env.REPORT_REPLAY_INPUT!,'utf8'));
  const ids=input.findings.map((f:any)=>f.id);
  const out=await downloadPdf(input,input.case.name);
  expect(out).toBeDefined();
  const checks=validateFinalReportContract(out!);
  expect(checks.blocking_errors).toEqual([]);
  expect(out!.findings!.every(f=>ids.includes(f.id))).toBe(true);
  expect(out!.report!.case_strength_score).toBe(64);
  expect(out!.report!.risk_score).toBe(18);
  expect(out!.report!.contradictions_struct).toEqual([]);
  const text=out!.report_presentation.render_output!.text;
  expect(text).toMatch(/Devuélvanse los autos/);
  expect(text).not.toMatch(/444\/2021 concede amparo|SCJN concede el amparo|Document B:/);
  expect(text).toContain('Fortaleza del expediente: 64/100');
  expect(text).toContain('Riesgo: 18/100');
  expect(rendered.pdf).not.toBeNull();
  expect(rendered.pages.get(1)!.join(' ').toUpperCase()).toContain('PRIMERA SALA DE LA SUPREMA CORTE');
  for(const [i,f] of out!.findings!.entries()) {
   const heading=('#'+(i+1)+' '+String(f.title)).toUpperCase();
   const page=[...rendered.pages.values()].find(lines=>lines.includes(heading));
   expect(page,`heading ${i+1} exists`).toBeDefined();
   expect(page!.join(' '),`finding ${i+1} heading must share its page with the description`).toContain(String(f.description).slice(0,30));
  }
  const dir=process.env.REPORT_REPLAY_OUTPUT!;fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'joe-bob-report.pdf'),Buffer.from(rendered.pdf!));
  fs.writeFileSync(path.join(dir,'rendered-payload.json'),JSON.stringify(out));
  fs.writeFileSync(path.join(dir,'report-checks.json'),JSON.stringify(checks,null,2));
 },60000);
});
