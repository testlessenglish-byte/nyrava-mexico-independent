export type MotionTemplate = {
  id: string;
  materia: string[];
  jurisdiction: "federal" | "local" | "both";
  stages: string[];
  category: string;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  authorityFamily: string[];
  requiresCaseAuthority: boolean;
};

export const MOTION_TEMPLATE_CATEGORIES = [
  { id: "demanda", es: "Demandas", en: "Complaints & Petitions" },
  { id: "contestacion", es: "Contestaciones", en: "Answers & Responses" },
  { id: "promocion", es: "Promociones", en: "Procedural Filings" },
  { id: "incidente", es: "Incidentes", en: "Incidental Proceedings" },
  { id: "recurso", es: "Recursos", en: "Appeals & Challenges" },
  { id: "cautelar", es: "Medidas Cautelares", en: "Provisional Relief" },
  { id: "pruebas", es: "Pruebas", en: "Evidence Filings" },
  { id: "alegatos", es: "Alegatos", en: "Closing Submissions" },
  { id: "ejecucion", es: "Ejecución", en: "Enforcement" },
] as const;

export const MEXICO_MOTION_TEMPLATES: MotionTemplate[] = [
  {
    id: "amparo-indirecto",
    materia: ["amparo", "constitucional"],
    jurisdiction: "federal",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda de Amparo Indirecto",
    titleEn: "Indirect Amparo Petition",
    descriptionEs:
      "Estructura editable para promover amparo indirecto. Nyrava debe verificar acto reclamado, autoridad responsable, interés jurídico o legítimo y autoridad aplicable antes de completar el escrito.",
    descriptionEn:
      "Editable structure for an indirect amparo petition. Nyrava must verify the challenged act, responsible authority, standing and applicable authority before completing the filing.",
    authorityFamily: ["Ley de Amparo", "Constitución Política de los Estados Unidos Mexicanos"],
    requiresCaseAuthority: true,
  },
  {
    id: "amparo-suspension",
    materia: ["amparo", "constitucional"],
    jurisdiction: "federal",
    stages: ["initial", "pending"],
    category: "cautelar",
    titleEs: "Solicitud de Suspensión",
    titleEn: "Request for Suspension",
    descriptionEs:
      "Solicitud editable de suspensión vinculada al acto reclamado y a los elementos verificados del expediente.",
    descriptionEn:
      "Editable suspension request tied to the challenged act and verified case record.",
    authorityFamily: ["Ley de Amparo"],
    requiresCaseAuthority: true,
  },
  {
    id: "amparo-revision",
    materia: ["amparo", "constitucional"],
    jurisdiction: "federal",
    stages: ["appeal", "post_judgment"],
    category: "recurso",
    titleEs: "Recurso de Revisión",
    titleEn: "Review Appeal",
    descriptionEs:
      "Estructura para recurso de revisión únicamente cuando el vehículo procesal y la resolución sean recurribles.",
    descriptionEn:
      "Review-appeal structure enabled only when the procedural vehicle and challenged ruling permit review.",
    authorityFamily: ["Ley de Amparo"],
    requiresCaseAuthority: true,
  },
  {
    id: "amparo-queja",
    materia: ["amparo", "constitucional"],
    jurisdiction: "federal",
    stages: ["pending", "appeal"],
    category: "recurso",
    titleEs: "Recurso de Queja",
    titleEn: "Complaint Appeal",
    descriptionEs:
      "Proyecto editable sujeto a verificación previa del supuesto de procedencia y plazo.",
    descriptionEn:
      "Editable draft subject to prior verification of availability and filing deadline.",
    authorityFamily: ["Ley de Amparo"],
    requiresCaseAuthority: true,
  },
  {
    id: "civil-demanda",
    materia: ["civil", "inmobiliario"],
    jurisdiction: "both",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda Inicial",
    titleEn: "Initial Complaint",
    descriptionEs:
      "Demanda civil estructurada conforme al régimen procesal aplicable al expediente.",
    descriptionEn:
      "Civil complaint structured according to the procedural regime applicable to the case.",
    authorityFamily: ["CNPCF", "Código procesal local aplicable"],
    requiresCaseAuthority: true,
  },
  {
    id: "civil-contestacion",
    materia: ["civil", "inmobiliario"],
    jurisdiction: "both",
    stages: ["answer"],
    category: "contestacion",
    titleEs: "Contestación de Demanda",
    titleEn: "Answer to Complaint",
    descriptionEs:
      "Contestación editable con respuesta a prestaciones, hechos, defensas, excepciones y pruebas sustentadas por el expediente.",
    descriptionEn:
      "Editable answer addressing requested relief, allegations, defenses, exceptions and case-supported evidence.",
    authorityFamily: ["CNPCF", "Código procesal local aplicable"],
    requiresCaseAuthority: true,
  },
  {
    id: "familiar-alimentos",
    materia: ["familiar"],
    jurisdiction: "both",
    stages: ["initial", "pending"],
    category: "demanda",
    titleEs: "Solicitud o Demanda de Alimentos",
    titleEn: "Support Petition",
    descriptionEs:
      "Escrito para alimentos sujeto a jurisdicción, procedimiento y hechos familiares verificados.",
    descriptionEn:
      "Support filing conditioned on verified jurisdiction, procedure and family facts.",
    authorityFamily: ["CNPCF", "Código Civil o Familiar aplicable"],
    requiresCaseAuthority: true,
  },
  {
    id: "familiar-medidas-proteccion",
    materia: ["familiar"],
    jurisdiction: "both",
    stages: ["initial", "pending"],
    category: "cautelar",
    titleEs: "Solicitud de Medidas de Protección",
    titleEn: "Request for Protective Measures",
    descriptionEs:
      "Solicitud de protección basada exclusivamente en hechos y riesgos documentados en el expediente.",
    descriptionEn:
      "Protective-relief request based exclusively on documented case facts and risks.",
    authorityFamily: ["CNPCF", "Legislación local aplicable"],
    requiresCaseAuthority: true,
  },
  {
    id: "mercantil-demanda",
    materia: ["mercantil"],
    jurisdiction: "both",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda Mercantil",
    titleEn: "Commercial Complaint",
    descriptionEs:
      "Demanda mercantil adaptada al procedimiento ordinario, oral o ejecutivo que corresponda.",
    descriptionEn:
      "Commercial complaint adapted to the applicable ordinary, oral or executive proceeding.",
    authorityFamily: ["Código de Comercio"],
    requiresCaseAuthority: true,
  },
  {
    id: "mercantil-contestacion",
    materia: ["mercantil"],
    jurisdiction: "both",
    stages: ["answer"],
    category: "contestacion",
    titleEs: "Contestación de Demanda Mercantil",
    titleEn: "Answer to Commercial Complaint",
    descriptionEs:
      "Contestación mercantil vinculada al procedimiento y a las pruebas verificadas.",
    descriptionEn:
      "Commercial answer tied to the applicable procedure and verified evidence.",
    authorityFamily: ["Código de Comercio"],
    requiresCaseAuthority: true,
  },
  {
    id: "laboral-demanda",
    materia: ["laboral"],
    jurisdiction: "both",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda Laboral",
    titleEn: "Labor Complaint",
    descriptionEs:
      "Proyecto de demanda laboral sujeto a competencia, conciliación prejudicial cuando corresponda y prestaciones verificadas.",
    descriptionEn:
      "Labor complaint conditioned on jurisdiction, applicable pre-suit conciliation and verified claims.",
    authorityFamily: ["Ley Federal del Trabajo"],
    requiresCaseAuthority: true,
  },
  {
    id: "administrativo-demanda",
    materia: ["administrativo", "fiscal"],
    jurisdiction: "federal",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda Contencioso-Administrativa",
    titleEn: "Administrative Litigation Complaint",
    descriptionEs:
      "Demanda editable contra el acto o resolución administrativa verificada en el expediente.",
    descriptionEn:
      "Editable complaint challenging the administrative act or decision verified in the case.",
    authorityFamily: ["Ley Federal de Procedimiento Contencioso Administrativo"],
    requiresCaseAuthority: true,
  },
  {
    id: "fiscal-revocacion",
    materia: ["fiscal"],
    jurisdiction: "federal",
    stages: ["administrative_review", "pre_filing"],
    category: "recurso",
    titleEs: "Recurso de Revocación",
    titleEn: "Administrative Revocation Appeal",
    descriptionEs:
      "Proyecto sujeto a verificación del acto fiscal, procedencia, autoridad competente y plazo.",
    descriptionEn:
      "Draft conditioned on verification of the tax act, availability, competent authority and deadline.",
    authorityFamily: ["Código Fiscal de la Federación"],
    requiresCaseAuthority: true,
  },
  {
    id: "agrario-demanda",
    materia: ["agrario"],
    jurisdiction: "federal",
    stages: ["initial", "pre_filing"],
    category: "demanda",
    titleEs: "Demanda Agraria",
    titleEn: "Agrarian Complaint",
    descriptionEs:
      "Demanda para controversia agraria conforme al órgano y procedimiento aplicables.",
    descriptionEn:
      "Complaint for an agrarian dispute under the applicable tribunal and procedure.",
    authorityFamily: ["Ley Agraria"],
    requiresCaseAuthority: true,
  },
  {
    id: "migratorio-promocion",
    materia: ["migratorio"],
    jurisdiction: "federal",
    stages: ["administrative", "pending"],
    category: "promocion",
    titleEs: "Promoción ante Autoridad Migratoria",
    titleEn: "Immigration Authority Filing",
    descriptionEs:
      "Escrito editable dirigido a la autoridad migratoria correspondiente con hechos, trámite y petición verificados.",
    descriptionEn:
      "Editable filing to the appropriate immigration authority using verified facts, proceeding and requested action.",
    authorityFamily: ["Ley de Migración", "Reglamento de la Ley de Migración"],
    requiresCaseAuthority: true,
  },
];

export function templatesForMateria(materia?: string | null) {
  if (!materia) return MEXICO_MOTION_TEMPLATES;
  const key = materia.toLowerCase();
  return MEXICO_MOTION_TEMPLATES.filter((template) =>
    template.materia.some((m) => key.includes(m)),
  );
}