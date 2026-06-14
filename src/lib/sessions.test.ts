import { describe, expect, it } from "vitest";

import { describeSession, isCurrentSession } from "./sessions";

describe("session display helpers", () => {
	it("marks a listed session as current when tokens match", () => {
		expect(isCurrentSession({ token: "current-token" }, "current-token")).toBe(true);
		expect(isCurrentSession({ token: "other-token" }, "current-token")).toBe(false);
	});

	it("builds a concise session description from available metadata", () => {
		expect(
			describeSession({
				ipAddress: "203.0.113.10",
				userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
			}),
		).toBe("Macintosh from 203.0.113.10");
	});

	it("falls back when metadata is missing", () => {
		expect(describeSession({})).toBe("Unknown device");
	});
});
