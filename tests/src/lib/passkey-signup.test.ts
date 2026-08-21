import { describe, expect, it } from "vitest";

import {
	createPasskeySignupContext,
	parsePasskeySignupContext,
} from "./passkey-signup";

describe("passkey sign-up context", () => {
	it("round-trips normalized account details", () => {
		const context = createPasskeySignupContext({
			name: "  Ada Lovelace  ",
			email: "ADA@EXAMPLE.COM",
			callbackURL: "/account?created=1",
		});

		expect(parsePasskeySignupContext(context)).toEqual({
			name: "Ada Lovelace",
			email: "ada@example.com",
			callbackURL: "/account?created=1",
		});
	});

	it("rejects malformed and external callback contexts", () => {
		expect(parsePasskeySignupContext("not-base64-json")).toBeNull();
		expect(() =>
			createPasskeySignupContext({
				name: "Ada",
				email: "ada@example.com",
				callbackURL: "https://example.com",
			}),
		).toThrow();
	});
});
