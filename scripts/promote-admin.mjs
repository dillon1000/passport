/**
 * Command-line admin promotion helper. Inputs are a promotion mode, user email,
 * and database URL from the shell or `.dev.vars`; output is a single role update
 * against Better Auth's `user.role` column and, when available, an audit event.
 * Safe configuration points are DATABASE_URL for local mode, PROD_DATABASE_URL
 * for prod mode, and the target role aligned with the Better Auth admin plugin.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

const ADMIN_ROLE = "admin";
const DEV_VARS_FILE = ".dev.vars";
const AUDIT_SOURCE = "pnpm admin:promote";
const PROMOTION_MODES = new Set(["local", "prod"]);

export class PromoteAdminUsageError extends Error {}

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

export function resolveDatabaseURL({ mode = "local", env, cwd }) {
	if (!PROMOTION_MODES.has(mode)) {
		throw new PromoteAdminUsageError(`Unknown promotion mode: ${mode}`);
	}

	const key = mode === "prod" ? "PROD_DATABASE_URL" : "DATABASE_URL";
	const directValue = env[key]?.trim();
	if (directValue) return directValue;
	const fileValue = readDevVars(cwd)[key]?.trim();
	return fileValue || undefined;
}

export function usageText() {
	return [
		"Usage: pnpm admin:promote [local|prod] <email>",
		"",
		"Promotes an existing Better Auth user to the admin role.",
		"local uses DATABASE_URL from the shell or .dev.vars.",
		"prod uses PROD_DATABASE_URL from the shell or .dev.vars.",
		"",
		"Examples:",
		"  pnpm admin:promote alice@example.com",
		"  pnpm admin:promote prod alice@example.com",
		"  PROD_DATABASE_URL=postgresql://... pnpm admin:promote --mode prod --email alice@example.com",
	].join("\n");
}

function isLikelyEmail(value) {
	return /^[^\s@]+@[^\s@]+$/.test(value);
}

export function parsePromotionArgs(args) {
	const values = [];
	let mode = "local";
	let modeSet = false;
	const setMode = (value) => {
		if (modeSet) throw new PromoteAdminUsageError("Pass only one promotion mode.");
		if (!PROMOTION_MODES.has(value)) {
			throw new PromoteAdminUsageError(`Unknown promotion mode: ${value}`);
		}
		mode = value;
		modeSet = true;
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--") continue;
		if (arg === "--help" || arg === "-h") return { help: true };
		if (arg === "--mode") {
			const value = args[index + 1];
			if (!value) throw new PromoteAdminUsageError("Missing value for --mode.");
			setMode(value);
			index += 1;
			continue;
		}
		if (arg?.startsWith("--mode=")) {
			setMode(arg.slice("--mode=".length));
			continue;
		}
		if (arg === "--email") {
			const value = args[index + 1];
			if (!value) throw new PromoteAdminUsageError("Missing value for --email.");
			values.push(value);
			index += 1;
			continue;
		}
		if (arg?.startsWith("--email=")) {
			values.push(arg.slice("--email=".length));
			continue;
		}
		if (arg?.startsWith("-")) {
			throw new PromoteAdminUsageError(`Unknown option: ${arg}`);
		}
		if (PROMOTION_MODES.has(arg)) {
			setMode(arg);
			continue;
		}
		if (arg) values.push(arg);
	}

	if (values.length !== 1) {
		throw new PromoteAdminUsageError("Pass exactly one user email to promote.");
	}

	const email = values[0].trim();
	if (!isLikelyEmail(email)) {
		throw new PromoteAdminUsageError("Pass a valid user email address.");
	}
	return { help: false, mode, email };
}

function firstRow(rows) {
	return Array.isArray(rows) ? rows[0] : undefined;
}

function hasAuditTable(rows) {
	const row = firstRow(rows);
	return Boolean(row?.table_name);
}

async function recordPromotionAudit(sql, user, previousRole, idFactory) {
	const tableRows = await sql`select to_regclass('public.admin_audit_event') as table_name`;
	if (!hasAuditTable(tableRows)) return false;

	await sql`
		insert into "admin_audit_event" (
			id,
			actor_email,
			actor_role,
			action,
			target_type,
			target_id,
			target_label,
			metadata
		)
		values (
			${idFactory()},
			${AUDIT_SOURCE},
			${"cli"},
			${"user.set_role"},
			${"user"},
			${user.id},
			${user.email},
			${JSON.stringify({ previousRole, role: ADMIN_ROLE, source: AUDIT_SOURCE })}
		)
	`;
	return true;
}

export async function promoteAdminByEmail({
	databaseURL,
	email,
	sqlFactory = postgres,
	idFactory = randomUUID,
}) {
	const sql = sqlFactory(databaseURL, { prepare: false });
	try {
		const matches = await sql`
			select id, email, role
			from "user"
			where lower(email) = lower(${email})
		`;

		if (!matches.length) {
			throw new Error(`No user found for ${email}.`);
		}
		if (matches.length > 1) {
			throw new Error(`Multiple users matched ${email}; use the stored email casing exactly.`);
		}

		const user = matches[0];
		const previousRole = user.role ?? null;
		if (previousRole === ADMIN_ROLE) {
			return { status: "already-admin", user, auditRecorded: false };
		}

		const updatedRows = await sql`
			update "user"
			set role = ${ADMIN_ROLE}, updated_at = now()
			where id = ${user.id}
			returning id, email, role
		`;
		const updatedUser = firstRow(updatedRows);
		if (!updatedUser) {
			throw new Error(`Could not update ${user.email}.`);
		}

		const auditRecorded = await recordPromotionAudit(sql, updatedUser, previousRole, idFactory);
		return { status: "promoted", user: updatedUser, auditRecorded };
	} finally {
		await sql.end({ timeout: 5 });
	}
}

export function formatPromotionResult(result) {
	if (result.status === "already-admin") {
		return `${result.user.email} is already an admin.\n`;
	}

	const warning = result.auditRecorded
		? ""
		: "Warning: admin_audit_event table was not found, so no audit event was recorded.\n";
	return `${result.user.email} is now an admin.\n${warning}`;
}

export async function runCLI({
	args = process.argv.slice(2),
	env = process.env,
	cwd = process.cwd(),
	stdout = process.stdout,
	stderr = process.stderr,
	sqlFactory = postgres,
	idFactory = randomUUID,
} = {}) {
	try {
		const parsed = parsePromotionArgs(args);
		if (parsed.help) {
			stdout.write(`${usageText()}\n`);
			return 0;
		}

		const databaseURL = resolveDatabaseURL({ mode: parsed.mode, env, cwd });
		if (!databaseURL) {
			const key = parsed.mode === "prod" ? "PROD_DATABASE_URL" : "DATABASE_URL";
			throw new PromoteAdminUsageError(`${key} is required in the shell or .dev.vars.`);
		}

		const result = await promoteAdminByEmail({
			databaseURL,
			email: parsed.email,
			sqlFactory,
			idFactory,
		});
		stdout.write(formatPromotionResult(result));
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`error: ${message}\n`);
		if (error instanceof PromoteAdminUsageError) {
			stderr.write(`\n${usageText()}\n`);
		}
		return 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const exitCode = await runCLI();
	process.exitCode = exitCode;
}
