-- A backend can retain an RI/SPI parent lookup planned while a private library
-- was tiny. Invalidate cached plans after a successful multirow event INSERT,
-- so later bounded batches can replan against the grown parent relation.
-- The current INSERT (including its FK checks) finishes before this guard.
-- Zero/one actually inserted row never executes DISCARD PLANS.
--
-- This deliberately invalidates backend-wide cached plans/expressions, even
-- after transaction rollback. Named prepared statement definitions survive.
-- It changes no rows, constraints, quotas, privileges, statistics or settings.
-- The transition relation materializes full NEW rows internally and can spill
-- under unchanged work_mem; even single-event writes incur trigger overhead.
-- The measured cost/temp-file tradeoff was explicitly approved by a maintainer.
CREATE FUNCTION public.library_event_batch_replan() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM library_event_inserted_rows OFFSET 1
  ) THEN
    EXECUTE 'DISCARD PLANS';
  END IF;
  RETURN NULL;
END;
$guard$;
--> statement-breakpoint
CREATE TRIGGER library_event_batch_replan
AFTER INSERT ON public.library_events
REFERENCING NEW TABLE AS library_event_inserted_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.library_event_batch_replan();
