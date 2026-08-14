import { describe, expect, it, vi } from "vitest";

import { createWorkerApp, type RequestTracer, type TraceSpan } from "./app";

function createEnv() {
	return {
		ASSETS: {
			fetch: vi.fn(() => new Response("asset")),
		},
		ADMIN_EMAILS: "admin@example.com",
		BRAND_NAME: "Acme ID",
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
	it("wraps request handling in a custom trace span", async () => {
		const span: TraceSpan = {
			isTraced: true,
			setAttribute: vi.fn(),
		};
		const enterSpan = vi.fn();
		const tracer: RequestTracer = {
			enterSpan(name, callback) {
				enterSpan(name, callback);
				return callback(span);
			},
		};
		const authHandler = vi.fn(() => new Response("auth"));
		const app = createWorkerApp({ authHandler, tracer });

		const response = await app.fetch(
			new Request("https://passport.test/api/auth/sign-in/email", { method: "POST" }),
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("auth");
		expect(enterSpan).toHaveBeenCalledOnce();
		expect(enterSpan).toHaveBeenCalledWith("passport.request", expect.any(Function));
		expect(span.setAttribute).toHaveBeenCalledWith("http.request.method", "POST");
		expect(span.setAttribute).toHaveBeenCalledWith("http.route", "auth");
	});

	it("uses normalized trace route names for dynamic application routes", async () => {
		const span: TraceSpan = {
			isTraced: true,
			setAttribute: vi.fn(),
		};
		const enterSpan = vi.fn();
		const tracer: RequestTracer = {
			enterSpan(name, callback) {
				enterSpan(name, callback);
				return callback(span);
			},
		};
		const applications = {
			list: vi.fn(),
			revoke: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			applications,
			tracer,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/applications/consent_123/revoke", {
				method: "POST",
			}),
			createEnv(),
		);

		expect(response.status).toBe(200);
		expect(span.setAttribute).toHaveBeenCalledWith("http.route", "applications");
		expect(span.setAttribute).not.toHaveBeenCalledWith(
			"url.path",
			"/api/applications/consent_123/revoke",
		);
	});

	it.each([
		"/api/auth/sign-in/email",
		"/reset-password/reset-token",
		"/api/auth/.well-known/openid-configuration",
		"/api/auth/.well-known/oauth-authorization-server",
		"/api/auth/stripe/webhook",
		"/oauth2/token",
		"/oauth2/introspect",
		"/oauth2/revoke",
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

	it("serves a secret-free Stripe billing plan catalog", async () => {
		const requestEnv = {
			...createEnv(),
			STRIPE_BILLING_PLANS: JSON.stringify([
				{
					name: "pro",
					label: "Pro",
					priceId: "price_secret_month",
					annualDiscountPriceId: "price_secret_year",
					limits: { applications: 10 },
					entitlements: ["billing"],
				},
			]),
		};
		const app = createWorkerApp({ authHandler: vi.fn(() => new Response("auth")) });

		const response = await app.fetch(
			new Request("https://passport.test/api/billing/plans"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			plans: [
				{
					name: "pro",
					label: "Pro",
					limits: { applications: 10 },
					entitlements: ["billing"],
					hasFreeTrial: false,
					hasAnnualDiscount: true,
					type: "subscription",
					personalOnly: false,
					hidden: false,
				},
			],
			entitlementLabels: {},
			limitLabels: {},
		});
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

	it("requires a session to read account activity", async () => {
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
			activityLog: { list: vi.fn() },
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/account/activity"),
			createEnv(),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to view your account activity." });
	});

	it("returns the signed-in user's account activity events", async () => {
		const list = vi.fn(() => ({
			items: [
				{
					id: "evt_1",
					type: "sign_in",
					createdAt: "2026-06-17T00:00:00.000Z",
					ipAddress: "203.0.113.7",
					location: null,
					userAgent: "test-agent",
				},
			],
		}));
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			activityLog: { list },
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/account/activity?limit=25"),
			createEnv(),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { events: { type: string }[] };
		expect(payload.events).toHaveLength(1);
		expect(payload.events[0]?.type).toBe("sign_in");
		expect(list).toHaveBeenCalledOnce();
	});

	it("forbids non-admins from managing webhooks", async () => {
		const create = vi.fn();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com", role: "user" } })),
			webhooks: {
				list: vi.fn(),
				create,
				update: vi.fn(),
				remove: vi.fn(),
				rotateSecret: vi.fn(),
				listDeliveries: vi.fn(),
			},
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/webhooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: "https://app.example.com/hooks", events: ["user.created"] }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(403);
		expect(create).not.toHaveBeenCalled();
	});

	it("rejects webhook endpoints that fail the SSRF URL guard", async () => {
		const create = vi.fn();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			webhooks: {
				list: vi.fn(),
				create,
				update: vi.fn(),
				remove: vi.fn(),
				rotateSecret: vi.fn(),
				listDeliveries: vi.fn(),
			},
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/webhooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: "http://169.254.169.254/", events: ["user.created"] }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(400);
		expect(create).not.toHaveBeenCalled();
	});

	it("creates a webhook endpoint for admins and returns the secret once", async () => {
		const create = vi.fn(() => ({
			id: "wh_1",
			url: "https://app.example.com/hooks",
			events: ["user.created"],
			description: null,
			disabled: false,
			createdAt: "2026-06-17T00:00:00.000Z",
			secret: "whsec_abc",
		}));
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			webhooks: {
				list: vi.fn(),
				create,
				update: vi.fn(),
				remove: vi.fn(),
				rotateSecret: vi.fn(),
				listDeliveries: vi.fn(),
			},
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/webhooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: "https://app.example.com/hooks", events: ["user.created"] }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(201);
		const payload = (await response.json()) as { endpoint: { secret: string } };
		expect(payload.endpoint.secret).toBe("whsec_abc");
		expect(create).toHaveBeenCalledOnce();
	});

	it("stores organization logo uploads through the profile image API", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123" } })),
		});
		const body = new FormData();
		body.set("purpose", "organization-logo");
		body.set("image", new File(["logo-bytes"], "logo.webp", { type: "image/webp" }));

		const response = await app.fetch(
			new Request("https://passport.test/api/profile-images", { method: "POST", body }),
			requestEnv,
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { image: string; url: string };
		expect(payload.image).toBe(payload.url);
		expect(payload.image).toMatch(
			/^\/api\/profile-images\/profile-images\/user_123\/organization-logo\/[a-f0-9-]+\.webp$/,
		);
		expect(requestEnv.PROFILE_IMAGES.put).toHaveBeenCalledOnce();
		const [key, value, options] = requestEnv.PROFILE_IMAGES.put.mock.calls[0] as [
			string,
			File,
			{ httpMetadata: { contentType: string } },
		];
		expect(key).toBe(payload.image.replace("/api/profile-images/", ""));
		expect(await value.text()).toBe("logo-bytes");
		expect(options.httpMetadata.contentType).toBe("image/webp");
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
			descriptor: "Acme identity",
			capabilities: ["OIDC", "PKCE", "JWKS", "Passkeys"],
			theme: {
				brand: "#111827",
			},
		});
	});

	it("returns public captcha config when both server and site keys are configured", async () => {
		const requestEnv = {
			...createEnv(),
			CAPTCHA_PROVIDER: "cap",
			CAPTCHA_SECRET_KEY: "server-secret",
			CAPTCHA_SITE_KEY: "site-key",
			CAPTCHA_API_ENDPOINT: "https://captcha.test/site-key/",
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
		});

		const response = await app.fetch(new Request("https://passport.test/api/captcha-config"), requestEnv);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("public, max-age=60");
		expect(await response.json()).toEqual({
			enabled: true,
			provider: "cap",
			siteKey: "site-key",
			apiEndpoint: "https://captcha.test/site-key/",
		});
	});

	it("hides captcha config when the secret key is not configured", async () => {
		const requestEnv = {
			...createEnv(),
			CAPTCHA_PROVIDER: "cap",
			CAPTCHA_SITE_KEY: "site-key",
			CAPTCHA_API_ENDPOINT: "https://captcha.test/site-key/",
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
		});

		const response = await app.fetch(new Request("https://passport.test/api/captcha-config"), requestEnv);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ enabled: false });
	});

	it("rejects password updates without a session", async () => {
		const requestEnv = createEnv();
		const accountPassword = {
			update: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
			accountPassword,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/account/password", {
				method: "POST",
				body: JSON.stringify({ newPassword: "password1234" }),
			}),
			requestEnv,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to update your password." });
		expect(accountPassword.update).not.toHaveBeenCalled();
	});

	it("passes password updates to the account password service", async () => {
		const requestEnv = createEnv();
		const accountPassword = {
			update: vi.fn(() => Response.json({ status: true })),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			accountPassword,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/account/password", {
				method: "POST",
				body: JSON.stringify({
					currentPassword: "old-password",
					newPassword: "new-password",
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: true });
		expect(accountPassword.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "user_123", email: "user@example.com" } },
			},
			{
				currentPassword: "old-password",
				newPassword: "new-password",
			},
		);
	});

	it("returns default notification preferences when no preference service is configured", async () => {
		const requestEnv = createEnv();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/settings/notifications"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ preferences: { securityAlerts: true } });
	});

	it("updates notification preferences for the signed-in user", async () => {
		const requestEnv = createEnv();
		const emailNotificationPreferences = {
			get: vi.fn(),
			update: vi.fn(() => ({ securityAlerts: false })),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			emailNotificationPreferences,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/settings/notifications", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ securityAlerts: false }),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ preferences: { securityAlerts: false } });
		expect(emailNotificationPreferences.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "user_123", email: "user@example.com" } },
			},
			{ securityAlerts: false },
		);
	});

	it("rejects invalid notification preference updates", async () => {
		const requestEnv = createEnv();
		const emailNotificationPreferences = {
			get: vi.fn(),
			update: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			emailNotificationPreferences,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/settings/notifications", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ securityAlerts: "yes" }),
			}),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid notification preferences." });
		expect(emailNotificationPreferences.update).not.toHaveBeenCalled();
	});

	it("returns the current data export request for the signed-in user", async () => {
		const requestEnv = createEnv();
		const exportRequest = {
			id: "export_123",
			status: "pending",
			requestedAt: "2026-06-17T00:00:00.000Z",
			cancelableUntil: "2026-06-17T00:15:00.000Z",
		} as const;
		const dataExports = {
			current: vi.fn(() => exportRequest),
			request: vi.fn(),
			cancel: vi.fn(),
			cancelWithToken: vi.fn(),
			downloadWithToken: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			dataExports,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/data-export-requests/current"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ request: exportRequest });
		expect(dataExports.current).toHaveBeenCalledWith({
			request: expect.any(Request),
			env: requestEnv,
			session: { user: { id: "user_123", email: "user@example.com" } },
		});
		expect(dataExports.request).not.toHaveBeenCalled();
	});

	it("keeps the current data export endpoint read-only", async () => {
		const requestEnv = createEnv();
		const dataExports = {
			current: vi.fn(),
			request: vi.fn(),
			cancel: vi.fn(),
			cancelWithToken: vi.fn(),
			downloadWithToken: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			dataExports,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/data-export-requests/current", {
				method: "POST",
			}),
			requestEnv,
		);

		expect(response.status).toBe(405);
		expect(dataExports.current).not.toHaveBeenCalled();
		expect(dataExports.request).not.toHaveBeenCalled();
	});

	it("starts a data export request for the signed-in user", async () => {
		const requestEnv = createEnv();
		const exportRequest = {
			id: "export_123",
			status: "pending",
			requestedAt: "2026-06-17T00:00:00.000Z",
			cancelableUntil: "2026-06-17T00:15:00.000Z",
		} as const;
		const dataExports = {
			current: vi.fn(),
			request: vi.fn(() => exportRequest),
			cancel: vi.fn(),
			cancelWithToken: vi.fn(),
			downloadWithToken: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			dataExports,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/data-export-requests", { method: "POST" }),
			requestEnv,
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ request: exportRequest });
		expect(dataExports.request).toHaveBeenCalledWith({
			request: expect.any(Request),
			env: requestEnv,
			session: { user: { id: "user_123", email: "user@example.com" } },
		});
	});

	it("cancels a data export request for the signed-in user", async () => {
		const requestEnv = createEnv();
		const canceledRequest = {
			id: "export_123",
			status: "canceled",
			requestedAt: "2026-06-17T00:00:00.000Z",
			cancelableUntil: "2026-06-17T00:15:00.000Z",
			canceledAt: "2026-06-17T00:05:00.000Z",
		} as const;
		const dataExports = {
			current: vi.fn(),
			request: vi.fn(),
			cancel: vi.fn(() => canceledRequest),
			cancelWithToken: vi.fn(),
			downloadWithToken: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			dataExports,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/data-export-requests/export_123/cancel", {
				method: "POST",
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ request: canceledRequest });
		expect(dataExports.cancel).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "user_123", email: "user@example.com" } },
			},
			"export_123",
		);
	});

	it("serves token-based data export cancel and download routes without a session", async () => {
		const requestEnv = createEnv();
		const dataExports = {
			current: vi.fn(),
			request: vi.fn(),
			cancel: vi.fn(),
			cancelWithToken: vi.fn(() => new Response("cancel-page")),
			downloadWithToken: vi.fn(() => new Response("download-page")),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
			dataExports,
		});

		const cancelResponse = await app.fetch(
			new Request("https://passport.test/api/data-export-requests/export_123/cancel?token=abc"),
			requestEnv,
		);
		const downloadResponse = await app.fetch(
			new Request("https://passport.test/api/data-export-requests/export_123/download?token=xyz"),
			requestEnv,
		);

		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.text()).toBe("cancel-page");
		expect(downloadResponse.status).toBe(200);
		expect(await downloadResponse.text()).toBe("download-page");
		expect(dataExports.cancelWithToken).toHaveBeenCalledWith(
			expect.any(Request),
			requestEnv,
			"export_123",
		);
		expect(dataExports.downloadWithToken).toHaveBeenCalledWith(
			expect.any(Request),
			requestEnv,
			"export_123",
		);
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
			list: vi.fn(() => ({
				items: [
					{
						consentId: "consent_123",
						clientId: "example-client",
						name: "Example Client",
						scopes: ["openid", "email"],
						authorizedAt: "2026-06-14T00:00:00.000Z",
					},
				],
			})),
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
			page: {
				limit: 25,
			},
		});
		expect(applications.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "user_123", email: "user@example.com" } },
			},
			{ limit: 25 },
		);
	});

	it("passes pagination options to authorized application listing", async () => {
		const requestEnv = createEnv();
		const applications = {
			list: vi.fn(() => ({
				items: [
					{
						consentId: "consent_456",
						clientId: "next-client",
						name: "Next Client",
						scopes: ["openid"],
						authorizedAt: "2026-06-15T00:00:00.000Z",
					},
				],
				nextCursor: "2",
			})),
			revoke: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			applications,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/applications?limit=1&cursor=1"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			applications: [
				{
					consentId: "consent_456",
					clientId: "next-client",
					name: "Next Client",
					scopes: ["openid"],
					authorizedAt: "2026-06-15T00:00:00.000Z",
				},
			],
			page: {
				limit: 1,
				nextCursor: "2",
			},
		});
		expect(applications.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "user_123", email: "user@example.com" } },
			},
			{ limit: 1, cursor: "1" },
		);
	});

	it("rejects invalid pagination before listing authorized applications", async () => {
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
			new Request("https://passport.test/api/applications?limit=0"),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid pagination parameters." });
		expect(applications.list).not.toHaveBeenCalled();
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

	it("rejects OAuth client metadata without a session", async () => {
		const requestEnv = createEnv();
		const clientMetadata = {
			resolve: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => null),
			clientMetadata,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/oauth/client-metadata?clientId=example-client"),
			requestEnv,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to view OAuth client metadata." });
		expect(clientMetadata.resolve).not.toHaveBeenCalled();
	});

	it("validates OAuth client metadata lookup input", async () => {
		const requestEnv = createEnv();
		const clientMetadata = {
			resolve: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			clientMetadata,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/oauth/client-metadata"),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Missing clientId." });
		expect(clientMetadata.resolve).not.toHaveBeenCalled();
	});

	it("returns consent-safe OAuth client metadata", async () => {
		const requestEnv = createEnv();
		const clientMetadata = {
			resolve: vi.fn(() => ({
				clientId: "example-client",
				name: "Example Client",
				redirectUris: ["https://app.example.com/callback"],
				uri: "https://app.example.com",
				icon: "https://app.example.com/icon.png",
				policy: "https://app.example.com/privacy",
				disabled: true,
				source: "database" as const,
			})),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			clientMetadata,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/oauth/client-metadata?clientId=example-client"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload).toEqual({
			client: {
				clientId: "example-client",
				name: "Example Client",
				redirectUris: ["https://app.example.com/callback"],
				uri: "https://app.example.com",
				icon: "https://app.example.com/icon.png",
				policy: "https://app.example.com/privacy",
				disabled: true,
				source: "database",
			},
		});
		expect(JSON.stringify(payload)).not.toContain("secret");
	});

	it("returns not found for unknown OAuth client metadata", async () => {
		const requestEnv = createEnv();
		const clientMetadata = {
			resolve: vi.fn(() => null),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			clientMetadata,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/oauth/client-metadata?clientId=missing-client"),
			requestEnv,
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "OAuth client not found." });
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

	it("rejects admin audit event listing for non-admin users", async () => {
		const requestEnv = createEnv();
		const adminAudit = {
			list: vi.fn(),
			record: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			adminAudit,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/audit-events"),
			requestEnv,
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "You do not have access to view audit events." });
		expect(adminAudit.list).not.toHaveBeenCalled();
	});

	it("allows Better Auth role admins to view audit events", async () => {
		const requestEnv = {
			...createEnv(),
			ADMIN_EMAILS: "bootstrap@example.com",
		} as Env;
		const adminAudit = {
			list: vi.fn(() => ({ items: [] })),
			record: vi.fn(),
		};
		const session = {
			user: { id: "admin_123", email: "role-admin@example.com", role: "admin" },
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => session),
			adminAudit,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/audit-events"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminAudit.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session,
			},
			{ limit: 25 },
		);
	});

	it("lists admin audit events for admins", async () => {
		const requestEnv = createEnv();
		const adminAudit = {
			list: vi.fn(() => ({
				items: [
					{
						id: "audit_1",
						createdAt: "2026-06-16T00:00:00.000Z",
						actorEmail: "admin@example.com",
						action: "oauth_client.create",
						targetType: "oauth_client",
						targetId: "client_123",
						targetLabel: "Client",
					},
				],
			})),
			record: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminAudit,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/audit-events?limit=1"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			events: [
				{
					id: "audit_1",
					createdAt: "2026-06-16T00:00:00.000Z",
					actorEmail: "admin@example.com",
					action: "oauth_client.create",
					targetType: "oauth_client",
					targetId: "client_123",
					targetLabel: "Client",
				},
			],
			page: { limit: 1 },
		});
		expect(adminAudit.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{ limit: 1 },
		);
	});

	it("lists admin OAuth clients without client secrets", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(() => ({
				items: [
					{
						clientId: "example-client",
						name: "Example Client",
						redirectUris: ["https://app.example.com/callback"],
						public: false,
						disabled: false,
					},
				],
			})),
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
			page: {
				limit: 25,
			},
		});
		expect(adminOAuth.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{ limit: 25 },
		);
	});

	it("allows configured admin user IDs to list OAuth clients", async () => {
		const requestEnv = {
			...createEnv(),
			ADMIN_EMAILS: "",
			ADMIN_USER_IDS: "admin_123",
		} as Env;
		const adminOAuth = {
			list: vi.fn(() => ({ items: [] })),
			create: vi.fn(),
			update: vi.fn(),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const session = {
			user: { id: "admin_123", email: "id-admin@example.com", role: "user" },
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => session),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminOAuth.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session,
			},
			{ limit: 25 },
		);
	});

	it("allows Better Auth role admins to edit OAuth clients", async () => {
		const requestEnv = {
			...createEnv(),
			ADMIN_EMAILS: "bootstrap@example.com",
		} as Env;
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(() => ({
				clientId: "existing-client",
				name: "Existing Client",
				redirectUris: ["https://app.example.com/callback"],
				public: false,
				disabled: false,
			})),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const session = {
			user: { id: "admin_123", email: "role-admin@example.com", role: "admin" },
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => session),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Existing Client",
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminOAuth.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session,
			},
			"existing-client",
			{ name: "Existing Client" },
		);
	});

	it("passes pagination options to admin OAuth client listing", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(() => ({
				items: [
					{
						clientId: "next-client",
						name: "Next Client",
						redirectUris: ["https://app.example.com/callback"],
						public: false,
						disabled: false,
					},
				],
				nextCursor: "2",
			})),
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
			new Request("https://passport.test/api/admin/oauth-clients?limit=1&cursor=1"),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			clients: [
				{
					clientId: "next-client",
					name: "Next Client",
					redirectUris: ["https://app.example.com/callback"],
					public: false,
					disabled: false,
				},
			],
			page: {
				limit: 1,
				nextCursor: "2",
			},
		});
		expect(adminOAuth.list).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{ limit: 1, cursor: "1" },
		);
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

	it("creates a machine-to-machine OAuth client without redirect URIs", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => ({
				clientId: "m2m-client",
				clientSecret: "secret-once",
				name: "Worker Job",
				redirectUris: [],
				scopes: ["permissions"],
				grantTypes: ["client_credentials" as const],
				allowedAudiences: ["https://api.example.com"],
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
					name: "Worker Job",
					redirectUris: [],
					scopes: ["permissions"],
					grantTypes: ["client_credentials"],
					allowedAudiences: ["https://api.example.com"],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(201);
		expect(adminOAuth.create).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{
				name: "Worker Job",
				redirectUris: [],
				scopes: ["permissions"],
				grantTypes: ["client_credentials" as const],
				allowedAudiences: ["https://api.example.com"],
				public: false,
			},
		);
		expect(await response.json()).toEqual({
			client: {
				clientId: "m2m-client",
				clientSecret: "secret-once",
				name: "Worker Job",
				redirectUris: [],
				scopes: ["permissions"],
				grantTypes: ["client_credentials" as const],
				allowedAudiences: ["https://api.example.com"],
				public: false,
				disabled: false,
			},
		});
	});

	it("rejects public machine-to-machine clients", async () => {
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
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Worker Job",
					redirectUris: [],
					scopes: ["permissions"],
					grantTypes: ["client_credentials"],
					allowedAudiences: ["https://api.example.com"],
					public: true,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Machine-to-machine clients must be confidential.",
		});
		expect(adminOAuth.create).not.toHaveBeenCalled();
	});

	it("returns JSON when admin OAuth client creation fails", async () => {
		const requestEnv = createEnv();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => {
				throw new Error("OAuth client could not be created.");
			}),
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

		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({ error: "Could not manage OAuth client." });
		expect(consoleError).toHaveBeenCalledWith("Admin OAuth request failed", expect.any(Error));
		consoleError.mockRestore();
	});

	it("records OAuth client creation without storing the one-time secret", async () => {
		const requestEnv = createEnv();
		const adminAudit = {
			list: vi.fn(),
			record: vi.fn(),
		};
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
			getSession: vi.fn(() => ({
				user: { id: "admin_123", email: "admin@example.com", role: "admin" },
			})),
			adminOAuth,
			adminAudit,
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
		expect(adminAudit.record).toHaveBeenCalledOnce();
		const [, event] = adminAudit.record.mock.calls[0] as [unknown, { metadata?: unknown }];
		expect(event).toMatchObject({
			action: "oauth_client.create",
			targetType: "oauth_client",
			targetId: "new-client",
			targetLabel: "New Client",
		});
		expect(JSON.stringify(event.metadata)).not.toContain("secret-once");
	});

	it("passes terms of service and privacy policy URLs when creating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => ({
				clientId: "new-client",
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				tos: "https://app.example.com/terms",
				policy: "https://app.example.com/privacy",
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
					tos: "https://app.example.com/terms",
					policy: "https://app.example.com/privacy",
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(201);
		expect(adminOAuth.create).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				tos: "https://app.example.com/terms",
				policy: "https://app.example.com/privacy",
				public: false,
			},
		);
	});

	it("accepts an empty optional post-logout URI list when creating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => ({
				clientId: "new-client",
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				postLogoutRedirectUris: [],
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
					postLogoutRedirectUris: [],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(201);
		expect(adminOAuth.create).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{
				name: "New Client",
				redirectUris: ["https://app.example.com/callback"],
				postLogoutRedirectUris: [],
				public: false,
			},
		);
	});

	it("accepts supported custom scopes when creating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(() => ({
				clientId: "scoped-client",
				name: "Scoped Client",
				redirectUris: ["https://app.example.com/callback"],
				scopes: [
					"openid",
					"profile",
					"email",
					"phone",
					"profile:picture",
					"profile:username",
					"organizations",
					"organizations:ids",
					"organizations:roles",
					"teams",
					"teams:ids",
					"permissions",
					"account:security",
					"connections",
				],
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
					name: "Scoped Client",
					redirectUris: ["https://app.example.com/callback"],
					scopes: [
						"openid",
						"profile",
						"email",
						"phone",
						"profile:picture",
						"profile:username",
						"organizations",
						"organizations:ids",
						"organizations:roles",
						"teams",
						"teams:ids",
						"permissions",
						"account:security",
						"connections",
					],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(201);
		expect(adminOAuth.create).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			{
				name: "Scoped Client",
				redirectUris: ["https://app.example.com/callback"],
				scopes: [
					"openid",
					"profile",
					"email",
					"phone",
					"profile:picture",
					"profile:username",
					"organizations",
					"organizations:ids",
					"organizations:roles",
					"teams",
					"teams:ids",
					"permissions",
					"account:security",
					"connections",
				],
				public: false,
			},
		);
	});

	it("rejects unsupported scopes when creating a client", async () => {
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
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Scoped Client",
					redirectUris: ["https://app.example.com/callback"],
					scopes: ["openid", "relationships"],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Unsupported OAuth scope: relationships",
		});
		expect(adminOAuth.create).not.toHaveBeenCalled();
	});

	it("accepts an empty optional post-logout URI list when updating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(() => ({
				clientId: "existing-client",
				name: "Existing Client",
				redirectUris: ["https://app.example.com/callback"],
				postLogoutRedirectUris: [],
				public: false,
				disabled: false,
			})),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					postLogoutRedirectUris: [],
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminOAuth.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			"existing-client",
			{
				postLogoutRedirectUris: [],
			},
		);
	});

	it("passes grant types and allowed audiences when updating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(() => ({
				clientId: "existing-client",
				name: "Existing Client",
				redirectUris: [],
				scopes: ["permissions"],
				grantTypes: ["client_credentials" as const],
				allowedAudiences: ["https://api.example.com"],
				public: false,
				disabled: false,
			})),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					redirectUris: [],
					scopes: ["permissions"],
					grantTypes: ["client_credentials"],
					allowedAudiences: ["https://api.example.com"],
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminOAuth.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			"existing-client",
			{
				redirectUris: [],
				scopes: ["permissions"],
				grantTypes: ["client_credentials"],
				allowedAudiences: ["https://api.example.com"],
			},
		);
	});

	it("passes terms of service and privacy policy URLs when updating a client", async () => {
		const requestEnv = createEnv();
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(() => ({
				clientId: "existing-client",
				name: "Existing Client",
				redirectUris: ["https://app.example.com/callback"],
				tos: "https://app.example.com/terms",
				policy: "https://app.example.com/privacy",
				public: false,
				disabled: false,
			})),
			rotateSecret: vi.fn(),
			setDisabled: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tos: "https://app.example.com/terms",
					policy: "https://app.example.com/privacy",
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(200);
		expect(adminOAuth.update).toHaveBeenCalledWith(
			{
				request: expect.any(Request),
				env: requestEnv,
				session: { user: { id: "admin_123", email: "admin@example.com" } },
			},
			"existing-client",
			{
				tos: "https://app.example.com/terms",
				policy: "https://app.example.com/privacy",
			},
		);
	});

	it("keeps redirect URIs required when creating a client", async () => {
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
			getSession: vi.fn(() => ({ user: { id: "admin_123", email: "admin@example.com" } })),
			adminOAuth,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "New Client",
					redirectUris: [],
					public: false,
				}),
			}),
			requestEnv,
		);

		expect(response.status).toBe(400);
		expect(adminOAuth.create).not.toHaveBeenCalled();
	});

	it("records OAuth client secret rotation and disable actions", async () => {
		const requestEnv = createEnv();
		const adminAudit = {
			list: vi.fn(),
			record: vi.fn(),
		};
		const adminOAuth = {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			rotateSecret: vi.fn(() => ({
				clientId: "existing-client",
				clientSecret: "secret-rotated",
				name: "Existing Client",
				redirectUris: ["https://app.example.com/callback"],
			})),
			setDisabled: vi.fn(() => ({
				clientId: "existing-client",
				name: "Existing Client",
				redirectUris: ["https://app.example.com/callback"],
				disabled: true,
			})),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({
				user: { id: "admin_123", email: "admin@example.com", role: "admin" },
			})),
			adminOAuth,
			adminAudit,
		});

		const rotateResponse = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client/rotate-secret", {
				method: "POST",
			}),
			requestEnv,
		);
		const disableResponse = await app.fetch(
			new Request("https://passport.test/api/admin/oauth-clients/existing-client/disable", {
				method: "POST",
			}),
			requestEnv,
		);

		expect(rotateResponse.status).toBe(200);
		expect(disableResponse.status).toBe(200);
		expect(adminAudit.record).toHaveBeenCalledTimes(2);
		expect(adminAudit.record.mock.calls[0]?.[1]).toMatchObject({
			action: "oauth_client.rotate_secret",
			targetId: "existing-client",
		});
		expect(JSON.stringify(adminAudit.record.mock.calls[0]?.[1])).not.toContain("secret-rotated");
		expect(adminAudit.record.mock.calls[1]?.[1]).toMatchObject({
			action: "oauth_client.disable",
			targetId: "existing-client",
			metadata: { disabled: true },
		});
	});

	it("requires admin access for audited user mutation wrappers", async () => {
		const requestEnv = createEnv();
		const adminUsers = {
			setRole: vi.fn(),
			ban: vi.fn(),
			unban: vi.fn(),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com" } })),
			adminUsers,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/users/user_456/role", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ role: "admin" }),
			}),
			requestEnv,
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "You do not have access to manage users." });
		expect(adminUsers.setRole).not.toHaveBeenCalled();
	});

	it("records audited user role, ban, and unban mutations after success", async () => {
		const requestEnv = createEnv();
		const adminAudit = {
			list: vi.fn(),
			record: vi.fn(),
		};
		const adminUsers = {
			setRole: vi.fn(() => ({ userId: "user_456", email: "target@example.com", role: "admin" })),
			ban: vi.fn(() => ({ userId: "user_456", email: "target@example.com", banned: true })),
			unban: vi.fn(() => ({ userId: "user_456", email: "target@example.com", banned: false })),
		};
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({
				user: { id: "admin_123", email: "admin@example.com", role: "admin" },
			})),
			adminUsers,
			adminAudit,
		});

		const roleResponse = await app.fetch(
			new Request("https://passport.test/api/admin/users/user_456/role", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ role: "admin" }),
			}),
			requestEnv,
		);
		const banResponse = await app.fetch(
			new Request("https://passport.test/api/admin/users/user_456/ban", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ banReason: "Compromised", banExpiresIn: 3600 }),
			}),
			requestEnv,
		);
		const unbanResponse = await app.fetch(
			new Request("https://passport.test/api/admin/users/user_456/unban", {
				method: "POST",
			}),
			requestEnv,
		);

		expect(roleResponse.status).toBe(200);
		expect(banResponse.status).toBe(200);
		expect(unbanResponse.status).toBe(200);
		expect(adminAudit.record).toHaveBeenCalledTimes(3);
		expect(adminAudit.record.mock.calls.map((call) => call[1])).toEqual([
			expect.objectContaining({ action: "user.set_role", targetId: "user_456" }),
			expect.objectContaining({ action: "user.ban", targetId: "user_456" }),
			expect.objectContaining({ action: "user.unban", targetId: "user_456" }),
		]);
	});

	function billingPlanService(overrides: Record<string, unknown> = {}) {
		return {
			catalog: vi.fn(() => []),
			product: vi.fn(() => null),
			labels: vi.fn(() => ({ entitlementLabels: {}, limitLabels: {} })),
			list: vi.fn(() => []),
			create: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reorder: vi.fn(() => 0),
			prices: vi.fn(() => ({})),
			...overrides,
		};
	}

	it("serves the public plan catalog from the billing plan service", async () => {
		const billingPlans = billingPlanService({
			catalog: vi.fn(() => [
				{ name: "pro", group: "Acme", entitlements: [], hasFreeTrial: false, hasAnnualDiscount: true },
			]),
		});
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			billingPlans,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/billing/plans"),
			createEnv(),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { plans: { name: string }[] };
		expect(payload.plans).toEqual([expect.objectContaining({ name: "pro" })]);
		expect(billingPlans.catalog).toHaveBeenCalledOnce();
	});

	it("hides hidden plans from the public catalog", async () => {
		const billingPlans = billingPlanService({
			catalog: vi.fn(() => [
				{ name: "pro", entitlements: [], hasFreeTrial: false, hasAnnualDiscount: false, hidden: false },
				{ name: "secret", entitlements: [], hasFreeTrial: false, hasAnnualDiscount: false, hidden: true },
			]),
		});
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			billingPlans,
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/billing/plans"),
			createEnv(),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { plans: { name: string }[] };
		expect(payload.plans.map((plan) => plan.name)).toEqual(["pro"]);
	});

	it("resolves a single product by id, including hidden ones", async () => {
		const product = vi.fn(() => ({
			id: "prod_secret",
			name: "secret",
			entitlements: [],
			hasFreeTrial: false,
			hasAnnualDiscount: false,
			type: "one_time" as const,
			personalOnly: false,
			hidden: true,
		}));
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			billingPlans: billingPlanService({ product }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/billing/products/prod_secret"),
			createEnv(),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { product: { name: string; hidden: boolean } };
		expect(payload.product).toEqual(expect.objectContaining({ name: "secret", hidden: true }));
		expect(product).toHaveBeenCalledWith(expect.anything(), "prod_secret");
	});

	it("returns 404 for an unknown product id", async () => {
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			billingPlans: billingPlanService({ product: vi.fn(() => null) }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/billing/products/prod_missing"),
			createEnv(),
		);

		expect(response.status).toBe(404);
	});

	it("forbids non-admins from managing billing plans", async () => {
		const create = vi.fn();
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "user_123", email: "user@example.com", role: "user" } })),
			billingPlans: billingPlanService({ create }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/billing/plans", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "pro", priceId: "price_123" }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(403);
		expect(create).not.toHaveBeenCalled();
	});

	it("creates a billing plan for admins", async () => {
		const create = vi.fn(() => ({ id: "plan_1", name: "pro" }));
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			billingPlans: billingPlanService({ create }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/billing/plans", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "pro", priceId: "price_123", group: "Acme" }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(201);
		const payload = (await response.json()) as { plan: { id: string } };
		expect(payload.plan.id).toBe("plan_1");
		expect(create).toHaveBeenCalledOnce();
	});

	it("surfaces plan validation errors as 400", async () => {
		const create = vi.fn(() => {
			throw new TypeError("plan must define priceId or lookupKey.");
		});
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			billingPlans: billingPlanService({ create }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/billing/plans", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "pro" }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(400);
		const payload = (await response.json()) as { error: string };
		expect(payload.error).toContain("priceId or lookupKey");
	});

	it("returns 404 when updating a missing plan", async () => {
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			billingPlans: billingPlanService({ update: vi.fn(() => null) }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/billing/plans/plan_404", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "pro", priceId: "price_123" }),
			}),
			createEnv(),
		);

		expect(response.status).toBe(404);
	});

	it("deletes a billing plan for admins", async () => {
		const remove = vi.fn(() => true);
		const app = createWorkerApp({
			authHandler: vi.fn(() => new Response("auth")),
			getSession: vi.fn(() => ({ user: { id: "admin_1", email: "admin@example.com", role: "admin" } })),
			billingPlans: billingPlanService({ remove }),
		});

		const response = await app.fetch(
			new Request("https://passport.test/api/admin/billing/plans/plan_1", {
				method: "DELETE",
			}),
			createEnv(),
		);

		expect(response.status).toBe(204);
		expect(remove).toHaveBeenCalledWith(expect.anything(), "plan_1");
	});
});
