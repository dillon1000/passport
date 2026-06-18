/**
 * OAuth client field helpers for Worker admin responses. Better Auth owns the
 * core OAuth client lifecycle, while Passport stores additional fields in the
 * same database table. These helpers merge Passport-owned database columns into
 * public DTOs before the dashboard turns them back into editable drafts.
 */
import type { OAuthClientSummary } from "./app";

export type OAuthClientPassportFields = {
	clientId: string;
	backchannelLogoutUri: string | null;
};

export function mergeOAuthClientPassportFields(
	clients: OAuthClientSummary[],
	fields: OAuthClientPassportFields[],
): OAuthClientSummary[] {
	const fieldsByClientId = new Map(
		fields.map((field) => [field.clientId, field.backchannelLogoutUri]),
	);

	return clients.map((client) => {
		if (!fieldsByClientId.has(client.clientId)) {
			return {
				...client,
				backchannelLogoutUri: client.backchannelLogoutUri ?? null,
			};
		}

		return {
			...client,
			backchannelLogoutUri: fieldsByClientId.get(client.clientId) ?? null,
		};
	});
}
