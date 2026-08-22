import { describe, expect, it, vi } from "vitest";

import {
	AUTH_SECONDARY_STORAGE_KEY_PREFIX,
	createAuthSecondaryStorage,
} from "./kv-secondary-storage";

function createStorageMocks() {
	const stub = {
		getValue: vi.fn<(_: string) => Promise<string | null>>(),
		setValue: vi.fn<(_: string, __: string, ___?: number) => Promise<void>>(),
		deleteValue: vi.fn<(_: string) => Promise<void>>(),
		getAndDeleteValue: vi.fn<(_: string) => Promise<string | null>>(),
		incrementValue: vi.fn<(_: string, __: number) => Promise<number>>(),
	};
	const namespace = {
		getByName: vi.fn(() => stub),
	};
	const legacyKV = {
		get: vi.fn<(_: string) => Promise<string | null>>(),
		delete: vi.fn<(_: string) => Promise<void>>(),
	};
	return { stub, namespace, legacyKV };
}

describe("createAuthSecondaryStorage", () => {
	it("reads new values from a deterministic Durable Object shard", async () => {
		const { stub, namespace, legacyKV } = createStorageMocks();
		stub.getValue.mockResolvedValue("stored-value");
		const storage = createAuthSecondaryStorage(namespace, legacyKV);

		await expect(storage.get("session:abc")).resolves.toBe("stored-value");

		expect(namespace.getByName).toHaveBeenCalledWith(expect.stringMatching(/^auth-storage-[0-9a-f]{2}$/));
		expect(stub.getValue).toHaveBeenCalledWith("session:abc");
		expect(legacyKV.get).not.toHaveBeenCalled();
	});

	it("falls back to prefixed KV values written before the migration", async () => {
		const { stub, namespace, legacyKV } = createStorageMocks();
		stub.getValue.mockResolvedValue(null);
		legacyKV.get.mockResolvedValue("legacy-value");
		const storage = createAuthSecondaryStorage(namespace, legacyKV);

		await expect(storage.get("session:abc")).resolves.toBe("legacy-value");

		expect(legacyKV.get).toHaveBeenCalledWith(
			`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}session:abc`,
		);
	});

	it("writes through the coordinator and removes the legacy value", async () => {
		const { stub, namespace, legacyKV } = createStorageMocks();
		const storage = createAuthSecondaryStorage(namespace, legacyKV);

		await storage.set("verification:abc", "payload", 90);

		expect(stub.setValue).toHaveBeenCalledWith("verification:abc", "payload", 90);
		expect(legacyKV.delete).toHaveBeenCalledWith(
			`${AUTH_SECONDARY_STORAGE_KEY_PREFIX}verification:abc`,
		);
	});

	it("delegates atomic consume and increment operations", async () => {
		const { stub, namespace, legacyKV } = createStorageMocks();
		stub.getAndDeleteValue.mockResolvedValue("single-use-value");
		stub.incrementValue.mockResolvedValue(2);
		const storage = createAuthSecondaryStorage(namespace, legacyKV);

		await expect(storage.getAndDelete("verification:abc")).resolves.toBe("single-use-value");
		await expect(storage.increment("rate-limit:abc", 60)).resolves.toBe(2);

		expect(stub.getAndDeleteValue).toHaveBeenCalledWith("verification:abc");
		expect(stub.incrementValue).toHaveBeenCalledWith("rate-limit:abc", 60);
	});
});
