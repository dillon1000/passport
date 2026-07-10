import type { DataExportWorkflowPayload } from "./lib/data-export";
import type { OAuthGrantType } from "./lib/oauth-grants";

export type OAuthClientSeed = {
	id: string;
	secret?: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	uri?: string;
	scopes?: string[];
	grantTypes?: OAuthGrantType[];
	allowedAudiences?: string[];
	public?: boolean;
	skipConsent?: boolean;
};

export type AuthEnv = Env & {
	ASSETS: Fetcher;
	HYPERDRIVE: Hyperdrive;
	EMAIL: SendEmail;
	AUTH_SECONDARY_STORAGE: KVNamespace;
	PROFILE_IMAGES: R2Bucket;
	DATA_EXPORTS: R2Bucket;
	DATA_EXPORT_WORKFLOW: Workflow<DataExportWorkflowPayload>;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	TRUSTED_ORIGINS?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	DISCORD_CLIENT_ID?: string;
	DISCORD_CLIENT_SECRET?: string;
	X_CLIENT_ID?: string;
	X_CLIENT_SECRET?: string;
	EMAIL_FROM: string;
	OAUTH_CLIENTS?: string;
	OAUTH_RESOURCES?: string;
	ADMIN_EMAILS?: string;
	ADMIN_USER_IDS?: string;
	AUTH_RATE_LIMIT_ENABLED?: string;
	AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
	AUTH_RATE_LIMIT_MAX?: string;
	AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS?: string;
	AUTH_SENSITIVE_RATE_LIMIT_MAX?: string;
	ACCOUNT_LOCKOUT_ENABLED?: string;
	ACCOUNT_LOCKOUT_THRESHOLD?: string;
	ACCOUNT_LOCKOUT_WINDOW_SECONDS?: string;
	ACCOUNT_LOCKOUT_COOLDOWN_SECONDS?: string;
	CAPTCHA_PROVIDER?: string;
	CAPTCHA_SECRET_KEY?: string;
	CAPTCHA_SITE_KEY?: string;
	CAPTCHA_SITE_VERIFY_URL?: string;
	CAPTCHA_MIN_SCORE?: string;
	AZURE_COMMUNICATION_CONNECTION_STRING?: string;
	COMMUNICATION_SERVICES_CONNECTION_STRING?: string;
	AZURE_COMMUNICATION_SMS_FROM?: string;
	OAUTH_PROXY_PRODUCTION_URL?: string;
	OAUTH_PROXY_SECRET?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	STRIPE_API_VERSION?: string;
	STRIPE_CREATE_CUSTOMER_ON_SIGN_UP?: string;
	STRIPE_BILLING_REQUIRE_EMAIL_VERIFICATION?: string;
	STRIPE_BILLING_PLANS?: string;
	STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES?: string;
	STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED?: string;
	STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED?: string;
	STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION?: string;
	STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE?: string;
	AGENT_AUTH_PROVIDER_NAME?: string;
	AGENT_AUTH_PROVIDER_DESCRIPTION?: string;
	BRAND_NAME?: string;
	BRAND_DESCRIPTOR?: string;
	BRAND_LOGO_SRC?: string;
	BRAND_CAPABILITIES?: string;
	BRAND_COLOR?: string;
	BRAND_FOREGROUND_COLOR?: string;
	PRIMARY_COLOR?: string;
	PRIMARY_FOREGROUND_COLOR?: string;
	RING_COLOR?: string;
};

export function splitCsv(value: string | undefined) {
	return value
		?.split(",")
		.map((item) => item.trim())
		.filter(Boolean) ?? [];
}

export function parseOAuthClientSeeds(value: string | undefined): OAuthClientSeed[] {
	if (!value) {
		return [];
	}

	const parsed = JSON.parse(value) as OAuthClientSeed[];
	if (!Array.isArray(parsed)) {
		throw new TypeError("OAUTH_CLIENTS must be a JSON array.");
	}

	return parsed;
}
