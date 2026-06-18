/**
 * Admin user governance UI helpers. These functions normalize form inputs and
 * gate obvious self-actions in the browser; Better Auth admin endpoints remain
 * the source of truth for authorization and mutation behavior.
 */
export function normalizedUserSearch(value: string) {
	const search = value.trim();
	return search || undefined;
}

export function canMutateUser(input: { currentUserId?: string | null; targetUserId: string }) {
	return !input.currentUserId || input.currentUserId !== input.targetUserId;
}

export type AdminPromotionCheck =
	| { ok: true }
	| { ok: false; reason: "not-found" | "self" | "already-admin" };

export function checkAdminPromotionTarget(input: {
	currentUserId?: string | null;
	targetUser?: { id: string; role?: string | null } | null;
}): AdminPromotionCheck {
	if (!input.targetUser) return { ok: false, reason: "not-found" };
	if (!canMutateUser({ currentUserId: input.currentUserId, targetUserId: input.targetUser.id })) {
		return { ok: false, reason: "self" };
	}
	if (input.targetUser.role === "admin") return { ok: false, reason: "already-admin" };
	return { ok: true };
}

export function banExpiresInSeconds(days: string) {
	const normalized = days.trim();
	if (!normalized) return undefined;
	const value = Number(normalized);
	if (!Number.isInteger(value) || value <= 0) return undefined;
	return value * 24 * 60 * 60;
}
