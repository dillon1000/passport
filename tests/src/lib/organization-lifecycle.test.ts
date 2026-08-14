import { describe, expect, it } from "vitest";

import {
	ORGANIZATION_ROLES,
	canChangeOrganizationRole,
	canOfferMemberForTeam,
	canRemoveOrganizationMember,
	canRemoveTeamMember,
} from "./organization-lifecycle";

describe("organization lifecycle helpers", () => {
	it("keeps organization role changes limited to Better Auth's default roles", () => {
		expect(ORGANIZATION_ROLES).toEqual(["member", "admin", "owner"]);
		expect(canChangeOrganizationRole("member")).toBe(true);
		expect(canChangeOrganizationRole("billing")).toBe(false);
	});

	it("does not offer current-user removal from an organization row", () => {
		expect(
			canRemoveOrganizationMember({
				currentUserId: "user_1",
				memberUserId: "user_1",
				memberRole: "admin",
				ownerCount: 2,
			}),
		).toBe(false);
	});

	it("does not offer removal for the last remaining owner", () => {
		expect(
			canRemoveOrganizationMember({
				currentUserId: "user_1",
				memberUserId: "user_2",
				memberRole: "owner",
				ownerCount: 1,
			}),
		).toBe(false);
	});

	it("offers removal for other members when owner safety is preserved", () => {
		expect(
			canRemoveOrganizationMember({
				currentUserId: "user_1",
				memberUserId: "user_2",
				memberRole: "member",
				ownerCount: 1,
			}),
		).toBe(true);
	});

	it("only offers organization members who are not already on a team", () => {
		expect(
			canOfferMemberForTeam({
				memberUserId: "user_2",
				teamMemberUserIds: ["user_1"],
			}),
		).toBe(true);
		expect(
			canOfferMemberForTeam({
				memberUserId: "user_1",
				teamMemberUserIds: ["user_1"],
			}),
		).toBe(false);
	});

	it("only offers team removal for assigned team members", () => {
		expect(
			canRemoveTeamMember({
				memberUserId: "user_1",
				teamMemberUserIds: ["user_1"],
			}),
		).toBe(true);
		expect(
			canRemoveTeamMember({
				memberUserId: "user_2",
				teamMemberUserIds: ["user_1"],
			}),
		).toBe(false);
	});
});
