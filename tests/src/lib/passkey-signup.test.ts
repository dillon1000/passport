import { describe, expect, it } from "vitest";

import { createPasskeySignupContext, parsePasskeySignupContext } from "./passkey-signup";

describe("passkey sign-up context", () => {
	it("round-trips normalized account details", () => {
		const context = createPasskeySignupContext({
			name: "  Ada Lovelace  ",
			email: "ADA@EXAMPLE.COM",
			username: "Ada.L",
			callbackURL: "/account?created=1",
		});

		expect(parsePasskeySignupContext(context)).toEqual({
			name: "Ada Lovelace",
			email: "ada@example.com",
			username: "Ada.L",
			callbackURL: "/account?created=1",
		});
	});

	it("rejects malformed and external callback contexts", () => {
		expect(parsePasskeySignupContext("not-base64-json")).toBeNull();
		expect(() =>
			createPasskeySignupContext({
				name: "Ada",
				email: "ada@example.com",
				username: "ada",
				callbackURL: "https://example.com",
			}),
		).toThrow();
	});

	it("rejects usernames that the server username plugin cannot accept", () => {
		expect(() =>
			createPasskeySignupContext({
				name: "Ada Lovelace",
				email: "ada@example.com",
				username: "Ada Lovelace",
				callbackURL: "/account",
			}),
		).toThrow();
	});
});
