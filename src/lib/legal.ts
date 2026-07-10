/**
 * Legal policy content rendered in Settings drawers and the public About page.
 * These sections are product copy, not executable policy; update this file when
 * data handling, retention, subprocessors, billing, refunds, or user
 * obligations change.
 */
export type LegalSection = {
	title: string;
	body: string[];
};

export const legalUpdatedAt = "June 17, 2026";

export const privacyPolicySections: LegalSection[] = [
	{
		title: "What we collect",
		body: [
			"When you sign up, you give us your name, email, username, and password. You can also add a profile photo, phone number, passkeys, an authenticator app, and social sign-in accounts. We keep this because it is your account.",
			"To run sessions and catch suspicious activity, we record some request metadata: IP address, browser and operating system, the rough location Cloudflare derives from your connection, and timestamps. This shows up in your active sessions, security alerts, and audit log.",
		],
	},
	{
		title: "What we do with it",
		body: [
			"We use your data to sign you in, recover your account, run two-factor authentication and passkeys, issue OAuth and OpenID Connect tokens, manage organizations and application access, send security alerts, and build the data exports you ask for.",
			"Passwords, OAuth tokens, two-factor secrets, backup codes, and signing keys exist only to keep authentication working. We store them protected, never show them in exports except as redacted records, and never use your data for advertising. We do not sell it.",
		],
	},
	{
		title: "Who we share it with",
		body: [
			"Applications get only the claims you approve when you authorize them — nothing more. First-party apps configured by the operator follow the same rule.",
			"A few providers process data so the service can run: Cloudflare hosts the Worker, storage, email, and database layer; Stripe handles payments; and email or SMS providers deliver verification and security messages. Each only touches what it needs to do its job.",
			"We will hand over data if the law requires it, or if we need to enforce our terms or protect people from harm.",
		],
	},
	{
		title: "How long we keep it",
		body: [
			"Your account sticks around as long as your account exists. Session, audit, OAuth, organization, billing, and consent records are kept for security and operational history until you or the operator remove them.",
			"Export archives live in a private bucket and are only reachable through short-lived download links. Every export waits 15 minutes before it finishes, so you have time to cancel one you did not start.",
		],
	},
	{
		title: "Deleting your account",
		body: [
			"When deletion is enabled, you can delete your account from Security. That removes your account and the authentication records tied to it. Backups may hold copies for a short while before they are overwritten.",
		],
	},
	{
		title: "Your choices",
		body: [
			"From the dashboard you control your profile, connected accounts, passkeys, phone number, two-factor authentication, active sessions, authorized applications, organizations, and notification settings. You can export everything at any time.",
			"Depending on where you live, you may have extra rights to access, correct, or limit how we process your data. Contact the operator to use them.",
		],
	},
	{
		title: "Keeping it safe",
		body: [
			"We hash passwords, encrypt secrets, scope every token, and offer passkeys, two-factor authentication, captcha challenges, and security alerts. No service is perfectly secure, so guard your credentials and recovery methods too.",
		],
	},
	{
		title: "Changes",
		body: [
			"If this policy changes, we update the date above. Keep using Passport and you accept the new version.",
		],
	},
];

export const billingPolicySections: LegalSection[] = [
	{
		title: "Plans and pricing",
		body: [
			"Passport has a free tier and paid plans. Before you confirm a subscription, checkout shows the price, the billing interval, and what the plan includes. Paid plans are billed up front for the interval you pick.",
			"Prices are in the currency shown at checkout, and any tax is added there based on your details. The total you approve is what you pay, until you change plans.",
		],
	},
	{
		title: "How payment works",
		body: [
			"Stripe processes payments. We never see or store your full card number — Stripe holds your payment method under its own terms.",
			"Subscribing authorizes us, through Stripe, to charge your payment method for the subscription and any tax until you cancel.",
		],
	},
	{
		title: "Renewals",
		body: [
			"Subscriptions renew on their own at the end of each interval, at your plan's current price, until you cancel.",
			"If a renewal fails, Stripe retries for a few days. If it still cannot collect, we pause paid features or move you back to the free tier.",
		],
	},
	{
		title: "Changing or canceling",
		body: [
			"Upgrade, downgrade, or cancel anytime from the Billing page. Upgrades apply right away, and we prorate the difference for the rest of the interval.",
			"Downgrades and cancellations take effect at the end of the interval you already paid for, so you keep paid access until then. Canceling stops future renewals; your account stays on the free tier unless you delete it from Security.",
		],
	},
	{
		title: "Price changes",
		body: [
			"Plan prices can change. A new price only applies to renewals after the change, and we give you notice first so you can cancel before paying it.",
		],
	},
	{
		title: "Invoices",
		body: [
			"Stripe emails a receipt for every charge to your account address. The billing portal, linked from the Billing page, has your full invoice history and lets you update your payment method.",
		],
	},
];

export const refundPolicySections: LegalSection[] = [
	{
		title: "The short version",
		body: [
			"Paid plans are billed up front and are generally not refundable for the interval you are in. When you cancel, you keep paid access until that interval ends and you are not charged again.",
			"Where local consumer law gives you stronger rights, those win over anything here.",
		],
	},
	{
		title: "When we refund",
		body: [
			"We refund clear billing problems: a duplicate charge, a charge after you canceled, an obvious mistake, or paid features you could not reach because of something on our end that we could not fix.",
			"Outside those cases, refunds are at the operator's discretion. We do not refund change of mind once an interval has started, and we do not prorate refunds for unused time after a cancellation unless the law requires it.",
		],
	},
	{
		title: "Asking for one",
		body: [
			"Email support from your account address within 14 days of the charge. Include the invoice number from your Stripe receipt and a line on what went wrong, and we will look into it as soon as we have what we need.",
		],
	},
	{
		title: "How refunds reach you",
		body: [
			"Approved refunds go back through Stripe to the card you paid with. How long it takes to show up depends on your bank, not us.",
		],
	},
	{
		title: "Chargebacks",
		body: [
			"Talk to us before disputing a charge with your bank — we can almost always sort it out faster directly. Accounts with an open, unresolved chargeback have paid features paused until the balance is settled.",
		],
	},
];

export const termsOfServiceSections: LegalSection[] = [
	{
		title: "Agreeing to these terms",
		body: [
			"Creating an account, signing in, or authorizing an app through Passport means you agree to these terms, the Privacy Policy, and — on a paid plan — the Billing and Refund policies.",
			"If you use Passport for an organization, you confirm you are allowed to accept these terms on its behalf.",
		],
	},
	{
		title: "Using Passport",
		body: [
			"Passport is an identity provider: it signs you in, lets you authorize apps, manages your account security, and issues OAuth and OpenID Connect tokens. Your credentials and trusted devices are yours to protect, and you are responsible for what happens under your account.",
			"Do not use Passport to get around access controls, attack or probe connected apps, fake an identity, infringe anyone's rights, spread malware, or disrupt the service or other users.",
		],
	},
	{
		title: "Keeping your account secure",
		body: [
			"Give us accurate details, keep access to your email, and check security alerts when something looks unfamiliar.",
			"Your passkeys, phone number, authenticators, backup codes, and linked social accounts are your responsibility. Remove any you no longer control, and tell the operator if you think your account is compromised.",
		],
	},
	{
		title: "Apps and organizations",
		body: [
			"Connected apps receive only the scopes you grant, and you can revoke any of them from the dashboard. Once you are inside an app, that app's own terms and privacy practices apply.",
			"Organization roles and permissions shape what apps and admins can see or change. Admins with the configured access can manage OAuth clients, users, roles, bans, organizations, and audit records.",
		],
	},
	{
		title: "Paid plans",
		body: [
			"Some features need a paid subscription. The Billing Policy covers pricing, renewals, and cancellation; the Refund Policy covers refunds. Subscribing authorizes the recurring charges described there.",
		],
	},
	{
		title: "Availability",
		body: [
			"Passport changes as standards, Cloudflare, Better Auth, and operational needs change — features can be adjusted, limited, or removed to keep it secure and reliable.",
			"The service comes as is. We cannot promise every app, provider, browser, authenticator, or network will work without interruption, and within what the law allows we are not liable for indirect or consequential losses from using it.",
		],
	},
	{
		title: "Ending access",
		body: [
			"Access can be suspended or removed for breaking these terms, threatening the service, or under an operator or organization decision.",
			"You can stop using Passport whenever you want and delete your account from Security where that is enabled. Terms that should outlast the account — like the disclaimers above — still apply afterward.",
		],
	},
	{
		title: "Changes",
		body: [
			"We may update these terms as the service or the law changes, and we update the date above when we do. Keep using Passport and you accept the new version.",
		],
	},
];
