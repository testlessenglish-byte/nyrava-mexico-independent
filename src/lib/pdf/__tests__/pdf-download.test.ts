import {afterEach, expect, it, vi} from 'vitest';
import {savePdfDownload} from '../pdf-download';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('hands PDF bytes to a connected native download link and keeps the URL alive for the browser',()=>{
  vi.useFakeTimers();let connected=false;let clicked=false;let savedBlob:Blob|undefined;
  const anchor={href:'',download:'',rel:'',hidden:false,click:()=>{expect(connected).toBe(true);clicked=true;},remove:()=>{connected=false;}};
  const revoke=vi.fn();vi.stubGlobal('document',{createElement:()=>anchor,body:{appendChild:()=>{connected=true;}}});
  vi.stubGlobal('URL',{createObjectURL:(blob:Blob)=>{savedBlob=blob;return 'blob:pdf';},revokeObjectURL:revoke});
  savePdfDownload(new TextEncoder().encode('%PDF-1.3').buffer,'case.pdf');
  expect(clicked).toBe(true);expect(anchor.download).toBe('case.pdf');expect(savedBlob?.type).toBe('application/pdf');expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000);expect(revoke).toHaveBeenCalledWith('blob:pdf');expect(connected).toBe(false);
});

it('keeps the prepared PDF URL usable for a later native subscriber click',()=>{
  vi.useFakeTimers();
  const anchor={href:'',download:'',rel:'',hidden:false,click:vi.fn(),remove:vi.fn()};
  const revoke=vi.fn(),prepared=vi.fn();
  vi.stubGlobal('document',{createElement:()=>anchor,body:{appendChild:vi.fn()}});
  vi.stubGlobal('URL',{createObjectURL:()=> 'blob:subscriber-pdf',revokeObjectURL:revoke});
  savePdfDownload(new TextEncoder().encode('%PDF-1.3').buffer,'subscriber.pdf',prepared);
  expect(prepared).toHaveBeenCalledWith({url:'blob:subscriber-pdf',filename:'subscriber.pdf'});
  vi.advanceTimersByTime(60000);
  expect(revoke).not.toHaveBeenCalled();
  expect(anchor.remove).toHaveBeenCalled();
});
