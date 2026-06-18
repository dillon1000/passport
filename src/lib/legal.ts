/**
 * Legal policy content rendered in Settings drawers. These sections are product
 * copy, not executable policy; update this file when data handling, retention,
 * subprocessors, or user obligations change.
 */
export type LegalSection = {
	title: string;
	body: string[];
};

export const legalUpdatedAt = "June 17, 2026";

export const privacyPolicySections: LegalSection[] = [
	{
		title: "What Passport Collects",
		body: [
			"Passport stores the account information needed to authenticate you, including your name, email address, username, profile image, session metadata, connected sign-in methods, passkeys, phone verification state, organization memberships, OAuth application grants, and account security settings.",
			"Passport also stores coarse request metadata such as IP address, browser, operating system, approximate Cloudflare location, and timestamps for sessions, security notifications, audit events, and data export requests.",
		],
	},
	{
		title: "How Data Is Used",
		body: [
			"Data is used to provide sign-in, OAuth and OpenID Connect, account recovery, passkeys, two-factor authentication, organization access, application consent, security alerts, admin audit trails, and user-requested data exports.",
			"Credential secrets, OAuth tokens, two-factor secrets, backup codes, and signing keys are used only to operate authentication and security workflows. They are not included in user-facing exports except as redacted records.",
		],
	},
	{
		title: "Sharing",
		body: [
			"Passport shares profile, email, phone, organization, permission, and security claims only with applications you authorize or first-party clients configured by the operator.",
			"Cloudflare provides the Worker, R2, Email, Hyperdrive, and request metadata infrastructure used to run Passport. Email and SMS providers process messages required for verification and account security.",
		],
	},
	{
		title: "Retention And Exports",
		body: [
			"Account records are retained while your account exists. Session, audit, OAuth, organization, agent, and consent records are retained for security, authorization, and operational history unless deleted by account or operator workflows.",
			"Data export archives are stored in the configured private R2 bucket and exposed through short-lived Worker download links. Export requests wait 15 minutes before completion so you can cancel requests you do not recognize.",
		],
	},
	{
		title: "Your Choices",
		body: [
			"You can manage profile data, connected accounts, passkeys, phone number, two-factor authentication, active sessions, authorized applications, notification preferences, and data exports from the dashboard.",
			"You can request account deletion from Security. Deletion removes your account and related authentication records according to the configured database cascade behavior and operational backups.",
		],
	},
];

export const termsOfServiceSections: LegalSection[] = [
	{
		title: "Use Of Passport",
		body: [
			"Passport is an identity provider for signing in, authorizing applications, managing account security, and issuing OAuth and OpenID Connect tokens. You are responsible for keeping your account credentials and trusted devices secure.",
			"You may not use Passport to bypass access controls, attack connected applications, misrepresent identity, or interfere with the service or other users.",
		],
	},
	{
		title: "Account Security",
		body: [
			"You agree to provide accurate account information, maintain access to your email address, and promptly review security alerts for activity you do not recognize.",
			"Passkeys, phone numbers, two-factor authenticators, backup codes, and connected social accounts are your responsibility. Remove methods you no longer control.",
		],
	},
	{
		title: "Applications And Organizations",
		body: [
			"Connected applications receive only the scopes and claims they are authorized to request. Organization roles, teams, and permissions may affect what applications and admins can see or change.",
			"Admins may manage OAuth clients, users, roles, bans, organizations, and audit information when their account has the configured administrative access.",
		],
	},
	{
		title: "Availability And Changes",
		body: [
			"Passport may change as authentication standards, Cloudflare services, Better Auth behavior, or operational requirements change. Features can be modified, limited, or removed to protect security and reliability.",
			"The service is provided without a guarantee that every integration, provider, browser, authenticator, or network condition will work continuously.",
		],
	},
	{
		title: "Termination",
		body: [
			"Access may be suspended or removed when an account violates these terms, threatens service integrity, or is subject to an operator or organization policy decision.",
			"You may stop using Passport or delete your account from Security when deletion is enabled.",
		],
	},
];
