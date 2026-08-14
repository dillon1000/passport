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
		subject: "Your Passport sign-in link",
		text: `Use this link to sign in to Passport. It expires shortly:\n\n${url}`,
		html: await render(
			ActionEmail({
				heading: "Sign in to Passport",
				intro: "Use this secure link to sign in. It expires shortly.",
				buttonLabel: "Sign in",
				url,
			}),
		),
	});
}

export async function sendVerificationEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Verify your email address for Passport",
		text: `Verify your email address for Passport:\n\n${url}`,
		html: await render(
			ActionEmail({
				heading: "Verify your email",
				intro: "Confirm this email address to finish setting up your Passport account.",
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
		text: `Use this link to choose a new Passport password. It expires shortly:\n\n${url}`,
		html: await render(
			ActionEmail({
				heading: "Reset your password",
				intro: "We received a request to reset your password. Use this link to choose a new one. It expires shortly.",
				buttonLabel: "Reset password",
				url,
			}),
		),
	});
}

export async function sendDeleteAccountEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Confirm deletion of your Passport account",
		text: `Use this link to permanently delete your Passport account:\n\n${url}`,
		html: await render(
			ActionEmail({
				heading: "Confirm account deletion",
				intro:
					"We received a request to delete your account. This permanently removes your account and cannot be undone.",
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
		subject: `You're invited to join ${organizationName} on Passport`,
		text: `${inviterName} invited you to join ${organizationName} on Passport.\n\nAccept the invitation: ${url}`,
		html: await render(
			OrganizationInvitationEmail({ organizationName, inviterName, url }),
		),
	});
}

export async function sendTwoFactorOTPEmail(env: AuthEnv, email: string, otp: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Your Passport sign-in code",
		text: `Your Passport sign-in code: ${otp}\n\nIt expires shortly.`,
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
		subject: `Security alert: ${event}`,
		text: `We noticed this activity on your Passport account: ${event}\n\n${requestMetadataText(metadata)}`,
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
		subject: "Your Passport data export request",
		text: [
			"A data export was requested for your Passport account.",
			"We will begin preparing it in 15 minutes.",
			"",
			requestMetadataText(metadata),
			"",
			`Review or cancel the request: ${cancelURL}`,
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
		subject: "Your Passport data export is ready",
		text: [
			"Your data export is ready to download.",
			`The download link expires ${new Date(expiresAt).toLocaleString()}.`,
			"",
			requestMetadataText(metadata),
			"",
			`Download your data: ${downloadURL}`,
		].join("\n"),
		html: await render(DataExportReadyEmail({ downloadURL, expiresAt, metadata })),
	});
}
