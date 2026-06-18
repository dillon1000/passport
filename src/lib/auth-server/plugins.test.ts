import { describe, expect, it } from "vitest";

import { createCliAuthEnv } from "./env";
import {
	buildAuthPlugins,
	MULTI_SESSION_MAXIMUM_SESSIONS,
} from "./plugins";
import type { AuthDatabase } from "./types";

type AuthPlugin = ReturnType<typeof buildAuthPlugins>[number];
type MultiSessionPlugin = AuthPlugin & {
	id: "multi-session";
	options: {
		maximumSessions: number;
	};
	endpoints: Record<string, unknown>;
};

function isMultiSessionPlugin(plugin: AuthPlugin): plugin is MultiSessionPlugin {
	return plugin.id === "multi-session";
}

describe("buildAuthPlugins", () => {
	it("enables Better Auth multi-session endpoints with the documented device limit", () => {
		const plugins = buildAuthPlugins(createCliAuthEnv(), {} as AuthDatabase);
		const plugin = plugins.find(isMultiSessionPlugin);

		expect(MULTI_SESSION_MAXIMUM_SESSIONS).toBe(5);
		expect(plugin).toBeDefined();
		expect(plugin?.options.maximumSessions).toBe(MULTI_SESSION_MAXIMUM_SESSIONS);
		expect(Object.keys(plugin?.endpoints ?? {})).toEqual(
			expect.arrayContaining([
				"listDeviceSessions",
				"setActiveSession",
				"revokeDeviceSession",
			]),
		);
	});
});
