/**
 * Actor-aware domain services for Passport's delegated resource API. Inputs
 * always include the OAuth subject and calling client; outputs are safe profile,
 * organization, invitation, member, and team DTOs. Every tenant mutation loads
 * current membership and dynamic-role permissions, while transactions preserve
 * Better Auth's limits, ownership rules, nested-resource boundaries, and stale
 * session cleanup without translating bearer tokens into browser sessions.
 */
import { and, count, eq, inArray, or } from "drizzle-orm";

import type { createDb } from "../db/client";
import * as schema from "../db/schema";
import {
	delegatedBadRequest,
	delegatedConflict,
	delegatedForbidden,
	delegatedNotFound,
	DelegatedResourceError,
} from "./delegated-resource-errors";
import {
	hasLiveOrganizationPermission,
	organizationRoleExists,
	type OrganizationPermission,
} from "./organization-access";
import type { PassportImageAssetService } from "./passport-image-assets";

const ORGANIZATION_LIMIT = 10;
const ORGANIZATION_MEMBER_LIMIT = 100;
const ORGANIZATION_INVITATION_LIMIT = 100;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const TEAM_LIMIT = 25;
const TEAM_MEMBER_LIMIT = 100;

type DelegatedDatabase = ReturnType<typeof createDb>;
type DelegatedTransaction = Parameters<
	Parameters<DelegatedDatabase["transaction"]>[0]
>[0];
type DelegatedDatabaseExecutor = DelegatedDatabase | DelegatedTransaction;

export type DelegatedResourceActor = {
	userID: string;
	clientID: string;
	clientName: string;
};

export type DelegatedMutation = {
	action: string;
	targetType: "profile" | "organization" | "invitation" | "member" | "team";
	targetID?: string;
	organizationID?: string;
	metadata?: Record<string, string | number | boolean | null>;
};

export type DelegatedMutationRecorder = (
	actor: DelegatedResourceActor,
	mutation: DelegatedMutation,
) => void | Promise<void>;

export type DelegatedInvitationDelivery = {
	id: string;
	email: string;
	organizationID: string;
	organizationName: string;
	inviterName: string;
};

type OrganizationMutationInput = {
	name?: string;
	slug?: string;
};

type ProfileMutationInput = {
	name?: string;
	username?: string | null;
};

type InvitationMutationInput = {
	email: string;
	role: string | string[];
	teamID?: string;
};

type ResourceServiceOptions = {
	db: DelegatedDatabase;
	origin: string;
	images?: PassportImageAssetService;
	now?: () => Date;
	generateID?: () => string;
	onMutation?: DelegatedMutationRecorder;
	sendInvitation?: (delivery: DelegatedInvitationDelivery) => void | Promise<void>;
};

function ISODate(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function roleList(value: string | string[]) {
	return [...new Set(
		(Array.isArray(value) ? value : [value])
			.flatMap((role) => role.split(","))
			.map((role) => role.trim())
			.filter(Boolean),
	)];
}

function hasRole(value: string, role: string) {
	return roleList(value).includes(role);
}

function invitationTeamIDs(value: string | null | undefined) {
	return value
		? value
				.split(",")
				.map((teamID) => teamID.trim())
				.filter(Boolean)
		: [];
}

function databaseErrorCode(error: unknown) {
	return error && typeof error === "object" && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;
}

async function serializableTransaction<T>(
	db: DelegatedDatabase,
	callback: (transaction: DelegatedTransaction) => Promise<T>,
) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			return await db.transaction(callback, { isolationLevel: "serializable" });
		} catch (error) {
			if (databaseErrorCode(error) !== "40001" || attempt === 2) throw error;
		}
	}
	throw new Error("Serializable transaction retry exhausted.");
}

async function findActorMembership(
	db: DelegatedDatabaseExecutor,
	actor: DelegatedResourceActor,
	organizationID: string,
) {
	const rows = await db
		.select({
			id: schema.member.id,
			organizationID: schema.member.organizationId,
			userID: schema.member.userId,
			role: schema.member.role,
		})
		.from(schema.member)
		.where(
			and(
				eq(schema.member.organizationId, organizationID),
				eq(schema.member.userId, actor.userID),
			),
		)
		.limit(1);
	return rows[0] ?? null;
}

async function requireVisibleOrganization(
	db: DelegatedDatabaseExecutor,
	actor: DelegatedResourceActor,
	organizationID: string,
) {
	const membership = await findActorMembership(db, actor, organizationID);
	if (!membership) {
		throw delegatedNotFound("organization_not_found", "Organization not found.");
	}
	return membership;
}

async function requireOrganizationPermission(
	db: DelegatedDatabase,
	actor: DelegatedResourceActor,
	organizationID: string,
	permission: OrganizationPermission,
) {
	const membership = await requireVisibleOrganization(db, actor, organizationID);
	if (
		!(await hasLiveOrganizationPermission(
			db,
			organizationID,
			membership.role,
			permission,
		))
	) {
		throw delegatedForbidden(
			"organization_permission_denied",
			"Your current organization role does not allow this action.",
		);
	}
	return membership;
}

async function requireVisibleTeam(
	db: DelegatedDatabaseExecutor,
	actor: DelegatedResourceActor,
	organizationID: string,
	teamID: string,
) {
	await requireVisibleOrganization(db, actor, organizationID);
	const rows = await db
		.select()
		.from(schema.team)
		.where(
			and(
				eq(schema.team.id, teamID),
				eq(schema.team.organizationId, organizationID),
			),
		)
		.limit(1);
	if (!rows[0]) throw delegatedNotFound("team_not_found", "Team not found.");
	return rows[0];
}

async function requireValidRoles(
	db: DelegatedDatabase,
	organizationID: string,
	roles: readonly string[],
) {
	if (!roles.length) throw delegatedBadRequest("invalid_role", "At least one role is required.");
	for (const role of roles) {
		if (!(await organizationRoleExists(db, organizationID, role))) {
			throw delegatedBadRequest("invalid_role", `Organization role '${role}' does not exist.`);
		}
	}
}

function requiredImages(images: PassportImageAssetService | undefined) {
	if (!images) {
		throw new DelegatedResourceError(
			501,
			"image_storage_unavailable",
			"Image storage is not configured.",
		);
	}
	return images;
}

export function createDelegatedResourceService(options: ResourceServiceOptions) {
	const now = options.now ?? (() => new Date());
	const generateID = options.generateID ?? (() => crypto.randomUUID());
	const recordMutation = options.onMutation ?? (() => undefined);

	function absoluteImage(value: string | null | undefined) {
		return value ? new URL(value, options.origin).toString() : null;
	}

	function profileDTO(row: {
		id: string;
		name: string;
		image: string | null;
		username: string | null;
		displayUsername: string | null;
	}) {
		return {
			id: row.id,
			name: row.name,
			image: absoluteImage(row.image),
			username: row.displayUsername ?? row.username,
		};
	}

	function organizationDTO(row: {
		id: string;
		name: string;
		slug: string;
		logo: string | null;
		createdAt: Date;
		metadata: string | null;
		role?: string;
	}) {
		return {
			id: row.id,
			name: row.name,
			slug: row.slug,
			logo: absoluteImage(row.logo),
			createdAt: ISODate(row.createdAt),
			metadata: parseMetadata(row.metadata),
			...(row.role ? { role: row.role } : {}),
		};
	}

	function teamDTO(row: typeof schema.team.$inferSelect) {
		return {
			id: row.id,
			name: row.name,
			logo: absoluteImage(row.logo),
			organizationId: row.organizationId,
			createdAt: ISODate(row.createdAt),
			updatedAt: ISODate(row.updatedAt),
		};
	}

	function invitationDTO(row: typeof schema.invitation.$inferSelect) {
		return {
			id: row.id,
			organizationId: row.organizationId,
			email: row.email,
			role: row.role ?? "member",
			teamIds: invitationTeamIDs(row.teamId),
			status: row.status,
			expiresAt: ISODate(row.expiresAt),
			createdAt: ISODate(row.createdAt),
			inviterId: row.inviterId,
		};
	}

	async function actorProfile(actor: DelegatedResourceActor) {
		const rows = await options.db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				emailVerified: schema.user.emailVerified,
				image: schema.user.image,
				username: schema.user.username,
				displayUsername: schema.user.displayUsername,
			})
			.from(schema.user)
			.where(eq(schema.user.id, actor.userID))
			.limit(1);
		if (!rows[0]) throw delegatedNotFound("user_not_found", "User not found.");
		return rows[0];
	}

	async function getProfile(actor: DelegatedResourceActor) {
		return profileDTO(await actorProfile(actor));
	}

	async function updateProfile(actor: DelegatedResourceActor, input: ProfileMutationInput) {
		if (input.name === undefined && input.username === undefined) {
			throw delegatedBadRequest("empty_update", "Provide a profile field to update.");
		}
		const name = input.name?.trim();
		if (input.name !== undefined && !name) {
			throw delegatedBadRequest("invalid_name", "Name cannot be empty.");
		}
		const displayUsername = input.username?.trim() || null;
		const username = displayUsername?.toLowerCase() ?? null;
		if (
			displayUsername &&
			(displayUsername.length < 3 ||
				displayUsername.length > 30 ||
				!/^[a-zA-Z0-9_.]+$/.test(displayUsername))
		) {
			throw delegatedBadRequest(
				"invalid_username",
				"Username must be 3 to 30 characters using letters, numbers, underscores, or periods.",
			);
		}
		try {
			const rows = await options.db
				.update(schema.user)
				.set({
					...(name === undefined ? {} : { name }),
					...(input.username === undefined
						? {}
						: { username, displayUsername }),
					updatedAt: now(),
				})
				.where(eq(schema.user.id, actor.userID))
				.returning({
					id: schema.user.id,
					name: schema.user.name,
					email: schema.user.email,
					emailVerified: schema.user.emailVerified,
					image: schema.user.image,
					username: schema.user.username,
					displayUsername: schema.user.displayUsername,
				});
			if (!rows[0]) throw delegatedNotFound("user_not_found", "User not found.");
			await recordMutation(actor, {
				action: "profile.update",
				targetType: "profile",
				targetID: actor.userID,
				metadata: {
					nameChanged: input.name !== undefined,
					usernameChanged: input.username !== undefined,
				},
			});
			return profileDTO(rows[0]);
		} catch (error) {
			if (error instanceof DelegatedResourceError) throw error;
			if (databaseErrorCode(error) === "23505") {
				throw delegatedConflict("username_taken", "Username is already in use.");
			}
			throw error;
		}
	}

	async function setProfilePicture(actor: DelegatedResourceActor, file: File) {
		const images = requiredImages(options.images);
		const image = await images.assignImage({
			file,
			ownerID: actor.userID,
			purpose: "profile",
			assign: (absoluteURL) =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ image: schema.user.image })
						.from(schema.user)
						.where(eq(schema.user.id, actor.userID))
						.limit(1);
					if (!rows[0]) throw delegatedNotFound("user_not_found", "User not found.");
					await transaction
						.update(schema.user)
						.set({ image: absoluteURL, updatedAt: now() })
						.where(eq(schema.user.id, actor.userID));
					return rows[0].image;
				}),
		});
		await recordMutation(actor, {
			action: "profile.picture.update",
			targetType: "profile",
			targetID: actor.userID,
		});
		return { image };
	}

	async function clearProfilePicture(actor: DelegatedResourceActor) {
		const images = requiredImages(options.images);
		await images.clearImage({
			assign: () =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ image: schema.user.image })
						.from(schema.user)
						.where(eq(schema.user.id, actor.userID))
						.limit(1);
					if (!rows[0]) throw delegatedNotFound("user_not_found", "User not found.");
					await transaction
						.update(schema.user)
						.set({ image: null, updatedAt: now() })
						.where(eq(schema.user.id, actor.userID));
					return rows[0].image;
				}),
		});
		await recordMutation(actor, {
			action: "profile.picture.delete",
			targetType: "profile",
			targetID: actor.userID,
		});
	}

	async function listOrganizations(actor: DelegatedResourceActor) {
		const rows = await options.db
			.select({
				id: schema.organization.id,
				name: schema.organization.name,
				slug: schema.organization.slug,
				logo: schema.organization.logo,
				createdAt: schema.organization.createdAt,
				metadata: schema.organization.metadata,
				role: schema.member.role,
			})
			.from(schema.member)
			.innerJoin(
				schema.organization,
				eq(schema.member.organizationId, schema.organization.id),
			)
			.where(eq(schema.member.userId, actor.userID));
		return rows.map(organizationDTO);
	}

	async function getOrganization(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireVisibleOrganization(options.db, actor, organizationID);
		const rows = await options.db
			.select({
				id: schema.organization.id,
				name: schema.organization.name,
				slug: schema.organization.slug,
				logo: schema.organization.logo,
				createdAt: schema.organization.createdAt,
				metadata: schema.organization.metadata,
				role: schema.member.role,
			})
			.from(schema.organization)
			.innerJoin(
				schema.member,
				and(
					eq(schema.member.organizationId, schema.organization.id),
					eq(schema.member.userId, actor.userID),
				),
			)
			.where(eq(schema.organization.id, organizationID))
			.limit(1);
		if (!rows[0]) {
			throw delegatedNotFound("organization_not_found", "Organization not found.");
		}
		return organizationDTO(rows[0]);
	}

	async function createOrganization(
		actor: DelegatedResourceActor,
		input: Required<OrganizationMutationInput>,
	) {
		const name = input.name.trim();
		const slug = input.slug.trim();
		if (!name || !slug) {
			throw delegatedBadRequest(
				"invalid_organization",
				"Organization name and slug are required.",
			);
		}
		const organizationID = generateID();
		const memberID = generateID();
		const teamID = generateID();
		const teamMemberID = generateID();
		const createdAt = now();

		try {
			const organization = await serializableTransaction(
				options.db,
				async (transaction) => {
					const users = await transaction
						.select({ id: schema.user.id })
						.from(schema.user)
						.where(eq(schema.user.id, actor.userID))
						.limit(1);
					if (!users[0]) throw delegatedNotFound("user_not_found", "User not found.");

					const membershipCounts = await transaction
						.select({ value: count() })
						.from(schema.member)
						.where(eq(schema.member.userId, actor.userID));
					if ((membershipCounts[0]?.value ?? 0) >= ORGANIZATION_LIMIT) {
						throw delegatedConflict(
							"organization_limit_reached",
							"The organization limit has been reached.",
						);
					}

					const inserted = await transaction
						.insert(schema.organization)
						.values({
							id: organizationID,
							name,
							slug,
							createdAt,
						})
						.returning();
					await transaction.insert(schema.member).values({
						id: memberID,
						organizationId: organizationID,
						userId: actor.userID,
						role: "owner",
						createdAt,
					});
					await transaction.insert(schema.team).values({
						id: teamID,
						name,
						organizationId: organizationID,
						createdAt,
						updatedAt: createdAt,
					});
					await transaction.insert(schema.teamMember).values({
						id: teamMemberID,
						teamId: teamID,
						userId: actor.userID,
						createdAt,
					});
					return inserted[0];
				},
			);
			if (!organization) throw new Error("Organization insert returned no row.");
			await recordMutation(actor, {
				action: "organization.create",
				targetType: "organization",
				targetID: organization.id,
				organizationID: organization.id,
				metadata: { name: organization.name, slug: organization.slug },
			});
			return organizationDTO({ ...organization, role: "owner" });
		} catch (error) {
			if (error instanceof DelegatedResourceError) throw error;
			if (databaseErrorCode(error) === "23505") {
				throw delegatedConflict(
					"organization_slug_taken",
					"Organization slug is already in use.",
				);
			}
			throw error;
		}
	}

	async function updateOrganization(
		actor: DelegatedResourceActor,
		organizationID: string,
		input: OrganizationMutationInput,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "organization",
			action: "update",
		});
		if (input.name === undefined && input.slug === undefined) {
			throw delegatedBadRequest("empty_update", "Provide an organization field to update.");
		}
		const name = input.name?.trim();
		const slug = input.slug?.trim();
		if ((input.name !== undefined && !name) || (input.slug !== undefined && !slug)) {
			throw delegatedBadRequest(
				"invalid_organization",
				"Organization name and slug cannot be empty.",
			);
		}
		try {
			const rows = await options.db
				.update(schema.organization)
				.set({
					...(name === undefined ? {} : { name }),
					...(slug === undefined ? {} : { slug }),
				})
				.where(eq(schema.organization.id, organizationID))
				.returning();
			if (!rows[0]) {
				throw delegatedNotFound("organization_not_found", "Organization not found.");
			}
			await recordMutation(actor, {
				action: "organization.update",
				targetType: "organization",
				targetID: organizationID,
				organizationID,
			});
			return organizationDTO(rows[0]);
		} catch (error) {
			if (error instanceof DelegatedResourceError) throw error;
			if (databaseErrorCode(error) === "23505") {
				throw delegatedConflict(
					"organization_slug_taken",
					"Organization slug is already in use.",
				);
			}
			throw error;
		}
	}

	async function deleteOrganization(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "organization",
			action: "delete",
		});
		const deleted = await serializableTransaction(options.db, async (transaction) => {
			const organizations = await transaction
				.select()
				.from(schema.organization)
				.where(eq(schema.organization.id, organizationID))
				.limit(1);
			if (!organizations[0]) {
				throw delegatedNotFound("organization_not_found", "Organization not found.");
			}
			const teams = await transaction
				.select({ id: schema.team.id })
				.from(schema.team)
				.where(eq(schema.team.organizationId, organizationID));
			const teamIDs = teams.map((team) => team.id);
			await transaction
				.update(schema.session)
				.set({ activeOrganizationId: null, activeTeamId: null, updatedAt: now() })
				.where(
					teamIDs.length
						? or(
								eq(schema.session.activeOrganizationId, organizationID),
								inArray(schema.session.activeTeamId, teamIDs),
							)
						: eq(schema.session.activeOrganizationId, organizationID),
				);
			await transaction
				.delete(schema.organization)
				.where(eq(schema.organization.id, organizationID));
			return organizations[0];
		});
		await options.images?.deleteOwnedAsset(deleted.logo);
		await recordMutation(actor, {
			action: "organization.delete",
			targetType: "organization",
			targetID: organizationID,
			organizationID,
			metadata: { name: deleted.name, slug: deleted.slug },
		});
	}

	async function leaveOrganization(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireVisibleOrganization(options.db, actor, organizationID);
		const removedMember = await serializableTransaction(
			options.db,
			async (transaction) => {
				const membership = await findActorMembership(transaction, actor, organizationID);
				if (!membership) {
					throw delegatedNotFound("organization_not_found", "Organization not found.");
				}
				if (hasRole(membership.role, "owner")) {
					const owners = await transaction
						.select({ role: schema.member.role })
						.from(schema.member)
						.where(eq(schema.member.organizationId, organizationID));
					if (owners.filter((member) => hasRole(member.role, "owner")).length <= 1) {
						throw delegatedConflict(
							"last_owner",
							"Transfer ownership before leaving this organization.",
						);
					}
				}
				const teams = await transaction
					.select({ id: schema.team.id })
					.from(schema.team)
					.where(eq(schema.team.organizationId, organizationID));
				const teamIDs = teams.map((team) => team.id);
				if (teamIDs.length) {
					await transaction
						.delete(schema.teamMember)
						.where(
							and(
								eq(schema.teamMember.userId, actor.userID),
								inArray(schema.teamMember.teamId, teamIDs),
							),
						);
				}
				await transaction
					.delete(schema.member)
					.where(eq(schema.member.id, membership.id));
				await transaction
					.update(schema.session)
					.set({ activeOrganizationId: null, activeTeamId: null, updatedAt: now() })
					.where(
						and(
							eq(schema.session.userId, actor.userID),
							teamIDs.length
								? or(
										eq(schema.session.activeOrganizationId, organizationID),
										inArray(schema.session.activeTeamId, teamIDs),
									)
								: eq(schema.session.activeOrganizationId, organizationID),
						),
					);
				return membership;
			},
		);
		await recordMutation(actor, {
			action: "organization.leave",
			targetType: "member",
			targetID: removedMember.id,
			organizationID,
		});
	}

	async function setOrganizationLogo(
		actor: DelegatedResourceActor,
		organizationID: string,
		file: File,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "organization",
			action: "update",
		});
		const images = requiredImages(options.images);
		const logo = await images.assignImage({
			file,
			ownerID: organizationID,
			purpose: "organization-logo",
			assign: (absoluteURL) =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ logo: schema.organization.logo })
						.from(schema.organization)
						.where(eq(schema.organization.id, organizationID))
						.limit(1);
					if (!rows[0]) {
						throw delegatedNotFound("organization_not_found", "Organization not found.");
					}
					await transaction
						.update(schema.organization)
						.set({ logo: absoluteURL })
						.where(eq(schema.organization.id, organizationID));
					return rows[0].logo;
				}),
		});
		await recordMutation(actor, {
			action: "organization.logo.update",
			targetType: "organization",
			targetID: organizationID,
			organizationID,
		});
		return { logo };
	}

	async function clearOrganizationLogo(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "organization",
			action: "update",
		});
		const images = requiredImages(options.images);
		await images.clearImage({
			assign: () =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ logo: schema.organization.logo })
						.from(schema.organization)
						.where(eq(schema.organization.id, organizationID))
						.limit(1);
					if (!rows[0]) {
						throw delegatedNotFound("organization_not_found", "Organization not found.");
					}
					await transaction
						.update(schema.organization)
						.set({ logo: null })
						.where(eq(schema.organization.id, organizationID));
					return rows[0].logo;
				}),
		});
		await recordMutation(actor, {
			action: "organization.logo.delete",
			targetType: "organization",
			targetID: organizationID,
			organizationID,
		});
	}

	async function listMyOrganizationInvitations(actor: DelegatedResourceActor) {
		const profile = await actorProfile(actor);
		const rows = await options.db
			.select({
				invitation: schema.invitation,
				organizationName: schema.organization.name,
				organizationSlug: schema.organization.slug,
				organizationLogo: schema.organization.logo,
			})
			.from(schema.invitation)
			.innerJoin(
				schema.organization,
				eq(schema.invitation.organizationId, schema.organization.id),
			)
			.where(
				and(
					eq(schema.invitation.email, profile.email.toLowerCase()),
					eq(schema.invitation.status, "pending"),
				),
			);
		return rows.map((row) => ({
			...invitationDTO(row.invitation),
			organization: {
				name: row.organizationName,
				slug: row.organizationSlug,
				logo: absoluteImage(row.organizationLogo),
			},
		}));
	}

	async function listOrganizationInvitations(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireVisibleOrganization(options.db, actor, organizationID);
		const rows = await options.db
			.select()
			.from(schema.invitation)
			.where(eq(schema.invitation.organizationId, organizationID));
		return rows.map(invitationDTO);
	}

	async function createOrganizationInvitation(
		actor: DelegatedResourceActor,
		organizationID: string,
		input: InvitationMutationInput,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "invitation",
			action: "create",
		});
		const email = input.email.trim().toLowerCase();
		if (!email) throw delegatedBadRequest("invalid_email", "Email is required.");
		const roles = roleList(input.role);
		await requireValidRoles(options.db, organizationID, roles);
		const actorUser = await actorProfile(actor);
		const invitationID = generateID();
		const createdAt = now();
		const expiresAt = new Date(createdAt.getTime() + INVITATION_LIFETIME_MS);

		const result = await serializableTransaction(options.db, async (transaction) => {
			const organizations = await transaction
				.select({ name: schema.organization.name })
				.from(schema.organization)
				.where(eq(schema.organization.id, organizationID))
				.limit(1);
			if (!organizations[0]) {
				throw delegatedNotFound("organization_not_found", "Organization not found.");
			}
			const existingMembers = await transaction
				.select({ id: schema.member.id })
				.from(schema.member)
				.innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
				.where(
					and(
						eq(schema.member.organizationId, organizationID),
						eq(schema.user.email, email),
					),
				)
				.limit(1);
			if (existingMembers[0]) {
				throw delegatedConflict(
					"already_a_member",
					"This user is already an organization member.",
				);
			}

			await transaction
				.update(schema.invitation)
				.set({ status: "canceled" })
				.where(
					and(
						eq(schema.invitation.organizationId, organizationID),
						eq(schema.invitation.email, email),
						eq(schema.invitation.status, "pending"),
					),
				);
			const pendingCounts = await transaction
				.select({ value: count() })
				.from(schema.invitation)
				.where(
					and(
						eq(schema.invitation.organizationId, organizationID),
						eq(schema.invitation.status, "pending"),
					),
				);
			if ((pendingCounts[0]?.value ?? 0) >= ORGANIZATION_INVITATION_LIMIT) {
				throw delegatedConflict(
					"invitation_limit_reached",
					"The pending invitation limit has been reached.",
				);
			}

			if (input.teamID) {
				const teams = await transaction
					.select({ id: schema.team.id })
					.from(schema.team)
					.where(
						and(
							eq(schema.team.id, input.teamID),
							eq(schema.team.organizationId, organizationID),
						),
					)
					.limit(1);
				if (!teams[0]) throw delegatedNotFound("team_not_found", "Team not found.");
				const memberCounts = await transaction
					.select({ value: count() })
					.from(schema.teamMember)
					.where(eq(schema.teamMember.teamId, input.teamID));
				if ((memberCounts[0]?.value ?? 0) >= TEAM_MEMBER_LIMIT) {
					throw delegatedConflict(
						"team_member_limit_reached",
						"The team member limit has been reached.",
					);
				}
			}

			const rows = await transaction
				.insert(schema.invitation)
				.values({
					id: invitationID,
					organizationId: organizationID,
					email,
					role: roles.join(","),
					teamId: input.teamID ?? null,
					status: "pending",
					expiresAt,
					createdAt,
					inviterId: actor.userID,
				})
				.returning();
			if (!rows[0]) throw new Error("Invitation insert returned no row.");
			return { invitation: rows[0], organizationName: organizations[0].name };
		});

		await recordMutation(actor, {
			action: "organization.invitation.create",
			targetType: "invitation",
			targetID: result.invitation.id,
			organizationID,
			metadata: { email, role: result.invitation.role ?? "member" },
		});
		await options.sendInvitation?.({
			id: result.invitation.id,
			email,
			organizationID,
			organizationName: result.organizationName,
			inviterName: actorUser.name,
		});
		return invitationDTO(result.invitation);
	}

	async function cancelOrganizationInvitation(
		actor: DelegatedResourceActor,
		organizationID: string,
		invitationID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "invitation",
			action: "cancel",
		});
		const rows = await options.db
			.update(schema.invitation)
			.set({ status: "canceled" })
			.where(
				and(
					eq(schema.invitation.id, invitationID),
					eq(schema.invitation.organizationId, organizationID),
					eq(schema.invitation.status, "pending"),
				),
			)
			.returning();
		if (!rows[0]) {
			const visible = await options.db
				.select({ id: schema.invitation.id })
				.from(schema.invitation)
				.where(
					and(
						eq(schema.invitation.id, invitationID),
						eq(schema.invitation.organizationId, organizationID),
					),
				)
				.limit(1);
			if (!visible[0]) {
				throw delegatedNotFound("invitation_not_found", "Invitation not found.");
			}
			throw delegatedConflict(
				"invitation_not_pending",
				"Only pending invitations can be canceled.",
			);
		}
		await recordMutation(actor, {
			action: "organization.invitation.cancel",
			targetType: "invitation",
			targetID: invitationID,
			organizationID,
		});
	}

	async function acceptOrganizationInvitation(
		actor: DelegatedResourceActor,
		invitationID: string,
	) {
		const profile = await actorProfile(actor);
		if (!profile.emailVerified) {
			throw delegatedForbidden(
				"email_verification_required",
				"Verify your email before accepting an invitation.",
			);
		}
		const createdAt = now();
		const result = await serializableTransaction(options.db, async (transaction) => {
			const invitations = await transaction
				.select()
				.from(schema.invitation)
				.where(eq(schema.invitation.id, invitationID))
				.limit(1);
			const pending = invitations[0];
			if (
				!pending ||
				pending.email.toLowerCase() !== profile.email.toLowerCase() ||
				pending.status !== "pending" ||
				pending.expiresAt <= createdAt
			) {
				throw delegatedNotFound("invitation_not_found", "Invitation not found.");
			}

			const existingMembers = await transaction
				.select({ id: schema.member.id })
				.from(schema.member)
				.where(
					and(
						eq(schema.member.organizationId, pending.organizationId),
						eq(schema.member.userId, actor.userID),
					),
				)
				.limit(1);
			if (existingMembers[0]) {
				throw delegatedConflict(
					"already_a_member",
					"You are already an organization member.",
				);
			}
			const memberCounts = await transaction
				.select({ value: count() })
				.from(schema.member)
				.where(eq(schema.member.organizationId, pending.organizationId));
			if ((memberCounts[0]?.value ?? 0) >= ORGANIZATION_MEMBER_LIMIT) {
				throw delegatedConflict(
					"organization_member_limit_reached",
					"The organization member limit has been reached.",
				);
			}

			const teamIDs = invitationTeamIDs(pending.teamId);
			for (const teamID of teamIDs) {
				const teams = await transaction
					.select({ id: schema.team.id })
					.from(schema.team)
					.where(
						and(
							eq(schema.team.id, teamID),
							eq(schema.team.organizationId, pending.organizationId),
						),
					)
					.limit(1);
				if (!teams[0]) throw delegatedNotFound("team_not_found", "Team not found.");
				const teamMemberCounts = await transaction
					.select({ value: count() })
					.from(schema.teamMember)
					.where(eq(schema.teamMember.teamId, teamID));
				if ((teamMemberCounts[0]?.value ?? 0) >= TEAM_MEMBER_LIMIT) {
					throw delegatedConflict(
						"team_member_limit_reached",
						"The team member limit has been reached.",
					);
				}
			}

			const updated = await transaction
				.update(schema.invitation)
				.set({ status: "accepted" })
				.where(
					and(
						eq(schema.invitation.id, invitationID),
						eq(schema.invitation.status, "pending"),
					),
				)
				.returning();
			if (!updated[0]) {
				throw delegatedConflict(
					"invitation_already_used",
					"Invitation has already been used.",
				);
			}
			const memberID = generateID();
			await transaction.insert(schema.member).values({
				id: memberID,
				organizationId: pending.organizationId,
				userId: actor.userID,
				role: pending.role ?? "member",
				createdAt,
			});
			for (const teamID of teamIDs) {
				await transaction.insert(schema.teamMember).values({
					id: generateID(),
					teamId: teamID,
					userId: actor.userID,
					createdAt,
				});
			}
			return { invitation: updated[0], memberID };
		});
		await recordMutation(actor, {
			action: "organization.invitation.accept",
			targetType: "invitation",
			targetID: invitationID,
			organizationID: result.invitation.organizationId,
		});
		return {
			invitation: invitationDTO(result.invitation),
			memberId: result.memberID,
		};
	}

	async function rejectOrganizationInvitation(
		actor: DelegatedResourceActor,
		invitationID: string,
	) {
		const profile = await actorProfile(actor);
		if (!profile.emailVerified) {
			throw delegatedForbidden(
				"email_verification_required",
				"Verify your email before rejecting an invitation.",
			);
		}
		const rows = await options.db
			.update(schema.invitation)
			.set({ status: "rejected" })
			.where(
				and(
					eq(schema.invitation.id, invitationID),
					eq(schema.invitation.email, profile.email.toLowerCase()),
					eq(schema.invitation.status, "pending"),
				),
			)
			.returning();
		if (!rows[0]) {
			throw delegatedNotFound("invitation_not_found", "Invitation not found.");
		}
		await recordMutation(actor, {
			action: "organization.invitation.reject",
			targetType: "invitation",
			targetID: invitationID,
			organizationID: rows[0].organizationId,
		});
		return invitationDTO(rows[0]);
	}

	async function listOrganizationMembers(
		actor: DelegatedResourceActor,
		organizationID: string,
	) {
		await requireVisibleOrganization(options.db, actor, organizationID);
		const rows = await options.db
			.select({
				id: schema.member.id,
				organizationId: schema.member.organizationId,
				userId: schema.member.userId,
				role: schema.member.role,
				createdAt: schema.member.createdAt,
				name: schema.user.name,
				email: schema.user.email,
				image: schema.user.image,
			})
			.from(schema.member)
			.innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
			.where(eq(schema.member.organizationId, organizationID));
		return rows.map((row) => ({
			...row,
			image: absoluteImage(row.image),
			createdAt: ISODate(row.createdAt),
		}));
	}

	async function updateOrganizationMember(
		actor: DelegatedResourceActor,
		organizationID: string,
		memberID: string,
		role: string | string[],
	) {
		const actorMembership = await requireOrganizationPermission(
			options.db,
			actor,
			organizationID,
			{ resource: "member", action: "update" },
		);
		const roles = roleList(role);
		await requireValidRoles(options.db, organizationID, roles);
		const updated = await serializableTransaction(options.db, async (transaction) => {
			const targets = await transaction
				.select()
				.from(schema.member)
				.where(
					and(
						eq(schema.member.id, memberID),
						eq(schema.member.organizationId, organizationID),
					),
				)
				.limit(1);
			const target = targets[0];
			if (!target) throw delegatedNotFound("member_not_found", "Member not found.");
			const actorIsOwner = hasRole(actorMembership.role, "owner");
			const targetIsOwner = hasRole(target.role, "owner");
			const settingOwner = roles.includes("owner");
			if ((targetIsOwner || settingOwner) && !actorIsOwner) {
				throw delegatedForbidden(
					"owner_permission_required",
					"Only an organization owner can change owner membership.",
				);
			}
			if (targetIsOwner && !settingOwner) {
				const ownerRows = await transaction
					.select({ role: schema.member.role })
					.from(schema.member)
					.where(eq(schema.member.organizationId, organizationID));
				if (ownerRows.filter((member) => hasRole(member.role, "owner")).length <= 1) {
					throw delegatedConflict(
						"last_owner",
						"Transfer ownership before changing the last owner's role.",
					);
				}
			}
			const rows = await transaction
				.update(schema.member)
				.set({ role: roles.join(",") })
				.where(eq(schema.member.id, memberID))
				.returning();
			if (!rows[0]) throw delegatedNotFound("member_not_found", "Member not found.");
			return rows[0];
		});
		await recordMutation(actor, {
			action: "organization.member.role.update",
			targetType: "member",
			targetID: memberID,
			organizationID,
			metadata: { role: updated.role },
		});
		return {
			id: updated.id,
			organizationId: updated.organizationId,
			userId: updated.userId,
			role: updated.role,
			createdAt: ISODate(updated.createdAt),
		};
	}

	async function removeOrganizationMember(
		actor: DelegatedResourceActor,
		organizationID: string,
		memberID: string,
	) {
		const actorMembership = await requireOrganizationPermission(
			options.db,
			actor,
			organizationID,
			{ resource: "member", action: "delete" },
		);
		const removed = await serializableTransaction(options.db, async (transaction) => {
			const targets = await transaction
				.select()
				.from(schema.member)
				.where(
					and(
						eq(schema.member.id, memberID),
						eq(schema.member.organizationId, organizationID),
					),
				)
				.limit(1);
			const target = targets[0];
			if (!target) throw delegatedNotFound("member_not_found", "Member not found.");
			if (hasRole(target.role, "owner")) {
				if (!hasRole(actorMembership.role, "owner")) {
					throw delegatedForbidden(
						"owner_permission_required",
						"Only an organization owner can remove another owner.",
					);
				}
				const ownerRows = await transaction
					.select({ role: schema.member.role })
					.from(schema.member)
					.where(eq(schema.member.organizationId, organizationID));
				if (ownerRows.filter((member) => hasRole(member.role, "owner")).length <= 1) {
					throw delegatedConflict(
						"last_owner",
						"Transfer ownership before removing the last owner.",
					);
				}
			}
			const teams = await transaction
				.select({ id: schema.team.id })
				.from(schema.team)
				.where(eq(schema.team.organizationId, organizationID));
			const teamIDs = teams.map((team) => team.id);
			if (teamIDs.length) {
				await transaction
					.delete(schema.teamMember)
					.where(
						and(
							eq(schema.teamMember.userId, target.userId),
							inArray(schema.teamMember.teamId, teamIDs),
						),
					);
			}
			await transaction.delete(schema.member).where(eq(schema.member.id, memberID));
			await transaction
				.update(schema.session)
				.set({ activeOrganizationId: null, activeTeamId: null, updatedAt: now() })
				.where(
					and(
						eq(schema.session.userId, target.userId),
						teamIDs.length
							? or(
									eq(schema.session.activeOrganizationId, organizationID),
									inArray(schema.session.activeTeamId, teamIDs),
								)
							: eq(schema.session.activeOrganizationId, organizationID),
					),
				);
			return target;
		});
		await recordMutation(actor, {
			action: "organization.member.delete",
			targetType: "member",
			targetID: memberID,
			organizationID,
			metadata: { userID: removed.userId },
		});
	}

	async function listTeams(actor: DelegatedResourceActor, organizationID: string) {
		await requireVisibleOrganization(options.db, actor, organizationID);
		const rows = await options.db
			.select()
			.from(schema.team)
			.where(eq(schema.team.organizationId, organizationID));
		return rows.map(teamDTO);
	}

	async function getTeam(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
	) {
		return teamDTO(await requireVisibleTeam(options.db, actor, organizationID, teamID));
	}

	async function createTeam(
		actor: DelegatedResourceActor,
		organizationID: string,
		input: { name: string },
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "create",
		});
		const name = input.name.trim();
		if (!name) throw delegatedBadRequest("invalid_team", "Team name is required.");
		const createdAt = now();
		const team = await serializableTransaction(options.db, async (transaction) => {
			const teamCounts = await transaction
				.select({ value: count() })
				.from(schema.team)
				.where(eq(schema.team.organizationId, organizationID));
			if ((teamCounts[0]?.value ?? 0) >= TEAM_LIMIT) {
				throw delegatedConflict("team_limit_reached", "The team limit has been reached.");
			}
			const rows = await transaction
				.insert(schema.team)
				.values({
					id: generateID(),
					name,
					organizationId: organizationID,
					createdAt,
					updatedAt: createdAt,
				})
				.returning();
			if (!rows[0]) throw new Error("Team insert returned no row.");
			return rows[0];
		});
		await recordMutation(actor, {
			action: "organization.team.create",
			targetType: "team",
			targetID: team.id,
			organizationID,
			metadata: { name },
		});
		return teamDTO(team);
	}

	async function updateTeam(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
		input: { name: string },
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "update",
		});
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const name = input.name.trim();
		if (!name) throw delegatedBadRequest("invalid_team", "Team name is required.");
		const rows = await options.db
			.update(schema.team)
			.set({ name, updatedAt: now() })
			.where(
				and(
					eq(schema.team.id, teamID),
					eq(schema.team.organizationId, organizationID),
				),
			)
			.returning();
		if (!rows[0]) throw delegatedNotFound("team_not_found", "Team not found.");
		await recordMutation(actor, {
			action: "organization.team.update",
			targetType: "team",
			targetID: teamID,
			organizationID,
		});
		return teamDTO(rows[0]);
	}

	async function deleteTeam(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "delete",
		});
		const deleted = await serializableTransaction(options.db, async (transaction) => {
			const teams = await transaction
				.select()
				.from(schema.team)
				.where(eq(schema.team.organizationId, organizationID));
			const target = teams.find((team) => team.id === teamID);
			if (!target) throw delegatedNotFound("team_not_found", "Team not found.");
			if (teams.length <= 1) {
				throw delegatedConflict("last_team", "An organization must keep at least one team.");
			}
			const pendingInvitations = await transaction
				.select({ id: schema.invitation.id, teamID: schema.invitation.teamId })
				.from(schema.invitation)
				.where(
					and(
						eq(schema.invitation.organizationId, organizationID),
						eq(schema.invitation.status, "pending"),
					),
				);
			for (const invitation of pendingInvitations) {
				const remainingTeamIDs = invitationTeamIDs(invitation.teamID).filter(
					(id) => id !== teamID,
				);
				if (remainingTeamIDs.length === invitationTeamIDs(invitation.teamID).length) continue;
				await transaction
					.update(schema.invitation)
					.set({ teamId: remainingTeamIDs.length ? remainingTeamIDs.join(",") : null })
					.where(eq(schema.invitation.id, invitation.id));
			}
			await transaction.delete(schema.team).where(eq(schema.team.id, teamID));
			await transaction
				.update(schema.session)
				.set({ activeTeamId: null, updatedAt: now() })
				.where(eq(schema.session.activeTeamId, teamID));
			return target;
		});
		await options.images?.deleteOwnedAsset(deleted.logo);
		await recordMutation(actor, {
			action: "organization.team.delete",
			targetType: "team",
			targetID: teamID,
			organizationID,
			metadata: { name: deleted.name },
		});
	}

	async function setTeamLogo(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
		file: File,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "update",
		});
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const images = requiredImages(options.images);
		const logo = await images.assignImage({
			file,
			ownerID: teamID,
			purpose: "team-logo",
			assign: (absoluteURL) =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ logo: schema.team.logo })
						.from(schema.team)
						.where(
							and(
								eq(schema.team.id, teamID),
								eq(schema.team.organizationId, organizationID),
							),
						)
						.limit(1);
					if (!rows[0]) throw delegatedNotFound("team_not_found", "Team not found.");
					await transaction
						.update(schema.team)
						.set({ logo: absoluteURL, updatedAt: now() })
						.where(eq(schema.team.id, teamID));
					return rows[0].logo;
				}),
		});
		await recordMutation(actor, {
			action: "organization.team.logo.update",
			targetType: "team",
			targetID: teamID,
			organizationID,
		});
		return { logo };
	}

	async function clearTeamLogo(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "update",
		});
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const images = requiredImages(options.images);
		await images.clearImage({
			assign: () =>
				serializableTransaction(options.db, async (transaction) => {
					const rows = await transaction
						.select({ logo: schema.team.logo })
						.from(schema.team)
						.where(
							and(
								eq(schema.team.id, teamID),
								eq(schema.team.organizationId, organizationID),
							),
						)
						.limit(1);
					if (!rows[0]) throw delegatedNotFound("team_not_found", "Team not found.");
					await transaction
						.update(schema.team)
						.set({ logo: null, updatedAt: now() })
						.where(eq(schema.team.id, teamID));
					return rows[0].logo;
				}),
		});
		await recordMutation(actor, {
			action: "organization.team.logo.delete",
			targetType: "team",
			targetID: teamID,
			organizationID,
		});
	}

	async function listTeamMembers(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
	) {
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const rows = await options.db
			.select({
				id: schema.teamMember.id,
				teamId: schema.teamMember.teamId,
				userId: schema.teamMember.userId,
				createdAt: schema.teamMember.createdAt,
				name: schema.user.name,
				email: schema.user.email,
				image: schema.user.image,
			})
			.from(schema.teamMember)
			.innerJoin(schema.user, eq(schema.teamMember.userId, schema.user.id))
			.where(eq(schema.teamMember.teamId, teamID));
		return rows.map((row) => ({
			...row,
			image: absoluteImage(row.image),
			createdAt: ISODate(row.createdAt),
		}));
	}

	async function addTeamMember(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
		userID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "update",
		});
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const added = await serializableTransaction(options.db, async (transaction) => {
			const memberships = await transaction
				.select({ id: schema.member.id })
				.from(schema.member)
				.where(
					and(
						eq(schema.member.organizationId, organizationID),
						eq(schema.member.userId, userID),
					),
				)
				.limit(1);
			if (!memberships[0]) {
				throw delegatedNotFound("member_not_found", "Organization member not found.");
			}
			const existing = await transaction
				.select()
				.from(schema.teamMember)
				.where(
					and(
						eq(schema.teamMember.teamId, teamID),
						eq(schema.teamMember.userId, userID),
					),
				)
				.limit(1);
			if (existing[0]) return { row: existing[0], created: false };
			const memberCounts = await transaction
				.select({ value: count() })
				.from(schema.teamMember)
				.where(eq(schema.teamMember.teamId, teamID));
			if ((memberCounts[0]?.value ?? 0) >= TEAM_MEMBER_LIMIT) {
				throw delegatedConflict(
					"team_member_limit_reached",
					"The team member limit has been reached.",
				);
			}
			const rows = await transaction
				.insert(schema.teamMember)
				.values({ id: generateID(), teamId: teamID, userId: userID, createdAt: now() })
				.returning();
			if (!rows[0]) throw new Error("Team member insert returned no row.");
			return { row: rows[0], created: true };
		});
		if (added.created) {
			await recordMutation(actor, {
				action: "organization.team.member.add",
				targetType: "member",
				targetID: added.row.id,
				organizationID,
				metadata: { teamID, userID },
			});
		}
		return {
			id: added.row.id,
			teamId: added.row.teamId,
			userId: added.row.userId,
			createdAt: ISODate(added.row.createdAt),
		};
	}

	async function removeTeamMember(
		actor: DelegatedResourceActor,
		organizationID: string,
		teamID: string,
		userID: string,
	) {
		await requireOrganizationPermission(options.db, actor, organizationID, {
			resource: "team",
			action: "update",
		});
		await requireVisibleTeam(options.db, actor, organizationID, teamID);
		const rows = await options.db
			.delete(schema.teamMember)
			.where(
				and(
					eq(schema.teamMember.teamId, teamID),
					eq(schema.teamMember.userId, userID),
				),
			)
			.returning();
		if (!rows[0]) {
			throw delegatedNotFound("team_member_not_found", "Team member not found.");
		}
		await options.db
			.update(schema.session)
			.set({ activeTeamId: null, updatedAt: now() })
			.where(
				and(eq(schema.session.userId, userID), eq(schema.session.activeTeamId, teamID)),
			);
		await recordMutation(actor, {
			action: "organization.team.member.delete",
			targetType: "member",
			targetID: rows[0].id,
			organizationID,
			metadata: { teamID, userID },
		});
	}

	return {
		getProfile,
		updateProfile,
		setProfilePicture,
		clearProfilePicture,
		listOrganizations,
		getOrganization,
		createOrganization,
		updateOrganization,
		deleteOrganization,
		leaveOrganization,
		setOrganizationLogo,
		clearOrganizationLogo,
		listMyOrganizationInvitations,
		acceptOrganizationInvitation,
		rejectOrganizationInvitation,
		listOrganizationInvitations,
		createOrganizationInvitation,
		cancelOrganizationInvitation,
		listOrganizationMembers,
		updateOrganizationMember,
		removeOrganizationMember,
		listTeams,
		getTeam,
		createTeam,
		updateTeam,
		deleteTeam,
		setTeamLogo,
		clearTeamLogo,
		listTeamMembers,
		addTeamMember,
		removeTeamMember,
	};
}

export type DelegatedResourceService = ReturnType<
	typeof createDelegatedResourceService
>;
