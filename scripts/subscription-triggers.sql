-- Subscription sync triggers (re-runnable).
-- Keeps tenants.subscription_plan and subscriptions.* in sync no matter
-- which table is edited (dashboard API, Drizzle Studio, Neon UI, SQL).
--
-- 1) tenants.subscription_plan changes (or new tenant)  -> creates/resets
--    the subscriptions row (period kept, dates restarted from now).
-- 2) subscriptions.plan / billing_period edited directly -> status + dates
--    recomputed automatically. Status-only edits are left alone.

CREATE OR REPLACE FUNCTION sync_subscription_for_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period billing_period := 'monthly';
  v_start timestamptz := now();
  v_end timestamptz;
BEGIN
  -- Same plan re-saved (e.g. by the dashboard API, which syncs the row
  -- itself first): leave the subscription row untouched.
  IF TG_OP = 'UPDATE' AND OLD.subscription_plan = NEW.subscription_plan THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan = 'free' THEN
    INSERT INTO subscriptions AS s
      (tenant_id, plan, status, billing_period, started_at, renewal_date, expiration_date)
    VALUES (NEW.id, 'free', 'cancelled', 'monthly', v_start, NULL, NULL)
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan = 'free', status = 'cancelled',
      renewal_date = NULL, expiration_date = NULL, updated_at = now();
    RETURN NEW;
  END IF;

  SELECT s.billing_period INTO v_period FROM subscriptions s WHERE s.tenant_id = NEW.id;
  IF v_period IS NULL THEN v_period := 'monthly'; END IF;
  v_end := v_start + (
    CASE v_period WHEN 'monthly' THEN 1 WHEN 'semiannual' THEN 6 ELSE 12 END
    || ' months'
  )::interval;

  INSERT INTO subscriptions AS s
    (tenant_id, plan, status, billing_period, started_at, renewal_date, expiration_date)
  VALUES (NEW.id, NEW.subscription_plan, 'active', v_period, v_start, v_end, v_end)
  ON CONFLICT (tenant_id) DO UPDATE SET
    plan = NEW.subscription_plan, status = 'active', billing_period = v_period,
    started_at = v_start, renewal_date = v_end, expiration_date = v_end,
    updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_sync_subscription ON tenants;
CREATE TRIGGER trg_tenants_sync_subscription
AFTER INSERT OR UPDATE OF subscription_plan ON tenants
FOR EACH ROW EXECUTE FUNCTION sync_subscription_for_tenant();

CREATE OR REPLACE FUNCTION sync_subscription_dates()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_months int;
BEGIN
  IF NEW.plan = 'free' THEN
    NEW.status := 'cancelled';
    NEW.renewal_date := NULL;
    NEW.expiration_date := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  v_months := CASE NEW.billing_period
    WHEN 'monthly' THEN 1 WHEN 'semiannual' THEN 6 ELSE 12 END;
  NEW.status := 'active';
  NEW.started_at := now();
  NEW.renewal_date := now() + (v_months || ' months')::interval;
  NEW.expiration_date := NEW.renewal_date;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscriptions_sync_dates ON subscriptions;
CREATE TRIGGER trg_subscriptions_sync_dates
BEFORE UPDATE OF plan, billing_period ON subscriptions
FOR EACH ROW EXECUTE FUNCTION sync_subscription_dates();
