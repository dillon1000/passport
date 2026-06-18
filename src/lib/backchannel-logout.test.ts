import { describe, expect, it } from "vitest";

import {
	BACKCHANNEL_LOGOUT_EVENT,
	backchannelLogoutIssuer,
	buildLogoutTokenClaims,
	LOGOUT_TOKEN_TTL_SECONDS,
} from "./backchannel-logout";

describe("backchannel logout issuer", () => {
	it("matches the id_token issuer (origin + /api/auth basePath)", () => {
		expect(backchannelLogoutIssuer("https://passport.test")).toBe(
			"https://passport.test/api/auth",
		);
		expect(backchannelLogoutIssuer("https://passport.test/")).toBe(
			"https://passport.test/api/auth",
		);
	});
});

describe("logout token claims", () => {
	it("builds spec-correct claims with the back-channel event and no nonce", () => {
		const claims = buildLogoutTokenClaims({
			issuer: "https://passport.test/api/auth",
			audience: "client_123",
			subject: "user_123",
		});
		expect(claims.iss).toBe("https://passport.test/api/auth");
		expect(claims.aud).toBe("client_123");
		expect(claims.sub).toBe("user_123");
		expect(claims.events).toEqual({ [BACKCHANNEL_LOGOUT_EVENT]: {} });
		expect(claims).not.toHaveProperty("nonce");
		expect(typeof claims.jti).toBe("string");
		expect(claims.sid).toBeUndefined();
		expect((claims.exp as number) - (claims.iat as number)).toBe(LOGOUT_TOKEN_TTL_SECONDS);
	});

	it("includes sid when a session id is supplied", () => {
		const claims = buildLogoutTokenClaims({
			issuer: "https://passport.test/api/auth",
			audience: "client_123",
			subject: "user_123",
			sessionId: "sess_1",
		});
		expect(claims.sid).toBe("sess_1");
	});
});
