/**
 * D1 integration check for the schema invariants that protect multi-step
 * mutations. It uses Wrangler's local binding and unique IDs, so
 * it can run with the normal Vitest suite without a separate database service.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { getPlatformProxy, type PlatformProxy } from "wrangler";

import * as schema from "./schema";

describe("D1 schema invariants", () => {
	let platform: PlatformProxy<{ DB: D1Database }>;
	let db: ReturnType<typeof drizzle<typeof schema>>;

	beforeAll(async () => {
		platform = await getPlatformProxy<{ DB: D1Database }>({ remoteBindings: false });
		db = drizzle(platform.env.DB, { schema });
	});

	afterAll(async () => {
		await platform.dispose();
	});

	it("enforces last-owner and last-team rules while allowing valid replacements", async () => {
		const suffix = crypto.randomUUID();
		const userOneID = `user-one-${suffix}`;
		const userTwoID = `user-two-${suffix}`;
		const organizationID = `organization-${suffix}`;
		const memberOneID = `member-one-${suffix}`;
		const memberTwoID = `member-two-${suffix}`;
		const teamOneID = `team-one-${suffix}`;
		const teamTwoID = `team-two-${suffix}`;
		const now = new Date();

		await db.batch([
			db.insert(schema.user).values({
				id: userOneID,
				name: "One",
				email: `${userOneID}@example.com`,
				createdAt: now,
				updatedAt: now,
			}),
			db.insert(schema.user).values({
				id: userTwoID,
				name: "Two",
				email: `${userTwoID}@example.com`,
				createdAt: now,
				updatedAt: now,
			}),
			db.insert(schema.organization).values({
				id: organizationID,
				name: "D1 test",
				slug: organizationID,
				createdAt: now,
			}),
			db.insert(schema.member).values({
				id: memberOneID,
				organizationId: organizationID,
				userId: userOneID,
				role: "owner",
				createdAt: now,
			}),
			db.insert(schema.team).values({
				id: teamOneID,
				name: "One",
				organizationId: organizationID,
				createdAt: now,
				updatedAt: now,
			}),
		]);

		await expect(
			db.delete(schema.member).where(eq(schema.member.id, memberOneID)),
		).rejects.toThrow();
		await expect(db.delete(schema.team).where(eq(schema.team.id, teamOneID))).rejects.toThrow();
		expect(
			await db.select({ id: schema.member.id }).from(schema.member).where(eq(schema.member.id, memberOneID)),
		).toHaveLength(1);
		expect(
			await db.select({ id: schema.team.id }).from(schema.team).where(eq(schema.team.id, teamOneID)),
		).toHaveLength(1);

		await db.batch([
			db.insert(schema.member).values({
				id: memberTwoID,
				organizationId: organizationID,
				userId: userTwoID,
				role: "owner",
				createdAt: now,
			}),
			db.insert(schema.team).values({
				id: teamTwoID,
				name: "Two",
				organizationId: organizationID,
				createdAt: now,
				updatedAt: now,
			}),
		]);

		await db.batch([
			db.delete(schema.member).where(eq(schema.member.id, memberOneID)),
			db.delete(schema.team).where(eq(schema.team.id, teamOneID)),
		]);
		await db.delete(schema.organization).where(eq(schema.organization.id, organizationID));
		await db.delete(schema.user).where(eq(schema.user.id, userOneID));
		await db.delete(schema.user).where(eq(schema.user.id, userTwoID));
	});
});
