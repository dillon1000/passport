/**
 * Better Auth option assembly for the server runtime. Inputs are the
 * Cloudflare env and auth database; output is the complete options object
 * consumed by `betterAuth`, including database adapter, email flows, hooks,
 * social providers, and plugins.
 */
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { BetterAuthOptions } from "better-auth/minimal";

import * as schema from "../../db/schema";
import {
	sendDeleteAccountEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from "../../email";
import type { AuthEnv } from "../../env";
import { splitCsv } from "../../env";
import { AUTH_ERROR_PATH } from "../auth-error";
import { createKVSecondaryStorage } from "../kv-secondary-storage";
import { emitWebhookEvent, WEBHOOK_EVENT_TYPES } from "../webhooks";
import { createAuthDatabaseHooks } from "./hooks";
import { parseOptionalBoolean, parseOptionalInteger } from "./env";
import { AUTH_ADVANCED_OPTIONS, AUTH_SESSION_OPTIONS } from "./options";
import { buildAuthPlugins, socialProviders } from "./plugins";
import { assertBillingAllowsUserDeletion } from "./stripe";
import type { AuthDatabase } from "./types";

type AuthRateLimitEnv = {
	AUTH_RATE_LIMIT_ENABLED?: string;
	AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
	AUTH_RATE_LIMIT_MAX?: string;
	AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS?: string;
	AUTH_SENSITIVE_RATE_LIMIT_MAX?: string;
};

export function buildAuthRateLimitOptions(env: AuthRateLimitEnv) {
	const sensitiveWindow =
		parseOptionalInteger(
			env.AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS,
			"AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS",
			{ min: 1 },
		) ?? 60;
	const sensitiveMax =
		parseOptionalInteger(
			env.AUTH_SENSITIVE_RATE_LIMIT_MAX,
			"AUTH_SENSITIVE_RATE_LIMIT_MAX",
			{ min: 1 },
		) ?? 10;
	const passwordRecoveryRule = {
		window: Math.max(sensitiveWindow, 300),
		max: Math.min(sensitiveMax, 5),
	};

	return {
		enabled:
			parseOptionalBoolean(env.AUTH_RATE_LIMIT_ENABLED, "AUTH_RATE_LIMIT_ENABLED") ??
			true,
		window:
			parseOptionalInteger(
				env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
				"AUTH_RATE_LIMIT_WINDOW_SECONDS",
				{ min: 1 },
			) ?? 60,
		max:
			parseOptionalInteger(env.AUTH_RATE_LIMIT_MAX, "AUTH_RATE_LIMIT_MAX", {
				min: 1,
			}) ?? 120,
		storage: "secondary-storage",
		customRules: {
			"/sign-in/email": { window: sensitiveWindow, max: sensitiveMax },
			"/sign-up/email": { window: 300, max: sensitiveMax },
			"/forget-password": passwordRecoveryRule,
			"/reset-password": { window: 300, max: sensitiveMax },
			"/two-factor/*": { window: sensitiveWindow, max: sensitiveMax },
			"/phone-number/*": { window: sensitiveWindow, max: sensitiveMax },
			"/email-otp/*": { window: sensitiveWindow, max: sensitiveMax },
			"/magic-link/*": passwordRecoveryRule,
		},
	} satisfies BetterAuthOptions["rateLimit"];
}

// Better Auth's Stripe subscription handler runs on every
// `checkout.session.completed`, including our payment-mode (one-time) sessions
// where `session.subscription` is null. It calls `subscriptions.retrieve(null)`,
// catches the resulting "No such subscription: 'null'" error, logs it, and
// returns 200 — harmless noise, since one-time purchases are fulfilled by the
// plugin's `onEvent` hook instead. Drop only that exact line; everything else
// keeps Better Auth's default formatting and console routing.
const SUPPRESSED_LOG_FRAGMENTS = [
	"Stripe webhook failed",
	"No such subscription: 'null'",
];

export const authLogger: NonNullable<BetterAuthOptions["logger"]> = {
	log(level, message, ...args) {
		if (
			level === "error" &&
			SUPPRESSED_LOG_FRAGMENTS.every((fragment) => message.includes(fragment))
		) {
			return;
		}
		const line = `${new Date().toISOString()} ${level.toUpperCase()} [Better Auth]: ${message}`;
		if (level === "error") console.error(line, ...args);
		else if (level === "warn") console.warn(line, ...args);
		else console.log(line, ...args);
	},
};

export function createAuthOptions(env: AuthEnv, db: AuthDatabase) {
	return {
		appName: "Passport",
		logger: authLogger,
		baseURL: env.BETTER_AUTH_URL,
		basePath: "/api/auth",
		secret: env.BETTER_AUTH_SECRET,
		onAPIError: {
			errorURL: AUTH_ERROR_PATH,
		},
		advanced: AUTH_ADVANCED_OPTIONS,
		secondaryStorage: createKVSecondaryStorage(env.AUTH_SECONDARY_STORAGE),
		rateLimit: buildAuthRateLimitOptions(env),
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: splitCsv(env.TRUSTED_ORIGINS),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
				...coreFields,
				role: "user",
				banned: false,
				banReason: null,
				banExpires: null,
				...additionalFields,
				id,
			}),
			sendResetPassword: async ({ user, url }) => {
				await sendPasswordResetEmail(env, user.email, url);
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendVerificationEmail(env, user.email, url);
			},
		},
		user: {
			changeEmail: {
				enabled: true,
			},
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					await assertBillingAllowsUserDeletion(env, user);
				},
				sendDeleteAccountVerification: async ({ user, url }) => {
					await sendDeleteAccountEmail(env, user.email, url);
				},
				afterDelete: async (user) => {
					await emitWebhookEvent(env, db, WEBHOOK_EVENT_TYPES.USER_DELETED, {
						userId: user.id,
						email: user.email,
					});
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["github", "discord", "twitter"],
				allowDifferentEmails: true,
			},
		},
		session: AUTH_SESSION_OPTIONS,
		databaseHooks: createAuthDatabaseHooks(env, db),
		socialProviders: socialProviders(env),
		plugins: buildAuthPlugins(env, db),
	} satisfies BetterAuthOptions;
}
