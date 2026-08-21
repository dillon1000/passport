import { describe, expect, it, vi } from "vitest";

import { checkPwnedPassword } from "./pwned-passwords";

describe("pwned password range lookup", () => {
	it("sends only the hash prefix and matches the suffix locally", async () => {
		const password = "password";
		const fetcher = vi.fn(async () =>
			new Response(
				"1E4C9B93F3F0682250B6CF8331B7EE68FD8:3303003\r\n00000000000000000000000000000000000:0",
			),
		);

		await expect(checkPwnedPassword(password, fetcher)).resolves.toBe(3_303_003);
		expect(fetcher).toHaveBeenCalledWith(
			"https://api.pwnedpasswords.com/range/5BAA6",
			{ headers: { "Add-Padding": "true" } },
		);
		expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
	});

	it("returns zero when the suffix is absent", async () => {
		const fetcher = vi.fn(async () => new Response("00000000000000000000000000000000000:0"));
		await expect(checkPwnedPassword("unique passphrase", fetcher)).resolves.toBe(0);
	});
});
