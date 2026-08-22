/**
 * Better Auth secondary storage adapter. New values use sharded Durable Objects
 * for strong consistency and atomic operations. The old KV namespace remains a
 * read/delete fallback until values written before this migration expire.
 */
import type { BetterAuthOptions } from "better-auth/minimal";

export const AUTH_SECONDARY_STORAGE_KEY_PREFIX = "passport:auth:";
export const AUTH_SECONDARY_STORAGE_SHARD_COUNT = 256;

type SecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;

type LegacyKVSecondaryStorageNamespace = {
	get: (key: string) => Promise<string | null>;
	delete: (key: string) => Promise<void>;
};

type AuthSecondaryStorageStub = {
	getValue: (key: string) => Promise<string | null>;
	setValue: (key: string, value: string, ttl?: number) => Promise<void>;
	deleteValue: (key: string) => Promise<void>;
	getAndDeleteValue: (key: string) => Promise<string | null>;
	incrementValue: (key: string, ttl: number) => Promise<number>;
};

type AuthSecondaryStorageNamespace = {
	getByName: (name: string) => AuthSecondaryStorageStub;
};

function prefixedKey(key: string) {
	return `${AUTH_SECONDARY_STORAGE_KEY_PREFIX}${key}`;
}

function shardName(key: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < key.length; index += 1) {
		hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
	}
	return `auth-storage-${((hash >>> 0) % AUTH_SECONDARY_STORAGE_SHARD_COUNT).toString(16).padStart(2, "0")}`;
}

export function createAuthSecondaryStorage(
	namespace: AuthSecondaryStorageNamespace,
	legacyKV: LegacyKVSecondaryStorageNamespace,
): SecondaryStorage {
	const stubFor = (key: string) => namespace.getByName(shardName(key));

	return {
		get: async (key) => {
			const value = await stubFor(key).getValue(key);
			return value ?? legacyKV.get(prefixedKey(key));
		},
		set: async (key, value, ttl) => {
			await Promise.all([
				stubFor(key).setValue(key, value, ttl),
				legacyKV.delete(prefixedKey(key)),
			]);
		},
		delete: async (key) => {
			await Promise.all([
				stubFor(key).deleteValue(key),
				legacyKV.delete(prefixedKey(key)),
			]);
		},
		getAndDelete: async (key) => {
			const value = await stubFor(key).getAndDeleteValue(key);
			if (value !== null) return value;

			// Legacy KV values are transitional and cannot provide an atomic read-delete.
			const legacyValue = await legacyKV.get(prefixedKey(key));
			await legacyKV.delete(prefixedKey(key));
			return legacyValue;
		},
		increment: async (key, ttl) => stubFor(key).incrementValue(key, ttl),
	};
}
