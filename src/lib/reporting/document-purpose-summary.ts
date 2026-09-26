export function documentPurposeSummary(raw:unknown,locale='es'):string[] {
  if(!raw || typeof raw!=='object')return [];
  const scope=raw as Record<string,any>,en=locale==='en';
  const lines:string[]=[];
  if(scope.test_fixture===true)lines.push(en?'Test fixture — production verification requirements apply.':'Caso de prueba — se aplican los requisitos de verificación de producción.');
  // User prompts and instructions are internal control data only; NEVER print them in reports.
  for(const document of Array.isArray(scope.documents)?scope.documents:[]){
    const label=document.source_scope==='research'?(en?'Legal research / judgment analysis':'Investigación jurídica / análisis de sentencia'):
      document.source_scope==='declared_client_evidence'?(en?'Submitted evidence; connection declared, contents not presumed proven':'Evidencia presentada; vínculo declarado, contenido no presumido probado'):
      (en?'Purpose or client connection unresolved':'Finalidad o vínculo con el cliente sin resolver');
    lines.push(`${document.filename ?? document.document_id ?? (en?'Document':'Documento')}: ${label}`);
  }
  return lines;
}
