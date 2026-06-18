/**
 * Default email notification preferences shared by the Worker API, auth hooks,
 * and Settings UI. Missing database rows resolve to these defaults so new
 * accounts receive security notifications until they explicitly opt out.
 */
export type EmailNotificationPreferences = {
	securityAlerts: boolean;
};

export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES = {
	securityAlerts: true,
} as const satisfies EmailNotificationPreferences;
