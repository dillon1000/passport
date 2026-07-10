/**
 * OAuth protected-resource registry. Inputs are the `OAUTH_RESOURCES` JSON env
 * value and OAuth client metadata; outputs are validated audiences, allowed
 * scope sets, and client metadata helpers used by token policy and admin DTOs.
 * Configure resources by adding `{ identifier, name, scopes }` entries; keep
 * scope strings in `oauth-scopes.ts` so discovery, consent, and API policy stay
 * aligned.
 */
import { assertSupportedOAuthScopes, type SupportedOAuthScope } from "./oauth-scopes";

export const PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY = "passportAllowedAudiences";

export type OAuthResourceSeed = {
	identifier: string;
	name: string;
	scopes: SupportedOAuthScope[];
};

type RawOAuthResourceSeed = {
	identifier?: unknown;
	name?: unknown;
	scopes?: unknown;
};

function assertStringArray(value: unknown, source: string): string[] {
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
		throw new TypeError(`${source} must be an array of strings.`);
	}
	return value.map((item) => item.trim()).filter(Boolean);
}

export function parseOAuthResourceSeeds(value: string | undefined): OAuthResourceSeed[] {
	if (!value) return [];

	const parsed = JSON.parse(value) as unknown;
	if (!Array.isArray(parsed)) {
		throw new TypeError("OAUTH_RESOURCES must be a JSON array.");
	}

	return parsed.map((item, index) => {
		const resource = item as RawOAuthResourceSeed;
		const source = `OAUTH_RESOURCES[${index}]`;
		if (typeof resource.identifier !== "string" || !resource.identifier.trim()) {
			throw new TypeError(`${source}.identifier must be a non-empty string.`);
		}
		if (typeof resource.name !== "string" || !resource.name.trim()) {
			throw new TypeError(`${source}.name must be a non-empty string.`);
		}
		const scopes = assertStringArray(resource.scopes, `${source}.scopes`);
		assertSupportedOAuthScopes(scopes, "OAUTH_RESOURCES");
		return {
			identifier: resource.identifier.trim(),
			name: resource.name.trim(),
			scopes: scopes as SupportedOAuthScope[],
		};
	});
}

export function oauthResourceIdentifiers(resources: readonly OAuthResourceSeed[]) {
	return resources.map((resource) => resource.identifier);
}

export function metadataWithAllowedAudiences(allowedAudiences: string[] | undefined) {
	if (allowedAudiences === undefined) return undefined;
	return {
		[PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY]: allowedAudiences,
	};
}

export function allowedAudiencesFromMetadata(
	metadata: unknown,
): string[] | undefined {
	if (!metadata || typeof metadata !== "object") return undefined;
	const value = (metadata as Record<string, unknown>)[PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY];
	if (!Array.isArray(value)) return undefined;
	const audiences = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return audiences.length ? audiences : undefined;
}

function resourceValues(value: string | readonly string[] | undefined) {
	if (typeof value === "string") {
		return value.trim() ? [value.trim()] : [];
	}
	return value?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function resourceForIdentifier(
	resources: readonly OAuthResourceSeed[],
	identifier: string,
) {
	return resources.find((resource) => resource.identifier === identifier);
}

export function assertOAuthClientResourceAccess({
	resources,
	resource,
	allowedAudiences,
	clientScopes,
	requestedScopes,
}: {
	resources: readonly OAuthResourceSeed[];
	resource: string | readonly string[] | undefined;
	allowedAudiences: readonly string[] | undefined;
	clientScopes: readonly string[] | undefined;
	requestedScopes: readonly string[] | undefined;
}) {
	const requestedResources = resourceValues(resource);
	if (!requestedResources.length) {
		throw new TypeError("resource is required for client_credentials.");
	}

	const allowedAudienceSet = allowedAudiences?.length
		? new Set(allowedAudiences)
		: undefined;
	const scopesToCheck = requestedScopes?.length ? requestedScopes : clientScopes ?? [];

	for (const requestedResource of requestedResources) {
		if (allowedAudienceSet && !allowedAudienceSet.has(requestedResource)) {
			throw new TypeError("requested resource is not allowed for this client.");
		}

		const resourceConfig = resourceForIdentifier(resources, requestedResource);
		if (!resourceConfig) {
			throw new TypeError("requested resource is not configured.");
		}

		const resourceScopes = new Set<string>(resourceConfig.scopes);
		const invalidScopes = scopesToCheck.filter((scope) => !resourceScopes.has(scope));
		if (invalidScopes.length) {
			throw new TypeError(
				`scope is not allowed for the requested resource: ${invalidScopes.join(", ")}`,
			);
		}
	}
}
