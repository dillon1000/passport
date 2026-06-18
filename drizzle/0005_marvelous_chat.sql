ALTER TABLE "admin_audit_event" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "location" jsonb;