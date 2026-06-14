import { describe, expect, it, vi } from "vitest";

import { createWorkerApp } from "./app";

function createEnv() {
	return {
		ASSETS: {
			fetch: vi.fn(() => new Response("asset")),
		},
		ADMIN_EMAILS: "admin@example.com",
		BRAND_NAME: "Acme ID",
		BRAND_ABBREVIATION: "AI",
		BRAND_DESCRIPTOR: "Acme identity",
		BRAND_CAPABILITIES: "OIDC,PKCE,JWKS,Passkeys",
		BRAND_COLOR: "#111827",
		PROFILE_IMAGES: {
			get: vi.fn(),
			put: vi.fn(),
		},
	} as unknown as Env & {
		PROFILE_IMAGES: {
			get: ReturnType<typeof vi.fn>;
			put: ReturnType<typeof vi.fn>;
		};
	};
}

const env = {
	ASSETS: {
		fetch: vi.fn(() => new Response("asset")),
	},
} as unknown as Env;

describe("createWorkerApp", () => {
	it.each([
		"/api/auth/sign-in/email",
		"/api/auth/.well-known/openid-configuration",
		"/api/auth/.well-known/oauth-authorization-server",
		"/oauth2/token",
	])("routes %s to the auth handler", async (pathname) => {
		const authHandler = vi.fn(
			(request: Request) =>
				Response.json({
					pathname: new URL(request.url).pathname,
				}),
		);
		const app = createWorkerApp({ authHandler });

		const response = await app.fetch(new Request(`https://passport.test${pathname}`), env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ pathname });
		expect(authHandler).toHaveBeenCalledOnce();
	});

	it("serves frontend routes from the static asset binding", async () => {
		const authHandler = vi.fn(() => new Response("auth"));
		const app = createWorkerApp({ authHandler });

		const response = await app.fetch(new Request("https://passport.test/sign-in"), env);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("asset");
		expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
		expect(authHandler).not.toHaveBeenCalled();
	});

	it("serves agent auth discovery from the root well-known path", async () => {
		const requestEnv = createEnv();
		const authHandler = vi.fn(() => new Response("auth"));
		const agentConfiguration = vi.fn(() => ({
			issuer: "https://passport.test",
			provider_name: "Passport",
		}));
		const app = createWorkerApp({ authHandler, agentConfiguration });

		const response = await app.fetch(
			new Request("https://passport.test/.well-known/agent-configuration"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			issuer: "https://passport.test",
			provider_name: "Passport",
		});
		expect(agentConfiguration).toHaveBeenCalledWith({
			request: expect.any(Request),
			env: requestEnv,
		});
		expect(authHandler).not.toHaveBeenCalled();
	});

	it("rejects profile image uploads without a signed-in session", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
		});
		const body = new FormData();
		body.set("image", new File(["not-an-image"], "avatar.txt", { type: "text/plain" }));

		const response = await app.fetch(
			new Request("https://passport.test/api/profile-images", { method: "POST", body }),
			requestEnv,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to upload a profile image." });
		expect(requestEnv.PROFILE_IMAGES.put).not.toHaveBeenCalled();
	});

	it("stores authenticated profile image uploads in R2", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123" } })),
		});
		const body = new FormData();
		body.set("image", new File(["image-bytes"], "avatar.png", { type: "image/png" }));

		const response = await app.fetch(
			new Request("https://passport.test/api/profile-images", { method: "POST", body }),
			requestEnv,
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { image: string };
		expect(payload.image).toMatch(
			/^\/api\/profile-images\/profile-images\/user_123\/[a-f0-9-]+\.png$/,
		);
		expect(requestEnv.PROFILE_IMAGES.put).toHaveBeenCalledOnce();
		const [key, value, options] = requestEnv.PROFILE_IMAGES.put.mock.calls[0] as [
			string,
			File,
			{ httpMetadata: { contentType: string } },
		];
		expect(key).toBe(payload.image.replace("/api/profile-images/", ""));
		expect(await value.text()).toBe("image-bytes");
		expect(options.httpMetadata.contentType).toBe("image/png");
	});

	it("serves profile images from R2", async () => {
		const requestEnv = createEnv();
		requestEnv.PROFILE_IMAGES.get.mockResolvedValue(
			new Response("stored-image", {
				headers: {
					"content-type": "image/webp",
				},
			}),
		);
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/profile-images/profile-images/user_123/avatar.webp"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("stored-image");
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
		expect(requestEnv.PROFILE_IMAGES.get).toHaveBeenCalledWith(
			"profile-images/user_123/avatar.webp",
		);
	});

	it("returns public brand config from environment values", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
		});

		const response = await app.fetch(new Request("https://passport.test/api/brand-config"), requestEnv);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("public, max-age=60");
		expect(await response.json()).toEqual({
			name: "Acme ID",
			abbreviation: "AI",
			descriptor: "Acme identity",
			capabilities: ["OIDC", "PKCE", "JWKS", "Passkeys"],
			theme: {
				brand: "#111827",
			},
		});
	});

	it("rejects authorized application listing without a session", async () => {
		const requestEnv = createEnv();
		const applications = {
			list: vi.fn(),
			revoke: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
			applications,
		});

		const response = await app.fetch(new Request("https://passport.test/api/applications"), requestEnv);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to manage applications." });
		expect(applications.list).not.toHaveBeenCalled();
	});

	it("lists authorized applications for the signed-in user", async () => {
		const requestEnv = createEnv();
		const applications = {
			list: vi.fn(() => [
				{
					consentId: "consent_123",
					clientId: "example-client",
					name: "Example Client",
					scopes: ["openid", "email"],
					authorizedAt: "2026-06-14T00:00:00.000Z",
				},
			]),
			revoke: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			applications,
		});

		const response = await app.fetch(new Request("https://passport.test/api/applications"), requestEnv);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			applications: [
				{
					consentId: "consent_123",
					clientId: "example-client",
					name: "Example Client",
					scopes: ["openid", "email"],
					authorizedAt: "2026-06-14T00:00:00.000Z",
				},
			],
		});
		expect(applications.list).toHaveBeenCalledWith({
			request: expect.any(Request),
			env: requestEnv,
			session: { user: { id: "user_123", email: "user@example.com" } },
		});
	});

	it("revokes an authorized application by consent id", async () => {
		const requestEnv = createEnv();
		const applications = {
			list: vi.fn(),
			revoke: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			applications,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/applications/consent_123/revoke", {
				method: "POST",
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(applications.revoke).toHaveBeenCalledWith({
			request: expect.any(Request),
			env: requestEnv,
			session: { user: { id: "user_123", email: "user@example.com" } },
			consentId: "consent_123",
		});
	});

	it("rejects admin OAuth client APIs for non-admin users", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients"),
			requestEnv,
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "You do not have access to manage OAuth clients." });
		expect(adminOAuth.list).not.toHaveBeenCalled();
	});

	it("rejects admin OAuth proxy status for non-admin users", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-proxy"),
			requestEnv,
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "You do not have access to view OAuth Proxy." });
	});

	it("returns OAuth proxy status for admins", async () => {
		const requestEnv = {
			...createEnv(),
			BETTER_AUTH_URL: "https://passport.test",
			OAUTH_PROXY_PRODUCTION_URL: "https://passport.example.com",
			OAUTH_PROXY_SECRET: "shared-proxy-secret",
			TRUSTED_ORIGINS: "http://localhost:5177,https://preview.example.com",
		} as Env;
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-proxy"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			oauthProxy: {
				configured: true,
				productionURL: "https://passport.example.com",
				currentURL: "https://passport.test",
				sharedSecretConfigured: true,
				proxyActive: true,
				trustedOrigins: ["http://localhost:5177", "https://preview.example.com"],
				callbackPath: "/api/auth/callback/:provider",
			},
		});
	});

	it("lists admin OAuth clients without client secrets", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(() => [
				{
					clientId: "example-client",
					name: "Example Client",
					redirectUris: ["https://app.example.com/callback"],
					public: false,
					disabled: false,
				},
			]),
			create: vi.fn(),
			update: vi.fn(),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			clients: [
				{
					clientId: "example-client",
					name: "Example Client",
					redirectUris: ["https://app.example.com/callback"],
					public: false,
					disabled: false,
				},
			],
		});
	});

	it("creates an admin OAuth client and returns the one-time secret", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => ({
				clientId: "new-client",
				clientSecret: "secret-once",
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				public: false,
				disabled: false,
			})),
			update: vi.fn(),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "New Client",
					redirectUris: ["https://app.example.com/callback"],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			client: {
				clientId: "new-client",
				clientSecret: "secret-once",
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				public: false,
				disabled: false,
			},
		});
	});
});
