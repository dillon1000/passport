CREATE TABLE "admin_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"target_label" text,
	"organization_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" text
);
--> statement-breakpoint
ALTER TABLE "admin_audit_event" ADD CONSTRAINT "admin_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_event" ADD CONSTRAINT "admin_audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adminAuditEvent_createdAt_idx" ON "admin_audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "adminAuditEvent_action_idx" ON "admin_audit_event" USING btree ("action");--> statement-breakpoint
CREATE INDEX "adminAuditEvent_targetType_idx" ON "admin_audit_event" USING btree ("target_type");--> statement-breakpoint
CREATE INDEX "adminAuditEvent_organizationId_idx" ON "admin_audit_event" USING btree ("organization_id");