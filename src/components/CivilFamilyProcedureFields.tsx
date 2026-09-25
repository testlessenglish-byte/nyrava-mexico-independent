import { CDMX_PROCEEDING_TYPES, type CdmxProceedingType } from '@/lib/legal/cdmx-procedural-transition';

const LABELS: Record<CdmxProceedingType, [string, string]> = {
  civil_hipotecario_oral: ['Hipotecario oral', 'Oral mortgage proceeding'],
  civil_arrendamiento_oral: ['Arrendamiento oral', 'Oral lease proceeding'],
  civil_jurisdiccion_voluntaria: ['Jurisdicción voluntaria civil', 'Civil voluntary jurisdiction'],
  civil_providencia_precautoria: ['Providencia precautoria civil', 'Civil precautionary measure'],
  civil_ejecutivo_oral: ['Ejecutivo oral civil', 'Oral civil enforcement'],
  civil_ordinario_oral: ['Ordinario oral civil', 'Ordinary oral civil proceeding'],
  civil_apremio: ['Vía de apremio civil', 'Civil compulsory enforcement'],
  familiar_jurisdiccion_voluntaria: ['Jurisdicción voluntaria familiar', 'Family voluntary jurisdiction'],
  familiar_sin_divorcio: ['Controversia familiar sin divorcio', 'Family dispute without divorce'],
  familiar_justicia_restaurativa: ['Justicia restaurativa familiar', 'Family restorative justice'],
  familiar_divorcio: ['Divorcio', 'Divorce'],
  familiar_sucesorio: ['Sucesorio familiar', 'Family succession proceeding'],
};

export function CivilFamilyProcedureFields({startedOn, proceeding, onStartedOnChange, onProceedingChange, locale, disabled=false}: {
  startedOn: string; proceeding: string; onStartedOnChange: (value:string)=>void;
  onProceedingChange: (value:string)=>void; locale:string; disabled?:boolean;
}) {
  const es = locale === 'es';
  return <fieldset disabled={disabled} className="space-y-3 rounded-md border border-border p-3">
    <legend className="text-sm font-medium">{es ? 'Datos declarados del procedimiento civil o familiar' : 'Declared civil or family procedural facts'}</legend>
    <p className="text-xs text-muted-foreground">{es ? 'Datos proporcionados por el usuario, pendientes de cotejo documental. La clasificación de transición disponible corresponde a CDMX; estos datos no acreditan competencia ni determinan por sí solos la ley aplicable.' : 'User declarations awaiting documentary verification. The available transition categories concern CDMX; these facts do not establish jurisdiction or determine applicable law by themselves.'}</p>
    <label className="block text-sm">{es ? 'Fecha de inicio original del procedimiento' : 'Original commencement date'}
      <input type="date" value={startedOn} max={new Date().toISOString().slice(0,10)} onChange={e=>onStartedOnChange(e.target.value)} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
    </label>
    <p className="text-xs text-muted-foreground">{es ? 'No utilice la fecha de apelación, amparo ni otro acto posterior. Déjela vacía si no se conoce.' : 'Do not use the appeal, amparo, or later procedural act date. Leave blank if unknown.'}</p>
    <label className="block text-sm">{es ? 'Categoría del procedimiento' : 'Proceeding category'}
      <select value={proceeding} onChange={e=>onProceedingChange(e.target.value)} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2">
        <option value="">{es ? 'Pendiente / categoría no incluida' : 'Unresolved / category not listed'}</option>
        {CDMX_PROCEEDING_TYPES.map(value=><option key={value} value={value}>{LABELS[value][es ? 0 : 1]}</option>)}
      </select>
    </label>
  </fieldset>;
}
