/**
 * Promotes one D1-backed Better Auth user and records the matching admin audit
 * event. The local mode uses Wrangler's persisted D1 database; remote mode uses
 * the bound production database. Both paths execute through Drizzle.
 */
import process from "node:process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { getPlatformProxy } from "wrangler";

import * as schema from "../src/db/schema.ts";

const ADMIN_ROLE = "admin";
const AUDIT_SOURCE = "pnpm admin:promote";
const PROMOTION_MODES = new Set(["local", "remote"]);

export class PromoteAdminUsageError extends Error {}

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

export function usageText() {
	return [
		"Usage: pnpm admin:promote [local|remote] <email>",
		"",
		"Promotes an existing Better Auth user in Cloudflare D1.",
		"",
		"Examples:",
		"  pnpm admin:promote alice@example.com",
		"  pnpm admin:promote remote alice@example.com",
	].join("\n");
}

export async function promoteAdminByEmail({ db, email, idFactory = randomUUID }) {
	const matches = await db
		.select({ id: schema.user.id, email: schema.user.email, role: schema.user.role })
		.from(schema.user)
		.where(eq(schema.user.email, email))
		.limit(2);
	if (!matches.length) throw new Error(`No user found for ${email}.`);
	if (matches.length > 1) throw new Error(`Multiple users matched ${email}.`);

	const user = matches[0];
	const previousRole = user.role ?? null;
	if (previousRole === ADMIN_ROLE) return { status: "already-admin", user };

	const now = new Date();
	const [updatedRows] = await db.batch([
		db
			.update(schema.user)
			.set({ role: ADMIN_ROLE, updatedAt: now })
			.where(eq(schema.user.id, user.id))
			.returning({ id: schema.user.id, email: schema.user.email, role: schema.user.role }),
		db.insert(schema.adminAuditEvent).values({
			id: idFactory(),
			createdAt: now,
			actorEmail: AUDIT_SOURCE,
			actorRole: "cli",
			action: "user.set_role",
			targetType: "user",
			targetId: user.id,
			targetLabel: user.email,
			metadata: JSON.stringify({ previousRole, role: ADMIN_ROLE, source: AUDIT_SOURCE }),
		}),
	]);
	const updatedUser = updatedRows[0];
	if (!updatedUser) throw new Error(`Could not update ${user.email}.`);
	return { status: "promoted", user: updatedUser };
}

export function formatPromotionResult(result) {
	return result.status === "already-admin"
		? `${result.user.email} is already an admin.\n`
		: `${result.user.email} is now an admin.\n`;
}

export async function runCLI({
	args = process.argv.slice(2),
	stdout = process.stdout,
	stderr = process.stderr,
	platformFactory = getPlatformProxy,
} = {}) {
	let platform;
	try {
		const parsed = parsePromotionArgs(args);
		if (parsed.help) {
			stdout.write(`${usageText()}\n`);
			return 0;
		}
		platform = await platformFactory({ remoteBindings: parsed.mode === "remote" });
		const db = drizzle(platform.env.DB, { schema });
		stdout.write(formatPromotionResult(await promoteAdminByEmail({ db, email: parsed.email })));
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`error: ${message}\n`);
		if (error instanceof PromoteAdminUsageError) stderr.write(`\n${usageText()}\n`);
		return 1;
	} finally {
		await platform?.dispose();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runCLI();
}
