import { describe, expect, it } from "vitest";

import {
	banExpiresInSeconds,
	canMutateUser,
	checkAdminPromotionTarget,
	normalizedUserSearch,
} from "./admin-users";

describe("admin user helpers", () => {
	it("normalizes blank search input to an omitted query value", () => {
		expect(normalizedUserSearch("  alice@example.com  ")).toBe("alice@example.com");
		expect(normalizedUserSearch("   ")).toBeUndefined();
	});

	it("guards obvious self-actions in the admin UI", () => {
		expect(canMutateUser({ currentUserId: "user_1", targetUserId: "user_1" })).toBe(false);
		expect(canMutateUser({ currentUserId: "user_1", targetUserId: "user_2" })).toBe(true);
	});

	it("classifies direct admin promotion targets", () => {
		expect(checkAdminPromotionTarget({ currentUserId: "admin_1", targetUser: null })).toEqual({
			ok: false,
			reason: "not-found",
		});
		expect(
			checkAdminPromotionTarget({
				currentUserId: "admin_1",
				targetUser: { id: "admin_1", role: "user" },
			}),
		).toEqual({ ok: false, reason: "self" });
		expect(
			checkAdminPromotionTarget({
				currentUserId: "admin_1",
				targetUser: { id: "user_2", role: "admin" },
			}),
		).toEqual({ ok: false, reason: "already-admin" });
		expect(
			checkAdminPromotionTarget({
				currentUserId: "admin_1",
				targetUser: { id: "user_2", role: "user" },
			}),
		).toEqual({ ok: true });
	});

	it("converts whole-day ban durations to seconds for Better Auth", () => {
		expect(banExpiresInSeconds("7")).toBe(604800);
		expect(banExpiresInSeconds("0")).toBeUndefined();
		expect(banExpiresInSeconds("abc")).toBeUndefined();
		expect(banExpiresInSeconds("")).toBeUndefined();
	});
});
