CREATE TABLE "billing_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"description" text,
	"group" text,
	"price_id" text,
	"lookup_key" text,
	"annual_discount_price_id" text,
	"annual_discount_lookup_key" text,
	"seat_price_id" text,
	"proration_behavior" text,
	"free_trial_days" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"limits" jsonb,
	"entitlements" jsonb,
	"line_items" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_plan_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "billingPlan_group_idx" ON "billing_plan" USING btree ("group");--> statement-breakpoint
CREATE INDEX "billingPlan_displayOrder_idx" ON "billing_plan" USING btree ("display_order");