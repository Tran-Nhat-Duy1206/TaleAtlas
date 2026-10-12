-- V4B adds a separate verified-owner metadata read bucket (60/minute).
-- Replace only the existing invoker function: frozen 0000-0011 and their
-- already-applied trigger identities remain unchanged. Exact equality erases
-- the fifth V4-owned actor key atomically, including rollback, without touching
-- catalog/auth/shared-IP keys or budgets belonging to any other live actor.
CREATE OR REPLACE FUNCTION public.community_user_erasure_budgets() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE key IN (
    'community.post:' || OLD.id,
    'community.report:' || OLD.id,
    'community.safety:' || OLD.id,
    'community.modread:' || OLD.id,
    'community.ownread:' || OLD.id
  );
  RETURN OLD;
END;
$$;
