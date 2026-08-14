/** Shared Better Auth/delegated organization role-policy tests. */
import { describe, expect, it } from "vitest";

import { hasOrganizationPermissionFromRoleRows } from "./organization-access";

describe("organization access policy", () => {
	it("preserves owner, admin, and member mutation boundaries", () => {
		expect(
			hasOrganizationPermissionFromRoleRows("owner", { resource: "organization", action: "delete" }, []),
		).toBe(true);
		expect(
			hasOrganizationPermissionFromRoleRows("admin", { resource: "organization", action: "delete" }, []),
		).toBe(false);
		expect(
			hasOrganizationPermissionFromRoleRows("admin", { resource: "team", action: "create" }, []),
		).toBe(true);
		expect(
			hasOrganizationPermissionFromRoleRows("member", { resource: "team", action: "create" }, []),
		).toBe(false);
	});

	it("evaluates current dynamic-role permissions and comma-separated roles", () => {
		const roles = [{ role: "developer", permission: JSON.stringify({ team: ["create"] }) }];
		expect(
			hasOrganizationPermissionFromRoleRows(
				"member,developer",
				{ resource: "team", action: "create" },
				roles,
			),
		).toBe(true);
		expect(
			hasOrganizationPermissionFromRoleRows(
				"developer",
				{ resource: "member", action: "delete" },
				roles,
			),
		).toBe(false);
	});

	it("denies malformed dynamic permission JSON", () => {
		expect(
			hasOrganizationPermissionFromRoleRows(
				"developer",
				{ resource: "team", action: "create" },
				[{ role: "developer", permission: "not json" }],
			),
		).toBe(false);
	});
});
