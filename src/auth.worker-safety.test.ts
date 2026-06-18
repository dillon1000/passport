/**
 * Worker module-safety regression: Cloudflare validates Worker modules before a
 * request exists and rejects timers at top level. Importing auth must remain
 * synchronous and side-effect-light; request-scoped auth construction can still
 * allocate plugin internals later inside handlers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth module Worker safety", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("does not create timers during module import", async () => {
		vi.resetModules();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(() => {
			throw new Error("setInterval called during module import");
		});

		await expect(import("./auth")).resolves.toHaveProperty("auth");
		expect(setIntervalSpy).not.toHaveBeenCalled();
	});
});
