CREATE TABLE "ingestion_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"input_revision" integer NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate" jsonb NOT NULL,
	"matches" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_candidates_request_input_unique" UNIQUE("request_id","input_revision"),
	CONSTRAINT "ingestion_candidates_revision_check" CHECK ("ingestion_candidates"."input_revision" > 0),
	CONSTRAINT "ingestion_candidates_candidate_check" CHECK (jsonb_typeof("ingestion_candidates"."candidate") = 'object' AND octet_length("ingestion_candidates"."candidate"::text) <= 32768),
	CONSTRAINT "ingestion_candidates_matches_check" CHECK (jsonb_typeof("ingestion_candidates"."matches") = 'object' AND octet_length("ingestion_candidates"."matches"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "ingestion_candidates" ADD CONSTRAINT "ingestion_candidates_request_id_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_candidates" ADD CONSTRAINT "ingestion_candidates_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_candidates_job_idx" ON "ingestion_candidates" USING btree ("job_id");