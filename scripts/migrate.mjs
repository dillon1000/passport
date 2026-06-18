/**
 * Drizzle migration wrapper. Inputs are a migration mode plus database URLs
 * from the shell or `.dev.vars`; output is the drizzle-kit migrate process
 * running with the selected URL exposed as DATABASE_URL. Safe configuration
 * points are DATABASE_URL for local migrations and PROD_DATABASE_URL for prod.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEV_VARS_FILE = ".dev.vars";
const DRIZZLE_BIN = "node_modules/drizzle-kit/bin.cjs";
const MIGRATION_MODES = new Set(["local", "prod"]);

export class MigrateUsageError extends Error {}

export function parseDevVars(contents) {
	const values = {};
	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const separator = line.indexOf("=");
		if (separator === -1) continue;

		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

		const quoted =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"));
		if (quoted) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

export function readDevVars(cwd) {
	const filePath = path.join(cwd, DEV_VARS_FILE);
	if (!fs.existsSync(filePath)) return {};
	return parseDevVars(fs.readFileSync(filePath, "utf8"));
}

export function parseMigrationArgs(args) {
	let mode = "local";
	let modeSet = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--") continue;
		if (arg === "--help" || arg === "-h") return { help: true, mode };
		if (arg === "--mode") {
			const value = args[index + 1];
			if (!value) throw new MigrateUsageError("Missing value for --mode.");
			if (modeSet) throw new MigrateUsageError("Pass only one migration mode.");
			mode = value;
			modeSet = true;
			index += 1;
			continue;
		}
		if (arg?.startsWith("--mode=")) {
			if (modeSet) throw new MigrateUsageError("Pass only one migration mode.");
			mode = arg.slice("--mode=".length);
			modeSet = true;
			continue;
		}
		if (arg?.startsWith("-")) {
			throw new MigrateUsageError(`Unknown option: ${arg}`);
		}
		if (modeSet) throw new MigrateUsageError("Pass only one migration mode.");
		mode = arg;
		modeSet = true;
	}

	if (!MIGRATION_MODES.has(mode)) {
		throw new MigrateUsageError(`Unknown migration mode: ${mode}`);
	}
	return { help: false, mode };
}

export function resolveMigrationDatabaseURL({ mode, env, cwd }) {
	const devVars = readDevVars(cwd);
	const key = mode === "prod" ? "PROD_DATABASE_URL" : "DATABASE_URL";
	const directValue = env[key]?.trim();
	if (directValue) return directValue;
	const fileValue = devVars[key]?.trim();
	return fileValue || undefined;
}

export function usageText() {
	return [
		"Usage: pnpm db:migrate [local|prod]",
		"",
		"Runs Drizzle migrations against the selected database.",
		"local uses DATABASE_URL from the shell or .dev.vars.",
		"prod uses PROD_DATABASE_URL from the shell or .dev.vars.",
		"",
		"Examples:",
		"  pnpm db:migrate",
		"  pnpm db:migrate prod",
	].join("\n");
}

export async function runCLI({
	args = process.argv.slice(2),
	env = process.env,
	cwd = process.cwd(),
	stdout = process.stdout,
	stderr = process.stderr,
	spawnProcess = spawnSync,
} = {}) {
	try {
		const parsed = parseMigrationArgs(args);
		if (parsed.help) {
			stdout.write(`${usageText()}\n`);
			return 0;
		}

		const databaseURL = resolveMigrationDatabaseURL({
			mode: parsed.mode,
			env,
			cwd,
		});
		if (!databaseURL) {
			const key = parsed.mode === "prod" ? "PROD_DATABASE_URL" : "DATABASE_URL";
			throw new MigrateUsageError(`${key} is required in the shell or .dev.vars.`);
		}

		const result = spawnProcess(process.execPath, [DRIZZLE_BIN, "migrate"], {
			cwd,
			env: {
				...env,
				DATABASE_URL: databaseURL,
			},
			stdio: "inherit",
		});
		return result.status ?? result.exitCode ?? 0;
	} catch (error) {
		if (error instanceof MigrateUsageError) {
			stderr.write(`${error.message}\n\n${usageText()}\n`);
			return 1;
		}
		throw error;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runCLI();
}
