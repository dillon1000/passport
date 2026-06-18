import { describe, expect, it } from "vitest";

import { dashboardNav, dashboardNavForUser } from "./lib/nav";
import { appRoutes } from "./routes";

describe("appRoutes", () => {
	it("declares the dashboard and auth entry routes", () => {
		expect(appRoutes.map((route) => route.path)).toEqual([
			"/",
			"/sign-in",
			"/account",
			"/security",
			"/sessions",
			"/settings",
			"/organizations",
			"/organization/invitation",
			"/applications",
			"/agents",
			"/agent/approve",
			"/admin/users",
			"/admin/audit",
			"/admin/webhooks",
			"/two-factor",
			"/consent",
			"/auth/error",
			"*",
		]);
	});
});

describe("dashboardNav", () => {
	it("includes organization and agent management tabs", () => {
		expect(dashboardNav.map((item) => item.href)).toEqual([
			"/account",
			"/security",
			"/sessions",
			"/organizations",
			"/applications",
			"/agents",
			"/admin/users",
			"/admin/audit",
			"/admin/webhooks",
			"/settings",
		]);
	});

	it("hides admin-only tabs from non-admin users", () => {
		expect(dashboardNavForUser({ role: "user" }).map((item) => item.href)).toEqual([
			"/account",
			"/security",
			"/sessions",
			"/organizations",
			"/applications",
			"/agents",
			"/settings",
		]);
	});

	it("shows admin-only tabs to admin users", () => {
		expect(dashboardNavForUser({ role: "admin" }).map((item) => item.href)).toEqual([
			"/account",
			"/security",
			"/sessions",
			"/organizations",
			"/applications",
			"/agents",
			"/admin/users",
			"/admin/audit",
			"/admin/webhooks",
			"/settings",
		]);
	});
});
