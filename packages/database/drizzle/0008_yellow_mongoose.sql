CREATE TYPE "public"."library_event_kind" AS ENUM('ADD', 'RESTORE', 'REMOVE', 'UPDATE', 'START_READ', 'START_REREAD', 'RESUME', 'COMPLETE', 'PROGRESS');--> statement-breakpoint
CREATE TYPE "public"."library_status" AS ENUM('WANT_TO_READ', 'READING', 'COMPLETED', 'ON_HOLD', 'DROPPED');--> statement-breakpoint
CREATE TYPE "public"."reading_session_kind" AS ENUM('FIRST_READ', 'REREAD');--> statement-breakpoint
CREATE TYPE "public"."reading_session_state" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"work_id" uuid NOT NULL,
	"status" "library_status" DEFAULT 'WANT_TO_READ' NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"rating_half_stars" integer,
	"notes" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_entries_user_work_unique" UNIQUE("user_id","work_id"),
	CONSTRAINT "library_entries_id_user_work_unique" UNIQUE("id","user_id","work_id"),
	CONSTRAINT "library_entries_rating_check" CHECK ("library_entries"."rating_half_stars" BETWEEN 2 AND 10),
	CONSTRAINT "library_entries_notes_check" CHECK (char_length("library_entries"."notes") <= 4000),
	CONSTRAINT "library_entries_revision_check" CHECK ("library_entries"."revision" BETWEEN 1 AND 10000),
	CONSTRAINT "library_entries_event_count_check" CHECK ("library_entries"."event_count" BETWEEN 1 AND 10000),
	CONSTRAINT "library_entries_session_count_check" CHECK ("library_entries"."session_count" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "library_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"work_id" uuid NOT NULL,
	"entry_revision" integer NOT NULL,
	"mutation_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" "library_event_kind" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_events_entry_revision_unique" UNIQUE("entry_id","entry_revision"),
	CONSTRAINT "library_events_entry_key_unique" UNIQUE("entry_id","mutation_key"),
	CONSTRAINT "library_events_owner_key_unique" UNIQUE("user_id","mutation_key"),
	CONSTRAINT "library_events_revision_check" CHECK ("library_events"."entry_revision" BETWEEN 1 AND 10000),
	CONSTRAINT "library_events_request_hash_check" CHECK (char_length("library_events"."request_hash") = 64 AND "library_events"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "library_events_snapshot_check" CHECK (jsonb_typeof("library_events"."snapshot") = 'object' AND octet_length("library_events"."snapshot"::text) <= 32768)
);
--> statement-breakpoint
CREATE TABLE "reading_progress_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"work_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"entry_revision" integer NOT NULL,
	"chapter_number" integer,
	"chapter_label" text,
	"volume_number" integer,
	"volume_label" text,
	"personal_chapter_total" integer,
	"progress_notes" text DEFAULT '' NOT NULL,
	"edition_id" uuid,
	"edition_work_id" uuid,
	"last_activity_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_events_entry_revision_unique" UNIQUE("entry_id","entry_revision"),
	CONSTRAINT "reading_progress_events_revision_check" CHECK ("reading_progress_events"."entry_revision" BETWEEN 1 AND 10000),
	CONSTRAINT "reading_progress_events_chapter_number_check" CHECK ("reading_progress_events"."chapter_number" BETWEEN 0 AND 1000000),
	CONSTRAINT "reading_progress_events_chapter_label_check" CHECK (char_length("reading_progress_events"."chapter_label") <= 200),
	CONSTRAINT "reading_progress_events_volume_number_check" CHECK ("reading_progress_events"."volume_number" BETWEEN 0 AND 100000),
	CONSTRAINT "reading_progress_events_volume_label_check" CHECK (char_length("reading_progress_events"."volume_label") <= 200),
	CONSTRAINT "reading_progress_events_personal_total_check" CHECK ("reading_progress_events"."personal_chapter_total" BETWEEN 1 AND 1000000),
	CONSTRAINT "reading_progress_events_progress_notes_check" CHECK (char_length("reading_progress_events"."progress_notes") <= 2000),
	CONSTRAINT "reading_progress_events_edition_scope_check" CHECK (("reading_progress_events"."edition_id" IS NULL AND "reading_progress_events"."edition_work_id" IS NULL) OR ("reading_progress_events"."edition_id" IS NOT NULL AND "reading_progress_events"."edition_work_id" IS NOT NULL AND "reading_progress_events"."edition_work_id" = "reading_progress_events"."work_id"))
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"work_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" "reading_session_kind" NOT NULL,
	"state" "reading_session_state" DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"started_on" date,
	"finished_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"chapter_number" integer,
	"chapter_label" text,
	"volume_number" integer,
	"volume_label" text,
	"personal_chapter_total" integer,
	"progress_notes" text DEFAULT '' NOT NULL,
	"edition_id" uuid,
	"edition_work_id" uuid,
	"last_activity_at" timestamp with time zone,
	CONSTRAINT "reading_sessions_id_entry_user_work_unique" UNIQUE("id","entry_id","user_id","work_id"),
	CONSTRAINT "reading_sessions_entry_sequence_unique" UNIQUE("entry_id","sequence"),
	CONSTRAINT "reading_sessions_sequence_check" CHECK ("reading_sessions"."sequence" BETWEEN 1 AND 1000),
	CONSTRAINT "reading_sessions_revision_check" CHECK ("reading_sessions"."revision" > 0),
	CONSTRAINT "reading_sessions_notes_check" CHECK (char_length("reading_sessions"."notes") <= 2000),
	CONSTRAINT "reading_sessions_started_on_check" CHECK ("reading_sessions"."started_on" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
	CONSTRAINT "reading_sessions_finished_on_check" CHECK ("reading_sessions"."finished_on" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
	CONSTRAINT "reading_sessions_personal_chronology_check" CHECK ("reading_sessions"."started_on" IS NULL OR "reading_sessions"."finished_on" IS NULL OR "reading_sessions"."started_on" <= "reading_sessions"."finished_on"),
	CONSTRAINT "reading_sessions_terminal_markers_check" CHECK (("reading_sessions"."state" IN ('ACTIVE', 'PAUSED') AND "reading_sessions"."completed_at" IS NULL AND "reading_sessions"."closed_at" IS NULL) OR ("reading_sessions"."state" = 'COMPLETED' AND "reading_sessions"."completed_at" IS NOT NULL AND "reading_sessions"."closed_at" IS NOT NULL) OR ("reading_sessions"."state" = 'ABANDONED' AND "reading_sessions"."completed_at" IS NULL AND "reading_sessions"."closed_at" IS NOT NULL)),
	CONSTRAINT "reading_sessions_marker_chronology_check" CHECK (("reading_sessions"."completed_at" IS NULL OR "reading_sessions"."completed_at" >= "reading_sessions"."started_at") AND ("reading_sessions"."closed_at" IS NULL OR "reading_sessions"."closed_at" >= "reading_sessions"."started_at") AND ("reading_sessions"."completed_at" IS NULL OR "reading_sessions"."closed_at" >= "reading_sessions"."completed_at")),
	CONSTRAINT "reading_sessions_chapter_number_check" CHECK ("reading_sessions"."chapter_number" BETWEEN 0 AND 1000000),
	CONSTRAINT "reading_sessions_chapter_label_check" CHECK (char_length("reading_sessions"."chapter_label") <= 200),
	CONSTRAINT "reading_sessions_volume_number_check" CHECK ("reading_sessions"."volume_number" BETWEEN 0 AND 100000),
	CONSTRAINT "reading_sessions_volume_label_check" CHECK (char_length("reading_sessions"."volume_label") <= 200),
	CONSTRAINT "reading_sessions_personal_total_check" CHECK ("reading_sessions"."personal_chapter_total" BETWEEN 1 AND 1000000),
	CONSTRAINT "reading_sessions_progress_notes_check" CHECK (char_length("reading_sessions"."progress_notes") <= 2000),
	CONSTRAINT "reading_sessions_edition_scope_check" CHECK (("reading_sessions"."edition_id" IS NULL AND "reading_sessions"."edition_work_id" IS NULL) OR ("reading_sessions"."edition_id" IS NOT NULL AND "reading_sessions"."edition_work_id" IS NOT NULL AND "reading_sessions"."edition_work_id" = "reading_sessions"."work_id"))
);
--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_events" ADD CONSTRAINT "library_events_entry_scope_fk" FOREIGN KEY ("entry_id","user_id","work_id") REFERENCES "public"."library_entries"("id","user_id","work_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_session_scope_fk" FOREIGN KEY ("session_id","entry_id","user_id","work_id") REFERENCES "public"."reading_sessions"("id","entry_id","user_id","work_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_entry_revision_fk" FOREIGN KEY ("entry_id","entry_revision") REFERENCES "public"."library_events"("entry_id","entry_revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_edition_work_fk" FOREIGN KEY ("edition_id","edition_work_id") REFERENCES "public"."editions"("id","work_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_entry_scope_fk" FOREIGN KEY ("entry_id","user_id","work_id") REFERENCES "public"."library_entries"("id","user_id","work_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_edition_work_fk" FOREIGN KEY ("edition_id","edition_work_id") REFERENCES "public"."editions"("id","work_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_entries_owner_archive_updated_idx" ON "library_entries" USING btree ("user_id","removed_at","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "library_entries_owner_archive_created_idx" ON "library_entries" USING btree ("user_id","removed_at","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "library_entries_owner_status_updated_idx" ON "library_entries" USING btree ("user_id","removed_at","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "library_entries_owner_favorite_updated_idx" ON "library_entries" USING btree ("user_id","removed_at","favorite","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "library_entries_work_idx" ON "library_entries" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "library_events_entry_timeline_idx" ON "library_events" USING btree ("entry_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_progress_events_edition_work_idx" ON "reading_progress_events" USING btree ("edition_id","edition_work_id");--> statement-breakpoint
CREATE INDEX "reading_progress_events_entry_timeline_idx" ON "reading_progress_events" USING btree ("entry_id","recorded_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_progress_events_session_timeline_idx" ON "reading_progress_events" USING btree ("session_id","recorded_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reading_sessions_one_unfinished_unique" ON "reading_sessions" USING btree ("entry_id") WHERE "reading_sessions"."state" IN ('ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE INDEX "reading_sessions_edition_work_idx" ON "reading_sessions" USING btree ("edition_id","edition_work_id");--> statement-breakpoint
CREATE INDEX "reading_sessions_entry_history_idx" ON "reading_sessions" USING btree ("entry_id","sequence" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_sessions_owner_history_idx" ON "reading_sessions" USING btree ("user_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);