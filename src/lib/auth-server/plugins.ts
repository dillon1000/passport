/**
 * Better Auth plugin builders. Inputs are runtime env values, external email
 * and SMS delivery functions, and the auth database; output is the full plugin
 * list used by the server auth instance. Safe configuration points are the
 * environment variables read by each builder.
 */
import { agentAuth, type Capability } from "@better-auth/agent-auth";
import { passkey } from "@better-auth/passkey";
import { APIError, createEmailVerificationToken } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { captcha, lastLoginMethod } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { multiSession } from "better-auth/plugins/multi-session";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { eq } from "drizzle-orm";

import { user as userTable } from "../../db/schema";
import {
	sendMagicLinkEmail,
	sendOrganizationInvitationEmail,
	sendTwoFactorOTPEmail,
} from "../../email";
import type { AuthEnv } from "../../env";
import { splitCsv } from "../../env";
import { isE164PhoneNumber, sendPhoneVerificationSMS } from "../../sms";
import { CAPTCHA_ENDPOINTS } from "../captcha-endpoints";
import { organizationAccessControl, organizationRoles } from "../organization-access";
import { parsePasskeySignupContext } from "../passkey-signup";
import { accountSecurityEmailPlugin } from "./hooks";
import {
	oauthProviderPlugin,
	oauthResourceAuthorizationPlugin,
	platformAdminOnlyOAuthClientPlugin,
} from "./oauth";
import { optionalEnv, parseOptionalNumber } from "./env";
import { buildStripePlugins } from "./stripe";
import type { AuthDatabase } from "./types";

export const MULTI_SESSION_MAXIMUM_SESSIONS = 5;

const PASSKEY_SIGNUP_ERROR = "An account with this email already exists.";

async function emailIsRegistered(db: AuthDatabase, email: string) {
	const [existingUser] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	return Boolean(existingUser);
}

export function socialProviders(env: AuthEnv) {
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

const CAPTCHA_PROVIDERS = [
	"cap",
	"cloudflare-turnstile",
	"google-recaptcha",
	"hcaptcha",
	"captchafox",
] as const;

type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];

function captchaProvider(value: string | undefined): CaptchaProvider {
	const provider = optionalEnv(value) ?? "cloudflare-turnstile";
	if (CAPTCHA_PROVIDERS.includes(provider as CaptchaProvider)) {
		return provider as CaptchaProvider;
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
		endpoints: [...CAPTCHA_ENDPOINTS],
		...(siteVerifyURLOverride ? { siteVerifyURLOverride } : {}),
	};
	if (provider === "cap") {
		if (!siteVerifyURLOverride) {
			throw new TypeError("CAPTCHA_SITE_VERIFY_URL must be set when CAPTCHA_PROVIDER is cap.");
		}
		// Cap's verification endpoint accepts the same JSON request and success
		// response that Better Auth uses for Turnstile. This preserves the
		// existing endpoint protection without placing Cap's secret in the client.
		return [
			captcha({
				...baseOptions,
				provider: "cloudflare-turnstile",
			}),
		];
	}

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

	if (provider === "hcaptcha") {
		const siteKey = optionalEnv(env.CAPTCHA_SITE_KEY);
		return [
			captcha({
				...baseOptions,
				provider,
				...(siteKey ? { siteKey } : {}),
			}),
		];
	}

	if (provider === "captchafox") {
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

export function buildAuthPlugins(env: AuthEnv, db: AuthDatabase) {
	return [
		...captchaPlugins(env),
		lastLoginMethod({
			storeInDatabase: true,
		}),
		multiSession({
			maximumSessions: MULTI_SESSION_MAXIMUM_SESSIONS,
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
			ac: organizationAccessControl,
			roles: organizationRoles,
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
			schema: {
				team: {
					additionalFields: {
						logo: {
							type: "string",
							required: false,
							input: true,
						},
					},
				},
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
		...buildStripePlugins(env, db),
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
			registration: {
				requireSession: false,
				resolveUser: async ({ context }) => {
					const signup = parsePasskeySignupContext(context);
					if (!signup) {
						throw new APIError("BAD_REQUEST", { message: "Passkey sign-up details are invalid." });
					}
					if (await emailIsRegistered(db, signup.email)) {
						throw new APIError("BAD_REQUEST", { message: PASSKEY_SIGNUP_ERROR });
					}
					return {
						id: crypto.randomUUID(),
						name: signup.email,
						displayName: signup.name,
					};
				},
				afterVerification: async ({ ctx, context, user }) => {
					// Existing authenticated users add passkeys without sign-up context.
					if (!context) return;
					const signup = parsePasskeySignupContext(context);
					if (!signup) {
						throw new APIError("BAD_REQUEST", { message: "Passkey sign-up details are invalid." });
					}
					if (await emailIsRegistered(db, signup.email)) {
						throw new APIError("BAD_REQUEST", { message: PASSKEY_SIGNUP_ERROR });
					}

					const createdUser = await ctx.context.internalAdapter.createUser({
						id: user.id,
						name: signup.name,
						email: signup.email,
						emailVerified: false,
						role: "user",
						banned: false,
						banReason: null,
						banExpires: null,
					});
					const session = await ctx.context.internalAdapter.createSession(createdUser.id);
					if (!session) {
						throw new APIError("BAD_REQUEST", { message: "Could not create an account session." });
					}
					await setSessionCookie(ctx, { session, user: createdUser });

					const sendVerification = ctx.context.options.emailVerification?.sendVerificationEmail;
					if (sendVerification) {
						const token = await createEmailVerificationToken(
							ctx.context.secret,
							createdUser.email,
							undefined,
							ctx.context.options.emailVerification?.expiresIn,
						);
						const verificationURL = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(signup.callbackURL)}`;
						await ctx.context.runInBackgroundOrAwait(
							sendVerification(
								{ user: createdUser, url: verificationURL, token },
								ctx.request?.clone(),
							),
						);
					}

					return { userId: createdUser.id, name: "Passkey" };
				},
			},
		}),
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				await sendMagicLinkEmail(env, email, url);
			},
		}),
		username(),
		phoneNumber({
			phoneNumberValidator: isE164PhoneNumber,
			sendOTP: async ({ phoneNumber, code }) => {
				await sendPhoneVerificationSMS(env, phoneNumber, code);
			},
		}),
		oauthResourceAuthorizationPlugin(env, db),
		platformAdminOnlyOAuthClientPlugin(env, db),
		oauthProviderPlugin(env, db),
		accountSecurityEmailPlugin(env, db),
	];
}
