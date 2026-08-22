/**
 * Fixed-window protection for public identifier discovery. Inputs are the
 * Cloudflare client address and shared auth KV. The output is either standard
 * rate-limit headers or a recoverable 429 response. Addresses are hashed before
 * storage, and state expires after two windows.
 */
export const SIGN_IN_METHOD_RATE_LIMIT = 20;
export const SIGN_IN_METHOD_RATE_LIMIT_WINDOW_SECONDS = 60;

type SignInMethodRateLimitState = {
	count: number;
	resetAt: number;
};

type SignInMethodRateLimitKV = {
	get(key: string, type: "json"): Promise<SignInMethodRateLimitState | null>;
	put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
};

function base64URL(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function rateLimitKey(clientAddress: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(clientAddress),
	);
	return `passport:sign-in-methods:${base64URL(new Uint8Array(digest))}`;
}

function rateLimitHeaders(remaining: number, resetAt: number) {
	return new Headers({
		"RateLimit-Limit": String(SIGN_IN_METHOD_RATE_LIMIT),
		"RateLimit-Remaining": String(Math.max(remaining, 0)),
		"RateLimit-Reset": String(resetAt),
	});
}

export async function enforceSignInMethodRateLimit(
	kv: SignInMethodRateLimitKV,
	clientAddress: string,
	now = new Date(),
) {
	const nowSeconds = Math.floor(now.getTime() / 1_000);
	const resetAt =
		(Math.floor(nowSeconds / SIGN_IN_METHOD_RATE_LIMIT_WINDOW_SECONDS) + 1) *
		SIGN_IN_METHOD_RATE_LIMIT_WINDOW_SECONDS;
	const key = await rateLimitKey(clientAddress);
	const stored = await kv.get(key, "json");
	const count = stored?.resetAt === resetAt ? stored.count : 0;

	if (count >= SIGN_IN_METHOD_RATE_LIMIT) {
		const headers = rateLimitHeaders(0, resetAt);
		headers.set("Retry-After", String(Math.max(resetAt - nowSeconds, 1)));
		return { allowed: false as const, headers };
	}

	const nextCount = count + 1;
	await kv.put(key, JSON.stringify({ count: nextCount, resetAt }), {
		expirationTtl: SIGN_IN_METHOD_RATE_LIMIT_WINDOW_SECONDS * 2,
	});
	return {
		allowed: true as const,
		headers: rateLimitHeaders(SIGN_IN_METHOD_RATE_LIMIT - nextCount, resetAt),
	};
}
