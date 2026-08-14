/**
 * Runtime environment helpers for server auth construction. Inputs are
 * Cloudflare env bindings or process env values used by the Better Auth CLI;
 * outputs are normalized optional strings, parsed numbers, and a CLI-safe env
 * object with inert service bindings.
 */
import type { AuthEnv } from "../../env";

type ProcessEnvSource = Record<string, string | undefined>;
type ProcessGlobal = {
	process?: {
		env?: ProcessEnvSource;
	};
};

function processEnvFromGlobal() {
	return (globalThis as unknown as ProcessGlobal).process?.env ?? {};
}

export function optionalEnv(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

export function parseOptionalNumber(value: string | undefined, name: string) {
	const trimmed = optionalEnv(value);
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		throw new TypeError(`${name} must be a finite number.`);
	}
	return parsed;
}

export function parseOptionalInteger(
	value: string | undefined,
	name: string,
	options: { min?: number } = {},
) {
	const parsed = parseOptionalNumber(value, name);
	if (parsed === undefined) return undefined;
	if (!Number.isInteger(parsed)) {
		throw new TypeError(`${name} must be an integer.`);
	}
	if (options.min !== undefined && parsed < options.min) {
		throw new TypeError(
			`${name} must be an integer greater than or equal to ${options.min}.`,
		);
	}
	return parsed;
}

export function parseOptionalBoolean(value: string | undefined, name: string) {
	const trimmed = optionalEnv(value)?.toLowerCase();
	if (!trimmed) return undefined;
	if (["true", "1", "yes", "on"].includes(trimmed)) return true;
	if (["false", "0", "no", "off"].includes(trimmed)) return false;
	throw new TypeError(`${name} must be true or false.`);
}

export function createCliAuthEnv(processEnv: ProcessEnvSource = processEnvFromGlobal()) {
	return {
		ASSETS: {
			fetch: () => new Response(null, { status: 404 }),
		},
		HYPERDRIVE: {
			connectionString: processEnv.DATABASE_URL ?? "",
		},
		EMAIL: {
			send: async () => {},
		},
		AUTH_SECONDARY_STORAGE: {
			get: async () => null,
			put: async () => {},
			delete: async () => {},
		},
		BETTER_AUTH_SECRET:
			processEnv.BETTER_AUTH_SECRET ?? "better-auth-cli-secret-for-schema-generation",
		BETTER_AUTH_URL: processEnv.BETTER_AUTH_URL ?? "http://localhost:5173",
		TRUSTED_ORIGINS: processEnv.TRUSTED_ORIGINS,
		GITHUB_CLIENT_ID: processEnv.GITHUB_CLIENT_ID,
		GITHUB_CLIENT_SECRET: processEnv.GITHUB_CLIENT_SECRET,
		DISCORD_CLIENT_ID: processEnv.DISCORD_CLIENT_ID,
		DISCORD_CLIENT_SECRET: processEnv.DISCORD_CLIENT_SECRET,
		X_CLIENT_ID: processEnv.X_CLIENT_ID,
		X_CLIENT_SECRET: processEnv.X_CLIENT_SECRET,
		EMAIL_FROM: processEnv.EMAIL_FROM ?? "Passport <noreply@example.com>",
		OAUTH_CLIENTS: processEnv.OAUTH_CLIENTS,
		OAUTH_RESOURCES: processEnv.OAUTH_RESOURCES,
		ADMIN_EMAILS: processEnv.ADMIN_EMAILS,
		ADMIN_USER_IDS: processEnv.ADMIN_USER_IDS,
		AUTH_RATE_LIMIT_ENABLED: processEnv.AUTH_RATE_LIMIT_ENABLED,
		AUTH_RATE_LIMIT_WINDOW_SECONDS: processEnv.AUTH_RATE_LIMIT_WINDOW_SECONDS,
		AUTH_RATE_LIMIT_MAX: processEnv.AUTH_RATE_LIMIT_MAX,
		AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS:
			processEnv.AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS,
		AUTH_SENSITIVE_RATE_LIMIT_MAX: processEnv.AUTH_SENSITIVE_RATE_LIMIT_MAX,
		ACCOUNT_LOCKOUT_ENABLED: processEnv.ACCOUNT_LOCKOUT_ENABLED,
		ACCOUNT_LOCKOUT_THRESHOLD: processEnv.ACCOUNT_LOCKOUT_THRESHOLD,
		ACCOUNT_LOCKOUT_WINDOW_SECONDS: processEnv.ACCOUNT_LOCKOUT_WINDOW_SECONDS,
		ACCOUNT_LOCKOUT_COOLDOWN_SECONDS: processEnv.ACCOUNT_LOCKOUT_COOLDOWN_SECONDS,
		CAPTCHA_PROVIDER: processEnv.CAPTCHA_PROVIDER,
		CAPTCHA_SECRET_KEY: processEnv.CAPTCHA_SECRET_KEY,
		CAPTCHA_SITE_KEY: processEnv.CAPTCHA_SITE_KEY,
		CAPTCHA_API_ENDPOINT: processEnv.CAPTCHA_API_ENDPOINT,
		CAPTCHA_SITE_VERIFY_URL: processEnv.CAPTCHA_SITE_VERIFY_URL,
		CAPTCHA_MIN_SCORE: processEnv.CAPTCHA_MIN_SCORE,
		OAUTH_PROXY_PRODUCTION_URL: processEnv.OAUTH_PROXY_PRODUCTION_URL,
		OAUTH_PROXY_SECRET: processEnv.OAUTH_PROXY_SECRET,
		STRIPE_SECRET_KEY: processEnv.STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET: processEnv.STRIPE_WEBHOOK_SECRET,
		STRIPE_API_VERSION: processEnv.STRIPE_API_VERSION,
		STRIPE_CREATE_CUSTOMER_ON_SIGN_UP:
			processEnv.STRIPE_CREATE_CUSTOMER_ON_SIGN_UP,
		STRIPE_BILLING_REQUIRE_EMAIL_VERIFICATION:
			processEnv.STRIPE_BILLING_REQUIRE_EMAIL_VERIFICATION,
		STRIPE_BILLING_PLANS: processEnv.STRIPE_BILLING_PLANS,
		STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES:
			processEnv.STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES,
		STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED:
			processEnv.STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED,
		STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED:
			processEnv.STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED,
		STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION:
			processEnv.STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION,
		STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE:
			processEnv.STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE,
		AGENT_AUTH_PROVIDER_NAME: processEnv.AGENT_AUTH_PROVIDER_NAME,
		AGENT_AUTH_PROVIDER_DESCRIPTION: processEnv.AGENT_AUTH_PROVIDER_DESCRIPTION,
		BRAND_NAME: processEnv.BRAND_NAME,
		BRAND_DESCRIPTOR: processEnv.BRAND_DESCRIPTOR,
		BRAND_LOGO_SRC: processEnv.BRAND_LOGO_SRC,
		BRAND_CAPABILITIES: processEnv.BRAND_CAPABILITIES,
		BRAND_COLOR: processEnv.BRAND_COLOR,
		BRAND_FOREGROUND_COLOR: processEnv.BRAND_FOREGROUND_COLOR,
		PRIMARY_COLOR: processEnv.PRIMARY_COLOR,
		PRIMARY_FOREGROUND_COLOR: processEnv.PRIMARY_FOREGROUND_COLOR,
		RING_COLOR: processEnv.RING_COLOR,
	} as unknown as AuthEnv;
}
