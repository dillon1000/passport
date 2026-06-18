/**
 * Better Auth secondary storage adapter for Cloudflare Workers KV. Better Auth
 * provides short-lived auth keys and optional TTLs; this adapter prefixes those
 * keys inside the bound namespace and maps TTLs to KV's `expirationTtl` option.
 * Safe configuration points are the KV binding passed in and the key prefix
 * below, which can be changed to isolate a future migration inside the same KV
 * namespace.
 */
import type { BetterAuthOptions } from "better-auth/minimal";

export const AUTH_SECONDARY_STORAGE_KEY_PREFIX = "passport:auth:";
export const MIN_KV_EXPIRATION_TTL_SECONDS = 60;

type SecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;

type KVSecondaryStorageNamespace = {
	get: (key: string) => Promise<string | null>;
	put: (
		key: string,
		value: string,
		options?: {
			expirationTtl?: number;
		},
	) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

function prefixedKey(key: string) {
	return `${AUTH_SECONDARY_STORAGE_KEY_PREFIX}${key}`;
}

function expirationOptions(ttl: number | undefined) {
	if (ttl === undefined) return undefined;
	const expirationTtl = Math.max(
		MIN_KV_EXPIRATION_TTL_SECONDS,
		Math.ceil(ttl),
	);
	return { expirationTtl };
}

export function createKVSecondaryStorage(
	kv: KVSecondaryStorageNamespace,
): SecondaryStorage {
	return {
		get: async (key) => kv.get(prefixedKey(key)),
		set: async (key, value, ttl) => {
			const options = expirationOptions(ttl);
			if (options) {
				await kv.put(prefixedKey(key), value, options);
				return;
			}
			await kv.put(prefixedKey(key), value);
		},
		delete: async (key) => {
			await kv.delete(prefixedKey(key));
		},
	};
}
