/**
 * Consent-safe OAuth client metadata normalization. Inputs are registered
 * database clients or trusted seed clients; outputs are display-only client
 * fields for consent surfaces. Credentials are intentionally not represented in
 * this contract.
 */
import type { OAuthClientSeed } from "../env";

export type ConsentClientMetadataSource = "database" | "seed";

export type ConsentClientMetadata = {
	clientId: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	scopes?: string[];
	optionalScopes?: string[];
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	public?: boolean;
	disabled?: boolean;
	verified: boolean;
	/** Registration time is display-only and lets consent show an application's age. */
	createdAt?: Date | null;
	source: ConsentClientMetadataSource;
};

export type RegisteredClientForConsent = {
	clientId: string;
	name?: string | null;
	redirectUris?: string[] | null;
	postLogoutRedirectUris?: string[] | null;
	scopes?: string[] | null;
	optionalScopes?: string[] | null;
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	public?: boolean | null;
	disabled?: boolean | null;
	verified?: boolean | null;
	createdAt?: Date | null;
};

function optionalArray(value: string[] | null | undefined) {
	return value && value.length ? value : undefined;
}

function optionalBoolean(value: boolean | null | undefined) {
	return value === undefined || value === null ? undefined : value;
}

export function consentMetadataFromRegisteredClient(
	client: RegisteredClientForConsent,
): ConsentClientMetadata {
	const metadata: ConsentClientMetadata = {
		clientId: client.clientId,
		name: client.name?.trim() || client.clientId,
		redirectUris: client.redirectUris ?? [],
		uri: client.uri,
		icon: client.icon,
		tos: client.tos,
		policy: client.policy,
		public: optionalBoolean(client.public),
		disabled: optionalBoolean(client.disabled),
		verified: client.verified ?? false,
		createdAt: client.createdAt,
		source: "database",
	};
	if (optionalArray(client.postLogoutRedirectUris)) metadata.postLogoutRedirectUris = client.postLogoutRedirectUris ?? [];
	if (optionalArray(client.scopes)) metadata.scopes = client.scopes ?? [];
	if (optionalArray(client.optionalScopes)) metadata.optionalScopes = client.optionalScopes ?? [];
	return metadata;
}

export function consentMetadataFromSeedClient(
	client: OAuthClientSeed,
): ConsentClientMetadata {
	const metadata: ConsentClientMetadata = {
		clientId: client.id,
		name: client.name.trim() || client.id,
		redirectUris: client.redirectUris,
		public: optionalBoolean(client.public),
		disabled: false,
		verified: true,
		source: "seed",
	};
	if (optionalArray(client.postLogoutRedirectUris)) metadata.postLogoutRedirectUris = client.postLogoutRedirectUris ?? [];
	if (optionalArray(client.scopes)) metadata.scopes = client.scopes ?? [];
	if (optionalArray(client.optionalScopes)) metadata.optionalScopes = client.optionalScopes ?? [];
	return metadata;
}
