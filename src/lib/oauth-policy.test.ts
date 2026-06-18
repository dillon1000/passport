import { describe, expect, it } from "vitest";

import { buildOAuthPolicyClaims, permissionsFromRoleValue } from "./oauth-policy";

describe("OAuth policy builder", () => {
	it("keeps unaffiliated policy output minimal", () => {
		expect(buildOAuthPolicyClaims({ memberships: [], rolePermissions: [] })).toEqual({
			roles: ["authenticated"],
			permissions: [],
			entitlements: [],
		});
	});

	it("converts memberships and role permissions into tenant-scoped strings", () => {
		expect(
			buildOAuthPolicyClaims({
				memberships: [{ id: "org_1", role: "admin" }],
				rolePermissions: [
					{
						organizationId: "org_1",
						role: "admin",
						permission: JSON.stringify({ project: ["create", "update"] }),
					},
				],
			}),
		).toEqual({
			roles: ["authenticated", "organization:org_1:admin"],
			permissions: [
				"organization:org_1:project:create",
				"organization:org_1:project:update",
			],
			entitlements: [],
		});
	});

	it("ignores permissions for organizations and roles the user does not hold", () => {
		expect(
			buildOAuthPolicyClaims({
				memberships: [{ id: "org_1", role: "member" }],
				rolePermissions: [
					{ organizationId: "org_1", role: "admin", permission: "admin:read" },
					{ organizationId: "org_2", role: "member", permission: "project:read" },
				],
			}),
		).toEqual({
			roles: ["authenticated", "organization:org_1:member"],
			permissions: [],
			entitlements: [],
		});
	});

	it("deduplicates comma-separated memberships and JSON array permissions", () => {
		expect(
			buildOAuthPolicyClaims({
				memberships: [{ id: "org_1", role: "admin, admin, member" }],
				rolePermissions: [
					{
						organizationId: "org_1",
						role: "admin",
						permission: JSON.stringify(["project:read", "project:read"]),
					},
					{ organizationId: "org_1", role: "member", permission: "project:read" },
				],
			}),
		).toEqual({
			roles: [
				"authenticated",
				"organization:org_1:admin",
				"organization:org_1:member",
			],
			permissions: ["organization:org_1:project:read"],
			entitlements: [],
		});
	});

	it("parses supported permission storage formats", () => {
		expect(permissionsFromRoleValue("project:read")).toEqual(["project:read"]);
		expect(permissionsFromRoleValue('["project:read","project:update"]')).toEqual([
			"project:read",
			"project:update",
		]);
		expect(permissionsFromRoleValue('{"project":["read","update"]}')).toEqual([
			"project:read",
			"project:update",
		]);
	});
});
