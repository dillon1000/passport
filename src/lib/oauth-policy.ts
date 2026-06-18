/**
 * OAuth policy claim builder. Inputs are authenticated organization
 * memberships plus Better Auth dynamic role permission rows; outputs are
 * tenant-scoped role, permission, and entitlement strings for OAuth claims.
 * Safe configuration point: update the string prefixes here if downstream
 * policy consumers need a versioned claim format.
 */
export type PolicyOrganizationMembership = {
	id: string;
	role: string;
};

export type PolicyRolePermission = {
	organizationId: string;
	role: string;
	permission: string;
};

export type OAuthPolicyOutput = {
	roles: string[];
	permissions: string[];
	entitlements: string[];
};

type PermissionObject = Record<string, string[]>;

function uniqueSorted(values: string[]) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function roleNames(value: string) {
	return value
		.split(",")
		.map((role) => role.trim())
		.filter(Boolean);
}

function isPermissionObject(value: unknown): value is PermissionObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.values(value).every(
		(actions) =>
			Array.isArray(actions) && actions.every((action) => typeof action === "string"),
	);
}

export function permissionsFromRoleValue(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return [];

	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (Array.isArray(parsed)) {
			return parsed.filter((permission): permission is string => typeof permission === "string");
		}
		if (isPermissionObject(parsed)) {
			return Object.entries(parsed).flatMap(([resource, actions]) =>
				actions.map((action) => `${resource}:${action}`),
			);
		}
	} catch {
		return [trimmed];
	}

	return [trimmed];
}

export function buildOAuthPolicyClaims(input: {
	memberships: PolicyOrganizationMembership[];
	rolePermissions: PolicyRolePermission[];
}): OAuthPolicyOutput {
	const membershipRoles = input.memberships.flatMap((membership) =>
		roleNames(membership.role).map((role) => ({
			organizationId: membership.id,
			role,
		})),
	);
	const membershipKeys = new Set(
		membershipRoles.map((membership) => `${membership.organizationId}:${membership.role}`),
	);
	const roles = [
		"authenticated",
		...membershipRoles.map(
			(membership) => `organization:${membership.organizationId}:${membership.role}`,
		),
	];
	const permissions = input.rolePermissions.flatMap((rolePermission) => {
		if (!membershipKeys.has(`${rolePermission.organizationId}:${rolePermission.role}`)) {
			return [];
		}
		return permissionsFromRoleValue(rolePermission.permission).map(
			(permission) => `organization:${rolePermission.organizationId}:${permission}`,
		);
	});

	return {
		roles: uniqueSorted(roles),
		permissions: uniqueSorted(permissions),
		entitlements: [],
	};
}
