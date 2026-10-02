-- Keep the subscriptions status constraint aligned with Stripe's
-- seven-day trial lifecycle.

ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_status_check
CHECK (
  status = ANY (
    ARRAY[
      'none'::text,
      'active'::text,
      'trialing'::text,
      'past_due'::text,
      'canceled'::text,
      'incomplete'::text
    ]
  )
);
