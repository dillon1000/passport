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
	BILLING_CUSTOMER_CREATED: "billing.customer_created",
	BILLING_SUBSCRIPTION_COMPLETED: "billing.subscription_completed",
	BILLING_SUBSCRIPTION_CREATED: "billing.subscription_created",
	BILLING_SUBSCRIPTION_UPDATED: "billing.subscription_updated",
	BILLING_SUBSCRIPTION_CANCELED: "billing.subscription_canceled",
	BILLING_SUBSCRIPTION_DELETED: "billing.subscription_deleted",
	BILLING_ONE_TIME_PURCHASE_COMPLETED: "billing.one_time_purchase_completed",
	BILLING_TRIAL_STARTED: "billing.trial_started",
	BILLING_TRIAL_ENDED: "billing.trial_ended",
	BILLING_TRIAL_EXPIRED: "billing.trial_expired",
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
	"billing.customer_created": "Billing customer created",
	"billing.subscription_completed": "Billing subscription completed",
	"billing.subscription_created": "Billing subscription created",
	"billing.subscription_updated": "Billing subscription updated",
	"billing.subscription_canceled": "Billing subscription canceled",
	"billing.subscription_deleted": "Billing subscription deleted",
	"billing.one_time_purchase_completed": "Billing one-time purchase completed",
	"billing.trial_started": "Billing trial started",
	"billing.trial_ended": "Billing trial ended",
	"billing.trial_expired": "Billing trial expired",
};

export function webhookEventLabel(type: string): string {
	return WEBHOOK_EVENT_LABELS[type as WebhookEventType] ?? type;
}
