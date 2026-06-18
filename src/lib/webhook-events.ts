/**
 * Pure webhook event-type taxonomy. No database or Node imports, so this module
 * is safe to import from the React client (event pickers, labels) as well as the
 * server. Signing, delivery, and emission live in `webhooks.ts`, which builds on
 * these constants. Slugs are shared with the account activity log where events
 * overlap so one identity event is named identically everywhere.
 */
export const WEBHOOK_EVENT_TYPES = {
	USER_CREATED: "user.created",
	USER_DELETED: "user.deleted",
	USER_BANNED: "user.banned",
	USER_UNBANNED: "user.unbanned",
	USER_ROLE_CHANGED: "user.role_changed",
	ACCOUNT_LINKED: "account.linked",
} as const;

export type WebhookEventType =
	(typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES];

export const WEBHOOK_EVENT_TYPE_VALUES = Object.values(
	WEBHOOK_EVENT_TYPES,
) as WebhookEventType[];

export function isWebhookEventType(value: string): value is WebhookEventType {
	return (WEBHOOK_EVENT_TYPE_VALUES as string[]).includes(value);
}

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
	"user.created": "User created",
	"user.deleted": "User deleted",
	"user.banned": "User banned",
	"user.unbanned": "User unbanned",
	"user.role_changed": "User role changed",
	"account.linked": "Account linked",
};

export function webhookEventLabel(type: string): string {
	return WEBHOOK_EVENT_LABELS[type as WebhookEventType] ?? type;
}
