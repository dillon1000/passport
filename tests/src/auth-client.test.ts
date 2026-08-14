import { describe, expect, it } from "vitest";

import { authClient } from "./auth-client";

describe("authClient", () => {
	it("exposes Better Auth multi-session client methods", () => {
		expect(authClient.multiSession.listDeviceSessions).toBeTypeOf("function");
		expect(authClient.multiSession.setActive).toBeTypeOf("function");
		expect(authClient.multiSession.revoke).toBeTypeOf("function");
	});

	it("exposes Better Auth Stripe subscription client methods", () => {
		expect(authClient.subscription.upgrade).toBeTypeOf("function");
		expect(authClient.subscription.list).toBeTypeOf("function");
		expect(authClient.subscription.cancel).toBeTypeOf("function");
		expect(authClient.subscription.restore).toBeTypeOf("function");
		expect(authClient.subscription.billingPortal).toBeTypeOf("function");
	});
});
