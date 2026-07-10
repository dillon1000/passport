CREATE TABLE "billing_action_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"action" text NOT NULL,
	"customer_type" text DEFAULT 'user' NOT NULL,
	"reference_id" text NOT NULL,
	"product_id" text,
	"subscription_id" text,
	"annual" boolean,
	"seats" integer,
	"success_url" text,
	"cancel_url" text,
	"return_url" text,
	"registered_return_urls" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "billing_action_intent" ADD CONSTRAINT "billing_action_intent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billingActionIntent_clientId_idempotencyKey_idx" ON "billing_action_intent" USING btree ("client_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "billingActionIntent_expiresAt_idx" ON "billing_action_intent" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "billingActionIntent_userId_idx" ON "billing_action_intent" USING btree ("user_id");