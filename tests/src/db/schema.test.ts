import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/sqlite-core";
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

	it("creates the required issuer and scoped identity index in D1", () => {
		const migration = readFileSync("drizzle/0000_marvelous_runaways.sql", "utf8");

		expect(migration).toContain("`issuer` text NOT NULL");
		expect(migration).toContain(
			"CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`)",
		);
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

	it("creates authorization metadata before the runtime uses it", () => {
		const migration = readFileSync("drizzle/0000_marvelous_runaways.sql", "utf8");

		for (const table of ["oauth_consent", "oauth_access_token", "oauth_refresh_token"]) {
			const createTable = migration.indexOf(`CREATE TABLE \`${table}\``);
			const nextStatement = migration.indexOf("--> statement-breakpoint", createTable);
			const tableDefinition = migration.slice(createTable, nextStatement);
			expect(createTable).toBeGreaterThanOrEqual(0);
			expect(tableDefinition).toContain("`requested_user_info_claims` text");
			expect(tableDefinition).toContain("`resources` text");
		}
	});
});
