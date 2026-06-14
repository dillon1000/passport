import { describe, expect, it } from "vitest";

import { dashboardNav } from "./lib/nav";
import { appRoutes } from "./routes";

describe("appRoutes", () => {
	it("declares the dashboard and auth entry routes", () => {
		expect(appRoutes.map((route) => route.path)).toEqual([
			"/",
			"/sign-in",
			"/account",
			"/security",
			"/sessions",
			"/organizations",
			"/applications",
			"/agents",
			"/agent/approve",
			"/two-factor",
			"/consent",
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
		]);
	});
});
