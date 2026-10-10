CREATE TYPE "public"."edit_suggestion_state" AS ENUM('SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "edit_suggestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_snapshot" text NOT NULL,
	"revision" integer NOT NULL,
	"from_state" "edit_suggestion_state",
	"to_state" "edit_suggestion_state" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_suggestion_events_revision_unique" UNIQUE("suggestion_id","revision"),
	CONSTRAINT "edit_suggestion_events_revision_check" CHECK ("edit_suggestion_events"."revision" > 0),
	CONSTRAINT "edit_suggestion_events_actor_check" CHECK (char_length("edit_suggestion_events"."actor_snapshot") BETWEEN 1 AND 200),
	CONSTRAINT "edit_suggestion_events_payload_check" CHECK (jsonb_typeof("edit_suggestion_events"."payload") = 'object' AND octet_length("edit_suggestion_events"."payload"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "edit_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"work_id" uuid NOT NULL,
	"base_work_revision" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" "edit_suggestion_state" DEFAULT 'SUBMITTED' NOT NULL,
	"proposed" jsonb NOT NULL,
	"citation" jsonb NOT NULL,
	"submit_key" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"review_reason" text,
	"applied_work_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_suggestions_owner_submit_unique" UNIQUE("owner_user_id","submit_key"),
	CONSTRAINT "edit_suggestions_revision_check" CHECK ("edit_suggestions"."revision" > 0 AND "edit_suggestions"."base_work_revision" > 0),
	CONSTRAINT "edit_suggestions_proposed_check" CHECK (jsonb_typeof("edit_suggestions"."proposed") = 'object' AND "edit_suggestions"."proposed" <> '{}'::jsonb AND octet_length("edit_suggestions"."proposed"::text) <= 16384),
	CONSTRAINT "edit_suggestions_citation_check" CHECK (jsonb_typeof("edit_suggestions"."citation") = 'object' AND octet_length("edit_suggestions"."citation"::text) <= 16384),
	CONSTRAINT "edit_suggestions_hash_check" CHECK ("edit_suggestions"."input_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "edit_suggestions_review_check" CHECK (("edit_suggestions"."state" = 'SUBMITTED' AND "edit_suggestions"."review_reason" IS NULL AND "edit_suggestions"."applied_work_revision" IS NULL) OR ("edit_suggestions"."state" <> 'SUBMITTED' AND "edit_suggestions"."review_reason" = btrim("edit_suggestions"."review_reason") AND char_length("edit_suggestions"."review_reason") BETWEEN 1 AND 2000 AND "edit_suggestions"."review_reason" IS NOT NULL AND (("edit_suggestions"."state" = 'APPROVED' AND "edit_suggestions"."applied_work_revision" > "edit_suggestions"."base_work_revision" AND "edit_suggestions"."applied_work_revision" IS NOT NULL) OR ("edit_suggestions"."state" = 'REJECTED' AND "edit_suggestions"."applied_work_revision" IS NULL))))
);
--> statement-breakpoint
CREATE TABLE "catalog_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"release_date" date NOT NULL,
	"language" text NOT NULL,
	"label" text NOT NULL,
	"source_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_snapshot" text NOT NULL,
	"reviewed_work_revision" integer NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_releases_language_check" CHECK ("catalog_releases"."language" ~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$' AND char_length("catalog_releases"."language") <= 35),
	CONSTRAINT "catalog_releases_label_check" CHECK ("catalog_releases"."label" = btrim("catalog_releases"."label") AND char_length("catalog_releases"."label") BETWEEN 1 AND 300),
	CONSTRAINT "catalog_releases_revision_check" CHECK ("catalog_releases"."reviewed_work_revision" > 0),
	CONSTRAINT "catalog_releases_actor_check" CHECK (char_length("catalog_releases"."actor_snapshot") BETWEEN 1 AND 500),
	CONSTRAINT "catalog_releases_date_check" CHECK ("catalog_releases"."release_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);
--> statement-breakpoint
ALTER TABLE "edit_suggestion_events" ADD CONSTRAINT "edit_suggestion_events_suggestion_id_edit_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."edit_suggestions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_suggestion_events" ADD CONSTRAINT "edit_suggestion_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_releases" ADD CONSTRAINT "catalog_releases_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_releases" ADD CONSTRAINT "catalog_releases_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_releases" ADD CONSTRAINT "catalog_releases_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edit_suggestions_owner_idx" ON "edit_suggestions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "edit_suggestions_state_idx" ON "edit_suggestions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "catalog_releases_date_idx" ON "catalog_releases" USING btree ("release_date","id");--> statement-breakpoint
CREATE INDEX "catalog_releases_work_idx" ON "catalog_releases" USING btree ("work_id");