/**
 * Identity-keyed account lockout helpers. Inputs are credential identifiers,
 * env-configured thresholds, and the shared auth KV namespace; outputs are
 * short-lived lockout state reads/writes used by the auth hook. Identifiers are
 * normalized and hashed before becoming KV keys so email addresses are never
 * exposed in storage keys.
 */
import { parseOptionalBoolean, parseOptionalInteger } from "./auth-server/env";

export const ACCOUNT_LOCKOUT_KEY_PREFIX = "passport:account-lockout:";
export const DEFAULT_ACCOUNT_LOCKOUT_THRESHOLD = 10;
export const DEFAULT_ACCOUNT_LOCKOUT_WINDOW_SECONDS = 15 * 60;
export const DEFAULT_ACCOUNT_LOCKOUT_COOLDOWN_SECONDS = 15 * 60;
const MIN_LOCKOUT_TTL_SECONDS = 60;

export type AccountLockoutPolicy = {
	enabled: boolean;
	threshold: number;
	windowSeconds: number;
	cooldownSeconds: number;
};

export type AccountLockoutState = {
	attempts: number;
	windowStartedAt: string;
	lockedUntil?: string;
};

type AccountLockoutEnv = {
	ACCOUNT_LOCKOUT_ENABLED?: string;
	ACCOUNT_LOCKOUT_THRESHOLD?: string;
	ACCOUNT_LOCKOUT_WINDOW_SECONDS?: string;
	ACCOUNT_LOCKOUT_COOLDOWN_SECONDS?: string;
};

type AccountLockoutKV = {
	get: (key: string) => Promise<string | null>;
	put: (
		key: string,
		value: string,
		options?: {
			expirationTtl?: number;
		},
	) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

export function accountLockoutPolicyFromEnv(
	env: AccountLockoutEnv,
): AccountLockoutPolicy {
	return {
		enabled:
			parseOptionalBoolean(env.ACCOUNT_LOCKOUT_ENABLED, "ACCOUNT_LOCKOUT_ENABLED") ??
			true,
		threshold:
			parseOptionalInteger(env.ACCOUNT_LOCKOUT_THRESHOLD, "ACCOUNT_LOCKOUT_THRESHOLD", {
				min: 1,
			}) ?? DEFAULT_ACCOUNT_LOCKOUT_THRESHOLD,
		windowSeconds:
			parseOptionalInteger(
				env.ACCOUNT_LOCKOUT_WINDOW_SECONDS,
				"ACCOUNT_LOCKOUT_WINDOW_SECONDS",
				{ min: 60 },
			) ?? DEFAULT_ACCOUNT_LOCKOUT_WINDOW_SECONDS,
		cooldownSeconds:
			parseOptionalInteger(
				env.ACCOUNT_LOCKOUT_COOLDOWN_SECONDS,
				"ACCOUNT_LOCKOUT_COOLDOWN_SECONDS",
				{ min: 60 },
			) ?? DEFAULT_ACCOUNT_LOCKOUT_COOLDOWN_SECONDS,
	};
}

export function normalizeLockoutIdentifier(value: string | null | undefined) {
	const normalized = value?.trim().toLowerCase();
	return normalized || null;
}

function base64URL(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function accountLockoutKey(identifier: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(identifier),
	);
	return `${ACCOUNT_LOCKOUT_KEY_PREFIX}${base64URL(new Uint8Array(digest))}`;
}

function parseLockoutState(value: string | null): AccountLockoutState | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<AccountLockoutState>;
		if (
			typeof parsed.attempts !== "number" ||
			typeof parsed.windowStartedAt !== "string"
		) {
			return null;
		}
		return {
			attempts: parsed.attempts,
			windowStartedAt: parsed.windowStartedAt,
			...(typeof parsed.lockedUntil === "string"
				? { lockedUntil: parsed.lockedUntil }
				: {}),
		};
	} catch {
		return null;
	}
}

export function isLockedOut(
	state: Pick<AccountLockoutState, "lockedUntil"> | null | undefined,
	now: Date = new Date(),
) {
	if (!state?.lockedUntil) return false;
	const lockedUntil = new Date(state.lockedUntil);
	return Number.isFinite(lockedUntil.getTime()) && lockedUntil > now;
}

function windowExpired(
	state: AccountLockoutState | null,
	policy: AccountLockoutPolicy,
	now: Date,
) {
	if (!state) return true;
	const windowStartedAt = new Date(state.windowStartedAt);
	if (!Number.isFinite(windowStartedAt.getTime())) return true;
	return now.getTime() - windowStartedAt.getTime() >= policy.windowSeconds * 1000;
}

function lockoutTTL(policy: AccountLockoutPolicy) {
	return Math.max(
		MIN_LOCKOUT_TTL_SECONDS,
		policy.windowSeconds,
		policy.cooldownSeconds,
	);
}

export async function readAccountLockoutStatus(
	kv: AccountLockoutKV,
	identifier: string | null | undefined,
	policy: AccountLockoutPolicy,
	now: Date = new Date(),
) {
	if (!policy.enabled) return { locked: false as const };
	const normalized = normalizeLockoutIdentifier(identifier);
	if (!normalized) return { locked: false as const };
	const state = parseLockoutState(await kv.get(await accountLockoutKey(normalized)));
	if (!isLockedOut(state, now)) return { locked: false as const };
	return {
		locked: true as const,
		lockedUntil: state?.lockedUntil,
	};
}

export async function recordFailedCredentialAttempt(
	kv: AccountLockoutKV,
	identifier: string | null | undefined,
	policy: AccountLockoutPolicy,
	now: Date = new Date(),
) {
	if (!policy.enabled) {
		return { attempts: 0, locked: false, lockoutStarted: false };
	}
	const normalized = normalizeLockoutIdentifier(identifier);
	if (!normalized) {
		return { attempts: 0, locked: false, lockoutStarted: false };
	}

	const key = await accountLockoutKey(normalized);
	const currentState = parseLockoutState(await kv.get(key));
	if (isLockedOut(currentState, now)) {
		return {
			attempts: currentState?.attempts ?? policy.threshold,
			locked: true,
			lockoutStarted: false,
			lockedUntil: currentState?.lockedUntil,
		};
	}

	const resetWindow = windowExpired(currentState, policy, now);
	const nextAttempts = resetWindow ? 1 : (currentState?.attempts ?? 0) + 1;
	const locked = nextAttempts >= policy.threshold;
	const lockedUntil = locked
		? new Date(now.getTime() + policy.cooldownSeconds * 1000).toISOString()
		: undefined;
	const nextState: AccountLockoutState = {
		attempts: nextAttempts,
		windowStartedAt: resetWindow
			? now.toISOString()
			: currentState?.windowStartedAt ?? now.toISOString(),
		...(lockedUntil ? { lockedUntil } : {}),
	};

	await kv.put(key, JSON.stringify(nextState), {
		expirationTtl: lockoutTTL(policy),
	});

	return {
		attempts: nextAttempts,
		locked,
		lockoutStarted: locked,
		lockedUntil,
	};
}

export async function clearCredentialAttempts(
	kv: AccountLockoutKV,
	identifier: string | null | undefined,
) {
	const normalized = normalizeLockoutIdentifier(identifier);
	if (!normalized) return;
	await kv.delete(await accountLockoutKey(normalized));
}
