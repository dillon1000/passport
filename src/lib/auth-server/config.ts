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
import { AUTH_ADVANCED_OPTIONS, AUTH_SESSION_OPTIONS } from "./options";
import { buildAuthPlugins, socialProviders } from "./plugins";
import type { AuthDatabase } from "./types";

export function createAuthOptions(env: AuthEnv, db: AuthDatabase) {
	return {
		appName: "Passport",
		baseURL: env.BETTER_AUTH_URL,
		basePath: "/api/auth",
		secret: env.BETTER_AUTH_SECRET,
		onAPIError: {
			errorURL: AUTH_ERROR_PATH,
		},
		advanced: AUTH_ADVANCED_OPTIONS,
		secondaryStorage: createKVSecondaryStorage(env.AUTH_SECONDARY_STORAGE),
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
