CREATE TABLE "one_time_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount_total" integer,
	"currency" text,
	"purchased_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_purchase_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id")
);
--> statement-breakpoint
CREATE INDEX "oneTimePurchase_referenceId_idx" ON "one_time_purchase" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "oneTimePurchase_stripeCustomerId_idx" ON "one_time_purchase" USING btree ("stripe_customer_id");