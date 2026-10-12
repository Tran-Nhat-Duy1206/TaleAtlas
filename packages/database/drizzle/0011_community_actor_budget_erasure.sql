-- V4's additional signed-actor budget rows have no user FK: their keys contain
-- the actor's text UUID. Remove ONLY these four V4-owned identity-bearing keys
-- in the same account-deletion transaction, including rollback of their removal.
-- This is forward-only privacy infrastructure; applied 0010 and frozen 0000-0009
-- remain unchanged. It does not reset live users' budgets or alter catalog/auth
-- budgets, public IP-hashed read keys, unrelated rows, plans or SQL timeouts.
-- Exact equality uses the existing leading UNIQUE index on rate_limits.key.
CREATE FUNCTION public.community_user_erasure_budgets() RETURNS trigger
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
    'community.modread:' || OLD.id
  );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_user_erasure_budgets
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.community_user_erasure_budgets();
