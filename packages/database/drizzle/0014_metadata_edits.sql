-- Forward-only additive V5B. Operator must schedule referenced-relation locks.
-- No database execution is authorized by this file. Fail rather than wait forever.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "catalog_metadata_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"work_revision" integer NOT NULL,
	"approval_event_id" uuid NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"title_id" uuid,
	"title_language" text,
	"title_kind" "title_kind",
	"description_language" text,
	"genre_slug" text,
	"before_present" boolean NOT NULL,
	"after_present" boolean NOT NULL,
	"before_title" text,
	"after_title" text,
	"before_description" text,
	"after_description" text,
	"decision_source_id" uuid NOT NULL,
	"previous_source_id" uuid,
	"resulting_source_id" uuid,
	"rights_basis" text,
	"originality_acknowledged" boolean,
	"rights_review_acknowledged" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_metadata_evidence_suggestion_unique" UNIQUE("suggestion_id"),
	CONSTRAINT "catalog_metadata_evidence_revision_check" CHECK ("catalog_metadata_evidence"."work_revision" > 0),
	CONSTRAINT "catalog_metadata_evidence_shape_check" CHECK (
    ((operation_type IN ('TITLE_ADD','TITLE_REPLACE','TITLE_REMOVE') AND title_id IS NOT NULL AND title_language IS NOT NULL AND title_kind IS NOT NULL AND num_nonnulls(description_language,genre_slug,before_description,after_description,rights_basis,originality_acknowledged,rights_review_acknowledged) = 0
      AND ((operation_type = 'TITLE_ADD' AND NOT before_present AND after_present AND before_title IS NULL AND after_title IS NOT NULL AND title_kind IN ('PRIMARY','ALIAS'))
        OR (operation_type = 'TITLE_REPLACE' AND before_present AND after_present AND before_title IS NOT NULL AND after_title IS NOT NULL AND before_title <> after_title)
        OR (operation_type = 'TITLE_REMOVE' AND before_present AND NOT after_present AND before_title IS NOT NULL AND after_title IS NULL)))
    OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE','DESCRIPTION_REMOVE') AND description_language IS NOT NULL AND num_nonnulls(title_id,title_language,title_kind,genre_slug,before_title,after_title) = 0
      AND ((operation_type = 'DESCRIPTION_ADD' AND NOT before_present AND after_present AND before_description IS NULL AND after_description IS NOT NULL)
        OR (operation_type = 'DESCRIPTION_REPLACE' AND before_present AND after_present AND before_description IS NOT NULL AND after_description IS NOT NULL AND before_description <> after_description)
        OR (operation_type = 'DESCRIPTION_REMOVE' AND before_present AND NOT after_present AND before_description IS NOT NULL AND after_description IS NULL))
      AND ((operation_type = 'DESCRIPTION_REMOVE' AND num_nonnulls(rights_basis,originality_acknowledged,rights_review_acknowledged) = 0) OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE') AND rights_basis IS NOT NULL AND rights_basis = 'ORIGINAL_SUMMARY' AND originality_acknowledged IS TRUE AND rights_review_acknowledged IS TRUE)))
    OR (operation_type IN ('GENRE_ADD_MEMBERSHIP','GENRE_REMOVE_MEMBERSHIP') AND genre_slug IS NOT NULL AND num_nonnulls(title_id,title_language,title_kind,description_language,before_title,after_title,before_description,after_description,rights_basis,originality_acknowledged,rights_review_acknowledged) = 0
      AND ((operation_type = 'GENRE_ADD_MEMBERSHIP' AND NOT before_present AND after_present) OR (operation_type = 'GENRE_REMOVE_MEMBERSHIP' AND before_present AND NOT after_present))))
    AND ((NOT before_present AND previous_source_id IS NULL) OR (before_present AND previous_source_id IS NOT NULL))
    AND ((NOT after_present AND resulting_source_id IS NULL) OR (after_present AND resulting_source_id IS NOT NULL AND resulting_source_id = decision_source_id))),
	CONSTRAINT "catalog_metadata_evidence_before_title_bound" CHECK (before_title IS NULL OR (before_title = btrim(before_title) AND char_length(before_title) BETWEEN 1 AND 500)),
	CONSTRAINT "catalog_metadata_evidence_after_title_bound" CHECK (after_title IS NULL OR (after_title = btrim(after_title) AND char_length(after_title) BETWEEN 1 AND 500)),
	CONSTRAINT "catalog_metadata_evidence_before_description_bound" CHECK (before_description IS NULL OR (before_description = btrim(before_description) AND char_length(before_description) BETWEEN 1 AND 20000)),
	CONSTRAINT "catalog_metadata_evidence_after_description_bound" CHECK (after_description IS NULL OR (after_description = btrim(after_description) AND char_length(after_description) BETWEEN 1 AND 20000)),
	CONSTRAINT "catalog_metadata_evidence_title_language_bound" CHECK (title_language IS NULL OR (title_language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length(title_language) <= 63)),
	CONSTRAINT "catalog_metadata_evidence_description_language_bound" CHECK (description_language IS NULL OR (description_language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length(description_language) <= 63)),
	CONSTRAINT "catalog_metadata_evidence_slug_bound" CHECK (genre_slug IS NULL OR (genre_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(genre_slug) <= 100))
);
--> statement-breakpoint
CREATE TABLE "metadata_edit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"from_state" "edit_suggestion_state",
	"to_state" "edit_suggestion_state" NOT NULL,
	"actor_user_id" text,
	"review_reason" text,
	"reason_redacted" boolean DEFAULT false NOT NULL,
	"applied_work_revision" integer,
	"metadata_review_acknowledged" boolean,
	"publication_review_acknowledged" boolean,
	"rights_review_acknowledged" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_edit_events_revision_unique" UNIQUE("suggestion_id","revision"),
	CONSTRAINT "metadata_edit_events_id_suggestion_unique" UNIQUE("id","suggestion_id"),
	CONSTRAINT "metadata_edit_events_shape_check" CHECK ((("metadata_edit_events"."revision" = 1 AND "metadata_edit_events"."from_state" IS NULL AND "metadata_edit_events"."to_state" = 'SUBMITTED' AND "metadata_edit_events"."review_reason" IS NULL AND "metadata_edit_events"."applied_work_revision" IS NULL AND "metadata_edit_events"."metadata_review_acknowledged" IS NULL AND "metadata_edit_events"."publication_review_acknowledged" IS NULL AND "metadata_edit_events"."rights_review_acknowledged" IS NULL) OR ("metadata_edit_events"."revision" = 2 AND "metadata_edit_events"."from_state" IS NOT NULL AND "metadata_edit_events"."from_state" = 'SUBMITTED' AND "metadata_edit_events"."to_state" IN ('APPROVED','REJECTED') AND (("metadata_edit_events"."reason_redacted" AND "metadata_edit_events"."review_reason" IS NULL) OR (NOT "metadata_edit_events"."reason_redacted" AND "metadata_edit_events"."review_reason" IS NOT NULL AND "metadata_edit_events"."review_reason" = btrim("metadata_edit_events"."review_reason") AND char_length("metadata_edit_events"."review_reason") BETWEEN 1 AND 2000)) AND (("metadata_edit_events"."to_state" = 'APPROVED' AND "metadata_edit_events"."applied_work_revision" IS NOT NULL AND "metadata_edit_events"."applied_work_revision" > 0 AND "metadata_edit_events"."metadata_review_acknowledged" IS TRUE AND "metadata_edit_events"."publication_review_acknowledged" IS TRUE AND "metadata_edit_events"."rights_review_acknowledged" IS TRUE) OR ("metadata_edit_events"."to_state" = 'REJECTED' AND "metadata_edit_events"."applied_work_revision" IS NULL AND "metadata_edit_events"."metadata_review_acknowledged" IS NULL AND "metadata_edit_events"."publication_review_acknowledged" IS NULL AND "metadata_edit_events"."rights_review_acknowledged" IS NULL)))))
);
--> statement-breakpoint
CREATE TABLE "metadata_edit_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"work_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"base_work_revision" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" "edit_suggestion_state" DEFAULT 'SUBMITTED' NOT NULL,
	"operation_type" text NOT NULL,
	"title_id" uuid,
	"title_text" text,
	"title_language" text,
	"title_kind" "title_kind",
	"description_language" text,
	"description_text" text,
	"genre_slug" text,
	"operation_reason" text,
	"citation_label" text,
	"citation_text" text,
	"citation_url" text,
	"citation_consulted_at" text,
	"rights_basis" text,
	"originality_acknowledged" boolean,
	"rights_statement" text,
	"submit_key" uuid,
	"input_hash" text,
	"applied_work_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_state" text DEFAULT 'ACTIVE' NOT NULL,
	"erased_at" timestamp with time zone,
	CONSTRAINT "metadata_edit_suggestions_owner_submit_unique" UNIQUE("owner_user_id","submit_key"),
	CONSTRAINT "metadata_edit_suggestions_id_work_unique" UNIQUE("id","work_id"),
	CONSTRAINT "metadata_edit_suggestions_lifecycle_check" CHECK ("metadata_edit_suggestions"."version" = 1 AND "metadata_edit_suggestions"."base_work_revision" > 0 AND (("metadata_edit_suggestions"."state" = 'SUBMITTED' AND "metadata_edit_suggestions"."revision" = 1 AND "metadata_edit_suggestions"."applied_work_revision" IS NULL) OR ("metadata_edit_suggestions"."state" = 'REJECTED' AND "metadata_edit_suggestions"."revision" = 2 AND "metadata_edit_suggestions"."applied_work_revision" IS NULL) OR ("metadata_edit_suggestions"."state" = 'APPROVED' AND "metadata_edit_suggestions"."revision" = 2 AND "metadata_edit_suggestions"."applied_work_revision" IS NOT NULL AND "metadata_edit_suggestions"."applied_work_revision"::bigint = "metadata_edit_suggestions"."base_work_revision"::bigint + 1))),
	CONSTRAINT "metadata_edit_suggestions_operation_check" CHECK ("metadata_edit_suggestions"."operation_type" IN ('TITLE_ADD','TITLE_REPLACE','TITLE_REMOVE','DESCRIPTION_ADD','DESCRIPTION_REPLACE','DESCRIPTION_REMOVE','GENRE_ADD_MEMBERSHIP','GENRE_REMOVE_MEMBERSHIP')),
	CONSTRAINT "metadata_edit_suggestions_content_check" CHECK (
    (content_state = 'ERASED' AND owner_user_id IS NULL AND erased_at IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,genre_slug,operation_reason,citation_label,citation_text,citation_url,citation_consulted_at,rights_basis,originality_acknowledged,rights_statement,submit_key,input_hash) = 0)
    OR (content_state = 'ACTIVE' AND owner_user_id IS NOT NULL AND erased_at IS NULL AND submit_key IS NOT NULL AND input_hash IS NOT NULL AND input_hash ~ '^[0-9a-f]{64}$' AND citation_label IS NOT NULL AND citation_text IS NOT NULL AND (
      (operation_type = 'TITLE_ADD' AND title_text IS NOT NULL AND title_language IS NOT NULL AND title_kind IS NOT NULL AND title_kind IN ('PRIMARY','ALIAS') AND num_nonnulls(title_id,description_language,description_text,genre_slug,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'TITLE_REPLACE' AND title_id IS NOT NULL AND title_text IS NOT NULL AND num_nonnulls(title_language,title_kind,description_language,description_text,genre_slug,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'TITLE_REMOVE' AND title_id IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_text,title_language,title_kind,description_language,description_text,genre_slug,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE') AND description_language IS NOT NULL AND description_text IS NOT NULL AND rights_basis IS NOT NULL AND rights_basis = 'ORIGINAL_SUMMARY' AND originality_acknowledged IS TRUE AND rights_statement IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,genre_slug,operation_reason) = 0)
      OR (operation_type = 'DESCRIPTION_REMOVE' AND description_language IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_text,genre_slug,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'GENRE_ADD_MEMBERSHIP' AND genre_slug IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'GENRE_REMOVE_MEMBERSHIP' AND genre_slug IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,rights_basis,originality_acknowledged,rights_statement) = 0)
    ))),
	CONSTRAINT "metadata_edit_suggestions_title_text_bound" CHECK (title_text IS NULL OR (title_text = btrim(title_text) AND char_length(title_text) BETWEEN 1 AND 500)),
	CONSTRAINT "metadata_edit_suggestions_description_text_bound" CHECK (description_text IS NULL OR (description_text = btrim(description_text) AND char_length(description_text) BETWEEN 1 AND 20000)),
	CONSTRAINT "metadata_edit_suggestions_operation_reason_bound" CHECK (operation_reason IS NULL OR (operation_reason = btrim(operation_reason) AND char_length(operation_reason) BETWEEN 1 AND 2000)),
	CONSTRAINT "metadata_edit_suggestions_citation_label_bound" CHECK (citation_label IS NULL OR (citation_label = btrim(citation_label) AND char_length(citation_label) BETWEEN 1 AND 200)),
	CONSTRAINT "metadata_edit_suggestions_citation_text_bound" CHECK (citation_text IS NULL OR (citation_text = btrim(citation_text) AND char_length(citation_text) BETWEEN 1 AND 4000)),
	CONSTRAINT "metadata_edit_suggestions_rights_statement_bound" CHECK (rights_statement IS NULL OR (rights_statement = btrim(rights_statement) AND char_length(rights_statement) BETWEEN 1 AND 2000)),
	CONSTRAINT "metadata_edit_suggestions_title_language_bound" CHECK (title_language IS NULL OR (title_language ~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$' AND char_length(title_language) <= 35)),
	CONSTRAINT "metadata_edit_suggestions_description_language_bound" CHECK (description_language IS NULL OR (description_language ~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$' AND char_length(description_language) <= 35)),
	CONSTRAINT "metadata_edit_suggestions_slug_bound" CHECK (genre_slug IS NULL OR (genre_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(genre_slug) <= 100)),
	CONSTRAINT "metadata_edit_suggestions_url_bound" CHECK (citation_url IS NULL OR char_length(citation_url) <= 2000),
	CONSTRAINT "metadata_edit_suggestions_consulted_bound" CHECK (citation_consulted_at IS NULL OR char_length(citation_consulted_at) <= 60000),
	CONSTRAINT "metadata_edit_suggestions_raw_bytes_bound" CHECK (octet_length(concat_ws('',title_id::text,title_text,title_language,title_kind::text,description_language,description_text,genre_slug,operation_reason,citation_label,citation_text,citation_url,citation_consulted_at,rights_basis,originality_acknowledged::text,rights_statement)) <= 60000)
);
--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_audit_event_id_catalog_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."catalog_audit_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_decision_source_id_catalog_sources_id_fk" FOREIGN KEY ("decision_source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_previous_source_id_catalog_sources_id_fk" FOREIGN KEY ("previous_source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_resulting_source_id_catalog_sources_id_fk" FOREIGN KEY ("resulting_source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_suggestion_work_fk" FOREIGN KEY ("suggestion_id","work_id") REFERENCES "public"."metadata_edit_suggestions"("id","work_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_metadata_evidence" ADD CONSTRAINT "catalog_metadata_evidence_approval_suggestion_fk" FOREIGN KEY ("approval_event_id","suggestion_id") REFERENCES "public"."metadata_edit_events"("id","suggestion_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_edit_events" ADD CONSTRAINT "metadata_edit_events_suggestion_id_metadata_edit_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."metadata_edit_suggestions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_edit_events" ADD CONSTRAINT "metadata_edit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_edit_suggestions" ADD CONSTRAINT "metadata_edit_suggestions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_edit_suggestions" ADD CONSTRAINT "metadata_edit_suggestions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_work_idx" ON "catalog_metadata_evidence" USING btree ("work_id","work_revision");--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_decision_source_idx" ON "catalog_metadata_evidence" USING btree ("decision_source_id");--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_previous_source_idx" ON "catalog_metadata_evidence" USING btree ("previous_source_id");--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_resulting_source_idx" ON "catalog_metadata_evidence" USING btree ("resulting_source_id");--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_approval_idx" ON "catalog_metadata_evidence" USING btree ("approval_event_id","suggestion_id");--> statement-breakpoint
CREATE INDEX "catalog_metadata_evidence_audit_idx" ON "catalog_metadata_evidence" USING btree ("audit_event_id");--> statement-breakpoint
CREATE INDEX "metadata_edit_events_actor_idx" ON "metadata_edit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "metadata_edit_suggestions_owner_page_idx" ON "metadata_edit_suggestions" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "metadata_edit_suggestions_queue_idx" ON "metadata_edit_suggestions" USING btree ("state","created_at","id") WHERE "metadata_edit_suggestions"."content_state" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "metadata_edit_suggestions_work_idx" ON "metadata_edit_suggestions" USING btree ("work_id");
--> statement-breakpoint
-- Invoker-only functions, fixed trusted search path, fully qualified relations.
-- JSONB below is transient row comparison only, never canonical/payload storage.
CREATE FUNCTION public.metadata_edit_header_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'metadata suggestion history is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.content_state <> 'ACTIVE' OR NEW.state <> 'SUBMITTED' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'metadata suggestion must start active and submitted' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- An owner can become NULL only when its referenced user is actually deleted.
  -- The FK action updates only owner_user_id; do not accept piggybacked mutations.
  IF OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.owner_user_id) THEN
    IF (to_jsonb(NEW) - 'owner_user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'owner_user_id') THEN
      RAISE EXCEPTION 'invalid metadata erasure mutation' USING ERRCODE = '23514';
    END IF;
    NEW.title_id := NULL; NEW.title_text := NULL; NEW.title_language := NULL; NEW.title_kind := NULL;
    NEW.description_language := NULL; NEW.description_text := NULL; NEW.genre_slug := NULL; NEW.operation_reason := NULL;
    NEW.citation_label := NULL; NEW.citation_text := NULL; NEW.citation_url := NULL; NEW.citation_consulted_at := NULL;
    NEW.rights_basis := NULL; NEW.originality_acknowledged := NULL; NEW.rights_statement := NULL;
    NEW.submit_key := NULL; NEW.input_hash := NULL; NEW.content_state := 'ERASED'; NEW.erased_at := clock_timestamp();
    NEW.updated_at := NEW.erased_at;
    RETURN NEW;
  END IF;
  IF OLD.content_state <> 'ACTIVE' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR (to_jsonb(NEW) - ARRAY['state','revision','applied_work_revision','updated_at']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['state','revision','applied_work_revision','updated_at'])
     OR OLD.state <> 'SUBMITTED' OR OLD.revision <> 1 OR NEW.revision <> 2 OR NEW.state NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'invalid metadata review transition or immutable mutation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER metadata_edit_header_guard BEFORE INSERT OR UPDATE OR DELETE ON public.metadata_edit_suggestions
FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_header_guard();
--> statement-breakpoint
CREATE FUNCTION public.metadata_edit_event_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE p public.metadata_edit_suggestions%ROWTYPE; actor_erased boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'metadata events are append only' USING ERRCODE = '23514';
  END IF;
  -- Inserts serialize lifecycle changes with owner erasure/review. Privacy-only
  -- UPDATE already holds the event row; taking its parent lock would invert the
  -- owner's header -> event erasure order. Its unchanged checks below prove the
  -- monotonic exception from a plain snapshot (never a new lifecycle transition).
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO p FROM public.metadata_edit_suggestions WHERE id = NEW.suggestion_id FOR UPDATE;
  ELSE
    SELECT * INTO p FROM public.metadata_edit_suggestions WHERE id = NEW.suggestion_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing metadata parent' USING ERRCODE = '23503'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF p.content_state <> 'ACTIVE' OR NEW.actor_user_id IS NULL OR NEW.reason_redacted
       OR NEW.revision <> p.revision OR NEW.to_state <> p.state
       OR NEW.applied_work_revision IS DISTINCT FROM p.applied_work_revision
       OR (NEW.revision = 1 AND NEW.actor_user_id IS DISTINCT FROM p.owner_user_id) THEN
      RAISE EXCEPTION 'invalid metadata event insertion' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  actor_erased := OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.actor_user_id);
  IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NOT actor_erased THEN
    RAISE EXCEPTION 'metadata actor cannot be rebound or manually nulled' USING ERRCODE = '23514';
  END IF;
  IF actor_erased THEN NEW.review_reason := NULL; NEW.reason_redacted := true; END IF;
  IF (to_jsonb(NEW) - ARRAY['actor_user_id','review_reason','reason_redacted']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['actor_user_id','review_reason','reason_redacted'])
     OR (OLD.reason_redacted AND (NOT NEW.reason_redacted OR NEW.review_reason IS NOT NULL))
     OR (NOT actor_erased AND NOT (p.content_state = 'ERASED' AND p.owner_user_id IS NULL AND p.erased_at IS NOT NULL
       AND NEW.reason_redacted AND NEW.review_reason IS NULL AND NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)) THEN
    RAISE EXCEPTION 'invalid metadata event privacy mutation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER metadata_edit_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.metadata_edit_events
FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_event_guard();
--> statement-breakpoint
CREATE FUNCTION public.metadata_edit_redact_owner_reasons() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.content_state = 'ACTIVE' AND NEW.content_state = 'ERASED' THEN
    UPDATE public.metadata_edit_events SET review_reason = NULL, reason_redacted = true
    WHERE suggestion_id = NEW.id AND revision = 2 AND NOT reason_redacted;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER metadata_edit_redact_owner_reasons AFTER UPDATE ON public.metadata_edit_suggestions
FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_redact_owner_reasons();
--> statement-breakpoint
CREATE FUNCTION public.catalog_metadata_evidence_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE p public.metadata_edit_suggestions%ROWTYPE; e public.metadata_edit_events%ROWTYPE; a public.catalog_audit_events%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'metadata evidence is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO p FROM public.metadata_edit_suggestions WHERE id = NEW.suggestion_id FOR UPDATE;
  IF NOT FOUND OR p.content_state <> 'ACTIVE' OR p.state <> 'APPROVED' OR NEW.work_id <> p.work_id
    OR NEW.work_revision IS DISTINCT FROM p.applied_work_revision OR NEW.operation_type <> p.operation_type THEN
    RAISE EXCEPTION 'metadata evidence parent mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO e FROM public.metadata_edit_events WHERE id = NEW.approval_event_id AND suggestion_id = p.id;
  IF NOT FOUND OR e.to_state <> 'APPROVED' OR e.revision <> 2 OR e.applied_work_revision IS DISTINCT FROM NEW.work_revision THEN
    RAISE EXCEPTION 'metadata evidence approval mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO a FROM public.catalog_audit_events WHERE id = NEW.audit_event_id FOR UPDATE;
  IF NOT FOUND OR a.work_id <> NEW.work_id OR a.new_revision <> NEW.work_revision
    OR a.previous_revision IS DISTINCT FROM p.base_work_revision OR a.operation <> 'UPDATE'
    OR a.actor_id_snapshot <> 'metadata-review' OR a.actor_user_id IS DISTINCT FROM e.actor_user_id
    OR a.changes IS DISTINCT FROM jsonb_build_object('sourceId', NEW.decision_source_id::text) THEN
    RAISE EXCEPTION 'metadata evidence audit mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_metadata_evidence WHERE audit_event_id = NEW.audit_event_id) THEN
    RAISE EXCEPTION 'metadata audit already linked' USING ERRCODE = '23514';
  END IF;
  IF (p.title_id IS NOT NULL AND NEW.title_id IS DISTINCT FROM p.title_id)
    OR (p.title_language IS NOT NULL AND NEW.title_language IS DISTINCT FROM p.title_language)
    OR (p.title_kind IS NOT NULL AND NEW.title_kind IS DISTINCT FROM p.title_kind)
    OR NEW.description_language IS DISTINCT FROM p.description_language OR NEW.genre_slug IS DISTINCT FROM p.genre_slug
    OR (p.title_text IS NOT NULL AND NEW.after_title IS DISTINCT FROM p.title_text)
    OR (p.description_text IS NOT NULL AND NEW.after_description IS DISTINCT FROM p.description_text)
    OR NEW.rights_basis IS DISTINCT FROM p.rights_basis OR NEW.originality_acknowledged IS DISTINCT FROM p.originality_acknowledged THEN
    RAISE EXCEPTION 'metadata evidence intent mismatch' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.works WHERE id = NEW.work_id AND revision = NEW.work_revision AND source_id = NEW.decision_source_id AND visibility = 'PUBLISHED')
    OR NOT EXISTS (SELECT 1 FROM public.catalog_sources s WHERE s.id = NEW.decision_source_id
      AND s.label = p.citation_label AND s.citation = p.citation_text AND s.url IS NOT DISTINCT FROM p.citation_url
      AND s.consulted_at IS NOT DISTINCT FROM p.citation_consulted_at::timestamptz) THEN
    RAISE EXCEPTION 'metadata evidence work/source mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.operation_type IN ('TITLE_ADD','TITLE_REPLACE') THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_titles t WHERE t.id = NEW.title_id AND t.work_id = NEW.work_id
      AND t.title = NEW.after_title AND t.language = NEW.title_language AND t.kind = NEW.title_kind AND t.source_id = NEW.decision_source_id) THEN
      RAISE EXCEPTION 'metadata title result mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.operation_type = 'TITLE_REMOVE' THEN
    IF EXISTS (SELECT 1 FROM public.work_titles WHERE id = NEW.title_id) THEN
      RAISE EXCEPTION 'metadata title removal mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE') THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_descriptions d WHERE d.work_id = NEW.work_id AND d.language = NEW.description_language
      AND d.text = NEW.after_description AND d.source_id = NEW.decision_source_id) THEN
      RAISE EXCEPTION 'metadata description result mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.operation_type = 'DESCRIPTION_REMOVE' THEN
    IF EXISTS (SELECT 1 FROM public.work_descriptions WHERE work_id = NEW.work_id AND language = NEW.description_language) THEN
      RAISE EXCEPTION 'metadata description removal mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.operation_type = 'GENRE_ADD_MEMBERSHIP' THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_genres WHERE work_id = NEW.work_id AND genre_slug = NEW.genre_slug AND source_id = NEW.decision_source_id) THEN
      RAISE EXCEPTION 'metadata genre result mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.operation_type = 'GENRE_REMOVE_MEMBERSHIP' THEN
    IF EXISTS (SELECT 1 FROM public.work_genres WHERE work_id = NEW.work_id AND genre_slug = NEW.genre_slug) THEN
      RAISE EXCEPTION 'metadata genre removal mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_metadata_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_metadata_evidence
FOR EACH ROW EXECUTE FUNCTION public.catalog_metadata_evidence_guard();
--> statement-breakpoint
CREATE FUNCTION public.metadata_edit_consistency_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE sid uuid; p public.metadata_edit_suggestions%ROWTYPE; n bigint;
BEGIN
  IF TG_TABLE_NAME = 'metadata_edit_suggestions' THEN sid := NEW.id; ELSE sid := NEW.suggestion_id; END IF;
  -- Keep every consistency check for privacy UPDATE, without reacquiring the
  -- header after its event row (including during deferred commit processing).
  IF TG_TABLE_NAME = 'metadata_edit_events' AND TG_OP = 'UPDATE' THEN
    SELECT * INTO p FROM public.metadata_edit_suggestions WHERE id = sid;
  ELSE
    SELECT * INTO p FROM public.metadata_edit_suggestions WHERE id = sid FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing metadata consistency parent' USING ERRCODE = '23514'; END IF;
  SELECT count(*) INTO n FROM public.metadata_edit_events WHERE suggestion_id = sid AND revision = 1 AND to_state = 'SUBMITTED';
  IF n <> 1 THEN RAISE EXCEPTION 'metadata initial event required' USING ERRCODE = '23514'; END IF;
  SELECT count(*) INTO n FROM public.metadata_edit_events WHERE suggestion_id = sid;
  IF n <> p.revision OR (p.revision = 2 AND NOT EXISTS (SELECT 1 FROM public.metadata_edit_events
      WHERE suggestion_id = sid AND revision = 2 AND to_state = p.state AND applied_work_revision IS NOT DISTINCT FROM p.applied_work_revision)) THEN
    RAISE EXCEPTION 'metadata terminal event mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO n FROM public.catalog_metadata_evidence v
    JOIN public.metadata_edit_events e ON e.id = v.approval_event_id AND e.suggestion_id = v.suggestion_id
    JOIN public.catalog_audit_events a ON a.id = v.audit_event_id
    WHERE v.suggestion_id = sid AND v.work_id = p.work_id AND v.work_revision = p.applied_work_revision
      AND v.operation_type = p.operation_type AND e.revision = 2 AND e.to_state = 'APPROVED' AND e.applied_work_revision = v.work_revision
      AND a.work_id = v.work_id AND a.new_revision = v.work_revision AND a.previous_revision = p.base_work_revision;
  IF (p.state = 'APPROVED' AND n <> 1) OR (p.state <> 'APPROVED' AND EXISTS (SELECT 1 FROM public.catalog_metadata_evidence WHERE suggestion_id = sid)) THEN
    RAISE EXCEPTION 'metadata approval evidence/audit required, rejection evidence forbidden' USING ERRCODE = '23514';
  END IF;
  -- Do not re-compare cleared private payload on erasure: approved facts survive.
  IF p.content_state = 'ERASED' AND EXISTS (SELECT 1 FROM public.metadata_edit_events WHERE suggestion_id = sid AND revision = 2 AND (NOT reason_redacted OR review_reason IS NOT NULL)) THEN
    RAISE EXCEPTION 'metadata owner reasons must be erased' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER metadata_edit_header_consistency AFTER INSERT OR UPDATE ON public.metadata_edit_suggestions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_consistency_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER metadata_edit_event_consistency AFTER INSERT OR UPDATE ON public.metadata_edit_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_consistency_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER metadata_edit_evidence_consistency AFTER INSERT ON public.catalog_metadata_evidence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.metadata_edit_consistency_guard();
--> statement-breakpoint
CREATE FUNCTION public.metadata_edit_no_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'metadata history cannot be truncated' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER metadata_edit_header_no_truncate BEFORE TRUNCATE ON public.metadata_edit_suggestions
FOR EACH STATEMENT EXECUTE FUNCTION public.metadata_edit_no_truncate();
--> statement-breakpoint
CREATE TRIGGER metadata_edit_event_no_truncate BEFORE TRUNCATE ON public.metadata_edit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.metadata_edit_no_truncate();
--> statement-breakpoint
CREATE TRIGGER catalog_metadata_evidence_no_truncate BEFORE TRUNCATE ON public.catalog_metadata_evidence
FOR EACH STATEMENT EXECUTE FUNCTION public.metadata_edit_no_truncate();