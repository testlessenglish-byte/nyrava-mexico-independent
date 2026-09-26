-- =============================================================================
-- Migration: Legal Analysis Types (Tipos de Análisis Jurídico) Feature Flags
--
-- Governs subscriber availability for all Mexican materias platform-wide.
-- Launch configuration:
--   Available (enabled = true):
--     - familiar (Derecho Familiar)
--     - civil (Derecho Civil)
--     - penal (Derecho Penal)
--     - migratorio (Derecho Migratorio, Refugio y Nacionalidad)
--   Coming soon (enabled = false):
--     - mercantil, laboral, administrativo, fiscal, amparo, electoral,
--       agrario, constitucional, ambiental, inmobiliario
--
-- No underlying algorithms, code or historical cases are deleted or modified.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.legal_analysis_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_es text NOT NULL,
  name_en text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.legal_analysis_type_audit (
  id bigserial PRIMARY KEY,
  materia_code text NOT NULL,
  previous_enabled boolean NOT NULL,
  new_enabled boolean NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_legal_analysis_types_code ON public.legal_analysis_types(code);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_types_enabled ON public.legal_analysis_types(enabled);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_type_audit_code ON public.legal_analysis_type_audit(materia_code);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_type_audit_created ON public.legal_analysis_type_audit(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.legal_analysis_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_analysis_type_audit ENABLE ROW LEVEL SECURITY;

-- Helper check if user is super_admin or platform_admin
CREATE OR REPLACE FUNCTION public.is_platform_or_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'platform_admin')
  );
$$;

-- RLS Policies for legal_analysis_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_analysis_types' AND policyname = 'legal_analysis_types_select'
  ) THEN
    CREATE POLICY legal_analysis_types_select ON public.legal_analysis_types
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_analysis_types' AND policyname = 'legal_analysis_types_admin_modify'
  ) THEN
    CREATE POLICY legal_analysis_types_admin_modify ON public.legal_analysis_types
      FOR ALL
      TO authenticated
      USING (public.is_platform_or_super_admin())
      WITH CHECK (public.is_platform_or_super_admin());
  END IF;
END $$;

-- RLS Policies for legal_analysis_type_audit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_analysis_type_audit' AND policyname = 'legal_analysis_type_audit_admin_select'
  ) THEN
    CREATE POLICY legal_analysis_type_audit_admin_select ON public.legal_analysis_type_audit
      FOR SELECT
      TO authenticated
      USING (public.is_platform_or_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_analysis_type_audit' AND policyname = 'legal_analysis_type_audit_admin_insert'
  ) THEN
    CREATE POLICY legal_analysis_type_audit_admin_insert ON public.legal_analysis_type_audit
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_platform_or_super_admin());
  END IF;
END $$;

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.log_legal_analysis_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.enabled IS DISTINCT FROM NEW.enabled) THEN
    INSERT INTO public.legal_analysis_type_audit (
      materia_code,
      previous_enabled,
      new_enabled,
      admin_user_id,
      created_at,
      metadata
    ) VALUES (
      NEW.code,
      OLD.enabled,
      NEW.enabled,
      COALESCE(NEW.updated_by, auth.uid()),
      now(),
      jsonb_build_object(
        'materia_code', NEW.code,
        'previous_state', OLD.enabled,
        'new_state', NEW.enabled,
        'updated_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_legal_analysis_type_change ON public.legal_analysis_types;
CREATE TRIGGER trg_log_legal_analysis_type_change
  AFTER UPDATE ON public.legal_analysis_types
  FOR EACH ROW
  EXECUTE FUNCTION public.log_legal_analysis_type_change();

-- Seed initial 14 Mexican legal analysis types with launch configuration
INSERT INTO public.legal_analysis_types (code, name_es, name_en, enabled, display_order)
VALUES
  ('familiar', 'Derecho Familiar', 'Family Law', true, 1),
  ('civil', 'Derecho Civil', 'Civil Law', true, 2),
  ('penal', 'Derecho Penal (Sistema Acusatorio, CNPP)', 'Criminal Law (Accusatory System, CNPP)', true, 3),
  ('migratorio', 'Derecho Migratorio, Refugio y Nacionalidad', 'Mexican Immigration, Refugee and Nationality Law', true, 4),
  ('mercantil', 'Derecho Mercantil', 'Commercial Law', false, 5),
  ('laboral', 'Derecho Laboral', 'Labor Law', false, 6),
  ('administrativo', 'Derecho Administrativo', 'Administrative Law', false, 7),
  ('fiscal', 'Derecho Fiscal', 'Tax Law', false, 8),
  ('amparo', 'Juicio de Amparo', 'Amparo Proceeding', false, 9),
  ('electoral', 'Derecho Electoral', 'Electoral Law', false, 10),
  ('agrario', 'Derecho Agrario', 'Agrarian Law', false, 11),
  ('constitucional', 'Derecho Constitucional y Derechos Humanos', 'Constitutional Law and Human Rights', false, 12),
  ('ambiental', 'Derecho Ambiental', 'Environmental Law', false, 13),
  ('inmobiliario', 'Derecho Inmobiliario', 'Real Estate Law', false, 14)
ON CONFLICT (code) DO UPDATE SET
  name_es = EXCLUDED.name_es,
  name_en = EXCLUDED.name_en,
  display_order = EXCLUDED.display_order;
