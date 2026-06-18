/**
 * Better Auth server hooks for security notifications, activity logging, and
 * database-side enrichment. Inputs are the runtime env, Drizzle database, auth
 * hook context, and request metadata; outputs are Better Auth hook definitions
 * plus the exported IP-address comparison helper used by tests.
 */
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth/minimal";
import { and, eq, ne } from "drizzle-orm";

import * as schema from "../../db/schema";
import { sendSecurityAlertEmail } from "../../email";
import type { AuthEnv } from "../../env";
import {
	ACCOUNT_ACTIVITY_LABELS,
	ACCOUNT_ACTIVITY_TYPES,
	accountActivityTypeForPath,
	type AccountActivityType,
} from "../account-activity";
import { isAdminEmail } from "../admin-access";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "../notification-preferences";
import { requestLocationFromRequest } from "../request-location";
import { requestIPAddress, requestMetadataFromRequest } from "../request-metadata";
import { emitWebhookEvent, WEBHOOK_EVENT_TYPES } from "../webhooks";
import type { AuthDatabase } from "./types";

type HookUser = {
	id: string;
	email: string;
};

type HookSession = {
	user?: HookUser;
};

type HookNewSession = {
	session?: {
		token?: string | null;
	};
	user?: HookUser & {
		twoFactorEnabled?: boolean | null;
	};
};

type SessionIPAddressSummary = {
	token?: string | null;
	ipAddress?: string | null;
};

function hookSessionUser(value: unknown): HookUser | null {
	if (!value || typeof value !== "object") return null;
	const session = value as HookSession;
	const user = session.user;
	if (!user?.id || !user.email) return null;
	return user;
}

function hookNewSession(value: unknown): HookNewSession | null {
	if (!value || typeof value !== "object") return null;
	const newSession = value as HookNewSession;
	if (!newSession.user?.id || !newSession.user.email) return null;
	return newSession;
}

function normalizeIPAddress(value: string | null | undefined) {
	const normalized = value?.trim().toLowerCase();
	return normalized || null;
}

export function isNewSignInIPAddress(
	currentToken: string,
	currentIPAddress: string | null | undefined,
	sessions: readonly SessionIPAddressSummary[],
) {
	const normalizedIPAddress = normalizeIPAddress(currentIPAddress);
	if (!normalizedIPAddress) return false;

	return !sessions.some((session) => {
		if (session.token === currentToken) return false;
		return normalizeIPAddress(session.ipAddress) === normalizedIPAddress;
	});
}

async function securityAlertsEnabled(db: AuthDatabase, userId: string) {
	const [preference] = await db
		.select({
			securityAlerts: schema.emailNotificationPreference.securityAlerts,
		})
		.from(schema.emailNotificationPreference)
		.where(eq(schema.emailNotificationPreference.userId, userId))
		.limit(1);
	return preference?.securityAlerts ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.securityAlerts;
}

async function sendSecurityNotification(
	env: AuthEnv,
	db: AuthDatabase,
	user: HookUser,
	request: Request | undefined,
	event: string,
) {
	if (!(await securityAlertsEnabled(db, user.id))) return;
	await sendSecurityAlertEmail(
		env,
		user.email,
		event,
		requestMetadataFromRequest(request),
	).catch((error: unknown) => {
		console.warn("Security alert email failed.", error);
	});
}

async function maybeSendNewIPAddressNotification(
	env: AuthEnv,
	db: AuthDatabase,
	newSession: HookNewSession,
	request: Request | undefined,
) {
	const token = newSession.session?.token;
	const user = newSession.user;
	if (!token || !user) return;

	const sessions = await db
		.select({
			token: schema.session.token,
			ipAddress: schema.session.ipAddress,
		})
		.from(schema.session)
		.where(eq(schema.session.userId, user.id));
	const currentSession = sessions.find((session) => session.token === token);
	const currentIPAddress = requestIPAddress(request) ?? currentSession?.ipAddress;
	if (!isNewSignInIPAddress(token, currentIPAddress, sessions)) return;

	await sendSecurityNotification(env, db, user, request, "New sign-in from a new IP address");
}

/**
 * Appends a row to the user-facing account activity log. Records every event
 * regardless of the user's email-alert preference: the log is the durable
 * record, alerts are an opt-in notification on top of it. Request metadata
 * mirrors what sessions already capture (IP, coarse location, user agent).
 * Failures are swallowed so logging never blocks an auth action.
 */
async function recordAccountActivity(
	db: AuthDatabase,
	userId: string,
	type: AccountActivityType,
	request: Request | undefined,
	metadata?: Record<string, string>,
) {
	await db
		.insert(schema.accountActivityEvent)
		.values({
			id: crypto.randomUUID(),
			userId,
			type,
			ipAddress: requestIPAddress(request),
			location: requestLocationFromRequest(request),
			userAgent: request?.headers.get("user-agent") ?? null,
			metadata: metadata ? JSON.stringify(metadata) : null,
		})
		.catch((error: unknown) => {
			console.warn("Account activity log write failed.", error);
		});
}

export function accountSecurityEmailPlugin(env: AuthEnv, db: AuthDatabase) {
	return {
		id: "account-security-email",
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						if (isAPIError(ctx.context.returned)) return;

						const newSession = hookNewSession(ctx.context.newSession);
						if (newSession?.user) {
							await recordAccountActivity(
								db,
								newSession.user.id,
								ACCOUNT_ACTIVITY_TYPES.SIGN_IN,
								ctx.request,
							);
							await maybeSendNewIPAddressNotification(env, db, newSession, ctx.request);
						}

						const updateBody = ctx.body as Record<string, unknown> | null | undefined;
						const phoneRemoved =
							ctx.path === "/update-user" && updateBody && "phoneNumber" in updateBody;
						const activityType: AccountActivityType | null = phoneRemoved
							? ACCOUNT_ACTIVITY_TYPES.PHONE_REMOVED
							: accountActivityTypeForPath(ctx.path);
						if (!activityType) return;

						const user = hookSessionUser(ctx.context.session);
						if (!user) return;

						// The activity log records the event for everyone; the email alert is
						// an opt-in notification layered on top.
						await recordAccountActivity(db, user.id, activityType, ctx.request);
						await sendSecurityNotification(
							env,
							db,
							user,
							ctx.request,
							ACCOUNT_ACTIVITY_LABELS[activityType],
						);
					}),
				},
			],
		},
	};
}

export function createAuthDatabaseHooks(env: AuthEnv, db: AuthDatabase) {
	return {
		user: {
			create: {
				before: async (user) => ({
					data: {
						...user,
						role: isAdminEmail(env, user.email) ? "admin" : "user",
					},
				}),
				after: async (user) => {
					await emitWebhookEvent(env, db, WEBHOOK_EVENT_TYPES.USER_CREATED, {
						userId: user.id,
						email: user.email,
						name: user.name,
					});
				},
			},
		},
		session: {
			create: {
				before: async (session, context) => ({
					data: {
						...session,
						location: requestLocationFromRequest(context?.request),
					},
				}),
			},
			update: {
				before: async (session, context) => {
					const location = requestLocationFromRequest(context?.request);
					if (!location) return;
					return {
						data: {
							...session,
							location,
						},
					};
				},
			},
		},
		account: {
			create: {
				after: async (account, context) => {
					if (account.providerId === "credential") return;
					const [existingAccount] = await db
						.select({
							id: schema.account.id,
						})
						.from(schema.account)
						.where(
							and(
								eq(schema.account.userId, account.userId),
								ne(schema.account.id, account.id),
							),
						)
						.limit(1);
					if (!existingAccount) return;
					const [user] = await db
						.select({
							id: schema.user.id,
							email: schema.user.email,
						})
						.from(schema.user)
						.where(eq(schema.user.id, account.userId))
						.limit(1);
					if (!user) return;
					await sendSecurityNotification(
						env,
						db,
						user,
						context?.request,
						`${account.providerId} account linked`,
					);
					await recordAccountActivity(
						db,
						user.id,
						ACCOUNT_ACTIVITY_TYPES.ACCOUNT_LINKED,
						context?.request,
						{ provider: account.providerId },
					);
					await emitWebhookEvent(env, db, WEBHOOK_EVENT_TYPES.ACCOUNT_LINKED, {
						userId: user.id,
						provider: account.providerId,
					});
				},
			},
		},
	} satisfies BetterAuthOptions["databaseHooks"];
}
