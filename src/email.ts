import type { AuthEnv } from "./env";

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
		html: `<p>Open this link to sign in to Passport:</p><p><a href="${url}">${url}</a></p>`,
	});
}

export async function sendVerificationEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Verify your Passport email",
		text: `Open this link to verify your Passport email: ${url}`,
		html: `<p>Open this link to verify your Passport email:</p><p><a href="${url}">${url}</a></p>`,
	});
}

export async function sendPasswordResetEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Reset your Passport password",
		text: `Open this link to reset your Passport password: ${url}`,
		html: `<p>Open this link to reset your Passport password:</p><p><a href="${url}">${url}</a></p>`,
	});
}

export async function sendDeleteAccountEmail(env: AuthEnv, email: string, url: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Delete your Passport account",
		text: `Open this link to delete your Passport account: ${url}`,
		html: `<p>Open this link to delete your Passport account:</p><p><a href="${url}">${url}</a></p>`,
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
		html: `<p>${inviterName} invited you to join ${organizationName} on Passport.</p><p><a href="${url}">Accept invitation</a></p>`,
	});
}

export async function sendTwoFactorOTPEmail(env: AuthEnv, email: string, otp: string) {
	await sendAuthEmail(env, {
		to: email,
		subject: "Your Passport verification code",
		text: `Your Passport verification code is ${otp}.`,
		html: `<p>Your Passport verification code is <strong>${otp}</strong>.</p>`,
	});
}
