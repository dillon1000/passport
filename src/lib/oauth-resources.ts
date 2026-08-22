/**
 * OAuth protected-resource registry. Inputs are the `OAUTH_RESOURCES` JSON env
 * value and OAuth client metadata; outputs are validated audiences, allowed
 * scope sets, and client metadata helpers used by token policy and admin DTOs.
 * Configure resources by adding `{ identifier, name, scopes }` entries; keep
 * scope strings in `oauth-scopes.ts` so discovery, consent, and API policy stay
 * aligned.
 */
import {
	assertSupportedOAuthScopes,
	isSupportedOAuthScope,
} from "./oauth-scopes";
import { z } from "zod";

export const PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY = "passportAllowedAudiences";

export type OAuthResourceSeed = {
	identifier: string;
	name: string;
	scopes: SupportedOAuthScope[];
};

const oauthResourceSeedSchema = z.object({
	identifier: z.string().trim().min(1),
	name: z.string().trim().min(1),
	scopes: z.array(z.string().trim().min(1)),
});
const allowedAudiencesMetadataSchema = z.record(z.string(), z.array(z.string()));
type OAuthMetadata = z.input<typeof allowedAudiencesMetadataSchema>;

export function parseOAuthResourceSeeds(value: string | undefined): OAuthResourceSeed[] {
	if (!value) return [];

	const parsed = z.array(oauthResourceSeedSchema).safeParse(JSON.parse(value));
	if (!parsed.success) {
		throw new TypeError("OAUTH_RESOURCES must be a JSON array.");
	}

	return parsed.data.map((resource) => {
		const scopes = resource.scopes;
		assertSupportedOAuthScopes(scopes, "OAUTH_RESOURCES");
		return {
			identifier: resource.identifier,
			name: resource.name,
			scopes: scopes.filter(isSupportedOAuthScope),
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
	metadata: OAuthMetadata,
): string[] | undefined {
	const parsed = allowedAudiencesMetadataSchema.safeParse(metadata);
	if (!parsed.success) return undefined;
	const audiences = (parsed.data[PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY] ?? [])
		.map((item) => item.trim())
		.filter(Boolean);
	return audiences.length ? audiences : undefined;
}

function resourceValues(value: string | readonly string[] | undefined) {
	const scalar = z.string().safeParse(value);
	if (scalar.success) return scalar.data.trim() ? [scalar.data.trim()] : [];
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
