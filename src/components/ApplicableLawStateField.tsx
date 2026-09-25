import { STATE_JURISDICTION_OPTIONS } from '@/lib/intelligence/jurisdictions';

export function ApplicableLawStateField({value,onChange,locale,disabled=false}:{value:string;onChange:(value:string)=>void;locale:string;disabled?:boolean}) {
  return <div className="space-y-1.5">
    <label htmlFor="applicable-law-state" className="text-sm font-medium">{locale==='es'?'Entidad de la legislación aplicable':'Entity whose local law applies'}</label>
    <p className="text-xs text-muted-foreground">{locale==='es'?'Separada del tribunal competente. En amparo, identifica la legislación del asunto subyacente. Cada entidad requiere verificación; CDMX no sustituye otras leyes.':'Separate from the competent court. For amparo, identify the underlying matter’s local law. Each entity requires verification; CDMX does not replace another entity’s law.'}</p>
    <select id="applicable-law-state" value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
      <option value="">{locale==='es'?'Pendiente / no se requiere ley local':'Unresolved / local law not required'}</option>
      {STATE_JURISDICTION_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  </div>;
}
