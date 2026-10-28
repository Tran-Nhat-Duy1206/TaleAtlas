CREATE TABLE "reader_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reader_blocks_pkey" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "reader_blocks_not_self_check" CHECK ("reader_blocks"."blocker_id" <> "reader_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "reader_profile_interests" (
	"user_id" text NOT NULL,
	"slot" smallint NOT NULL,
	"genre_slug" text NOT NULL,
	CONSTRAINT "reader_profile_interests_pkey" PRIMARY KEY("user_id","slot"),
	CONSTRAINT "reader_profile_interests_user_genre_unique" UNIQUE("user_id","genre_slug"),
	CONSTRAINT "reader_profile_interests_slot_check" CHECK ("reader_profile_interests"."slot" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "reader_profiles" (
	"user_id" text NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"biography" text,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reader_profiles_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "reader_profiles_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "reader_profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "reader_profiles_handle_check" CHECK ("reader_profiles"."handle" COLLATE "C" ~ '^[a-z][a-z0-9_]{2,23}$' AND "reader_profiles"."handle" COLLATE "C" !~ '[^a-z0-9_]' AND char_length("reader_profiles"."handle") BETWEEN 3 AND 24),
	CONSTRAINT "reader_profiles_visibility_check" CHECK ("reader_profiles"."visibility" IN ('PRIVATE', 'PUBLIC')),
	CONSTRAINT "reader_profiles_state_check" CHECK ("reader_profiles"."state" IN ('ACTIVE', 'REMOVED')),
	CONSTRAINT "reader_profiles_revision_check" CHECK ("reader_profiles"."revision" BETWEEN 1 AND 2147483647),
	CONSTRAINT "reader_profiles_display_name_check" CHECK ("reader_profiles"."display_name" IS NULL OR (char_length("reader_profiles"."display_name") >= 1 AND char_length("reader_profiles"."display_name") + char_length(regexp_replace("reader_profiles"."display_name", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 80 AND octet_length("reader_profiles"."display_name") <= 320 AND "reader_profiles"."display_name" = normalize("reader_profiles"."display_name", NFC) AND "reader_profiles"."display_name" = btrim("reader_profiles"."display_name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') AND "reader_profiles"."display_name" !~ U&'[\0001-\001F\007F-\009F\061C\200E\200F\2028\2029\202A-\202E\2066-\2069]')),
	CONSTRAINT "reader_profiles_biography_check" CHECK ("reader_profiles"."biography" IS NULL OR (char_length("reader_profiles"."biography") + char_length(regexp_replace("reader_profiles"."biography", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 500 AND octet_length("reader_profiles"."biography") <= 2000 AND "reader_profiles"."biography" = normalize("reader_profiles"."biography", NFC) AND "reader_profiles"."biography" = btrim("reader_profiles"."biography", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') AND "reader_profiles"."biography" !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\061C\200E\200F\202A-\202E\2066-\2069]')),
	CONSTRAINT "reader_profiles_shape_check" CHECK (("reader_profiles"."state" = 'ACTIVE' AND "reader_profiles"."display_name" IS NOT NULL) OR ("reader_profiles"."state" = 'REMOVED' AND "reader_profiles"."visibility" = 'PRIVATE' AND "reader_profiles"."display_name" IS NULL AND "reader_profiles"."biography" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "reader_blocks" ADD CONSTRAINT "reader_blocks_blocker_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_blocks" ADD CONSTRAINT "reader_blocks_blocked_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_profile_interests" ADD CONSTRAINT "reader_profile_interests_profile_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reader_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_profile_interests" ADD CONSTRAINT "reader_profile_interests_genre_fk" FOREIGN KEY ("genre_slug") REFERENCES "public"."genres"("slug") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_profiles" ADD CONSTRAINT "reader_profiles_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reader_blocks_reverse_idx" ON "reader_blocks" USING btree ("blocked_id","blocker_id");--> statement-breakpoint
CREATE INDEX "reader_profile_interests_genre_idx" ON "reader_profile_interests" USING btree ("genre_slug","user_id");
--> statement-breakpoint
-- Reviewed forward-only lifecycle SQL, following the existing 0009/0010/0013
-- custom-trigger convention. No old function or trigger is replaced.
CREATE FUNCTION public.reader_profile_scope_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A root-account CASCADE runs after that parent row is deleted. Ordinary
    -- profile DELETE cannot free a live account's immutable handle claim.
    IF EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = OLD.user_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reader profile claims remain while the account exists';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.visibility IS DISTINCT FROM 'PRIVATE' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'New reader profiles must be private';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.public_id IS DISTINCT FROM OLD.public_id
     OR NEW.handle IS DISTINCT FROM OLD.handle THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reader profile identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reader_profiles_scope_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.reader_profiles
FOR EACH ROW EXECUTE FUNCTION public.reader_profile_scope_guard();
--> statement-breakpoint
CREATE FUNCTION public.reader_profile_removal_interests() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.reader_profile_interests WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reader_profiles_removal_interests
AFTER UPDATE OF state ON public.reader_profiles
FOR EACH ROW WHEN (NEW.state = 'REMOVED')
EXECUTE FUNCTION public.reader_profile_removal_interests();
--> statement-breakpoint
CREATE FUNCTION public.reader_profile_interest_active_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_state text;
BEGIN
  -- Row locking, not a racy CHECK subquery: serialize selection against removal.
  SELECT p.state INTO parent_state FROM public.reader_profiles AS p
  WHERE p.user_id = NEW.user_id FOR UPDATE;
  IF FOUND AND parent_state IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reader interests require an active profile';
  END IF;
  -- Missing parents are rejected by the actual, immediate profile foreign key.
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reader_profile_interests_active_guard
BEFORE INSERT OR UPDATE ON public.reader_profile_interests
FOR EACH ROW EXECUTE FUNCTION public.reader_profile_interest_active_guard();
--> statement-breakpoint
-- Like frozen 0009/0013, invalidate backend-cached RI/SPI plans once before
-- this cohort's root cascade, not per child. DISCARD PLANS is not rolled back;
-- it changes no rows, statements, settings, statistics, or privileges.
CREATE FUNCTION public.reader_profile_user_erasure_replan() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reader_profiles WHERE user_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.reader_blocks WHERE blocker_id = OLD.id OR blocked_id = OLD.id) THEN
    EXECUTE 'DISCARD PLANS';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reader_profile_user_erasure_replan
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.reader_profile_user_erasure_replan();
