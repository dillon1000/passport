import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { account } from "./schema";

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
