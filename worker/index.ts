import { eq } from "drizzle-orm";

import { createWorkerApp, type OAuthClientSummary, type OAuthClientWithSecret } from "./app";
import { auth } from "../src/auth";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import type { AuthEnv } from "../src/env";

type OAuthClientAPIShape = {
	client_id: string;
	client_secret?: string;
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	redirect_uris?: string[];
	post_logout_redirect_uris?: string[];
	scope?: string;
	public?: boolean;
	disabled?: boolean;
	skip_consent?: boolean;
	enable_end_session?: boolean;
};

type OAuthConsentAPIShape = {
	id: string;
	clientId: string;
	scopes?: string[];
	createdAt?: Date | string | null;
	updatedAt?: Date | string | null;
};

function toISOString(value: Date | string | null | undefined) {
	if (!value) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function scopesFrom(value: string | string[] | null | undefined) {
	if (Array.isArray(value)) return value;
	return value?.split(" ").map((scope) => scope.trim()).filter(Boolean) ?? [];
}

function mapOAuthClient(client: OAuthClientAPIShape): OAuthClientWithSecret {
	return {
		clientId: client.client_id,
		name: client.client_name ?? client.client_id,
		redirectUris: client.redirect_uris ?? [],
		postLogoutRedirectUris: client.post_logout_redirect_uris,
		scopes: scopesFrom(client.scope),
		uri: client.client_uri,
		icon: client.logo_uri,
		public: client.public,
		disabled: client.disabled,
		skipConsent: client.skip_consent,
		enableEndSession: client.enable_end_session,
		clientSecret: client.client_secret,
	};
}

function mapDatabaseClient(client: typeof schema.oauthClient.$inferSelect): OAuthClientSummary {
	return {
		clientId: client.clientId,
		name: client.name ?? client.clientId,
		redirectUris: client.redirectUris,
		postLogoutRedirectUris: client.postLogoutRedirectUris ?? undefined,
		scopes: client.scopes ?? undefined,
		uri: client.uri,
		icon: client.icon,
		public: client.public ?? undefined,
		disabled: client.disabled ?? undefined,
		skipConsent: client.skipConsent ?? undefined,
		enableEndSession: client.enableEndSession ?? undefined,
	};
}

function redactClientSecret(client: OAuthClientWithSecret): OAuthClientSummary {
	return {
		clientId: client.clientId,
		name: client.name,
		redirectUris: client.redirectUris,
		postLogoutRedirectUris: client.postLogoutRedirectUris,
		scopes: client.scopes,
		uri: client.uri,
		icon: client.icon,
		public: client.public,
		disabled: client.disabled,
		skipConsent: client.skipConsent,
		enableEndSession: client.enableEndSession,
	};
}

const app = createWorkerApp({
	authHandler: (request, env) => auth(env as AuthEnv).handler(request),
	agentConfiguration: ({ env }) => auth(env as AuthEnv).api.getAgentConfiguration(),
	getSession: (request, env) =>
		auth(env as AuthEnv).api.getSession({
			headers: request.headers,
		}),
	applications: {
		list: async ({ request, env }) => {
			const authInstance = auth(env as AuthEnv);
			const consents = (await authInstance.api.getOAuthConsents({
				headers: request.headers,
			})) as OAuthConsentAPIShape[];
			const applications = await Promise.all(
				consents.map(async (consent) => {
					const client = (await authInstance.api.getOAuthClientPublic({
						headers: request.headers,
						query: {
							client_id: consent.clientId,
						},
					})) as OAuthClientAPIShape;
					return {
						consentId: consent.id,
						clientId: consent.clientId,
						name: client.client_name ?? consent.clientId,
						icon: client.logo_uri,
						uri: client.client_uri,
						scopes: consent.scopes ?? [],
						authorizedAt: toISOString(consent.createdAt),
						updatedAt: toISOString(consent.updatedAt),
					};
				}),
			);
			return applications.sort((a, b) =>
				String(b.updatedAt ?? b.authorizedAt ?? "").localeCompare(
					String(a.updatedAt ?? a.authorizedAt ?? ""),
				),
			);
		},
		revoke: async ({ request, env, consentId }) => {
			await auth(env as AuthEnv).api.deleteOAuthConsent({
				headers: request.headers,
				body: {
					id: consentId,
				},
			});
		},
	},
	adminOAuth: {
		list: async ({ request, env }) => {
			const clients =
				((await auth(env as AuthEnv).api.getOAuthClients({
					headers: request.headers,
				})) as OAuthClientAPIShape[] | null) ?? [];
			return clients.map((client) => redactClientSecret(mapOAuthClient(client)));
		},
		create: async ({ request, env }, input) => {
			const client = (await auth(env as AuthEnv).api.adminCreateOAuthClient({
				headers: request.headers,
				body: {
					redirect_uris: input.redirectUris,
					client_name: input.name,
					client_uri: input.uri,
					logo_uri: input.icon,
					post_logout_redirect_uris: input.postLogoutRedirectUris,
					scope: input.scopes?.join(" "),
					token_endpoint_auth_method: input.public ? "none" : "client_secret_basic",
					skip_consent: input.skipConsent,
					enable_end_session: input.enableEndSession,
				},
			})) as OAuthClientAPIShape;
			return mapOAuthClient(client);
		},
		update: async ({ request, env }, clientId, input) => {
			const client = (await auth(env as AuthEnv).api.adminUpdateOAuthClient({
				headers: request.headers,
				body: {
					client_id: clientId,
					update: {
						redirect_uris: input.redirectUris,
						client_name: input.name,
						client_uri: input.uri,
						logo_uri: input.icon,
						post_logout_redirect_uris: input.postLogoutRedirectUris,
						scope: input.scopes?.join(" "),
						skip_consent: input.skipConsent,
						enable_end_session: input.enableEndSession,
					},
				},
			})) as OAuthClientAPIShape;
			return redactClientSecret(mapOAuthClient(client));
		},
		rotateSecret: async ({ request, env }, clientId) => {
			const client = (await auth(env as AuthEnv).api.rotateClientSecret({
				headers: request.headers,
				body: {
					client_id: clientId,
				},
			})) as OAuthClientAPIShape;
			return mapOAuthClient(client);
		},
		setDisabled: async ({ env }, clientId, disabled) => {
			const db = createDb(env as AuthEnv);
			const [client] = await db
				.update(schema.oauthClient)
				.set({
					disabled,
					updatedAt: new Date(),
				})
				.where(eq(schema.oauthClient.clientId, clientId))
				.returning();
			if (!client) {
				throw new Error("OAuth client not found.");
			}
			return mapDatabaseClient(client);
		},
	},
});

export default app satisfies ExportedHandler<Env>;
