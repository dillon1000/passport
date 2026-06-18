/**
 * Admin audit event helpers. Inputs are server-side operator mutations and
 * bounded metadata; outputs are sanitized append-only audit event payloads.
 * Safe configuration point: add new action/target constants as privileged
 * worker routes are introduced.
 */
export const ADMIN_AUDIT_ACTIONS = {
	OAUTH_CLIENT_CREATE: "oauth_client.create",
	OAUTH_CLIENT_UPDATE: "oauth_client.update",
	OAUTH_CLIENT_ROTATE_SECRET: "oauth_client.rotate_secret",
	OAUTH_CLIENT_DISABLE: "oauth_client.disable",
	OAUTH_CLIENT_ENABLE: "oauth_client.enable",
	USER_SET_ROLE: "user.set_role",
	USER_BAN: "user.ban",
	USER_UNBAN: "user.unban",
} as const;

export const ADMIN_AUDIT_TARGET_TYPES = {
	OAUTH_CLIENT: "oauth_client",
	USER: "user",
} as const;

export type AdminAuditAction =
	(typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

export type AdminAuditTargetType =
	(typeof ADMIN_AUDIT_TARGET_TYPES)[keyof typeof ADMIN_AUDIT_TARGET_TYPES];

export type AdminAuditMetadata =
	| null
	| string
	| number
	| boolean
	| AdminAuditMetadata[]
	| { [key: string]: AdminAuditMetadata };

export type AdminAuditEventInput = {
	action: AdminAuditAction;
	targetType: AdminAuditTargetType;
	targetId?: string | null;
	targetLabel?: string | null;
	organizationId?: string | null;
	metadata?: unknown;
};

const REDACTED_KEY_FRAGMENTS = [
	"authorization",
	"backup",
	"otp",
	"password",
	"secret",
	"token",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Object.prototype.toString.call(value) === "[object Object]";
}

function isSecretLikeKey(key: string) {
	const normalized = key.toLowerCase();
	return REDACTED_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function sanitizeAuditMetadata(value: unknown): AdminAuditMetadata {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeAuditMetadata(item));
	}
	if (!isPlainObject(value)) {
		return String(value);
	}

	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !isSecretLikeKey(key))
			.map(([key, item]) => [key, sanitizeAuditMetadata(item)]),
	) as AdminAuditMetadata;
}

export function auditMetadataJSON(value: unknown) {
	const sanitized = sanitizeAuditMetadata(value);
	if (sanitized === null) return null;
	return JSON.stringify(sanitized);
}
