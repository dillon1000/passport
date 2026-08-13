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
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	public?: boolean;
	disabled?: boolean;
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
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	public?: boolean | null;
	disabled?: boolean | null;
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
	return {
		clientId: client.clientId,
		name: client.name?.trim() || client.clientId,
		redirectUris: client.redirectUris ?? [],
		...(optionalArray(client.postLogoutRedirectUris) ? { postLogoutRedirectUris: client.postLogoutRedirectUris ?? [] } : {}),
		...(optionalArray(client.scopes) ? { scopes: client.scopes ?? [] } : {}),
		uri: client.uri,
		icon: client.icon,
		tos: client.tos,
		policy: client.policy,
		public: optionalBoolean(client.public),
		disabled: optionalBoolean(client.disabled),
		createdAt: client.createdAt,
		source: "database",
	};
}

export function consentMetadataFromSeedClient(
	client: OAuthClientSeed,
): ConsentClientMetadata {
	return {
		clientId: client.id,
		name: client.name.trim() || client.id,
		redirectUris: client.redirectUris,
		...(optionalArray(client.postLogoutRedirectUris) ? { postLogoutRedirectUris: client.postLogoutRedirectUris ?? [] } : {}),
		...(optionalArray(client.scopes) ? { scopes: client.scopes ?? [] } : {}),
		public: optionalBoolean(client.public),
		disabled: false,
		source: "seed",
	};
}
