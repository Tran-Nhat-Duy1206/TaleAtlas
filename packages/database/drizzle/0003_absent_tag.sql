CREATE TABLE "catalog_field_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"revision" integer NOT NULL,
	"value" jsonb NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_field_evidence_revision_unique" UNIQUE("work_id","field_path","revision"),
	CONSTRAINT "catalog_field_evidence_path_check" CHECK ("catalog_field_evidence"."field_path" ~ '^(work[.]([A-Za-z]+)|edition[.][0-9a-f-]{36}[.]([A-Za-z]+)|cover[.]([A-Za-z]+))$' AND char_length("catalog_field_evidence"."field_path") <= 100),
	CONSTRAINT "catalog_field_evidence_revision_check" CHECK ("catalog_field_evidence"."revision" > 0),
	CONSTRAINT "catalog_field_evidence_value_check" CHECK (jsonb_typeof("catalog_field_evidence"."value") IN ('string', 'number', 'null') AND octet_length("catalog_field_evidence"."value"::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "catalog_audit_events" DROP CONSTRAINT "catalog_audit_changes_check";--> statement-breakpoint
ALTER TABLE "catalog_field_evidence" ADD CONSTRAINT "catalog_field_evidence_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_field_evidence" ADD CONSTRAINT "catalog_field_evidence_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_field_evidence_work_idx" ON "catalog_field_evidence" USING btree ("work_id","revision");--> statement-breakpoint
CREATE INDEX "catalog_field_evidence_source_idx" ON "catalog_field_evidence" USING btree ("source_id");--> statement-breakpoint
ALTER TABLE "catalog_audit_events" ADD CONSTRAINT "catalog_audit_changes_check" CHECK (jsonb_typeof("catalog_audit_events"."changes") = 'object' AND octet_length("catalog_audit_events"."changes"::text) <= 65536 AND ("catalog_audit_events"."changes" - ARRAY['primaryTitle','primaryTitleLanguage','format','visibility','releaseStatus','originalLanguage','country','publicationYear','publicationLabel','sourceId','titles','descriptions','editions','creators','genres','cover','identifiers','relations','publicationReviewAcknowledged']::text[]) = '{}'::jsonb);