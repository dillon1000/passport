CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`issuer` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE TABLE `account_activity_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`ip_address` text,
	`location` text,
	`user_agent` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accountActivityEvent_userId_createdAt_idx` ON `account_activity_event` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `admin_audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`actor_user_id` text,
	`actor_email` text,
	`actor_role` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`target_label` text,
	`organization_id` text,
	`ip_address` text,
	`location` text,
	`user_agent` text,
	`metadata` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `adminAuditEvent_createdAt_idx` ON `admin_audit_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `adminAuditEvent_action_idx` ON `admin_audit_event` (`action`);--> statement-breakpoint
CREATE INDEX `adminAuditEvent_targetType_idx` ON `admin_audit_event` (`target_type`);--> statement-breakpoint
CREATE INDEX `adminAuditEvent_organizationId_idx` ON `admin_audit_event` (`organization_id`);--> statement-breakpoint
CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`host_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`mode` text DEFAULT 'delegated' NOT NULL,
	`public_key` text NOT NULL,
	`kid` text,
	`jwks_url` text,
	`last_used_at` integer,
	`activated_at` integer,
	`expires_at` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `agent_host`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_userId_idx` ON `agent` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_hostId_idx` ON `agent` (`host_id`);--> statement-breakpoint
CREATE INDEX `agent_status_idx` ON `agent` (`status`);--> statement-breakpoint
CREATE INDEX `agent_kid_idx` ON `agent` (`kid`);--> statement-breakpoint
CREATE TABLE `agent_capability_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`capability` text NOT NULL,
	`denied_by` text,
	`granted_by` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`reason` text,
	`constraints` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`denied_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentCapabilityGrant_agentId_idx` ON `agent_capability_grant` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agentCapabilityGrant_capability_idx` ON `agent_capability_grant` (`capability`);--> statement-breakpoint
CREATE INDEX `agentCapabilityGrant_grantedBy_idx` ON `agent_capability_grant` (`granted_by`);--> statement-breakpoint
CREATE INDEX `agentCapabilityGrant_status_idx` ON `agent_capability_grant` (`status`);--> statement-breakpoint
CREATE TABLE `agent_host` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`user_id` text,
	`default_capabilities` text,
	`public_key` text,
	`kid` text,
	`jwks_url` text,
	`enrollment_token_hash` text,
	`enrollment_token_expires_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`activated_at` integer,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentHost_userId_idx` ON `agent_host` (`user_id`);--> statement-breakpoint
CREATE INDEX `agentHost_kid_idx` ON `agent_host` (`kid`);--> statement-breakpoint
CREATE INDEX `agentHost_enrollmentTokenHash_idx` ON `agent_host` (`enrollment_token_hash`);--> statement-breakpoint
CREATE INDEX `agentHost_status_idx` ON `agent_host` (`status`);--> statement-breakpoint
CREATE TABLE `approval_request` (
	`id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`agent_id` text,
	`host_id` text,
	`user_id` text,
	`capabilities` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_code_hash` text,
	`login_hint` text,
	`binding_message` text,
	`client_notification_token` text,
	`client_notification_endpoint` text,
	`delivery_mode` text,
	`interval` integer NOT NULL,
	`last_polled_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `agent_host`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approvalRequest_agentId_idx` ON `approval_request` (`agent_id`);--> statement-breakpoint
CREATE INDEX `approvalRequest_hostId_idx` ON `approval_request` (`host_id`);--> statement-breakpoint
CREATE INDEX `approvalRequest_userId_idx` ON `approval_request` (`user_id`);--> statement-breakpoint
CREATE INDEX `approvalRequest_status_idx` ON `approval_request` (`status`);--> statement-breakpoint
CREATE TABLE `billing_action_intent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`action` text NOT NULL,
	`customer_type` text DEFAULT 'user' NOT NULL,
	`reference_id` text NOT NULL,
	`product_id` text,
	`subscription_id` text,
	`annual` integer,
	`seats` integer,
	`success_url` text,
	`cancel_url` text,
	`return_url` text,
	`registered_return_urls` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billingActionIntent_clientId_idempotencyKey_idx` ON `billing_action_intent` (`client_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `billingActionIntent_expiresAt_idx` ON `billing_action_intent` (`expires_at`);--> statement-breakpoint
CREATE INDEX `billingActionIntent_userId_idx` ON `billing_action_intent` (`user_id`);--> statement-breakpoint
CREATE TABLE `billing_entitlement` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_entitlement_key_unique` ON `billing_entitlement` (`key`);--> statement-breakpoint
CREATE TABLE `billing_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`unit` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_limit_key_unique` ON `billing_limit` (`key`);--> statement-breakpoint
CREATE TABLE `billing_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label` text,
	`description` text,
	`group` text,
	`price_id` text,
	`lookup_key` text,
	`annual_discount_price_id` text,
	`annual_discount_lookup_key` text,
	`seat_price_id` text,
	`proration_behavior` text,
	`free_trial_days` integer,
	`type` text DEFAULT 'subscription' NOT NULL,
	`personal_only` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`limits` text,
	`entitlements` text,
	`line_items` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_plan_name_unique` ON `billing_plan` (`name`);--> statement-breakpoint
CREATE INDEX `billingPlan_group_idx` ON `billing_plan` (`group`);--> statement-breakpoint
CREATE INDEX `billingPlan_displayOrder_idx` ON `billing_plan` (`display_order`);--> statement-breakpoint
CREATE TABLE `data_export_request` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`workflow_instance_id` text,
	`r2_key` text,
	`zip_filename` text,
	`cancel_token_hash` text,
	`download_token_hash` text,
	`requested_at` integer DEFAULT (unixepoch()) NOT NULL,
	`cancelable_until` integer NOT NULL,
	`canceled_at` integer,
	`completed_at` integer,
	`expires_at` integer,
	`downloaded_at` integer,
	`error_message` text,
	`request_ip_address` text,
	`request_location` text,
	`request_user_agent` text,
	`request_browser` text,
	`request_operating_system` text,
	`request_device` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_export_request_workflow_instance_id_unique` ON `data_export_request` (`workflow_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `data_export_request_download_token_hash_unique` ON `data_export_request` (`download_token_hash`);--> statement-breakpoint
CREATE INDEX `dataExportRequest_userId_requestedAt_idx` ON `data_export_request` (`user_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `dataExportRequest_status_idx` ON `data_export_request` (`status`);--> statement-breakpoint
CREATE TABLE `email_notification_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`security_alerts` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`team_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_pending_organizationId_email_uidx` ON `invitation` (`organization_id`,`email`) WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_organizationId_userId_uidx` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_token`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_token_token_unique` ON `oauth_access_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauth_access_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_userId_idx` ON `oauth_access_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauth_access_token` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauth_access_token` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`disabled` integer DEFAULT false,
	`platform_admin_only` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`optional_scopes` text,
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`token_endpoint_auth_method` text,
	`grant_types` text,
	`response_types` text,
	`public` integer,
	`type` text,
	`require_pkce` integer,
	`reference_id` text,
	`metadata` text,
	`backchannel_logout_uri` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_client_id_unique` ON `oauth_client` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClient_userId_idx` ON `oauth_client` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthConsent_clientId_idx` ON `oauth_consent` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthConsent_userId_idx` ON `oauth_consent` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_token_token_unique` ON `oauth_refresh_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauth_refresh_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauth_refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauth_refresh_token` (`authorization_code_id`);--> statement-breakpoint
CREATE TABLE `one_time_purchase` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`reference_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`amount_total` integer,
	`currency` text,
	`purchased_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_purchase_stripe_checkout_session_id_unique` ON `one_time_purchase` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `oneTimePurchase_referenceId_idx` ON `one_time_purchase` (`reference_id`);--> statement-breakpoint
CREATE INDEX `oneTimePurchase_stripeCustomerId_idx` ON `one_time_purchase` (`stripe_customer_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`stripe_customer_id` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE INDEX `organization_slug_idx` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_role` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organizationRole_organizationId_idx` ON `organization_role` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organizationRole_role_idx` ON `organization_role` (`role`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`location` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	`active_organization_id` text,
	`active_team_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`reference_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`trial_start` integer,
	`trial_end` integer,
	`cancel_at_period_end` integer DEFAULT false,
	`cancel_at` integer,
	`canceled_at` integer,
	`ended_at` integer,
	`seats` integer,
	`billing_interval` text,
	`stripe_schedule_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscription_referenceId_idx` ON `subscription` (`reference_id`);--> statement-breakpoint
CREATE INDEX `subscription_stripeCustomerId_idx` ON `subscription` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `subscription_stripeSubscriptionId_idx` ON `subscription` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo` text,
	`organization_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_organizationId_idx` ON `team` (`organization_id`);--> statement-breakpoint
CREATE TABLE `team_member` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teamMember_teamId_idx` ON `team_member` (`team_id`);--> statement-breakpoint
CREATE INDEX `teamMember_userId_idx` ON `team_member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teamMember_teamId_userId_uidx` ON `team_member` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT true,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`last_login_method` text,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`two_factor_enabled` integer DEFAULT false,
	`username` text,
	`display_username` text,
	`phone_number` text,
	`phone_number_verified` integer,
	`stripe_customer_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `webhook_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`endpoint_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`response_status` integer,
	`error` text,
	`delivered_at` integer,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoint`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhookDelivery_endpointId_createdAt_idx` ON `webhook_delivery` (`endpoint_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `webhookDelivery_status_idx` ON `webhook_delivery` (`status`);--> statement-breakpoint
CREATE TABLE `webhook_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by_user_id` text,
	`organization_id` text,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`description` text,
	`disabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhookEndpoint_organizationId_idx` ON `webhook_endpoint` (`organization_id`);
--> statement-breakpoint
CREATE TRIGGER `member_user_organization_limit`
BEFORE INSERT ON `member`
WHEN (SELECT count(*) FROM `member` WHERE `user_id` = NEW.`user_id`) >= 10
BEGIN
	SELECT RAISE(ABORT, 'organization_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `member_organization_limit`
BEFORE INSERT ON `member`
WHEN (SELECT count(*) FROM `member` WHERE `organization_id` = NEW.`organization_id`) >= 100
BEGIN
	SELECT RAISE(ABORT, 'organization_member_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `invitation_pending_limit`
BEFORE INSERT ON `invitation`
WHEN NEW.`status` = 'pending'
	AND (SELECT count(*) FROM `invitation` WHERE `organization_id` = NEW.`organization_id` AND `status` = 'pending') >= 100
BEGIN
	SELECT RAISE(ABORT, 'invitation_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `team_organization_limit`
BEFORE INSERT ON `team`
WHEN (SELECT count(*) FROM `team` WHERE `organization_id` = NEW.`organization_id`) >= 25
BEGIN
	SELECT RAISE(ABORT, 'team_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `team_member_limit`
BEFORE INSERT ON `team_member`
WHEN (SELECT count(*) FROM `team_member` WHERE `team_id` = NEW.`team_id`) >= 100
BEGIN
	SELECT RAISE(ABORT, 'team_member_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `member_keep_last_owner_on_update`
BEFORE UPDATE OF `role` ON `member`
WHEN EXISTS (SELECT 1 FROM `organization` WHERE `id` = OLD.`organization_id`)
	AND EXISTS (SELECT 1 FROM `user` WHERE `id` = OLD.`user_id`)
	AND instr(',' || OLD.`role` || ',', ',owner,') > 0
	AND instr(',' || NEW.`role` || ',', ',owner,') = 0
	AND NOT EXISTS (
		SELECT 1 FROM `member`
		WHERE `organization_id` = OLD.`organization_id`
			AND `id` != OLD.`id`
			AND instr(',' || `role` || ',', ',owner,') > 0
	)
BEGIN
	SELECT RAISE(ABORT, 'last_owner');
END;
--> statement-breakpoint
CREATE TRIGGER `member_keep_last_owner_on_delete`
BEFORE DELETE ON `member`
WHEN EXISTS (SELECT 1 FROM `organization` WHERE `id` = OLD.`organization_id`)
	AND EXISTS (SELECT 1 FROM `user` WHERE `id` = OLD.`user_id`)
	AND instr(',' || OLD.`role` || ',', ',owner,') > 0
	AND NOT EXISTS (
		SELECT 1 FROM `member`
		WHERE `organization_id` = OLD.`organization_id`
			AND `id` != OLD.`id`
			AND instr(',' || `role` || ',', ',owner,') > 0
	)
BEGIN
	SELECT RAISE(ABORT, 'last_owner');
END;
--> statement-breakpoint
CREATE TRIGGER `team_keep_last_team_on_delete`
BEFORE DELETE ON `team`
WHEN EXISTS (SELECT 1 FROM `organization` WHERE `id` = OLD.`organization_id`)
	AND NOT EXISTS (
		SELECT 1 FROM `team`
		WHERE `organization_id` = OLD.`organization_id`
			AND `id` != OLD.`id`
	)
BEGIN
	SELECT RAISE(ABORT, 'last_team');
END;
