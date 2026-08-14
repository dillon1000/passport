import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
	parseMigrationArgs,
	resolveMigrationDatabaseURL,
	runCLI,
} from "./migrate.mjs";

function createTempCwd(devVars) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "passport-migrate-"));
	fs.writeFileSync(path.join(cwd, ".dev.vars"), devVars);
	return cwd;
}

describe("migrate script", () => {
	it("uses local DATABASE_URL by default", () => {
		const cwd = createTempCwd(`
			DATABASE_URL=postgresql://localhost/passport
			PROD_DATABASE_URL=postgresql://prod/passport
		`);

		expect(resolveMigrationDatabaseURL({ mode: "local", env: {}, cwd })).toBe(
			"postgresql://localhost/passport",
		);
	});

	it("uses PROD_DATABASE_URL for prod mode", () => {
		const cwd = createTempCwd(`
			DATABASE_URL=postgresql://localhost/passport
			PROD_DATABASE_URL=postgresql://prod/passport
		`);

		expect(resolveMigrationDatabaseURL({ mode: "prod", env: {}, cwd })).toBe(
			"postgresql://prod/passport",
		);
	});

	it("passes the selected URL to drizzle as DATABASE_URL", async () => {
		const cwd = createTempCwd("PROD_DATABASE_URL=postgresql://prod/passport\n");
		const spawnProcess = vi.fn(() => ({ exitCode: 0 }));

		const exitCode = await runCLI({
			args: ["prod"],
			env: {},
			cwd,
			spawnProcess,
			stderr: { write: vi.fn() },
			stdout: { write: vi.fn() },
		});

		expect(exitCode).toBe(0);
		expect(spawnProcess).toHaveBeenCalledWith(
			process.execPath,
			["node_modules/drizzle-kit/bin.cjs", "migrate"],
			expect.objectContaining({
				cwd,
				env: expect.objectContaining({
					DATABASE_URL: "postgresql://prod/passport",
				}),
			}),
		);
	});

	it("parses explicit migration modes", () => {
		expect(parseMigrationArgs([])).toEqual({ help: false, mode: "local" });
		expect(parseMigrationArgs(["local"])).toEqual({ help: false, mode: "local" });
		expect(parseMigrationArgs(["prod"])).toEqual({ help: false, mode: "prod" });
		expect(parseMigrationArgs(["--", "--help"])).toEqual({ help: true, mode: "local" });
		expect(() => parseMigrationArgs(["prod", "local"])).toThrow("Pass only one");
		expect(() => parseMigrationArgs(["staging"])).toThrow("Unknown migration mode");
	});
});
