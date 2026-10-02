-- Align Motion Center / Centro de Promociones draft authorization with the
-- platform-wide legal-case access model.
--
-- A user may create and edit only drafts carrying their own user_id, and only
-- for a legal case they are authorized to access. Platform admins retain
-- administrative visibility. RLS remains enabled.

DROP POLICY IF EXISTS "motion drafts all"
ON public.case_motion_drafts;

CREATE POLICY "motion drafts all"
ON public.case_motion_drafts
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_case(auth.uid(), case_id)
);