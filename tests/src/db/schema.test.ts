import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { account, oauthAccessToken, oauthConsent, oauthRefreshToken } from "./schema";

describe("Better Auth account identity schema", () => {
	it("requires an issuer and uniquely scopes provider account IDs by issuer", () => {
		const config = getTableConfig(account);
		const issuer = config.columns.find((column) => column.name === "issuer");
		const identityIndex = config.indexes.find(
			(index) => index.config.name === "account_issuer_accountId_uidx",
		);

		expect(issuer?.notNull).toBe(true);
		expect(identityIndex?.config.unique).toBe(true);
		expect(identityIndex?.config.columns.map((column) => column.name)).toEqual([
			"issuer",
			"account_id",
		]);
	});

	it("backfills populated account rows before enforcing the required column", () => {
		const migration = readFileSync("drizzle/0020_conscious_anthem.sql", "utf8");
		const addColumn = migration.indexOf('ADD COLUMN "issuer" text;');
		const backfill = migration.indexOf('UPDATE "account"');
		const requireIssuer = migration.indexOf('ALTER COLUMN "issuer" SET NOT NULL');
		const createIdentityIndex = migration.indexOf('CREATE UNIQUE INDEX "account_issuer_accountId_uidx"');

		expect(addColumn).toBeGreaterThanOrEqual(0);
		expect(backfill).toBeGreaterThan(addColumn);
		expect(requireIssuer).toBeGreaterThan(backfill);
		expect(createIdentityIndex).toBeGreaterThan(requireIssuer);
	});
});

describe("Better Auth OAuth authorization metadata schema", () => {
	it.each([
		["oauthConsent", oauthConsent],
		["oauthAccessToken", oauthAccessToken],
		["oauthRefreshToken", oauthRefreshToken],
	])("stores requested UserInfo claims and resources on %s", (_name, table) => {
		const columnNames = getTableConfig(table).columns.map((column) => column.name);

		expect(columnNames).toEqual(
			expect.arrayContaining(["requested_user_info_claims", "resources"]),
		);
	});

	it("migrates authorization metadata before the upgraded runtime uses it", () => {
		const migration = readFileSync("drizzle/0021_kind_firelord.sql", "utf8");

		for (const table of ["oauth_consent", "oauth_access_token", "oauth_refresh_token"]) {
			expect(migration).toContain(
				`ALTER TABLE "${table}" ADD COLUMN "requested_user_info_claims" text[];`,
			);
		}
	});
});
