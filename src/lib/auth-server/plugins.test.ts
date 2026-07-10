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
type StripePlugin = AuthPlugin & {
	id: "stripe";
	endpoints: Record<string, unknown>;
};

function isMultiSessionPlugin(plugin: AuthPlugin): plugin is MultiSessionPlugin {
	return plugin.id === "multi-session";
}

function isStripePlugin(plugin: AuthPlugin): plugin is StripePlugin {
	return plugin.id === "stripe";
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

	it("enables the Better Auth Stripe plugin when Stripe billing env is configured", () => {
		const plugins = buildAuthPlugins(
			createCliAuthEnv({
				STRIPE_SECRET_KEY: "sk_test_123",
				STRIPE_WEBHOOK_SECRET: "whsec_123",
				STRIPE_BILLING_PLANS: JSON.stringify([
					{
						name: "pro",
						priceId: "price_pro_month",
					},
				]),
			}),
			{} as AuthDatabase,
		);
		const plugin = plugins.find(isStripePlugin);

		expect(plugin).toBeDefined();
		expect(Object.keys(plugin?.endpoints ?? {})).toEqual(
			expect.arrayContaining([
				"stripeWebhook",
				"upgradeSubscription",
				"cancelSubscription",
				"restoreSubscription",
				"listActiveSubscriptions",
				"createBillingPortal",
			]),
		);
	});

	it("does not enable Stripe when secrets are absent", () => {
		const plugins = buildAuthPlugins(createCliAuthEnv(), {} as AuthDatabase);

		expect(plugins.some((plugin) => plugin.id === "stripe")).toBe(false);
	});
});
