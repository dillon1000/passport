ALTER TABLE "billing_plan" ADD COLUMN "type" text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plan" ADD COLUMN "personal_only" boolean DEFAULT false NOT NULL;