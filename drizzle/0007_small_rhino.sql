CREATE TABLE "account_activity_event" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"ip_address" text,
	"location" jsonb,
	"user_agent" text,
	"metadata" text
);
--> statement-breakpoint
ALTER TABLE "account_activity_event" ADD CONSTRAINT "account_activity_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accountActivityEvent_userId_createdAt_idx" ON "account_activity_event" USING btree ("user_id","created_at");