import { describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
	it("reports unavailable clipboard support", async () => {
		await expect(copyTextToClipboard("user_123", undefined)).resolves.toEqual({
			ok: false,
			message: "Clipboard is not available in this browser.",
		});
	});

	it("reports rejected clipboard writes", async () => {
		const clipboard = {
			writeText: vi.fn().mockRejectedValue(new Error("denied")),
		};

		await expect(copyTextToClipboard("secret", clipboard)).resolves.toEqual({
			ok: false,
			message: "Could not copy to clipboard.",
		});
	});

	it("reports successful clipboard writes", async () => {
		const clipboard = {
			writeText: vi.fn().mockResolvedValue(undefined),
		};

		await expect(copyTextToClipboard("client_123", clipboard)).resolves.toEqual({
			ok: true,
		});
		expect(clipboard.writeText).toHaveBeenCalledWith("client_123");
	});
});
