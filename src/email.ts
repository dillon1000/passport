/**
 * Transactional email helpers: each function builds the subject, plain-text body,
 * and HTML body sent through the configured EMAIL binding. Plain-text bodies are
 * authored here for deliverability; HTML bodies are rendered from the React Email
 * templates in `./emails/templates`, which escape dynamic content automatically.
 */
import { render } from "@react-email/render";

import {
	ActionEmail,
	DataExportReadyEmail,
	DataExportRequestedEmail,
	OrganizationInvitationEmail,
	OTPEmail,
	SecurityAlertEmail,
} from "./emails/templates";
import type { AuthEnv } from "./env";
import { requestMetadataText, type RequestMetadata } from "./lib/request-metadata";

type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

export async function sendAuthEmail(env: AuthEnv, message: EmailMessage) {
	await env.EMAIL.send({
		from: env.EMAIL_FROM,
		to: message.to,
		subject: message.subject,
		text: message.text,
		html: message.html,
	});
}

export async function sendMagicLinkEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Sign in to Passport",
		text: `Open this link to sign in to Passport: ${url}`,
		html: await render(
			ActionEmail({
				heading: "Sign in to Passport",
				intro: "Use the button below to sign in to Passport. This link expires shortly.",
				buttonLabel: "Sign in",
				url,
			}),
		),
	});
}

export async function sendVerificationEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Verify your Passport email",
		text: `Open this link to verify your Passport email: ${url}`,
		html: await render(
			ActionEmail({
				heading: "Verify your email",
				intro: "Use the button below to verify your Passport email address.",
				buttonLabel: "Verify email",
				url,
			}),
		),
	});
}

export async function sendPasswordResetEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Reset your Passport password",
		text: `Open this link to reset your Passport password: ${url}`,
		html: await render(
			ActionEmail({
				heading: "Reset your password",
				intro: "Use the button below to choose a new Passport password. This link expires shortly.",
				buttonLabel: "Reset password",
				url,
			}),
		),
	});
}

export async function sendDeleteAccountEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Delete your Passport account",
		text: `Open this link to delete your Passport account: ${url}`,
		html: await render(
			ActionEmail({
				heading: "Delete your account",
				intro:
					"Use the button below to permanently delete your Passport account. This cannot be undone.",
				buttonLabel: "Delete account",
				url,
			}),
		),
	});
}

export async function sendOrganizationInvitationEmail(
	env: AuthEnv,
	email: string,
	organizationName: string,
	inviterName: string,
	url: string,
) {
	await sendAuthEmail(env, {
		to: email,
		subject: `Join ${organizationName} on Passport`,
		text: `${inviterName} invited you to join ${organizationName} on Passport: ${url}`,
		html: await render(
			OrganizationInvitationEmail({ organizationName, inviterName, url }),
		),
	});
}

export async function sendTwoFactorOTPEmail(env: AuthEnv, email: string, otp: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Your Passport verification code",
		text: `Your Passport verification code is ${otp}.`,
		html: await render(OTPEmail({ otp })),
	});
}

export async function sendSecurityAlertEmail(
	env: AuthEnv,
	email: string,
	event: string,
	metadata: RequestMetadata,
) {
	await sendAuthEmail(env, {
		to: email,
		subject: `${event} on Passport`,
		text: `${event}\n\n${requestMetadataText(metadata)}`,
		html: await render(SecurityAlertEmail({ event, metadata })),
	});
}

export async function sendDataExportRequestedEmail(
	env: AuthEnv,
	email: string,
	cancelURL: string,
	metadata: RequestMetadata,
) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Passport data export requested",
		text: [
			"A Passport data export was requested for your account.",
			"The export waits 15 minutes before it is prepared.",
			"",
			requestMetadataText(metadata),
			"",
			`Review or cancel this request: ${cancelURL}`,
		].join("\n"),
		html: await render(DataExportRequestedEmail({ cancelURL, metadata })),
	});
}

export async function sendDataExportReadyEmail(
	env: AuthEnv,
	email: string,
	downloadURL: string,
	expiresAt: string,
	metadata: RequestMetadata,
) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Passport data export ready",
		text: [
			"Your Passport account data export is ready.",
			`The download page expires ${new Date(expiresAt).toLocaleString()}.`,
			"",
			requestMetadataText(metadata),
			"",
			`Open the download page: ${downloadURL}`,
		].join("\n"),
		html: await render(DataExportReadyEmail({ downloadURL, expiresAt, metadata })),
	});
}
