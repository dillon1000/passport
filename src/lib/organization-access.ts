/**
 * Shared organization authorization policy. Better Auth consumes the exported
 * access-control object and roles, while delegated resource services merge the
 * same defaults with live organization-role rows before authorizing mutations.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { and, eq } from "drizzle-orm";

import type { createDb } from "../db/client";
import * as schema from "../db/schema";

export const ORGANIZATION_ACCESS_STATEMENTS = {
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
} as const;

export const organizationAccessControl = createAccessControl(
	ORGANIZATION_ACCESS_STATEMENTS,
);

export const organizationRoles = {
	admin: organizationAccessControl.newRole({
		organization: ["update"],
		invitation: ["create", "cancel"],
		member: ["create", "update", "delete"],
		team: ["create", "update", "delete"],
		ac: ["create", "read", "update", "delete"],
	}),
	owner: organizationAccessControl.newRole({
		organization: ["update", "delete"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		team: ["create", "update", "delete"],
		ac: ["create", "read", "update", "delete"],
	}),
	member: organizationAccessControl.newRole({
		organization: [],
		member: [],
		invitation: [],
		team: [],
		ac: ["read"],
	}),
};

export type OrganizationPermissionResource = keyof typeof ORGANIZATION_ACCESS_STATEMENTS;
export type OrganizationPermission = {
	resource: OrganizationPermissionResource;
	action: string;
};

export type OrganizationDynamicRoleRow = {
	role: string;
	permission: string;
};

type OrganizationAccessDatabase = ReturnType<typeof createDb>;
type DynamicRoleStatements = Record<string, string[]>;

function parseDynamicRoleStatements(value: string): DynamicRoleStatements | null {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		const statements: DynamicRoleStatements = {};
		for (const [resource, actions] of Object.entries(parsed)) {
			if (!Array.isArray(actions) || actions.some((action) => typeof action !== "string")) {
				return null;
			}
			statements[resource] = actions;
		}
		return statements;
	} catch {
		return null;
	}
}

function staticStatements(role: string): DynamicRoleStatements {
	const configuredRole = organizationRoles[role as keyof typeof organizationRoles];
	return configuredRole
		? Object.fromEntries(
				Object.entries(configuredRole.statements).map(([resource, actions]) => [
					resource,
					[...actions],
				]),
			)
		: {};
}

/**
 * Evaluates a member's comma-separated roles against current dynamic role rows.
 * Invalid dynamic permission JSON denies that role rather than granting a
 * partially understood policy.
 */
export async function hasLiveOrganizationPermission(
	db: OrganizationAccessDatabase,
	organizationID: string,
	memberRoles: string,
	permission: OrganizationPermission,
) {
	const dynamicRoles = await db
		.select({
			role: schema.organizationRole.role,
			permission: schema.organizationRole.permission,
		})
		.from(schema.organizationRole)
		.where(eq(schema.organizationRole.organizationId, organizationID));
	return hasOrganizationPermissionFromRoleRows(memberRoles, permission, dynamicRoles);
}

/** Pure evaluator used by live DB checks and policy tests. */
export function hasOrganizationPermissionFromRoleRows(
	memberRoles: string,
	permission: OrganizationPermission,
	dynamicRoles: readonly OrganizationDynamicRoleRow[],
) {
	const roleNames = memberRoles
		.split(",")
		.map((role) => role.trim())
		.filter(Boolean);
	const dynamicByRole = new Map(dynamicRoles.map((role) => [role.role, role.permission]));

	return roleNames.some((roleName) => {
		const statements = staticStatements(roleName);
		const dynamicValue = dynamicByRole.get(roleName);
		if (dynamicValue) {
			const dynamicStatements = parseDynamicRoleStatements(dynamicValue);
			if (!dynamicStatements) return false;
			for (const [resource, actions] of Object.entries(dynamicStatements)) {
				statements[resource] = [...new Set([...(statements[resource] ?? []), ...actions])];
			}
		}
		return statements[permission.resource]?.includes(permission.action) === true;
	});
}

export async function organizationRoleExists(
	db: OrganizationAccessDatabase,
	organizationID: string,
	role: string,
) {
	if (role in organizationRoles) return true;
	const rows = await db
		.select({ id: schema.organizationRole.id })
		.from(schema.organizationRole)
		.where(
			and(
				eq(schema.organizationRole.organizationId, organizationID),
				eq(schema.organizationRole.role, role),
			),
		)
		.limit(1);
	return rows.length > 0;
}
