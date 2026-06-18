CREATE TABLE "data_export_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"workflow_instance_id" text,
	"r2_key" text,
	"zip_filename" text,
	"cancel_token_hash" text,
	"download_token_hash" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"cancelable_until" timestamp NOT NULL,
	"canceled_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"downloaded_at" timestamp,
	"error_message" text,
	"request_ip_address" text,
	"request_location" jsonb,
	"request_user_agent" text,
	"request_browser" text,
	"request_operating_system" text,
	"request_device" text,
	CONSTRAINT "data_export_request_workflow_instance_id_unique" UNIQUE("workflow_instance_id"),
	CONSTRAINT "data_export_request_download_token_hash_unique" UNIQUE("download_token_hash")
);
--> statement-breakpoint
CREATE TABLE "email_notification_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"security_alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_export_request" ADD CONSTRAINT "data_export_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preference" ADD CONSTRAINT "email_notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataExportRequest_userId_requestedAt_idx" ON "data_export_request" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "dataExportRequest_status_idx" ON "data_export_request" USING btree ("status");