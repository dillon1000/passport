/**
 * KV-backed fixed-window limits for delegated client API actors. Inputs are the
 * calling OAuth client, delegated user, and whether the operation is sensitive;
 * output includes the current limit headers or a typed 429 response. The
 * sensitive bucket is separate so image uploads and billing-intent creation do
 * not consume the actor's general API allowance.
 */
import type { DelegatedClientActor } from "./client-api-auth";
import { ClientAPIError } from "./client-api-http";

export const CLIENT_API_RATE_LIMIT_WINDOW_SECONDS = 60;
export const CLIENT_API_STANDARD_RATE_LIMIT = 120;
export const CLIENT_API_SENSITIVE_RATE_LIMIT = 10;

type ClientAPIRateLimitState = {
	count: number;
	resetAt: number;
};

export type ClientAPIRateLimitResult = {
	limit: number;
	remaining: number;
	resetAt: number;
	headers: Headers;
};

function rateLimitKey(actor: Pick<DelegatedClientActor, "clientId" | "userId">, tier: string) {
	return [
		"client-api-rate-limit",
		tier,
		encodeURIComponent(actor.clientId),
		encodeURIComponent(actor.userId),
	].join(":");
}

function rateLimitHeaders(limit: number, remaining: number, resetAt: number) {
	return new Headers({
		"RateLimit-Limit": String(limit),
		"RateLimit-Remaining": String(Math.max(remaining, 0)),
		"RateLimit-Reset": String(resetAt),
	});
}

export async function enforceClientAPIRateLimit(
	kv: KVNamespace,
	actor: Pick<DelegatedClientActor, "clientId" | "userId">,
	{
		sensitive = false,
		now = new Date(),
	}: {
		sensitive?: boolean;
		now?: Date;
	} = {},
): Promise<ClientAPIRateLimitResult> {
	const limit = sensitive
		? CLIENT_API_SENSITIVE_RATE_LIMIT
		: CLIENT_API_STANDARD_RATE_LIMIT;
	const tier = sensitive ? "sensitive" : "standard";
	const key = rateLimitKey(actor, tier);
	const nowSeconds = Math.floor(now.getTime() / 1_000);
	const resetAt =
		(Math.floor(nowSeconds / CLIENT_API_RATE_LIMIT_WINDOW_SECONDS) + 1) *
		CLIENT_API_RATE_LIMIT_WINDOW_SECONDS;
	const stored = await kv.get<ClientAPIRateLimitState>(key, "json");
	const count = stored?.resetAt === resetAt ? stored.count : 0;

	if (count >= limit) {
		const retryAfter = Math.max(resetAt - nowSeconds, 1);
		const headers = rateLimitHeaders(limit, 0, resetAt);
		headers.set("Retry-After", String(retryAfter));
		throw new ClientAPIError({
			status: 429,
			code: "rate_limit_exceeded",
			message: "Too many delegated API requests. Try again after the retry interval.",
			headers,
		});
	}

	const nextCount = count + 1;
	await kv.put(
		key,
		JSON.stringify({ count: nextCount, resetAt } satisfies ClientAPIRateLimitState),
		{
			expirationTtl: CLIENT_API_RATE_LIMIT_WINDOW_SECONDS * 2,
		},
	);
	const remaining = limit - nextCount;
	return {
		limit,
		remaining,
		resetAt,
		headers: rateLimitHeaders(limit, remaining, resetAt),
	};
}
