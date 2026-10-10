CREATE TABLE "work_request_supporters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_request_supporters_user_request_unique" UNIQUE("user_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "work_requests" ADD COLUMN "public_search_text" text;--> statement-breakpoint
ALTER TABLE "work_request_supporters" ADD CONSTRAINT "work_request_supporters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_request_supporters" ADD CONSTRAINT "work_request_supporters_request_id_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_request_supporters_user_idx" ON "work_request_supporters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_request_supporters_request_idx" ON "work_request_supporters" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_public_search_check" CHECK (("work_requests"."public_summary_verified_at" IS NOT NULL) = ("work_requests"."public_search_text" IS NOT NULL) AND char_length("work_requests"."public_search_text") <= 9000);