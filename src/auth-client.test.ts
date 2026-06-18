import { describe, expect, it } from "vitest";

import { authClient } from "./auth-client";

describe("authClient", () => {
	it("exposes Better Auth multi-session client methods", () => {
		expect(authClient.multiSession.listDeviceSessions).toBeTypeOf("function");
		expect(authClient.multiSession.setActive).toBeTypeOf("function");
		expect(authClient.multiSession.revoke).toBeTypeOf("function");
	});
});
