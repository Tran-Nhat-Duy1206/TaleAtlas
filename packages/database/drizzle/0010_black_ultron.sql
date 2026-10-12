CREATE TYPE "public"."community_author_state" AS ENUM('ACTIVE', 'DELETED', 'ERASED');--> statement-breakpoint
CREATE TYPE "public"."community_command_kind" AS ENUM('CREATE_THREAD', 'CREATE_REPLY', 'CREATE_REVIEW', 'EDIT', 'WITHDRAW', 'REPORT', 'DISMISS', 'HIDE', 'RESTORE');--> statement-breakpoint
CREATE TYPE "public"."community_content_kind" AS ENUM('THREAD', 'REPLY', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."community_moderation_action_kind" AS ENUM('DISMISS', 'HIDE', 'RESTORE');--> statement-breakpoint
CREATE TYPE "public"."community_moderation_state" AS ENUM('VISIBLE', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."community_mutation_outcome" AS ENUM('APPLIED', 'NOOP');--> statement-breakpoint
CREATE TYPE "public"."community_report_reason" AS ENUM('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'ILLEGAL_CONTENT', 'COPYRIGHT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."community_report_state" AS ENUM('OPEN', 'DISMISSED', 'UPHELD');--> statement-breakpoint
CREATE TABLE "community_content_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"target_kind" "community_content_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"content_revision" integer NOT NULL,
	"command" "community_command_kind" NOT NULL,
	"before_author_state" "community_author_state" NOT NULL,
	"after_author_state" "community_author_state" NOT NULL,
	"before_moderation_state" "community_moderation_state" NOT NULL,
	"after_moderation_state" "community_moderation_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_content_events_revision_unique" UNIQUE("content_id","content_revision"),
	CONSTRAINT "community_content_events_revision_check" CHECK ("community_content_events"."content_revision" > 0),
	CONSTRAINT "community_content_events_command_check" CHECK ("community_content_events"."command" <> 'REPORT')
);
--> statement-breakpoint
CREATE TABLE "community_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"kind" "community_content_kind" NOT NULL,
	"author_id" text,
	"author_state" "community_author_state" DEFAULT 'ACTIVE' NOT NULL,
	"moderation_state" "community_moderation_state" DEFAULT 'VISIBLE' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"title_spoiler" boolean DEFAULT false NOT NULL,
	"body_spoiler" boolean DEFAULT false NOT NULL,
	"spoiler_context" text,
	"rating_half_stars" integer,
	"thread_id" uuid,
	"thread_kind" "community_content_kind",
	"parent_id" uuid,
	"parent_kind" "community_content_kind",
	"parent_depth" integer,
	"depth" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"moderation_action_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"edited_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "community_contents_scope_unique" UNIQUE("id","work_id","kind"),
	CONSTRAINT "community_contents_parent_scope_unique" UNIQUE("id","work_id","thread_id","kind","depth"),
	CONSTRAINT "community_contents_structure_check" CHECK (("community_contents"."kind" = 'REPLY' AND "community_contents"."thread_id" IS NOT NULL AND "community_contents"."thread_kind" = 'THREAD' AND "community_contents"."thread_kind" IS NOT NULL AND "community_contents"."depth" BETWEEN 0 AND 2 AND "community_contents"."depth" IS NOT NULL AND (("community_contents"."depth" = 0 AND "community_contents"."parent_id" IS NULL AND "community_contents"."parent_kind" IS NULL AND "community_contents"."parent_depth" IS NULL) OR ("community_contents"."depth" > 0 AND "community_contents"."parent_id" IS NOT NULL AND "community_contents"."parent_kind" = 'REPLY' AND "community_contents"."parent_kind" IS NOT NULL AND "community_contents"."parent_depth" = "community_contents"."depth" - 1 AND "community_contents"."parent_depth" IS NOT NULL))) OR ("community_contents"."kind" IN ('THREAD','REVIEW') AND "community_contents"."thread_id" IS NULL AND "community_contents"."thread_kind" IS NULL AND "community_contents"."parent_id" IS NULL AND "community_contents"."parent_kind" IS NULL AND "community_contents"."parent_depth" IS NULL AND "community_contents"."depth" IS NULL)),
	CONSTRAINT "community_contents_text_bounds_check" CHECK (char_length("community_contents"."title") + char_length(regexp_replace("community_contents"."title", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 160 AND octet_length("community_contents"."title") <= 640 AND char_length("community_contents"."body") + char_length(regexp_replace("community_contents"."body", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 8000 AND octet_length("community_contents"."body") <= 32000 AND ("community_contents"."kind" <> 'REPLY' OR (char_length("community_contents"."body") + char_length(regexp_replace("community_contents"."body", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 4000 AND octet_length("community_contents"."body") <= 16000)) AND ("community_contents"."spoiler_context" IS NULL OR (char_length("community_contents"."spoiler_context") + char_length(regexp_replace("community_contents"."spoiler_context", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 80 AND octet_length("community_contents"."spoiler_context") <= 320 AND char_length(btrim("community_contents"."spoiler_context")) > 0))),
	CONSTRAINT "community_contents_flags_check" CHECK (("community_contents"."kind" = 'THREAD' OR ("community_contents"."title" = '' AND NOT "community_contents"."title_spoiler")) AND ("community_contents"."spoiler_context" IS NULL OR "community_contents"."title_spoiler" OR "community_contents"."body_spoiler") AND ("community_contents"."kind" = 'REVIEW' OR "community_contents"."rating_half_stars" IS NULL)),
	CONSTRAINT "community_contents_rating_check" CHECK ("community_contents"."rating_half_stars" BETWEEN 2 AND 10),
	CONSTRAINT "community_contents_author_shape_check" CHECK (("community_contents"."author_state" = 'ERASED' AND "community_contents"."author_id" IS NULL AND "community_contents"."created_at" IS NULL AND "community_contents"."updated_at" IS NULL AND "community_contents"."edited_at" IS NULL AND "community_contents"."last_activity_at" IS NULL) OR ("community_contents"."author_state" <> 'ERASED' AND "community_contents"."author_id" IS NOT NULL AND "community_contents"."created_at" IS NOT NULL AND "community_contents"."updated_at" IS NOT NULL AND "community_contents"."last_activity_at" IS NOT NULL)),
	CONSTRAINT "community_contents_live_text_check" CHECK (("community_contents"."author_state" = 'ACTIVE' AND (("community_contents"."kind" = 'THREAD' AND char_length(btrim("community_contents"."title")) >= 1 AND char_length(btrim("community_contents"."body")) >= 1) OR ("community_contents"."kind" = 'REPLY' AND char_length(btrim("community_contents"."body")) >= 1) OR ("community_contents"."kind" = 'REVIEW' AND char_length(btrim("community_contents"."body")) + char_length(regexp_replace(btrim("community_contents"."body"), U&'[^\+010000-\+10FFFF]', '', 'g')) >= 20))) OR ("community_contents"."author_state" <> 'ACTIVE' AND "community_contents"."title" = '' AND "community_contents"."body" = '' AND "community_contents"."spoiler_context" IS NULL AND "community_contents"."rating_half_stars" IS NULL AND NOT "community_contents"."title_spoiler" AND NOT "community_contents"."body_spoiler")),
	CONSTRAINT "community_contents_revision_check" CHECK ("community_contents"."revision" > 0),
	CONSTRAINT "community_contents_event_count_check" CHECK ("community_contents"."event_count" BETWEEN 0 AND 1001),
	CONSTRAINT "community_contents_report_count_check" CHECK ("community_contents"."report_count" BETWEEN 0 AND 50),
	CONSTRAINT "community_contents_action_count_check" CHECK ("community_contents"."moderation_action_count" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "community_moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"target_kind" "community_content_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"report_id" uuid,
	"action" "community_moderation_action_kind" NOT NULL,
	"reason" text NOT NULL,
	"evidence_redacted" boolean DEFAULT false NOT NULL,
	"sequence" integer NOT NULL,
	"content_revision" integer NOT NULL,
	"report_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_moderation_actions_sequence_unique" UNIQUE("content_id","sequence"),
	CONSTRAINT "community_moderation_actions_sequence_check" CHECK ("community_moderation_actions"."sequence" BETWEEN 1 AND 1000),
	CONSTRAINT "community_moderation_actions_revision_check" CHECK ("community_moderation_actions"."content_revision" > 0 AND ("community_moderation_actions"."report_revision" IS NULL OR "community_moderation_actions"."report_revision" > 0)),
	CONSTRAINT "community_moderation_actions_reason_check" CHECK (char_length("community_moderation_actions"."reason") + char_length(regexp_replace("community_moderation_actions"."reason", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 1000 AND octet_length("community_moderation_actions"."reason") <= 4000 AND (("community_moderation_actions"."evidence_redacted" AND "community_moderation_actions"."reason" = '') OR (NOT "community_moderation_actions"."evidence_redacted" AND char_length(btrim("community_moderation_actions"."reason")) > 0)))
);
--> statement-breakpoint
CREATE TABLE "community_mutation_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"target_kind" "community_content_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"report_id" uuid,
	"mutation_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"command" "community_command_kind" NOT NULL,
	"outcome" "community_mutation_outcome" NOT NULL,
	"content_revision" integer NOT NULL,
	"report_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_mutation_receipts_actor_key_unique" UNIQUE("actor_id","mutation_key"),
	CONSTRAINT "community_mutation_receipts_hash_check" CHECK ("community_mutation_receipts"."request_hash" ~ '^[0-9a-f]{64}$' AND char_length("community_mutation_receipts"."request_hash") = 64),
	CONSTRAINT "community_mutation_receipts_revision_check" CHECK ("community_mutation_receipts"."content_revision" > 0 AND ("community_mutation_receipts"."report_revision" IS NULL OR "community_mutation_receipts"."report_revision" > 0))
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"target_kind" "community_content_kind" NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" "community_report_reason" NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"evidence_redacted" boolean DEFAULT false NOT NULL,
	"state" "community_report_state" DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reports_scope_unique" UNIQUE("id","work_id","content_id","target_kind"),
	CONSTRAINT "community_reports_explanation_check" CHECK (char_length("community_reports"."explanation") + char_length(regexp_replace("community_reports"."explanation", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 1000 AND octet_length("community_reports"."explanation") <= 4000),
	CONSTRAINT "community_reports_evidence_check" CHECK (("community_reports"."evidence_redacted" AND "community_reports"."explanation" = '') OR (NOT "community_reports"."evidence_redacted" AND ("community_reports"."reason" <> 'OTHER' OR char_length(btrim("community_reports"."explanation")) > 0))),
	CONSTRAINT "community_reports_revision_check" CHECK ("community_reports"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "community_content_events" ADD CONSTRAINT "community_content_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_content_events" ADD CONSTRAINT "community_content_events_target_fk" FOREIGN KEY ("content_id","work_id","target_kind") REFERENCES "public"."community_contents"("id","work_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contents" ADD CONSTRAINT "community_contents_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contents" ADD CONSTRAINT "community_contents_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contents" ADD CONSTRAINT "community_contents_thread_fk" FOREIGN KEY ("thread_id","work_id","thread_kind") REFERENCES "public"."community_contents"("id","work_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contents" ADD CONSTRAINT "community_contents_parent_fk" FOREIGN KEY ("parent_id","work_id","thread_id","parent_kind","parent_depth") REFERENCES "public"."community_contents"("id","work_id","thread_id","kind","depth") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_target_fk" FOREIGN KEY ("content_id","work_id","target_kind") REFERENCES "public"."community_contents"("id","work_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_report_fk" FOREIGN KEY ("report_id","work_id","content_id","target_kind") REFERENCES "public"."community_reports"("id","work_id","content_id","target_kind") ON DELETE SET NULL ("report_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mutation_receipts" ADD CONSTRAINT "community_mutation_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mutation_receipts" ADD CONSTRAINT "community_mutation_receipts_target_fk" FOREIGN KEY ("content_id","work_id","target_kind") REFERENCES "public"."community_contents"("id","work_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mutation_receipts" ADD CONSTRAINT "community_mutation_receipts_report_fk" FOREIGN KEY ("report_id","work_id","content_id","target_kind") REFERENCES "public"."community_reports"("id","work_id","content_id","target_kind") ON DELETE SET NULL ("report_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_target_fk" FOREIGN KEY ("content_id","work_id","target_kind") REFERENCES "public"."community_contents"("id","work_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_content_events_target_idx" ON "community_content_events" USING btree ("content_id","work_id","target_kind");--> statement-breakpoint
CREATE INDEX "community_content_events_actor_idx" ON "community_content_events" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_contents_review_slot_unique" ON "community_contents" USING btree ("author_id","work_id") WHERE "community_contents"."kind" = 'REVIEW' AND ("community_contents"."author_state" = 'ACTIVE' OR "community_contents"."moderation_state" = 'HIDDEN');--> statement-breakpoint
CREATE INDEX "community_contents_author_idx" ON "community_contents" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "community_contents_work_idx" ON "community_contents" USING btree ("work_id","kind","created_at","id");--> statement-breakpoint
CREATE INDEX "community_contents_thread_idx" ON "community_contents" USING btree ("thread_id","work_id","thread_kind");--> statement-breakpoint
CREATE INDEX "community_contents_parent_idx" ON "community_contents" USING btree ("parent_id","work_id","thread_id","parent_kind","parent_depth");--> statement-breakpoint
CREATE INDEX "community_moderation_actions_target_idx" ON "community_moderation_actions" USING btree ("content_id","work_id","target_kind");--> statement-breakpoint
CREATE INDEX "community_moderation_actions_actor_idx" ON "community_moderation_actions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "community_moderation_actions_report_idx" ON "community_moderation_actions" USING btree ("report_id","work_id","content_id","target_kind");--> statement-breakpoint
CREATE INDEX "community_mutation_receipts_target_idx" ON "community_mutation_receipts" USING btree ("content_id","work_id","target_kind");--> statement-breakpoint
CREATE INDEX "community_mutation_receipts_report_idx" ON "community_mutation_receipts" USING btree ("report_id","work_id","content_id","target_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "community_reports_open_unique" ON "community_reports" USING btree ("reporter_id","content_id") WHERE "community_reports"."state" = 'OPEN';--> statement-breakpoint
CREATE INDEX "community_reports_target_idx" ON "community_reports" USING btree ("content_id","work_id","target_kind");--> statement-breakpoint
CREATE INDEX "community_reports_reporter_idx" ON "community_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "community_reports_queue_idx" ON "community_reports" USING btree ("state","created_at","id");
--> statement-breakpoint
-- Reviewed PostgreSQL 17/18 extension to generated DDL: the two scoped report
-- FKs above use SET NULL (report_id), not SET NULL of the entire scope. Drizzle's
-- DSL/snapshot records the set-null action but cannot express its column subset.
-- Do not replace those clauses with generated all-column nulling on regeneration.
-- Privacy erasure appends no events/receipts and consumes no history capacity.
CREATE FUNCTION public.community_content_scope_and_erasure() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW.id, NEW.work_id, NEW.kind, NEW.thread_id, NEW.thread_kind,
         NEW.parent_id, NEW.parent_kind, NEW.parent_depth, NEW.depth)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.work_id, OLD.kind, OLD.thread_id, OLD.thread_kind,
         OLD.parent_id, OLD.parent_kind, OLD.parent_depth, OLD.depth) THEN
    RAISE EXCEPTION 'Community content scope is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    IF OLD.author_id IS NULL OR NEW.author_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.users WHERE id = OLD.author_id) THEN
      RAISE EXCEPTION 'Community author binding is immutable' USING ERRCODE = '23514';
    END IF;
    -- The author FK's account-delete SET NULL invokes this in the same transaction.
    -- No original-author snapshot, no authored text, no identifying authored dates.
    NEW.author_state := 'ERASED';
    NEW.title := '';
    NEW.body := '';
    NEW.spoiler_context := NULL;
    NEW.rating_half_stars := NULL;
    NEW.title_spoiler := false;
    NEW.body_spoiler := false;
    NEW.created_at := NULL;
    NEW.updated_at := NULL;
    NEW.edited_at := NULL;
    NEW.last_activity_at := NULL;
    -- Include other actors' quotes, all report states and every moderation action.
    UPDATE public.community_reports
      SET explanation = '', evidence_redacted = true
      WHERE content_id = OLD.id AND work_id = OLD.work_id AND target_kind = OLD.kind;
    UPDATE public.community_moderation_actions
      SET reason = '', evidence_redacted = true
      WHERE content_id = OLD.id AND work_id = OLD.work_id AND target_kind = OLD.kind;
  ELSIF OLD.author_state <> 'ACTIVE' AND NEW.author_state <> OLD.author_state THEN
    RAISE EXCEPTION 'Community author tombstones cannot be restored' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_content_scope_and_erasure
BEFORE UPDATE ON public.community_contents
FOR EACH ROW EXECUTE FUNCTION public.community_content_scope_and_erasure();
--> statement-breakpoint
-- A deleted reporter's own rows cascade. Preserve unrelated moderators' metadata,
-- but remove their narrative before the scoped report FK nulls only report_id.
CREATE FUNCTION public.community_report_erasure_redact_actions() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.community_moderation_actions
    SET reason = '', evidence_redacted = true
    WHERE report_id = OLD.id AND work_id = OLD.work_id
      AND content_id = OLD.content_id AND target_kind = OLD.target_kind;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_report_erasure_redact_actions
BEFORE DELETE ON public.community_reports
FOR EACH ROW EXECUTE FUNCTION public.community_report_erasure_redact_actions();
--> statement-breakpoint
-- Pending erased-target reports can still be resolved privately. Their narrative
-- must stay erased, including newly supplied moderator/reporter text.
CREATE FUNCTION public.community_erased_target_evidence() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_contents
    WHERE id = NEW.content_id AND work_id = NEW.work_id AND kind = NEW.target_kind
      AND author_state = 'ERASED'
  ) THEN
    NEW.evidence_redacted := true;
    IF TG_TABLE_NAME = 'community_reports' THEN
      NEW.explanation := '';
    ELSE
      NEW.reason := '';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_reports_erased_target_evidence
BEFORE INSERT OR UPDATE ON public.community_reports
FOR EACH ROW EXECUTE FUNCTION public.community_erased_target_evidence();
--> statement-breakpoint
CREATE TRIGGER community_actions_erased_target_evidence
BEFORE INSERT OR UPDATE ON public.community_moderation_actions
FOR EACH ROW EXECUTE FUNCTION public.community_erased_target_evidence();