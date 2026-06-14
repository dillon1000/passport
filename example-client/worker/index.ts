import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";

type TokenResponse = {
	access_token: string;
	id_token?: string;
	refresh_token?: string;
	token_type: string;
	expires_in?: number;
	scope?: string;
};

type ClientEnv = Env & {
	CLIENT_SECRET: string;
};

const stateCookie = "passport_example_state";
const verifierCookie = "passport_example_verifier";
const idTokenCookie = "passport_example_id_token";

const app = new Hono<{ Bindings: ClientEnv }>();

function encodeBase64Url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(byteLength = 32) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return encodeBase64Url(bytes);
}

async function codeChallenge(verifier: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return encodeBase64Url(new Uint8Array(digest));
}

async function discover(env: ClientEnv) {
	const response = await fetch(`${env.AUTH_ISSUER}/api/auth/.well-known/openid-configuration`);
	if (!response.ok) {
		throw new Error(`Discovery failed with ${response.status}`);
	}
	return (await response.json()) as {
		authorization_endpoint: string;
		token_endpoint: string;
		jwks_uri: string;
		issuer: string;
		end_session_endpoint?: string;
	};
}

async function verifyIdToken(env: ClientEnv, idToken: string) {
	const metadata = await discover(env);
	const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: metadata.issuer,
		audience: env.CLIENT_ID,
	});
	return payload;
}

app.get("/api/login", async (c) => {
	const metadata = await discover(c.env);
	const verifier = randomToken();
	const state = randomToken();
	const authorizationUrl = new URL(metadata.authorization_endpoint);

	authorizationUrl.searchParams.set("client_id", c.env.CLIENT_ID);
	authorizationUrl.searchParams.set("redirect_uri", c.env.REDIRECT_URI);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("scope", "openid profile email");
	authorizationUrl.searchParams.set("state", state);
	authorizationUrl.searchParams.set("code_challenge", await codeChallenge(verifier));
	authorizationUrl.searchParams.set("code_challenge_method", "S256");

	setCookie(c, stateCookie, state, {
		httpOnly: true,
		maxAge: 600,
		path: "/",
		sameSite: "Lax",
	});
	setCookie(c, verifierCookie, verifier, {
		httpOnly: true,
		maxAge: 600,
		path: "/",
		sameSite: "Lax",
	});

	return c.redirect(authorizationUrl.toString());
});

app.get("/callback", async (c) => {
	const expectedState = getCookie(c, stateCookie);
	const verifier = getCookie(c, verifierCookie);
	const state = c.req.query("state");
	const code = c.req.query("code");

	if (!state || !expectedState || state !== expectedState || !code || !verifier) {
		return c.redirect("/?error=invalid_callback");
	}

	const metadata = await discover(c.env);
	const tokenResponse = await fetch(metadata.token_endpoint, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: c.env.CLIENT_ID,
			client_secret: c.env.CLIENT_SECRET,
			redirect_uri: c.env.REDIRECT_URI,
			code,
			code_verifier: verifier,
		}),
	});

	if (!tokenResponse.ok) {
		return c.redirect("/?error=token_exchange_failed");
	}

	const tokens = (await tokenResponse.json()) as TokenResponse;
	if (!tokens.id_token) {
		return c.redirect("/?error=missing_id_token");
	}

	await verifyIdToken(c.env, tokens.id_token);
	setCookie(c, idTokenCookie, tokens.id_token, {
		httpOnly: true,
		maxAge: tokens.expires_in ?? 3600,
		path: "/",
		sameSite: "Lax",
	});
	setCookie(c, stateCookie, "", { maxAge: 0, path: "/" });
	setCookie(c, verifierCookie, "", { maxAge: 0, path: "/" });

	return c.redirect("/?login=complete");
});

app.get("/api/session", async (c) => {
	const idToken = getCookie(c, idTokenCookie);
	if (!idToken) {
		return c.json({ authenticated: false });
	}

	try {
		const payload = await verifyIdToken(c.env, idToken);
		return c.json({
			authenticated: true,
			claims: payload,
		});
	} catch {
		setCookie(c, idTokenCookie, "", { maxAge: 0, path: "/" });
		return c.json({ authenticated: false }, 401);
	}
});

app.post("/api/logout", (c) => {
	setCookie(c, idTokenCookie, "", { maxAge: 0, path: "/" });
	return c.json({ ok: true, redirectTo: c.env.POST_LOGOUT_REDIRECT_URI });
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app satisfies ExportedHandler<ClientEnv>;
