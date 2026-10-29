CREATE FUNCTION public.reader_profile_user_erasure_budgets() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE key IN ('reader-profile.attempt:' || OLD.id, 'reader-profile.write:' || OLD.id, 'reader-profile.withdraw:' || OLD.id);
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reader_profile_user_erasure_budgets
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.reader_profile_user_erasure_budgets();
