CREATE TABLE "public"."todo_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "due_date" date,
  "done_at" timestamptz,
  "done_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid
);

ALTER TABLE "public"."todo_items" OWNER TO "postgres";

ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."todo_items"
    ADD CONSTRAINT "todo_items_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

CREATE INDEX "todo_items_baby_id_idx" ON "public"."todo_items" USING btree ("baby_id");

GRANT ALL ON TABLE "public"."todo_items" TO "anon";
GRANT ALL ON TABLE "public"."todo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_items" TO "service_role";
