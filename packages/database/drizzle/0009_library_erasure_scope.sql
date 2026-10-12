CREATE INDEX "library_events_entry_scope_idx" ON "library_events" USING btree ("entry_id","user_id","work_id");
--> statement-breakpoint
-- PostgreSQL keeps RI/SPI plans for a backend's lifetime. A plan selected when
-- a private library was tiny can remain inefficient after bounded growth.
-- Rebuild those plans once before an owner's cascade, not for each child row.
-- This invalidates cached plans/expressions on this backend, even on rollback;
-- it changes no rows, statistics, settings, statement definitions or privileges.
CREATE FUNCTION public.library_user_erasure_replan() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.library_entries WHERE user_id = OLD.id
  ) THEN
    EXECUTE 'DISCARD PLANS';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER library_user_erasure_replan
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.library_user_erasure_replan();
