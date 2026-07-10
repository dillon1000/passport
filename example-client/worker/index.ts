/**
 * Example client Worker. Inputs are browser requests plus Wrangler auth
 * bindings; outputs are Better Auth OAuth routes, a compact session JSON API,
 * explicit delegated-resource BFF routes, logout responses, and static asset
 * fallthrough. Safe OAuth configuration lives in `worker/auth.ts`.
 */
import { Hono } from "hono";

import {
	betterAuthCallbackURL,
	createExampleAuth,
	getExampleSessionPayload,
	signOut,
	startPassportLogin,
	type ClientEnv,
} from "./auth";
import { handlePassportResourceRequest } from "./passport-api";

const app = new Hono<{ Bindings: ClientEnv }>();

function appendSetCookieHeaders(target: Headers, source: Headers | undefined) {
	source?.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") {
			target.append(key, value);
		}
	});
}

function postLogoutRedirectURL(env: ClientEnv) {
	return env.POST_LOGOUT_REDIRECT_URI || env.BETTER_AUTH_URL;
}

// The BFF resolves and refreshes provider tokens through Better Auth's server
// API. Its corresponding HTTP endpoints stay closed so browser JavaScript
// cannot retrieve those tokens from the local session.
app.on(["POST", "GET"], ["/api/auth/get-access-token", "/api/auth/refresh-token"], (c) =>
	c.json({ error: { code: "not_found", message: "Not found." } }, 404),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => createExampleAuth(c.env).handler(c.req.raw));

app.get("/callback", (c) => {
	const callbackURL = new URL(c.req.url);
	const targetURL = new URL(betterAuthCallbackURL(c.env));
	targetURL.search = callbackURL.search;

	return createExampleAuth(c.env).handler(
		new Request(targetURL, {
			headers: c.req.raw.headers,
			method: c.req.raw.method,
		}),
	);
});

app.get("/api/login", async (c) => {
	const result = await startPassportLogin(c.req.raw, c.env);
	const response = c.redirect(result.response.url);
	appendSetCookieHeaders(response.headers, result.headers);
	return response;
});

app.get("/api/session", async (c) => c.json(await getExampleSessionPayload(c.req.raw, c.env)));

app.put("/api/delegated/me/profile-picture", (c) => {
	const headers = new Headers();
	const contentType = c.req.header("content-type");
	if (contentType) headers.set("content-type", contentType);

	return handlePassportResourceRequest(c.req.raw, c.env, "me/profile-picture", {
		body: c.req.raw.body,
		headers,
		method: "PUT",
	});
});

app.get("/api/delegated/organizations", (c) =>
	handlePassportResourceRequest(c.req.raw, c.env, "organizations"),
);

app.post("/api/delegated/organizations", async (c) =>
	handlePassportResourceRequest(c.req.raw, c.env, "organizations", {
		body: JSON.stringify(await c.req.json()),
		headers: { "content-type": "application/json" },
		method: "POST",
	}),
);

app.post("/api/delegated/organizations/:organizationId/teams", async (c) =>
	handlePassportResourceRequest(
		c.req.raw,
		c.env,
		`organizations/${encodeURIComponent(c.req.param("organizationId"))}/teams`,
		{
			body: JSON.stringify(await c.req.json()),
			headers: { "content-type": "application/json" },
			method: "POST",
		},
	),
);

app.get("/api/delegated/billing/products", (c) =>
	handlePassportResourceRequest(c.req.raw, c.env, "billing/products"),
);

app.post("/api/delegated/billing/checkout-intents", async (c) => {
	const headers = new Headers({ "content-type": "application/json" });
	const idempotencyKey = c.req.header("Idempotency-Key");
	if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

	return handlePassportResourceRequest(c.req.raw, c.env, "billing/checkout-intents", {
		body: JSON.stringify(await c.req.json()),
		headers,
		method: "POST",
	});
});

app.post("/api/logout", async (c) => {
	const result = await signOut(c.req.raw, c.env);
	const response = c.json({ ok: true, redirectTo: postLogoutRedirectURL(c.env) });
	appendSetCookieHeaders(response.headers, result.headers);
	return response;
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app satisfies ExportedHandler<ClientEnv>;
