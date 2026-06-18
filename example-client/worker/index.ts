/**
 * Example client Worker. Inputs are browser requests plus Wrangler auth
 * bindings; outputs are Better Auth OAuth routes, a compact session JSON API,
 * logout responses, and static asset fallthrough. Safe configuration lives in
 * `worker/auth.ts`.
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

app.post("/api/logout", async (c) => {
	const result = await signOut(c.req.raw, c.env);
	const response = c.json({ ok: true, redirectTo: postLogoutRedirectURL(c.env) });
	appendSetCookieHeaders(response.headers, result.headers);
	return response;
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app satisfies ExportedHandler<ClientEnv>;
