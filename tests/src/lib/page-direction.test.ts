import { describe, expect, it } from "vitest";

import { navRank } from "@/lib/nav";
import { resolvePageDirection } from "@/lib/page-direction";

describe("navRank", () => {
	it("ranks pages by their order in the tab strip", () => {
		expect(navRank("/account")?.[0]).toBe(0);
		expect(navRank("/billing")?.[0]).toBe(1);
		expect(navRank("/settings")?.[0]).toBeGreaterThan(navRank("/agents")![0]);
	});

	it("ranks billing sub-pages by the sub-tab strip", () => {
		expect(navRank("/billing")).toEqual([1, 0]);
		expect(navRank("/billing/plans")).toEqual([1, 1]);
		expect(navRank("/billing/purchases")).toEqual([1, 2]);
	});

	it("has no rank for paths outside the strips", () => {
		expect(navRank("/sign-in")).toBeNull();
		expect(navRank("/consent")).toBeNull();
	});
});

describe("resolvePageDirection", () => {
	it("swipes forward when moving right along the tabs", () => {
		expect(resolvePageDirection("/account", "/security", false)).toBe("forward");
		expect(resolvePageDirection("/billing", "/billing/plans", false)).toBe("forward");
	});

	it("swipes backward when moving left along the tabs", () => {
		expect(resolvePageDirection("/settings", "/account", false)).toBe("backward");
		expect(resolvePageDirection("/billing/purchases", "/billing", false)).toBe("backward");
	});

	it("follows the tabs rather than the history action", () => {
		// Browser back onto an earlier tab still reads as going back...
		expect(resolvePageDirection("/security", "/account", true)).toBe("backward");
		// ...and back onto a later tab reads as going forward.
		expect(resolvePageDirection("/account", "/security", true)).toBe("forward");
	});

	it("falls back to the history action outside the tab strips", () => {
		expect(resolvePageDirection("/sign-in", "/two-factor", false)).toBe("forward");
		expect(resolvePageDirection("/two-factor", "/sign-in", true)).toBe("backward");
		expect(resolvePageDirection("/account", "/consent", false)).toBe("forward");
	});

	it("does not swipe when the page has not changed", () => {
		expect(resolvePageDirection("/account", "/account", false)).toBe("none");
	});
});
