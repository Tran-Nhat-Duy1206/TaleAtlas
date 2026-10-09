CREATE TYPE "public"."ingestion_job_kind" AS ENUM('REQUEST_ENRICH', 'DISCOVER_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."ingestion_job_state" AS ENUM('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."work_request_state" AS ENUM('SUBMITTED', 'ENRICHING', 'NEEDS_REVIEW', 'NEEDS_INFO', 'APPROVED', 'LINKED_EXISTING', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"provider_id" text,
	"kind" "ingestion_job_kind" NOT NULL,
	"state" "ingestion_job_state" DEFAULT 'QUEUED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expected_input_revision" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ingestion_jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ingestion_jobs_idempotency_check" CHECK ("ingestion_jobs"."idempotency_key" = btrim("ingestion_jobs"."idempotency_key") AND char_length("ingestion_jobs"."idempotency_key") BETWEEN 1 AND 200),
	CONSTRAINT "ingestion_jobs_revision_check" CHECK (("ingestion_jobs"."expected_input_revision" IS NULL OR "ingestion_jobs"."expected_input_revision" > 0) AND ("ingestion_jobs"."request_id" IS NULL OR "ingestion_jobs"."expected_input_revision" IS NOT NULL)),
	CONSTRAINT "ingestion_jobs_kind_check" CHECK (("ingestion_jobs"."kind" <> 'REQUEST_ENRICH' OR ("ingestion_jobs"."request_id" IS NOT NULL AND "ingestion_jobs"."expected_input_revision" IS NOT NULL)) AND ("ingestion_jobs"."kind" <> 'DISCOVER_PROVIDER' OR "ingestion_jobs"."provider_id" IS NOT NULL)),
	CONSTRAINT "ingestion_jobs_attempts_check" CHECK ("ingestion_jobs"."attempts" BETWEEN 0 AND 8 AND "ingestion_jobs"."max_attempts" BETWEEN 1 AND 8 AND "ingestion_jobs"."attempts" <= "ingestion_jobs"."max_attempts"),
	CONSTRAINT "ingestion_jobs_lease_check" CHECK (("ingestion_jobs"."state" = 'RUNNING' AND "ingestion_jobs"."lease_token" IS NOT NULL AND "ingestion_jobs"."lease_owner" IS NOT NULL AND "ingestion_jobs"."lease_expires_at" IS NOT NULL) OR ("ingestion_jobs"."state" <> 'RUNNING' AND "ingestion_jobs"."lease_token" IS NULL AND "ingestion_jobs"."lease_owner" IS NULL AND "ingestion_jobs"."lease_expires_at" IS NULL)),
	CONSTRAINT "ingestion_jobs_lease_owner_check" CHECK ("ingestion_jobs"."lease_owner" = btrim("ingestion_jobs"."lease_owner") AND char_length("ingestion_jobs"."lease_owner") BETWEEN 1 AND 200),
	CONSTRAINT "ingestion_jobs_error_code_check" CHECK ("ingestion_jobs"."last_error_code" = btrim("ingestion_jobs"."last_error_code") AND char_length("ingestion_jobs"."last_error_code") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "provider_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"window_started_at" timestamp with time zone,
	"requests_in_window" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_registry_id_check" CHECK ("provider_registry"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("provider_registry"."id") <= 100),
	CONSTRAINT "provider_registry_policy_check" CHECK (jsonb_typeof("provider_registry"."policy") = 'object' AND octet_length("provider_registry"."policy"::text) <= 16384),
	CONSTRAINT "provider_registry_enabled_check" CHECK (NOT "provider_registry"."enabled" OR (("provider_registry"."policy"->>'reviewStatus' = 'REVIEWED' AND "provider_registry"."policy"->'metadataStorageAllowed' = 'true'::jsonb) IS TRUE)),
	CONSTRAINT "provider_registry_window_count_check" CHECK ("provider_registry"."requests_in_window" >= 0)
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_snapshot" text,
	"event_kind" text NOT NULL,
	"revision" integer NOT NULL,
	"from_state" "work_request_state",
	"to_state" "work_request_state" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_events_request_revision_unique" UNIQUE("request_id","revision"),
	CONSTRAINT "request_events_actor_check" CHECK ("request_events"."actor_snapshot" = btrim("request_events"."actor_snapshot") AND char_length("request_events"."actor_snapshot") BETWEEN 1 AND 200),
	CONSTRAINT "request_events_kind_check" CHECK ("request_events"."event_kind" = btrim("request_events"."event_kind") AND char_length("request_events"."event_kind") BETWEEN 1 AND 80),
	CONSTRAINT "request_events_revision_check" CHECK ("request_events"."revision" > 0),
	CONSTRAINT "request_events_payload_check" CHECK (jsonb_typeof("request_events"."payload") = 'object' AND octet_length("request_events"."payload"::text) <= 32768)
);
--> statement-breakpoint
CREATE TABLE "work_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"state" "work_request_state" DEFAULT 'SUBMITTED' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"input_revision" integer DEFAULT 1 NOT NULL,
	"details" jsonb NOT NULL,
	"normalized_title" text NOT NULL,
	"submit_key" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"resulting_work_id" uuid,
	"public_title" text,
	"public_format" text,
	"public_summary_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_requests_owner_submit_unique" UNIQUE("owner_user_id","submit_key"),
	CONSTRAINT "work_requests_revision_check" CHECK ("work_requests"."revision" > 0 AND "work_requests"."input_revision" > 0),
	CONSTRAINT "work_requests_details_check" CHECK (jsonb_typeof("work_requests"."details") = 'object' AND octet_length("work_requests"."details"::text) <= 16384),
	CONSTRAINT "work_requests_title_check" CHECK ("work_requests"."normalized_title" = btrim("work_requests"."normalized_title") AND char_length("work_requests"."normalized_title") BETWEEN 1 AND 600),
	CONSTRAINT "work_requests_hash_check" CHECK ("work_requests"."input_hash" ~ '^[0-9a-fA-F]{64}$'),
	CONSTRAINT "work_requests_result_check" CHECK (("work_requests"."state" IN ('APPROVED', 'LINKED_EXISTING')) = ("work_requests"."resulting_work_id" IS NOT NULL)),
	CONSTRAINT "work_requests_public_summary_check" CHECK (("work_requests"."public_title" IS NULL AND "work_requests"."public_format" IS NULL AND "work_requests"."public_summary_verified_at" IS NULL) OR ("work_requests"."public_title" IS NOT NULL AND "work_requests"."public_format" IS NOT NULL AND "work_requests"."public_summary_verified_at" IS NOT NULL)),
	CONSTRAINT "work_requests_public_title_check" CHECK ("work_requests"."public_title" = btrim("work_requests"."public_title") AND char_length("work_requests"."public_title") BETWEEN 1 AND 600),
	CONSTRAINT "work_requests_public_format_check" CHECK ("work_requests"."public_format" IN ('MANGA', 'MANHWA', 'MANHUA', 'WEBTOON', 'WEB_NOVEL', 'LIGHT_NOVEL', 'NOVEL', 'GRAPHIC_NOVEL', 'COMIC', 'SHORT_STORY', 'OTHER', 'UNKNOWN'))
);
--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_request_id_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_provider_id_provider_registry_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_registry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_resulting_work_id_works_id_fk" FOREIGN KEY ("resulting_work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_jobs_claim_idx" ON "ingestion_jobs" USING btree ("state","run_after");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_request_idx" ON "ingestion_jobs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_provider_idx" ON "ingestion_jobs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_lease_expiry_idx" ON "ingestion_jobs" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "work_requests_owner_idx" ON "work_requests" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "work_requests_state_idx" ON "work_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "work_requests_normalized_title_idx" ON "work_requests" USING btree ("normalized_title");