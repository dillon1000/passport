import { describe, expect, it, vi } from "vitest";

import {
	AUTH_SECONDARY_STORAGE_KEY_PREFIX,
	MIN_KV_EXPIRATION_TTL_SECONDS,
	createKVSecondaryStorage,
} from "./kv-secondary-storage";

function createKVMock() {
	return {
		get: vi.fn<(_: string) => Promise<string | null>>(),
		put: vi.fn<
			(
				_: string,
				__: string,
				___?: {
					expirationTtl?: number;
				},
			) => Promise<void>
		>(),
		delete: vi.fn<(_: string) => Promise<void>>(),
	};
}

describe("createKVSecondaryStorage", () => {
	it("reads Better Auth values from prefixed KV keys", async () => {
		const kv = createKVMock();
		kv.get.mockResolvedValue("stored-value");
		const storage = createKVSecondaryStorage(kv);

		await expect(storage.get("session:abc")).resolves.toBe("stored-value");

		expect(kv.get).toHaveBeenCalledWith(`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}session:abc`);
	});

	it("writes values without expiration when Better Auth does not provide a ttl", async () => {
		const kv = createKVMock();
		const storage = createKVSecondaryStorage(kv);

		await storage.set("verification:abc", "payload");

		expect(kv.put).toHaveBeenCalledWith(
			`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}verification:abc`,
			"payload",
		);
	});

	it("clamps ttl values to Cloudflare KV's minimum expiration ttl", async () => {
		const kv = createKVMock();
		const storage = createKVSecondaryStorage(kv);

		await storage.set("rate-limit:abc", "1", 10);

		expect(kv.put).toHaveBeenCalledWith(
			`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}rate-limit:abc`,
			"1",
			{ expirationTtl: MIN_KV_EXPIRATION_TTL_SECONDS },
		);
	});

	it("deletes prefixed KV keys", async () => {
		const kv = createKVMock();
		const storage = createKVSecondaryStorage(kv);

		await storage.delete("session:abc");

		expect(kv.delete).toHaveBeenCalledWith(
			`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}session:abc`,
		);
	});
});
