/**
 * OAuth client field helpers for Worker admin responses. Better Auth owns the
 * core OAuth client lifecycle, while Passport stores additional fields in the
 * same database table. These helpers merge Passport-owned database columns into
 * public DTOs before the dashboard turns them back into editable drafts.
 */
import type { OAuthClientSummary } from "./app";
import type { OAuthGrantType } from "../src/lib/oauth-grants";

export type OAuthClientPassportFields = {
	clientId: string;
	backchannelLogoutUri: string | null;
	grantTypes?: OAuthGrantType[] | null;
	allowedAudiences?: string[] | null;
	platformAdminOnly?: boolean;
};

export function mergeOAuthClientPassportFields(
	clients: OAuthClientSummary[],
	fields: OAuthClientPassportFields[],
): OAuthClientSummary[] {
	const fieldsByClientId = new Map(fields.map((field) => [field.clientId, field]));

	return clients.map((client) => {
		if (!fieldsByClientId.has(client.clientId)) {
			return {
				...client,
				backchannelLogoutUri: client.backchannelLogoutUri ?? null,
			};
		}

		const field = fieldsByClientId.get(client.clientId);
		return {
			...client,
			backchannelLogoutUri: field?.backchannelLogoutUri ?? null,
			grantTypes: field?.grantTypes ?? client.grantTypes,
			allowedAudiences: field?.allowedAudiences ?? client.allowedAudiences,
			platformAdminOnly: field?.platformAdminOnly ?? client.platformAdminOnly,
		};
	});
}
