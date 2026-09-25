-- Client access by assignment does not grant permission to delete the client.
-- Apply only to the independent Nyrava project after verifying ownership rules.
BEGIN;
DROP POLICY IF EXISTS clients_delete_policy ON public.clients;
CREATE POLICY clients_delete_policy ON public.clients
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) OR created_by = (select auth.uid()));
COMMIT;
