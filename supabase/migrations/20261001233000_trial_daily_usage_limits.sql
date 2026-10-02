-- ============================================================================
-- Trial daily usage limits
--
-- Paid subscriptions retain the existing monthly consume_usage() behavior.
-- Trial subscriptions are additionally capped per UTC day at ceil(monthly/30).
-- The trial RPC atomically enforces BOTH the daily and monthly ceilings so a
-- request rejected by either ceiling never consumes the other allowance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trial_daily_usage_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  ai_requests_used integer NOT NULL DEFAULT 0,
  talk_to_case_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS trial_daily_usage_counters_user_idx
  ON public.trial_daily_usage_counters (user_id);

GRANT SELECT ON public.trial_daily_usage_counters TO authenticated;
GRANT ALL ON public.trial_daily_usage_counters TO service_role;

ALTER TABLE public.trial_daily_usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own trial daily usage"
  ON public.trial_daily_usage_counters;

CREATE POLICY "Users can view own trial daily usage"
  ON public.trial_daily_usage_counters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trial_daily_usage_counters_set_updated_at
  ON public.trial_daily_usage_counters;

CREATE TRIGGER trial_daily_usage_counters_set_updated_at
  BEFORE UPDATE ON public.trial_daily_usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.trial_daily_usage_counters IS
  'Daily UTC usage counters used only while a subscription is trialing. Paid subscriptions continue using the normal monthly usage_counters gate.';

CREATE OR REPLACE FUNCTION public.consume_trial_usage(
  p_user_id uuid,
  p_kind text,
  p_monthly_limit integer,
  p_daily_limit integer,
  p_amount integer DEFAULT 1
)
RETURNS TABLE (
  allowed boolean,
  monthly_used integer,
  monthly_limit integer,
  daily_used integer,
  daily_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_date date := (now() AT TIME ZONE 'utc')::date;
  v_monthly integer;
  v_daily integer;
BEGIN
  IF p_kind NOT IN ('ai_request', 'talk_to_case') THEN
    RAISE EXCEPTION 'consume_trial_usage: unknown kind %', p_kind;
  END IF;

  IF p_amount < 1 THEN
    RAISE EXCEPTION 'consume_trial_usage: p_amount must be positive';
  END IF;

  INSERT INTO public.usage_counters (user_id, period_month)
  VALUES (p_user_id, v_period)
  ON CONFLICT (user_id, period_month) DO NOTHING;

  INSERT INTO public.trial_daily_usage_counters (user_id, usage_date)
  VALUES (p_user_id, v_date)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  IF p_kind = 'ai_request' THEN
    -- Lock in stable order: monthly first, daily second.
    SELECT ai_requests_used
      INTO v_monthly
      FROM public.usage_counters
      WHERE user_id = p_user_id
        AND period_month = v_period
      FOR UPDATE;

    SELECT ai_requests_used
      INTO v_daily
      FROM public.trial_daily_usage_counters
      WHERE user_id = p_user_id
        AND usage_date = v_date
      FOR UPDATE;

    IF p_monthly_limit IS NOT NULL
       AND v_monthly + p_amount > p_monthly_limit THEN
      RETURN QUERY
        SELECT false, v_monthly, p_monthly_limit, v_daily, p_daily_limit;
      RETURN;
    END IF;

    IF p_daily_limit IS NOT NULL
       AND v_daily + p_amount > p_daily_limit THEN
      RETURN QUERY
        SELECT false, v_monthly, p_monthly_limit, v_daily, p_daily_limit;
      RETURN;
    END IF;

    UPDATE public.usage_counters
      SET ai_requests_used = ai_requests_used + p_amount
      WHERE user_id = p_user_id
        AND period_month = v_period
      RETURNING ai_requests_used INTO v_monthly;

    UPDATE public.trial_daily_usage_counters
      SET ai_requests_used = ai_requests_used + p_amount
      WHERE user_id = p_user_id
        AND usage_date = v_date
      RETURNING ai_requests_used INTO v_daily;

  ELSE
    SELECT talk_to_case_used
      INTO v_monthly
      FROM public.usage_counters
      WHERE user_id = p_user_id
        AND period_month = v_period
      FOR UPDATE;

    SELECT talk_to_case_used
      INTO v_daily
      FROM public.trial_daily_usage_counters
      WHERE user_id = p_user_id
        AND usage_date = v_date
      FOR UPDATE;

    IF p_monthly_limit IS NOT NULL
       AND v_monthly + p_amount > p_monthly_limit THEN
      RETURN QUERY
        SELECT false, v_monthly, p_monthly_limit, v_daily, p_daily_limit;
      RETURN;
    END IF;

    IF p_daily_limit IS NOT NULL
       AND v_daily + p_amount > p_daily_limit THEN
      RETURN QUERY
        SELECT false, v_monthly, p_monthly_limit, v_daily, p_daily_limit;
      RETURN;
    END IF;

    UPDATE public.usage_counters
      SET talk_to_case_used = talk_to_case_used + p_amount
      WHERE user_id = p_user_id
        AND period_month = v_period
      RETURNING talk_to_case_used INTO v_monthly;

    UPDATE public.trial_daily_usage_counters
      SET talk_to_case_used = talk_to_case_used + p_amount
      WHERE user_id = p_user_id
        AND usage_date = v_date
      RETURNING talk_to_case_used INTO v_daily;
  END IF;

  RETURN QUERY
    SELECT true, v_monthly, p_monthly_limit, v_daily, p_daily_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_trial_usage(
  uuid, text, integer, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_trial_usage(
  uuid, text, integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.consume_trial_usage IS
  'Atomically enforces monthly plan allowance plus a daily UTC allowance for trialing subscriptions. A rejected request consumes neither counter.';