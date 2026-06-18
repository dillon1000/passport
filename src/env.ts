import type { DataExportWorkflowPayload } from "./lib/data-export";

export type OAuthClientSeed = {
	id: string;
	secret?: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	scopes?: string[];
	public?: boolean;
	skipConsent?: boolean;
};

export type AuthEnv = Env & {
	ASSETS: Fetcher;
	HYPERDRIVE: Hyperdrive;
	EMAIL: SendEmail;
	AUTH_SECONDARY_STORAGE: KVNamespace;
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
	ADMIN_EMAILS?: string;
	ADMIN_USER_IDS?: string;
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
