-- In-app notification inbox. Written on every notify event regardless of
-- push subscription/quiet hours state, so a user who never granted browser
-- push permission (or is inside their quiet hours) still sees what happened
-- next time they open the app.
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "baby_id" "uuid" NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "title" character varying NOT NULL,
    "body" character varying NOT NULL,
    "url" character varying,
    "read_at" timestamp with time zone
);

ALTER TABLE "public"."notifications" OWNER TO "postgres";

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

CREATE INDEX "notifications_user_id_read_at_idx" ON "public"."notifications" USING "btree" ("user_id", "read_at");

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";
