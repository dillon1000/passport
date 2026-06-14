import { agentAuth, type Capability } from "@better-auth/agent-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha, lastLoginMethod, type CaptchaOptions } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";

import { createDb } from "./db/client";
import * as schema from "./db/schema";
import {
	sendDeleteAccountEmail,
	sendMagicLinkEmail,
	sendOrganizationInvitationEmail,
	sendPasswordResetEmail,
	sendTwoFactorOTPEmail,
	sendVerificationEmail,
} from "./email";
import { parseOAuthClientSeeds, splitCsv, type AuthEnv } from "./env";

function normalizeEmail(email: string | null | undefined) {
	return email?.trim().toLowerCase() ?? "";
}

function isAdminEmail(env: AuthEnv, email: string | null | undefined) {
	const adminEmails = splitCsv(env.ADMIN_EMAILS).map((item) => normalizeEmail(item));
	return adminEmails.includes(normalizeEmail(email));
}

function optionalEnv(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function parseOptionalNumber(value: string | undefined, name: string) {
	const trimmed = optionalEnv(value);
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		throw new TypeError(`${name} must be a finite number.`);
	}
	return parsed;
}

function socialProviders(env: AuthEnv) {
	return {
		github:
			env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
				? {
						clientId: env.GITHUB_CLIENT_ID,
						clientSecret: env.GITHUB_CLIENT_SECRET,
					}
				: undefined,
		discord:
			env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
				? {
						clientId: env.DISCORD_CLIENT_ID,
						clientSecret: env.DISCORD_CLIENT_SECRET,
					}
				: undefined,
		twitter:
			env.X_CLIENT_ID && env.X_CLIENT_SECRET
				? {
						clientId: env.X_CLIENT_ID,
						clientSecret: env.X_CLIENT_SECRET,
					}
				: undefined,
	};
}

const CAPTCHA_ENDPOINTS = ["/sign-up/email", "/sign-in/email", "/request-password-reset"];
const CAPTCHA_PROVIDERS = [
	"cloudflare-turnstile",
	"google-recaptcha",
	"hcaptcha",
	"captchafox",
] as const satisfies CaptchaOptions["provider"][];

function captchaProvider(value: string | undefined): CaptchaOptions["provider"] {
	const provider = optionalEnv(value) ?? "cloudflare-turnstile";
	if (CAPTCHA_PROVIDERS.includes(provider as CaptchaOptions["provider"])) {
		return provider as CaptchaOptions["provider"];
	}
	throw new TypeError(
		`CAPTCHA_PROVIDER must be one of: ${CAPTCHA_PROVIDERS.join(", ")}.`,
	);
}

function captchaPlugins(env: AuthEnv) {
	const secretKey = optionalEnv(env.CAPTCHA_SECRET_KEY);
	if (!secretKey) return [];

	const provider = captchaProvider(env.CAPTCHA_PROVIDER);
	const siteVerifyURLOverride = optionalEnv(env.CAPTCHA_SITE_VERIFY_URL);
	const baseOptions = {
		secretKey,
		endpoints: CAPTCHA_ENDPOINTS,
		...(siteVerifyURLOverride ? { siteVerifyURLOverride } : {}),
	};

	if (provider === "google-recaptcha") {
		const minScore = parseOptionalNumber(env.CAPTCHA_MIN_SCORE, "CAPTCHA_MIN_SCORE");
		return [
			captcha({
				...baseOptions,
				provider,
				...(minScore === undefined ? {} : { minScore }),
			}),
		];
	}

	if (provider === "hcaptcha" || provider === "captchafox") {
		const siteKey = optionalEnv(env.CAPTCHA_SITE_KEY);
		return [
			captcha({
				...baseOptions,
				provider,
				...(siteKey ? { siteKey } : {}),
			}),
		];
	}

	return [
		captcha({
			...baseOptions,
			provider,
		}),
	];
}

const SERVICE_METADATA_CAPABILITY = "get_service_metadata";
const agentCapabilities = [
	{
		name: SERVICE_METADATA_CAPABILITY,
		description: "Read public metadata about this Passport identity provider.",
		input: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		output: {
			type: "object",
			properties: {
				name: { type: "string" },
				issuer: { type: "string" },
				capabilities: {
					type: "array",
					items: { type: "string" },
				},
			},
			required: ["name", "issuer", "capabilities"],
		},
		approvalStrength: "none",
	},
] satisfies Capability[];

function agentProviderName(env: AuthEnv) {
	return optionalEnv(env.AGENT_AUTH_PROVIDER_NAME) ?? optionalEnv(env.BRAND_NAME) ?? "Passport";
}

function agentProviderDescription(env: AuthEnv) {
	return (
		optionalEnv(env.AGENT_AUTH_PROVIDER_DESCRIPTION) ??
		optionalEnv(env.BRAND_DESCRIPTOR) ??
		"Passport identity, OAuth, and account security APIs for AI agents."
	);
}

function createAuthInstance(env: AuthEnv) {
	const db = createDb(env);

	return betterAuth({
		appName: "Passport",
		baseURL: env.BETTER_AUTH_URL,
		basePath: "/api/auth",
		secret: env.BETTER_AUTH_SECRET,
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
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["github", "discord", "twitter"],
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => ({
						data: {
							...user,
							role: isAdminEmail(env, user.email) ? "admin" : "user",
						},
					}),
				},
			},
		},
		socialProviders: socialProviders(env),
		plugins: [
			...captchaPlugins(env),
			lastLoginMethod({
				storeInDatabase: true,
			}),
			oAuthProxy({
				productionURL: optionalEnv(env.OAUTH_PROXY_PRODUCTION_URL) ?? env.BETTER_AUTH_URL,
				secret: optionalEnv(env.OAUTH_PROXY_SECRET),
			}),
			admin({
				defaultRole: "user",
				...(splitCsv(env.ADMIN_USER_IDS).length
					? { adminUserIds: splitCsv(env.ADMIN_USER_IDS) }
					: {}),
			}),
			organization({
				allowUserToCreateOrganization: true,
				organizationLimit: 10,
				membershipLimit: 100,
				invitationExpiresIn: 60 * 60 * 24 * 7,
				invitationLimit: 100,
				cancelPendingInvitationsOnReInvite: true,
				requireEmailVerificationOnInvitation: true,
				dynamicAccessControl: {
					enabled: true,
					maximumRolesPerOrganization: 25,
				},
				teams: {
					enabled: true,
					maximumTeams: 25,
					maximumMembersPerTeam: 100,
					allowRemovingAllTeams: false,
				},
				sendInvitationEmail: async (data) => {
					const url = new URL("/organization/invitation", env.BETTER_AUTH_URL);
					url.searchParams.set("id", data.id);
					await sendOrganizationInvitationEmail(
						env,
						data.email,
						data.organization.name,
						data.inviter.user.name,
						url.toString(),
					);
				},
			}),
			twoFactor({
				issuer: "Passport",
				allowPasswordless: true,
				totpOptions: {
					digits: 6,
					period: 30,
				},
				otpOptions: {
					sendOTP: async ({ user, otp }) => {
						await sendTwoFactorOTPEmail(env, user.email, otp);
					},
					period: 5,
					allowedAttempts: 5,
					storeOTP: "encrypted",
				},
				backupCodeOptions: {
					amount: 10,
					length: 10,
					storeBackupCodes: "encrypted",
					allowPasswordless: true,
				},
				twoFactorCookieMaxAge: 10 * 60,
				trustDeviceMaxAge: 30 * 24 * 60 * 60,
			}),
			agentAuth({
				providerName: agentProviderName(env),
				providerDescription: agentProviderDescription(env),
				modes: ["delegated", "autonomous"],
				deviceAuthorizationPage: "/agent/approve",
				capabilities: agentCapabilities,
				defaultHostCapabilities: [SERVICE_METADATA_CAPABILITY],
				validateCapabilities: (capabilities) =>
					capabilities.every((capability) =>
						agentCapabilities.some((known) => known.name === capability),
					),
				onExecute: async ({ capability, agentSession }) => {
					if (capability !== SERVICE_METADATA_CAPABILITY) {
						throw new Error(`Unsupported capability: ${capability}`);
					}
					return {
						name: agentProviderName(env),
						issuer: env.BETTER_AUTH_URL,
						capabilities: splitCsv(env.BRAND_CAPABILITIES).length
							? splitCsv(env.BRAND_CAPABILITIES)
							: ["OIDC", "PKCE", "JWKS"],
						agentId: agentSession.agentId,
					};
				},
			}),
			jwt({
				jwks: {
					keyPairConfig: {
						alg: "RS256",
					},
				},
				disableSettingJwtHeader: true,
			}),
			passkey({
				rpName: "Passport",
				origin: env.BETTER_AUTH_URL,
			}),
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					await sendMagicLinkEmail(env, email, url);
				},
			}),
			username(),
			phoneNumber({
				sendOTP: () => {},
			}),
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/consent",
				disabledPaths: ["/token"],
				allowDynamicClientRegistration: true,
				clientRegistrationDefaultScopes: ["openid", "profile", "email"],
				clientRegistrationAllowedScopes: ["offline_access"],
				clientPrivileges: async ({ user }) => isAdminEmail(env, user?.email),
				silenceWarnings: {
					oauthAuthServerConfig: true,
				},
				scopes: ["openid", "profile", "email", "offline_access"],
				trustedClients: parseOAuthClientSeeds(env.OAUTH_CLIENTS).map((client) => ({
					clientId: client.id,
					clientSecret: client.secret,
					name: client.name,
					redirectURLs: client.redirectUris,
					postLogoutRedirectURLs: client.postLogoutRedirectUris,
					public: client.public,
					skipConsent: client.skipConsent,
				})),
			}),
		],
	});
}

const cliProcessEnv =
	(globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
		?.env ?? {};

const cliAuthEnv = {
	ASSETS: {
		fetch: () => new Response(null, { status: 404 }),
	},
	HYPERDRIVE: {
		connectionString: cliProcessEnv.DATABASE_URL ?? "",
	},
	EMAIL: {
		send: async () => {},
	},
	BETTER_AUTH_SECRET:
		cliProcessEnv.BETTER_AUTH_SECRET ?? "better-auth-cli-secret-for-schema-generation",
	BETTER_AUTH_URL: cliProcessEnv.BETTER_AUTH_URL ?? "http://localhost:5173",
	TRUSTED_ORIGINS: cliProcessEnv.TRUSTED_ORIGINS,
	GITHUB_CLIENT_ID: cliProcessEnv.GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET: cliProcessEnv.GITHUB_CLIENT_SECRET,
	DISCORD_CLIENT_ID: cliProcessEnv.DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET: cliProcessEnv.DISCORD_CLIENT_SECRET,
	X_CLIENT_ID: cliProcessEnv.X_CLIENT_ID,
	X_CLIENT_SECRET: cliProcessEnv.X_CLIENT_SECRET,
	EMAIL_FROM: cliProcessEnv.EMAIL_FROM ?? "Passport <noreply@example.com>",
	OAUTH_CLIENTS: cliProcessEnv.OAUTH_CLIENTS,
	ADMIN_EMAILS: cliProcessEnv.ADMIN_EMAILS,
	ADMIN_USER_IDS: cliProcessEnv.ADMIN_USER_IDS,
	CAPTCHA_PROVIDER: cliProcessEnv.CAPTCHA_PROVIDER,
	CAPTCHA_SECRET_KEY: cliProcessEnv.CAPTCHA_SECRET_KEY,
	CAPTCHA_SITE_KEY: cliProcessEnv.CAPTCHA_SITE_KEY,
	CAPTCHA_SITE_VERIFY_URL: cliProcessEnv.CAPTCHA_SITE_VERIFY_URL,
	CAPTCHA_MIN_SCORE: cliProcessEnv.CAPTCHA_MIN_SCORE,
	OAUTH_PROXY_PRODUCTION_URL: cliProcessEnv.OAUTH_PROXY_PRODUCTION_URL,
	OAUTH_PROXY_SECRET: cliProcessEnv.OAUTH_PROXY_SECRET,
	AGENT_AUTH_PROVIDER_NAME: cliProcessEnv.AGENT_AUTH_PROVIDER_NAME,
	AGENT_AUTH_PROVIDER_DESCRIPTION: cliProcessEnv.AGENT_AUTH_PROVIDER_DESCRIPTION,
	BRAND_NAME: cliProcessEnv.BRAND_NAME,
	BRAND_ABBREVIATION: cliProcessEnv.BRAND_ABBREVIATION,
	BRAND_DESCRIPTOR: cliProcessEnv.BRAND_DESCRIPTOR,
	BRAND_LOGO_SRC: cliProcessEnv.BRAND_LOGO_SRC,
	BRAND_CAPABILITIES: cliProcessEnv.BRAND_CAPABILITIES,
	BRAND_COLOR: cliProcessEnv.BRAND_COLOR,
	BRAND_FOREGROUND_COLOR: cliProcessEnv.BRAND_FOREGROUND_COLOR,
	PRIMARY_COLOR: cliProcessEnv.PRIMARY_COLOR,
	PRIMARY_FOREGROUND_COLOR: cliProcessEnv.PRIMARY_FOREGROUND_COLOR,
	RING_COLOR: cliProcessEnv.RING_COLOR,
} as unknown as AuthEnv;

const cliAuthInstance = createAuthInstance(cliAuthEnv);

export const auth = Object.assign(
	(env: AuthEnv) => createAuthInstance(env),
	cliAuthInstance,
);

export default cliAuthInstance;
