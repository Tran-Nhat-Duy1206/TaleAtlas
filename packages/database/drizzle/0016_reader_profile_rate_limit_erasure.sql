CREATE TABLE "reader_profile_rate_limits" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "reader_profile_rate_limits_pkey" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "reader_profile_rate_limits_kind_check" CHECK ("reader_profile_rate_limits"."kind" IN ('ordinary', 'content', 'withdrawal')),
	CONSTRAINT "reader_profile_rate_limits_count_check" CHECK ("reader_profile_rate_limits"."count" >= 0 AND "reader_profile_rate_limits"."count" <= 21 AND ("reader_profile_rate_limits"."kind" <> 'content' OR "reader_profile_rate_limits"."count" <= 6) AND ("reader_profile_rate_limits"."kind" <> 'withdrawal' OR "reader_profile_rate_limits"."count" <= 11)),
	CONSTRAINT "reader_profile_rate_limits_last_request_check" CHECK ("reader_profile_rate_limits"."last_request" >= 0 AND "reader_profile_rate_limits"."last_request" <= 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "reader_profile_rate_limits" ADD CONSTRAINT "reader_profile_rate_limits_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;