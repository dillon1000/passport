import { describe, expect, it } from "vitest";

import {
	canReactivateAgentStatus,
	canRevokeAgentStatus,
	canRevokeGrantStatus,
	parseCapabilityList,
} from "./agent-auth";

describe("agent auth helpers", () => {
	it("parses comma and whitespace separated capability lists", () => {
		expect(parseCapabilityList(" get_service_metadata,read_sessions  write_profile ")).toEqual([
			"get_service_metadata",
			"read_sessions",
			"write_profile",
		]);
		expect(parseCapabilityList("   ")).toEqual([]);
	});

	it("offers revoke controls only for live agent states", () => {
		expect(canRevokeAgentStatus("active")).toBe(true);
		expect(canRevokeAgentStatus("pending")).toBe(true);
		expect(canRevokeAgentStatus("expired")).toBe(false);
		expect(canRevokeAgentStatus("revoked")).toBe(false);
	});

	it("offers reactivate controls only for expired agents", () => {
		expect(canReactivateAgentStatus("expired")).toBe(true);
		expect(canReactivateAgentStatus("active")).toBe(false);
	});

	it("offers grant revocation for active or pending grants", () => {
		expect(canRevokeGrantStatus("active")).toBe(true);
		expect(canRevokeGrantStatus("granted")).toBe(true);
		expect(canRevokeGrantStatus("pending")).toBe(true);
		expect(canRevokeGrantStatus("revoked")).toBe(false);
	});
});
