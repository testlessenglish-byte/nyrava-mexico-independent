CREATE OR REPLACE FUNCTION public.nyrava_case_denies_personal_notice_duty(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.case_id = p_case_id
      AND d.status = 'extracted'
      AND regexp_replace(coalesce(d.extracted_text, ''), E'[\n\r]+', ' ', 'g') ~*
        '(no exist[ií]a|no era necesario|no resultaba necesario|no fue necesario|no hab[ií]a).{0,180}.{0,180}(deber|obligaci[oó]n|necesidad)?.{0,240}notific.{0,120}personal'
  );
$$;
CREATE OR REPLACE FUNCTION public.nyrava_is_personal_notice_defect_text(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(p_text, '') ~* '(notific.{0,180}personal|personal.{0,180}notific)'
    AND coalesce(p_text, '') ~*
      '(defect|irregular|error procesal|nulidad|invalid|afect.{0,100}(procedencia|defensa|debido proceso)|desestim|debilidad|riesgo|perjuicio|garanti[cz]|asegurar|deb[ií][oa].{0,100}realiz|motivo.{0,100}impug|incidente_de_nulidad)';
$$;
CREATE OR REPLACE FUNCTION public.nyrava_sanitize_personal_notice_json_value(
  p_value jsonb,
  p_deny_personal_notice_duty boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type text;
  v_is_claim_object boolean;
  v_result jsonb;
BEGIN
  IF p_value IS NULL OR NOT p_deny_personal_notice_duty THEN
    RETURN p_value;
  END IF;

  v_type := jsonb_typeof(p_value);

  IF v_type = 'object' THEN
    v_is_claim_object := p_value ?| ARRAY[
      'title','item','description','legal_significance','potential_impact',
      'potential_avenue','why_it_may_apply','what_is_missing','rule'
    ];

    IF v_is_claim_object AND public.nyrava_is_personal_notice_defect_text(p_value::text) THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_object_agg(e.key, e.cleaned), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT j.key,
             coalesce(
               public.nyrava_sanitize_personal_notice_json_value(j.value, p_deny_personal_notice_duty),
               'null'::jsonb
             ) AS cleaned
      FROM jsonb_each(p_value) AS j(key, value)
    ) e;
    RETURN v_result;
  END IF;

  IF v_type = 'array' THEN
    SELECT coalesce(jsonb_agg(e.cleaned), '[]'::jsonb)
      INTO v_result
    FROM (
      SELECT public.nyrava_sanitize_personal_notice_json_value(a.value, p_deny_personal_notice_duty) AS cleaned
      FROM jsonb_array_elements(p_value) AS a(value)
    ) e
    WHERE e.cleaned IS NOT NULL;
    RETURN v_result;
  END IF;

  RETURN p_value;
END;
$$;