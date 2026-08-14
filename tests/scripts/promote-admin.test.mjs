import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
	formatPromotionResult,
	parseDevVars,
	parsePromotionArgs,
	promoteAdminByEmail,
	resolveDatabaseURL,
	runCLI,
} from "./promote-admin.mjs";

function createSQLFactory(responses) {
	const calls = [];
	const sql = vi.fn((strings, ...values) => {
		calls.push({ text: Array.from(strings).join("?"), values });
		const response = responses.shift();
		if (response instanceof Error) return Promise.reject(response);
		return Promise.resolve(response);
	});
	sql.end = vi.fn(async () => {});
	return {
		calls,
		sqlFactory: vi.fn(() => sql),
	};
}

describe("promote admin script", () => {
	it("parses local dev vars without requiring dotenv", () => {
		expect(
			parseDevVars(`
				# ignored
				DATABASE_URL=postgresql://localhost/passport
				EMAIL_FROM=Passport <auth@example.com>
				QUOTED="quoted value"
			`),
		).toEqual({
			DATABASE_URL: "postgresql://localhost/passport",
			EMAIL_FROM: "Passport <auth@example.com>",
			QUOTED: "quoted value",
		});
	});

	it("prefers shell DATABASE_URL over .dev.vars", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "passport-promote-admin-"));
		fs.writeFileSync(path.join(cwd, ".dev.vars"), "DATABASE_URL=postgresql://file/passport\n");
		expect(resolveDatabaseURL({ env: { DATABASE_URL: "postgresql://env/passport" }, cwd })).toBe(
			"postgresql://env/passport",
		);
		expect(resolveDatabaseURL({ env: {}, cwd })).toBe("postgresql://file/passport");
	});

	it("uses PROD_DATABASE_URL for prod mode", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "passport-promote-admin-"));
		fs.writeFileSync(
			path.join(cwd, ".dev.vars"),
			"DATABASE_URL=postgresql://local/passport\nPROD_DATABASE_URL=postgresql://prod/passport\n",
		);

		expect(resolveDatabaseURL({ mode: "prod", env: {}, cwd })).toBe(
			"postgresql://prod/passport",
		);
		expect(
			resolveDatabaseURL({
				mode: "prod",
				env: { PROD_DATABASE_URL: "postgresql://env-prod/passport" },
				cwd,
			}),
		).toBe("postgresql://env-prod/passport");
	});

	it("parses positional and named email arguments", () => {
		expect(parsePromotionArgs(["alice@example.com"])).toEqual({
			help: false,
			mode: "local",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--email", "alice@example.com"])).toEqual({
			help: false,
			mode: "local",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--email=alice@example.com"])).toEqual({
			help: false,
			mode: "local",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--", "--email=alice@example.com"])).toEqual({
			help: false,
			mode: "local",
			email: "alice@example.com",
		});
	});

	it("parses explicit promotion modes", () => {
		expect(parsePromotionArgs(["prod", "alice@example.com"])).toEqual({
			help: false,
			mode: "prod",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--mode", "prod", "--email", "alice@example.com"])).toEqual({
			help: false,
			mode: "prod",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--mode=prod", "alice@example.com"])).toEqual({
			help: false,
			mode: "prod",
			email: "alice@example.com",
		});
	});

	it("rejects ambiguous promotion arguments", () => {
		expect(() => parsePromotionArgs([])).toThrow("exactly one user email");
		expect(() => parsePromotionArgs(["not-an-email"])).toThrow("valid user email");
		expect(() => parsePromotionArgs(["--role", "admin", "alice@example.com"])).toThrow(
			"Unknown option",
		);
		expect(() => parsePromotionArgs(["--mode", "staging", "alice@example.com"])).toThrow(
			"Unknown promotion mode",
		);
		expect(() => parsePromotionArgs(["prod", "--mode", "local", "alice@example.com"])).toThrow(
			"Pass only one promotion mode",
		);
	});

	it("promotes a matching user and records an audit event when the table exists", async () => {
		const { calls, sqlFactory } = createSQLFactory([
			[{ id: "user_1", email: "alice@example.com", role: "user" }],
			[{ id: "user_1", email: "alice@example.com", role: "admin" }],
			[{ table_name: "admin_audit_event" }],
			[],
		]);

		const result = await promoteAdminByEmail({
			databaseURL: "postgresql://localhost/passport",
			email: "alice@example.com",
			sqlFactory,
			idFactory: () => "audit_1",
		});

		expect(result).toEqual({
			status: "promoted",
			user: { id: "user_1", email: "alice@example.com", role: "admin" },
			auditRecorded: true,
		});
		expect(calls.map((call) => call.text).join("\n")).toContain('update "user"');
		expect(calls.map((call) => call.text).join("\n")).toContain('insert into "admin_audit_event"');
	});

	it("does not rewrite users that already have the admin role", async () => {
		const { calls, sqlFactory } = createSQLFactory([
			[{ id: "user_1", email: "alice@example.com", role: "admin" }],
		]);

		const result = await promoteAdminByEmail({
			databaseURL: "postgresql://localhost/passport",
			email: "alice@example.com",
			sqlFactory,
		});

		expect(result.status).toBe("already-admin");
		expect(calls).toHaveLength(1);
	});

	it("reports a warning when the audit table has not been migrated yet", async () => {
		const { sqlFactory } = createSQLFactory([
			[{ id: "user_1", email: "alice@example.com", role: null }],
			[{ id: "user_1", email: "alice@example.com", role: "admin" }],
			[{ table_name: null }],
		]);

		const result = await promoteAdminByEmail({
			databaseURL: "postgresql://localhost/passport",
			email: "alice@example.com",
			sqlFactory,
		});

		expect(formatPromotionResult(result)).toContain("Warning:");
	});

	it("returns a non-zero CLI status for missing configuration", async () => {
		const stderr = { write: vi.fn() };
		const exitCode = await runCLI({
			args: ["alice@example.com"],
			env: {},
			cwd: fs.mkdtempSync(path.join(os.tmpdir(), "passport-promote-admin-")),
			stderr,
			stdout: { write: vi.fn() },
		});

		expect(exitCode).toBe(1);
		expect(stderr.write.mock.calls.map((call) => call[0]).join("")).toContain(
			"DATABASE_URL is required",
		);
	});

	it("passes the production database URL to prod promotions", async () => {
		const { sqlFactory } = createSQLFactory([
			[{ id: "user_1", email: "alice@example.com", role: "user" }],
			[{ id: "user_1", email: "alice@example.com", role: "admin" }],
			[{ table_name: null }],
		]);
		const stdout = { write: vi.fn() };
		const exitCode = await runCLI({
			args: ["prod", "alice@example.com"],
			env: { PROD_DATABASE_URL: "postgresql://prod/passport" },
			cwd: fs.mkdtempSync(path.join(os.tmpdir(), "passport-promote-admin-")),
			stderr: { write: vi.fn() },
			stdout,
			sqlFactory,
		});

		expect(exitCode).toBe(0);
		expect(sqlFactory).toHaveBeenCalledWith("postgresql://prod/passport", { prepare: false });
		expect(stdout.write.mock.calls.map((call) => call[0]).join("")).toContain(
			"alice@example.com is now an admin.",
		);
	});
});
