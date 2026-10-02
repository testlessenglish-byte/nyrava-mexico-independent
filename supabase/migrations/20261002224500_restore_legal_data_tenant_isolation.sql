-- Nyrava Mexico
-- Restore legal-data tenant isolation.
--
-- Platform administrator status is NOT a master key to subscriber
-- legal data through ordinary subscriber-facing tables.
--
-- Access to substantive legal data is based on ownership,
-- responsibility, or explicit assignment.
--
-- Trusted backend/pipeline operations continue through service_role.

BEGIN;

-- ============================================================
-- CLIENT ACCESS
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_client(
  _user_id uuid,
  _client_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = _client_id
      AND (
        c.created_by = _user_id
        OR c.user_id = _user_id
        OR c.responsible_attorney = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.client_assignments ca
          WHERE ca.client_id = _client_id
            AND ca.user_id = _user_id
        )
      )
  );
$$;


-- ============================================================
-- CASE ACCESS
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_case(
  _user_id uuid,
  _case_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = _case_id
      AND (
        c.user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.case_assignments ca
          WHERE ca.case_id = _case_id
            AND ca.user_id = _user_id
        )
        OR (
          c.client_id IS NOT NULL
          AND public.can_access_client(_user_id, c.client_id)
        )
      )
  );
$$;


-- ============================================================
-- CLIENT RLS
-- ============================================================

DROP POLICY IF EXISTS clients_select_policy ON public.clients;
DROP POLICY IF EXISTS clients_insert_policy ON public.clients;
DROP POLICY IF EXISTS clients_update_policy ON public.clients;
DROP POLICY IF EXISTS clients_delete_policy ON public.clients;

CREATE POLICY clients_select_policy
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.can_access_client(auth.uid(), id)
);

CREATE POLICY clients_insert_policy
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY clients_update_policy
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.can_access_client(auth.uid(), id)
)
WITH CHECK (
  public.can_access_client(auth.uid(), id)
);

CREATE POLICY clients_delete_policy
ON public.clients
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR created_by = auth.uid()
);


-- ============================================================
-- CASE RLS
-- ============================================================

DROP POLICY IF EXISTS "cases select" ON public.cases;
DROP POLICY IF EXISTS "cases insert" ON public.cases;
DROP POLICY IF EXISTS "cases update" ON public.cases;
DROP POLICY IF EXISTS "cases delete" ON public.cases;

DROP POLICY IF EXISTS cases_select_policy ON public.cases;
DROP POLICY IF EXISTS cases_insert_policy ON public.cases;
DROP POLICY IF EXISTS cases_update_policy ON public.cases;
DROP POLICY IF EXISTS cases_delete_policy ON public.cases;
DROP POLICY IF EXISTS cases_firm_admin_read ON public.cases;

CREATE POLICY cases_select_policy
ON public.cases
FOR SELECT
TO authenticated
USING (
  public.can_access_case(auth.uid(), id)
);

CREATE POLICY cases_insert_policy
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY cases_update_policy
ON public.cases
FOR UPDATE
TO authenticated
USING (
  public.can_access_case(auth.uid(), id)
)
WITH CHECK (
  public.can_access_case(auth.uid(), id)
);

CREATE POLICY cases_delete_policy
ON public.cases
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
);


-- ============================================================
-- DOCUMENT RLS
-- ============================================================

DROP POLICY IF EXISTS "docs all" ON public.documents;

DROP POLICY IF EXISTS documents_select_policy ON public.documents;
DROP POLICY IF EXISTS documents_insert_policy ON public.documents;
DROP POLICY IF EXISTS documents_update_policy ON public.documents;
DROP POLICY IF EXISTS documents_delete_policy ON public.documents;

CREATE POLICY documents_select_policy
ON public.documents
FOR SELECT
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY documents_insert_policy
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY documents_update_policy
ON public.documents
FOR UPDATE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
)
WITH CHECK (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY documents_delete_policy
ON public.documents
FOR DELETE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);


-- ============================================================
-- CASE FINDINGS RLS
-- ============================================================

DROP POLICY IF EXISTS "findings select" ON public.case_findings;
DROP POLICY IF EXISTS "findings insert" ON public.case_findings;
DROP POLICY IF EXISTS "findings update" ON public.case_findings;
DROP POLICY IF EXISTS "findings delete" ON public.case_findings;

DROP POLICY IF EXISTS findings_select_policy ON public.case_findings;
DROP POLICY IF EXISTS findings_insert_policy ON public.case_findings;
DROP POLICY IF EXISTS findings_update_policy ON public.case_findings;
DROP POLICY IF EXISTS findings_delete_policy ON public.case_findings;

CREATE POLICY findings_select_policy
ON public.case_findings
FOR SELECT
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY findings_insert_policy
ON public.case_findings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY findings_update_policy
ON public.case_findings
FOR UPDATE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
)
WITH CHECK (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY findings_delete_policy
ON public.case_findings
FOR DELETE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);


-- ============================================================
-- REPORT RLS
-- service_role policy deliberately remains untouched.
-- ============================================================

DROP POLICY IF EXISTS "Users read reports for their cases"
ON public.reports;

DROP POLICY IF EXISTS "Owners write reports for their cases"
ON public.reports;

DROP POLICY IF EXISTS reports_subscriber_select ON public.reports;
DROP POLICY IF EXISTS reports_subscriber_insert ON public.reports;
DROP POLICY IF EXISTS reports_subscriber_update ON public.reports;
DROP POLICY IF EXISTS reports_subscriber_delete ON public.reports;

CREATE POLICY reports_subscriber_select
ON public.reports
FOR SELECT
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY reports_subscriber_insert
ON public.reports
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY reports_subscriber_update
ON public.reports
FOR UPDATE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
)
WITH CHECK (
  public.can_access_case(auth.uid(), case_id)
);

CREATE POLICY reports_subscriber_delete
ON public.reports
FOR DELETE
TO authenticated
USING (
  public.can_access_case(auth.uid(), case_id)
);

COMMIT;