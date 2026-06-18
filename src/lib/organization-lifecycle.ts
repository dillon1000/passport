/**
 * Organization lifecycle UI policy helpers. Inputs come from Better Auth's
 * organization/member rows and the current session user; outputs are local UI
 * eligibility decisions only. Better Auth remains the enforcement boundary.
 */
export const ORGANIZATION_ROLES = ["member", "admin", "owner"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export function canChangeOrganizationRole(role: string): role is OrganizationRole {
	return ORGANIZATION_ROLES.includes(role as OrganizationRole);
}

export function canRemoveOrganizationMember(input: {
	currentUserId?: string | null;
	memberUserId: string;
	memberRole: string;
	ownerCount: number;
}) {
	if (input.currentUserId && input.currentUserId === input.memberUserId) return false;
	if (input.memberRole === "owner" && input.ownerCount <= 1) return false;
	return true;
}

export function canOfferMemberForTeam(input: {
	memberUserId: string;
	teamMemberUserIds: readonly string[];
}) {
	return !input.teamMemberUserIds.includes(input.memberUserId);
}

export function canRemoveTeamMember(input: {
	memberUserId: string;
	teamMemberUserIds: readonly string[];
}) {
	return input.teamMemberUserIds.includes(input.memberUserId);
}
