/**
 * Drizzle schema for the Better Auth database plus Passport-owned OAuth and
 * agent tables. Field names mirror Better Auth adapter expectations; optional
 * columns are safe extension points for UI metadata such as logos and policies.
 */
import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { RequestLocation } from "../lib/request-location";
import type { BillingLimits, BillingPlanLineItem } from "../lib/billing";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  lastLoginMethod: text("last_login_method"),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(false),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: integer("phone_number_verified", { mode: "boolean" }),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    location: text("location", { mode: "json" }).$type<RequestLocation | null>(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    // Better Auth 1.7 scopes provider identities by this stable authority.
    // Local credentials use `local:credential`; configured OAuth providers
    // without a protocol issuer use `local:oauth:<providerId>`.
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("account_userId_idx").on(table.userId),
    uniqueIndex("account_issuer_accountId_uidx").on(table.issuer, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = sqliteTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    metadata: text("metadata"),
  },
  (table) => [index("organization_slug_idx").on(table.slug)],
);

export const organizationRole = sqliteTable(
  "organization_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("organizationRole_organizationId_idx").on(table.organizationId),
    index("organizationRole_role_idx").on(table.role),
  ],
);

export const team = sqliteTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    logo: text("logo"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_organizationId_idx").on(table.organizationId)],
);

export const teamMember = sqliteTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
    uniqueIndex("teamMember_teamId_userId_uidx").on(table.teamId, table.userId),
  ],
);

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    uniqueIndex("member_organizationId_userId_uidx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    teamId: text("team_id"),
    status: text("status").default("pending").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
    uniqueIndex("invitation_pending_organizationId_email_uidx")
      .on(table.organizationId, table.email)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: integer("verified", { mode: "boolean" }).default(true),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

// Better Auth Stripe subscription rows. `referenceId` is intentionally
// polymorphic: for personal billing it is the user id, and for organization
// billing it is the organization id. Do not add a uniqueness constraint;
// Stripe/Better Auth allow resubscription after cancellation history.
export const subscription = sqliteTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").default("incomplete").notNull(),
    periodStart: integer("period_start", { mode: "timestamp" }),
    periodEnd: integer("period_end", { mode: "timestamp" }),
    trialStart: integer("trial_start", { mode: "timestamp" }),
    trialEnd: integer("trial_end", { mode: "timestamp" }),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).default(false),
    cancelAt: integer("cancel_at", { mode: "timestamp" }),
    canceledAt: integer("canceled_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    seats: integer("seats"),
    billingInterval: text("billing_interval"),
    stripeScheduleId: text("stripe_schedule_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_referenceId_idx").on(table.referenceId),
    index("subscription_stripeCustomerId_idx").on(table.stripeCustomerId),
    index("subscription_stripeSubscriptionId_idx").on(table.stripeSubscriptionId),
  ],
);

// One-time (single payment) purchases settled through the payment-mode Stripe
// Checkout flow. Unlike `subscription` these never recur; a completed row grants
// the plan's entitlements and limits permanently. `referenceId` is the user or
// organization id (mirrors `subscription`); customer type is derived from it.
export const oneTimePurchase = sqliteTable(
  "one_time_purchase",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    // Checkout session id is the idempotency key: Stripe redelivers webhooks, so
    // the unique constraint keeps repeated deliveries from inserting duplicates.
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: text("status").default("completed").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    amountTotal: integer("amount_total"),
    currency: text("currency"),
    purchasedAt: integer("purchased_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("oneTimePurchase_referenceId_idx").on(table.referenceId),
    index("oneTimePurchase_stripeCustomerId_idx").on(table.stripeCustomerId),
  ],
);

// Delegated clients create short-lived billing handoffs instead of receiving a
// Stripe URL directly. The client/idempotency key pair makes creation replayable,
// while requestHash detects a key reused with different inputs. Stripe work only
// begins after the same user confirms this row from Passport's session UI.
export const billingActionIntent = sqliteTable(
  "billing_action_intent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    action: text("action").notNull(),
    customerType: text("customer_type").default("user").notNull(),
    referenceId: text("reference_id").notNull(),
    productId: text("product_id"),
    subscriptionId: text("subscription_id"),
    annual: integer("annual", { mode: "boolean" }),
    seats: integer("seats"),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    returnUrl: text("return_url"),
    registeredReturnUrls: text("registered_return_urls", { mode: "json" }).$type<string[]>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").default("pending").notNull(),
    resultUrl: text("result_url"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("billingActionIntent_clientId_idempotencyKey_idx").on(
      table.clientId,
      table.idempotencyKey,
    ),
    index("billingActionIntent_expiresAt_idx").on(table.expiresAt),
    index("billingActionIntent_userId_idx").on(table.userId),
  ],
);

export const agentHost = sqliteTable(
  "agent_host",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    defaultCapabilities: text("default_capabilities"),
    publicKey: text("public_key"),
    kid: text("kid"),
    jwksUrl: text("jwks_url"),
    enrollmentTokenHash: text("enrollment_token_hash"),
    enrollmentTokenExpiresAt: integer("enrollment_token_expires_at", { mode: "timestamp" }),
    status: text("status").default("active").notNull(),
    activatedAt: integer("activated_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("agentHost_userId_idx").on(table.userId),
    index("agentHost_kid_idx").on(table.kid),
    index("agentHost_enrollmentTokenHash_idx").on(table.enrollmentTokenHash),
    index("agentHost_status_idx").on(table.status),
  ],
);

export const agent = sqliteTable(
  "agent",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    hostId: text("host_id")
      .notNull()
      .references(() => agentHost.id, { onDelete: "cascade" }),
    status: text("status").default("active").notNull(),
    mode: text("mode").default("delegated").notNull(),
    publicKey: text("public_key").notNull(),
    kid: text("kid"),
    jwksUrl: text("jwks_url"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    activatedAt: integer("activated_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("agent_userId_idx").on(table.userId),
    index("agent_hostId_idx").on(table.hostId),
    index("agent_status_idx").on(table.status),
    index("agent_kid_idx").on(table.kid),
  ],
);

export const agentCapabilityGrant = sqliteTable(
  "agent_capability_grant",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    deniedBy: text("denied_by").references(() => user.id, {
      onDelete: "cascade",
    }),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    status: text("status").default("active").notNull(),
    reason: text("reason"),
    constraints: text("constraints"),
  },
  (table) => [
    index("agentCapabilityGrant_agentId_idx").on(table.agentId),
    index("agentCapabilityGrant_capability_idx").on(table.capability),
    index("agentCapabilityGrant_grantedBy_idx").on(table.grantedBy),
    index("agentCapabilityGrant_status_idx").on(table.status),
  ],
);

export const approvalRequest = sqliteTable(
  "approval_request",
  {
    id: text("id").primaryKey(),
    method: text("method").notNull(),
    agentId: text("agent_id").references(() => agent.id, {
      onDelete: "cascade",
    }),
    hostId: text("host_id").references(() => agentHost.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    capabilities: text("capabilities"),
    status: text("status").default("pending").notNull(),
    userCodeHash: text("user_code_hash"),
    loginHint: text("login_hint"),
    bindingMessage: text("binding_message"),
    clientNotificationToken: text("client_notification_token"),
    clientNotificationEndpoint: text("client_notification_endpoint"),
    deliveryMode: text("delivery_mode"),
    interval: integer("interval").notNull(),
    lastPolledAt: integer("last_polled_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("approvalRequest_agentId_idx").on(table.agentId),
    index("approvalRequest_hostId_idx").on(table.hostId),
    index("approvalRequest_userId_idx").on(table.userId),
    index("approvalRequest_status_idx").on(table.status),
  ],
);

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: integer("created_at", { mode: "timestamp" }),
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    // When enabled, the authorization flow issues codes only to Passport
    // platform administrators. This is a Passport-owned access policy, not
    // OAuth client metadata consumed by Better Auth.
    platformAdminOnly: integer("platform_admin_only", { mode: "boolean" }).default(false).notNull(),
    // Verified clients may show their uploaded brand on consent screens. New
    // registrations stay unpublished until an administrator reviews them.
    verified: integer("verified", { mode: "boolean" }).default(false).notNull(),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>(),
    // Only these requested scopes may be removed by a user during consent.
    // All other client scopes remain required by default.
    optionalScopes: text("optional_scopes", { mode: "json" }).$type<string[]>(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts", { mode: "json" }).$type<string[]>(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris", { mode: "json" }).$type<string[]>().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris", { mode: "json" }).$type<string[]>(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types", { mode: "json" }).$type<string[]>(),
    responseTypes: text("response_types", { mode: "json" }).$type<string[]>(),
    public: integer("public", { mode: "boolean" }),
    type: text("type"),
    requirePKCE: integer("require_pkce", { mode: "boolean" }),
    referenceId: text("reference_id"),
    metadata: text("metadata", { mode: "json" }),
    // OIDC Back-Channel Logout endpoint for this client. When set, Passport
    // POSTs a signed logout_token here when a user's sessions are force-ended
    // (e.g. an admin ban). Passport-owned column: Better Auth's client APIs do
    // not manage it, so the worker persists it with a direct update.
    backchannelLogoutUri: text("backchannel_logout_uri"),
  },
  (table) => [index("oauthClient_userId_idx").on(table.userId)],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources", { mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type<string[]>(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }),
    revoked: integer("revoked", { mode: "timestamp" }),
    rotatedAt: integer("rotated_at", { mode: "timestamp" }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp" }),
    authTime: integer("auth_time", { mode: "timestamp" }),
    confirmation: text("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    index("oauthRefreshToken_clientId_idx").on(table.clientId),
    index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    index("oauthRefreshToken_userId_idx").on(table.userId),
    index("oauthRefreshToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources", { mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type<string[]>(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }),
    revoked: integer("revoked", { mode: "timestamp" }),
    confirmation: text("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    index("oauthAccessToken_userId_idx").on(table.userId),
    index("oauthAccessToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
    index("oauthAccessToken_refreshId_idx").on(table.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources", { mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type<string[]>(),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId),
  ],
);

export const adminAuditEvent = sqliteTable(
  "admin_audit_event",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    ipAddress: text("ip_address"),
    location: text("location", { mode: "json" }).$type<RequestLocation | null>(),
    userAgent: text("user_agent"),
    metadata: text("metadata"),
  },
  (table) => [
    index("adminAuditEvent_createdAt_idx").on(table.createdAt),
    index("adminAuditEvent_action_idx").on(table.action),
    index("adminAuditEvent_targetType_idx").on(table.targetType),
    index("adminAuditEvent_organizationId_idx").on(table.organizationId),
  ],
);

// User-facing account activity log. Append-only security/account events the
// authenticated user can review on their Security page. Recorded by the auth
// after-hook independently of email-alert preferences. Distinct from
// admin_audit_event, which records operator (cross-user) mutations.
export const accountActivityEvent = sqliteTable(
  "account_activity_event",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    ipAddress: text("ip_address"),
    location: text("location", { mode: "json" }).$type<RequestLocation | null>(),
    userAgent: text("user_agent"),
    metadata: text("metadata"),
  },
  (table) => [
    index("accountActivityEvent_userId_createdAt_idx").on(table.userId, table.createdAt),
  ],
);

// Outbound webhook subscriptions. A provider-level endpoint has a null
// organizationId; org-owned endpoints (future) carry one. `secret` is the
// symmetric HMAC signing key the worker uses to sign every delivery, so it must
// be stored retrievably; it is redacted from list responses and shown to the
// operator only on create/rotate. `events` is the set of subscribed event-type
// slugs (see lib/webhooks.ts).
export const webhookEndpoint = sqliteTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: text("events", { mode: "json" }).$type<string[]>().notNull(),
    description: text("description"),
    disabled: integer("disabled", { mode: "boolean" }).default(false).notNull(),
  },
  (table) => [index("webhookEndpoint_organizationId_idx").on(table.organizationId)],
);

// Append-only delivery log. One row per (event, endpoint) attempt set. The
// delivery Workflow updates status/attempts/responseStatus as it retries.
export const webhookDelivery = sqliteTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  },
  (table) => [
    index("webhookDelivery_endpointId_createdAt_idx").on(
      table.endpointId,
      table.createdAt,
    ),
    index("webhookDelivery_status_idx").on(table.status),
  ],
);

export const emailNotificationPreference = sqliteTable("email_notification_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  securityAlerts: integer("security_alerts", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const dataExportRequest = sqliteTable(
  "data_export_request",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(),
    workflowInstanceId: text("workflow_instance_id").unique(),
    r2Key: text("r2_key"),
    zipFilename: text("zip_filename"),
    cancelTokenHash: text("cancel_token_hash"),
    downloadTokenHash: text("download_token_hash").unique(),
    requestedAt: integer("requested_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    cancelableUntil: integer("cancelable_until", { mode: "timestamp" }).notNull(),
    canceledAt: integer("canceled_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
    errorMessage: text("error_message"),
    requestIpAddress: text("request_ip_address"),
    requestLocation: text("request_location", { mode: "json" }).$type<RequestLocation | null>(),
    requestUserAgent: text("request_user_agent"),
    requestBrowser: text("request_browser"),
    requestOperatingSystem: text("request_operating_system"),
    requestDevice: text("request_device"),
  },
  (table) => [
    index("dataExportRequest_userId_requestedAt_idx").on(table.userId, table.requestedAt),
    index("dataExportRequest_status_idx").on(table.status),
  ],
);

// Billing plan catalog. Mirrors BillingPlanDefinition (src/lib/billing.ts).
// When this table is empty, the plan source falls back to STRIPE_BILLING_PLANS,
// so existing env-only deployments keep working and the env var can seed.
export const billingPlan = sqliteTable(
  "billing_plan",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    label: text("label"),
    description: text("description"),
    group: text("group"),
    priceId: text("price_id"),
    lookupKey: text("lookup_key"),
    annualDiscountPriceId: text("annual_discount_price_id"),
    annualDiscountLookupKey: text("annual_discount_lookup_key"),
    seatPriceId: text("seat_price_id"),
    prorationBehavior: text("proration_behavior"),
    freeTrialDays: integer("free_trial_days"),
    // "subscription" (recurring Stripe price) or "one_time" (single payment).
    type: text("type").default("subscription").notNull(),
    // When true the plan is purchasable only by personal accounts; organization
    // customers are blocked at checkout.
    personalOnly: integer("personal_only", { mode: "boolean" }).default(false).notNull(),
    // When true the plan is hidden from the public catalog. It stays purchasable
    // by anyone who has the direct /billing/product/:id deeplink.
    hidden: integer("hidden", { mode: "boolean" }).default(false).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    limits: text("limits", { mode: "json" }).$type<BillingLimits>(),
    entitlements: text("entitlements", { mode: "json" }).$type<string[]>(),
    lineItems: text("line_items", { mode: "json" }).$type<BillingPlanLineItem[]>(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("billingPlan_group_idx").on(table.group),
    index("billingPlan_displayOrder_idx").on(table.displayOrder),
  ],
);

// Reusable entitlement registry. Plans reference entries by `key`; `name` is the
// friendly label shown in pricing tables and the public catalog.
export const billingEntitlement = sqliteTable("billing_entitlement", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Reusable limit registry. Plans reference entries by `key` and assign a value;
// `name`/`unit` describe the limit in pricing tables and the public catalog.
export const billingLimit = sqliteTable("billing_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  unit: text("unit"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  members: many(member),
  invitations: many(invitation),
  twoFactors: many(twoFactor),
  agentHosts: many(agentHost),
  agents: many(agent),
  agentCapabilityGrants: many(agentCapabilityGrant),
  approvalRequests: many(approvalRequest),
  passkeys: many(passkey),
  oauthClients: many(oauthClient),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
  adminAuditEvents: many(adminAuditEvent),
  dataExportRequests: many(dataExportRequest),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  organizationRoles: many(organizationRole),
  teams: many(team),
  members: many(member),
  invitations: many(invitation),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationRole.organizationId],
      references: [organization.id],
    }),
  }),
);

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const agentHostRelations = relations(agentHost, ({ one, many }) => ({
  user: one(user, {
    fields: [agentHost.userId],
    references: [user.id],
  }),
  agents: many(agent),
  approvalRequests: many(approvalRequest),
}));

export const agentRelations = relations(agent, ({ one, many }) => ({
  user: one(user, {
    fields: [agent.userId],
    references: [user.id],
  }),
  agentHost: one(agentHost, {
    fields: [agent.hostId],
    references: [agentHost.id],
  }),
  agentCapabilityGrants: many(agentCapabilityGrant),
  approvalRequests: many(approvalRequest),
}));

export const agentCapabilityGrantDeniedByRelations = relations(
  agentCapabilityGrant,
  ({ one }) => ({
    user: one(user, {
      fields: [agentCapabilityGrant.deniedBy],
      references: [user.id],
    }),
  }),
);

export const agentCapabilityGrantGrantedByRelations = relations(
  agentCapabilityGrant,
  ({ one }) => ({
    user: one(user, {
      fields: [agentCapabilityGrant.grantedBy],
      references: [user.id],
    }),
  }),
);

export const agentCapabilityGrantRelations = relations(
  agentCapabilityGrant,
  ({ one }) => ({
    agent: one(agent, {
      fields: [agentCapabilityGrant.agentId],
      references: [agent.id],
    }),
  }),
);

export const approvalRequestRelations = relations(
  approvalRequest,
  ({ one }) => ({
    agent: one(agent, {
      fields: [approvalRequest.agentId],
      references: [agent.id],
    }),
    agentHost: one(agentHost, {
      fields: [approvalRequest.hostId],
      references: [agentHost.id],
    }),
    user: one(user, {
      fields: [approvalRequest.userId],
      references: [user.id],
    }),
  }),
);

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, {
    fields: [oauthClient.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const oauthRefreshTokenRelations = relations(
  oauthRefreshToken,
  ({ one, many }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthRefreshToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthRefreshToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthRefreshToken.userId],
      references: [user.id],
    }),
    oauthAccessTokens: many(oauthAccessToken),
  }),
);

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthAccessToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthAccessToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
    oauthRefreshToken: one(oauthRefreshToken, {
      fields: [oauthAccessToken.refreshId],
      references: [oauthRefreshToken.id],
    }),
  }),
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}));

export const adminAuditEventRelations = relations(adminAuditEvent, ({ one }) => ({
  actor: one(user, {
    fields: [adminAuditEvent.actorUserId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [adminAuditEvent.organizationId],
    references: [organization.id],
  }),
}));

export const emailNotificationPreferenceRelations = relations(
  emailNotificationPreference,
  ({ one }) => ({
    user: one(user, {
      fields: [emailNotificationPreference.userId],
      references: [user.id],
    }),
  }),
);

export const dataExportRequestRelations = relations(dataExportRequest, ({ one }) => ({
  user: one(user, {
    fields: [dataExportRequest.userId],
    references: [user.id],
  }),
}));
