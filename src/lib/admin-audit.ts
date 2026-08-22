/**
 * Admin audit event helpers. Inputs are server-side operator mutations and
 * bounded metadata; outputs are sanitized append-only audit event payloads.
 * Safe configuration point: add new action/target constants as privileged
 * worker routes are introduced.
 */
import { z } from "zod";

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
type AuditMetadataInput = z.input<ReturnType<typeof z.unknown>>;

export type AdminAuditEventInput = {
	action: AdminAuditAction;
	targetType: AdminAuditTargetType;
	targetId?: string | null;
	targetLabel?: string | null;
	organizationId?: string | null;
	metadata?: AuditMetadataInput;
};

const REDACTED_KEY_FRAGMENTS = [
	"authorization",
	"backup",
	"otp",
	"password",
	"secret",
	"token",
];

function isSecretLikeKey(key: string) {
	const normalized = key.toLowerCase();
	return REDACTED_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function sanitizeAuditMetadata(value: AuditMetadataInput): AdminAuditMetadata {
	const parsed = z.json().safeParse(value);
	if (!parsed.success || parsed.data === null) return null;
	const scalar = z.union([z.string(), z.number(), z.boolean()]).safeParse(parsed.data);
	if (scalar.success) return scalar.data;
	if (Array.isArray(parsed.data)) return parsed.data.map((item) => sanitizeAuditMetadata(item));
	const object = z.record(z.string(), z.json()).parse(parsed.data);
	const sanitized: { [key: string]: AdminAuditMetadata } = {};
	for (const [key, item] of Object.entries(object)) {
		if (!isSecretLikeKey(key)) sanitized[key] = sanitizeAuditMetadata(item);
	}
	return sanitized;
}

export function auditMetadataJSON(value: AuditMetadataInput) {
	const sanitized = sanitizeAuditMetadata(value);
	if (sanitized === null) return null;
	return JSON.stringify(sanitized);
}
