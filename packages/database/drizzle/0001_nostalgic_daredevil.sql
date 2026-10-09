CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."catalog_audit_operation" AS ENUM('CREATE', 'UPDATE', 'HIDE', 'RESTORE');--> statement-breakpoint
CREATE TYPE "public"."cover_rights" AS ENUM('UNKNOWN', 'LICENSED', 'PUBLIC_DOMAIN', 'PERMISSION');--> statement-breakpoint
CREATE TYPE "public"."creator_role" AS ENUM('AUTHOR', 'WRITER', 'ILLUSTRATOR', 'ARTIST', 'TRANSLATOR', 'EDITOR', 'PUBLISHER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('ADAPTATION_OF', 'SEQUEL_OF', 'PREQUEL_OF', 'SPIN_OFF_OF', 'SIDE_STORY_OF', 'REMAKE_OF', 'SHARED_UNIVERSE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('UNKNOWN', 'ANNOUNCED', 'ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."title_kind" AS ENUM('PRIMARY', 'ORIGINAL', 'ALIAS');--> statement-breakpoint
CREATE TYPE "public"."work_format" AS ENUM('MANGA', 'MANHWA', 'MANHUA', 'WEBTOON', 'WEB_NOVEL', 'LIGHT_NOVEL', 'NOVEL', 'GRAPHIC_NOVEL', 'COMIC', 'SHORT_STORY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."work_visibility" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TABLE "catalog_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_id_snapshot" text NOT NULL,
	"operation" "catalog_audit_operation" NOT NULL,
	"previous_revision" integer,
	"new_revision" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_audit_actor_check" CHECK ("catalog_audit_events"."actor_id_snapshot" = btrim("catalog_audit_events"."actor_id_snapshot") AND char_length("catalog_audit_events"."actor_id_snapshot") BETWEEN 1 AND 200),
	CONSTRAINT "catalog_audit_revisions_check" CHECK ("catalog_audit_events"."new_revision" > 0 AND ("catalog_audit_events"."previous_revision" IS NULL OR ("catalog_audit_events"."previous_revision" > 0 AND "catalog_audit_events"."new_revision" > "catalog_audit_events"."previous_revision"))),
	CONSTRAINT "catalog_audit_changes_check" CHECK (jsonb_typeof("catalog_audit_events"."changes") = 'object' AND octet_length("catalog_audit_events"."changes"::text) <= 65536 AND ("catalog_audit_events"."changes" - ARRAY['primaryTitle','primaryTitleLanguage','format','visibility','releaseStatus','originalLanguage','country','publicationYear','publicationLabel','sourceId','titles','descriptions','editions','creators','genres','cover','identifiers','relations']::text[]) = '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "catalog_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"citation" text NOT NULL,
	"url" text,
	"consulted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_sources_label_check" CHECK ("catalog_sources"."label" = btrim("catalog_sources"."label") AND char_length("catalog_sources"."label") BETWEEN 1 AND 200),
	CONSTRAINT "catalog_sources_citation_check" CHECK ("catalog_sources"."citation" = btrim("catalog_sources"."citation") AND char_length("catalog_sources"."citation") BETWEEN 1 AND 4000),
	CONSTRAINT "catalog_sources_url_check" CHECK ("catalog_sources"."url" ~ '^https://[^[:space:]]+$' AND char_length("catalog_sources"."url") <= 2048)
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "creators_name_check" CHECK ("creators"."name" = btrim("creators"."name") AND char_length("creators"."name") BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"language" text,
	"title" text,
	"publisher" text,
	"format" text,
	"publication_year" integer,
	"publication_label" text,
	"isbn" text,
	"source_id" uuid NOT NULL,
	CONSTRAINT "editions_id_work_unique" UNIQUE("id","work_id"),
	CONSTRAINT "editions_language_check" CHECK ("editions"."language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length("editions"."language") <= 63),
	CONSTRAINT "editions_title_check" CHECK ("editions"."title" = btrim("editions"."title") AND char_length("editions"."title") BETWEEN 1 AND 500),
	CONSTRAINT "editions_format_check" CHECK ("editions"."format" = btrim("editions"."format") AND char_length("editions"."format") BETWEEN 1 AND 200),
	CONSTRAINT "editions_publisher_check" CHECK ("editions"."publisher" = btrim("editions"."publisher") AND char_length("editions"."publisher") BETWEEN 1 AND 300),
	CONSTRAINT "editions_year_check" CHECK ("editions"."publication_year" BETWEEN 1 AND 9999),
	CONSTRAINT "editions_label_check" CHECK ("editions"."publication_label" = btrim("editions"."publication_label") AND char_length("editions"."publication_label") BETWEEN 1 AND 200),
	CONSTRAINT "editions_isbn_check" CHECK ("editions"."isbn" ~ '^([0-9]{9}[0-9X]|[0-9]{13})$')
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"slug" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_vi" text NOT NULL,
	CONSTRAINT "genres_slug_check" CHECK ("genres"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("genres"."slug") <= 100),
	CONSTRAINT "genres_name_en_check" CHECK ("genres"."name_en" = btrim("genres"."name_en") AND char_length("genres"."name_en") BETWEEN 1 AND 200),
	CONSTRAINT "genres_name_vi_check" CHECK ("genres"."name_vi" = btrim("genres"."name_vi") AND char_length("genres"."name_vi") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "work_covers" (
	"work_id" uuid PRIMARY KEY NOT NULL,
	"asset_path" text,
	"rights" "cover_rights" DEFAULT 'UNKNOWN' NOT NULL,
	"credit" text,
	"rights_statement" text,
	"license_url" text,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_covers_path_check" CHECK ("work_covers"."asset_path" ~ '^/covers/[A-Za-z0-9_-]+([/][A-Za-z0-9_-]+)*[.](avif|webp|png|jpg|jpeg)$' AND char_length("work_covers"."asset_path") <= 500),
	CONSTRAINT "work_covers_credit_check" CHECK ("work_covers"."credit" = btrim("work_covers"."credit") AND char_length("work_covers"."credit") BETWEEN 1 AND 500),
	CONSTRAINT "work_covers_statement_check" CHECK ("work_covers"."rights_statement" = btrim("work_covers"."rights_statement") AND char_length("work_covers"."rights_statement") BETWEEN 1 AND 2000),
	CONSTRAINT "work_covers_license_check" CHECK ("work_covers"."license_url" ~ '^https://[^[:space:]]+$' AND char_length("work_covers"."license_url") <= 2048),
	CONSTRAINT "work_covers_approved_check" CHECK ("work_covers"."rights" = 'UNKNOWN' OR ("work_covers"."asset_path" IS NOT NULL AND "work_covers"."rights_statement" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "work_creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"role" "creator_role" NOT NULL,
	"edition_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_creators_credit_unique" UNIQUE NULLS NOT DISTINCT("work_id","creator_id","role","edition_id"),
	CONSTRAINT "work_creators_order_check" CHECK ("work_creators"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_descriptions" (
	"work_id" uuid NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_descriptions_work_id_language_pk" PRIMARY KEY("work_id","language"),
	CONSTRAINT "work_descriptions_language_check" CHECK ("work_descriptions"."language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length("work_descriptions"."language") <= 63),
	CONSTRAINT "work_descriptions_text_check" CHECK ("work_descriptions"."text" = btrim("work_descriptions"."text") AND char_length("work_descriptions"."text") BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "work_genres" (
	"work_id" uuid NOT NULL,
	"genre_slug" text NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_genres_work_id_genre_slug_pk" PRIMARY KEY("work_id","genre_slug")
);
--> statement-breakpoint
CREATE TABLE "work_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"value" text NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_identifiers_namespace_value_unique" UNIQUE("namespace","value"),
	CONSTRAINT "work_identifiers_namespace_check" CHECK ("work_identifiers"."namespace" = btrim("work_identifiers"."namespace") AND char_length("work_identifiers"."namespace") BETWEEN 1 AND 100),
	CONSTRAINT "work_identifiers_value_check" CHECK ("work_identifiers"."value" = btrim("work_identifiers"."value") AND char_length("work_identifiers"."value") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "work_relations" (
	"from_work_id" uuid NOT NULL,
	"to_work_id" uuid NOT NULL,
	"type" "relation_type" NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_relations_from_work_id_to_work_id_type_pk" PRIMARY KEY("from_work_id","to_work_id","type"),
	CONSTRAINT "work_relations_not_self_check" CHECK ("work_relations"."from_work_id" <> "work_relations"."to_work_id")
);
--> statement-breakpoint
CREATE TABLE "work_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"title" text NOT NULL,
	"language" text DEFAULT 'und' NOT NULL,
	"kind" "title_kind" NOT NULL,
	"normalized" text NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "work_titles_title_check" CHECK ("work_titles"."title" = btrim("work_titles"."title") AND char_length("work_titles"."title") BETWEEN 1 AND 500),
	CONSTRAINT "work_titles_language_check" CHECK ("work_titles"."language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length("work_titles"."language") <= 63),
	CONSTRAINT "work_titles_normalized_check" CHECK ("work_titles"."normalized" = btrim("work_titles"."normalized") AND char_length("work_titles"."normalized") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"primary_title" text NOT NULL,
	"primary_title_language" text DEFAULT 'und' NOT NULL,
	"format" "work_format" NOT NULL,
	"visibility" "work_visibility" DEFAULT 'DRAFT' NOT NULL,
	"release_status" "release_status" DEFAULT 'UNKNOWN' NOT NULL,
	"original_language" text,
	"country" text,
	"publication_year" integer,
	"publication_label" text,
	"source_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"search_text" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, "search_text")) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_slug_unique" UNIQUE("slug"),
	CONSTRAINT "works_slug_check" CHECK ("works"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("works"."slug") <= 160),
	CONSTRAINT "works_title_check" CHECK ("works"."primary_title" = btrim("works"."primary_title") AND char_length("works"."primary_title") BETWEEN 1 AND 500),
	CONSTRAINT "works_title_language_check" CHECK ("works"."primary_title_language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length("works"."primary_title_language") <= 63),
	CONSTRAINT "works_original_language_check" CHECK ("works"."original_language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length("works"."original_language") <= 63),
	CONSTRAINT "works_country_check" CHECK ("works"."country" = btrim("works"."country") AND char_length("works"."country") BETWEEN 1 AND 100),
	CONSTRAINT "works_year_check" CHECK ("works"."publication_year" BETWEEN 1 AND 9999),
	CONSTRAINT "works_publication_label_check" CHECK ("works"."publication_label" = btrim("works"."publication_label") AND char_length("works"."publication_label") BETWEEN 1 AND 200),
	CONSTRAINT "works_revision_check" CHECK ("works"."revision" > 0),
	CONSTRAINT "works_search_text_check" CHECK ("works"."search_text" = btrim("works"."search_text") AND char_length("works"."search_text") BETWEEN 1 AND 100000)
);
--> statement-breakpoint
ALTER TABLE "catalog_audit_events" ADD CONSTRAINT "catalog_audit_events_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_audit_events" ADD CONSTRAINT "catalog_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_covers" ADD CONSTRAINT "work_covers_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_covers" ADD CONSTRAINT "work_covers_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_creators" ADD CONSTRAINT "work_creators_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_creators" ADD CONSTRAINT "work_creators_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_creators" ADD CONSTRAINT "work_creators_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_creators" ADD CONSTRAINT "work_creators_edition_work_fk" FOREIGN KEY ("edition_id","work_id") REFERENCES "public"."editions"("id","work_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_descriptions" ADD CONSTRAINT "work_descriptions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_descriptions" ADD CONSTRAINT "work_descriptions_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_genre_slug_genres_slug_fk" FOREIGN KEY ("genre_slug") REFERENCES "public"."genres"("slug") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_identifiers" ADD CONSTRAINT "work_identifiers_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_identifiers" ADD CONSTRAINT "work_identifiers_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_relations" ADD CONSTRAINT "work_relations_from_work_id_works_id_fk" FOREIGN KEY ("from_work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_relations" ADD CONSTRAINT "work_relations_to_work_id_works_id_fk" FOREIGN KEY ("to_work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_relations" ADD CONSTRAINT "work_relations_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_titles" ADD CONSTRAINT "work_titles_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_titles" ADD CONSTRAINT "work_titles_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_audit_work_idx" ON "catalog_audit_events" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "catalog_audit_actor_idx" ON "catalog_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "editions_work_idx" ON "editions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "editions_source_idx" ON "editions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_covers_source_idx" ON "work_covers" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_creators_work_idx" ON "work_creators" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "work_creators_creator_idx" ON "work_creators" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "work_creators_edition_work_idx" ON "work_creators" USING btree ("edition_id","work_id");--> statement-breakpoint
CREATE INDEX "work_creators_source_idx" ON "work_creators" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_descriptions_source_idx" ON "work_descriptions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_genres_genre_idx" ON "work_genres" USING btree ("genre_slug");--> statement-breakpoint
CREATE INDEX "work_genres_source_idx" ON "work_genres" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_identifiers_work_idx" ON "work_identifiers" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "work_identifiers_source_idx" ON "work_identifiers" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "work_relations_to_idx" ON "work_relations" USING btree ("to_work_id");--> statement-breakpoint
CREATE INDEX "work_relations_source_idx" ON "work_relations" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_titles_primary_language_unique" ON "work_titles" USING btree ("work_id","language") WHERE "work_titles"."kind" = 'PRIMARY';--> statement-breakpoint
CREATE UNIQUE INDEX "work_titles_original_unique" ON "work_titles" USING btree ("work_id") WHERE "work_titles"."kind" = 'ORIGINAL';--> statement-breakpoint
CREATE INDEX "work_titles_work_idx" ON "work_titles" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "work_titles_source_idx" ON "work_titles" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "works_source_idx" ON "works" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "works_search_vector_idx" ON "works" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "works_search_trigram_idx" ON "works" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "works_visibility_idx" ON "works" USING btree ("visibility");--> statement-breakpoint
-- Slugs are stable identifiers, independent of mutable catalog titles.
CREATE FUNCTION "catalog_reject_slug_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Catalog work slugs are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "works_immutable_slug" BEFORE UPDATE OF "slug" ON "works"
FOR EACH ROW EXECUTE FUNCTION "catalog_reject_slug_change"();