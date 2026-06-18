import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "./env";
import {
	sendMagicLinkEmail,
	sendOrganizationInvitationEmail,
	sendTwoFactorOTPEmail,
} from "./email";

type SentEmail = {
	from: string;
	to: string;
	subject: string;
	text: string;
	html: string;
};

type EmailSendMock = ReturnType<typeof vi.fn>;

function createEmailEnv() {
	const send = vi.fn(async () => undefined);
	const env = {
		EMAIL_FROM: "Passport <noreply@example.com>",
		EMAIL: {
			send,
		},
	} as unknown as AuthEnv;

	return { env, send };
}

function sentMessage(send: EmailSendMock) {
	const message = send.mock.calls[0]?.[0] as SentEmail | undefined;
	if (!message) {
		throw new Error("Expected email to be sent.");
	}
	return message;
}

describe("transactional emails", () => {
	it("renders the magic link URL into the HTML without changing plain text", async () => {
		const { env, send } = createEmailEnv();
		const url = "https://passport.test/sign-in?token=a&next=<x>'\"";

		await sendMagicLinkEmail(env, "user@example.com", url);

		const message = sentMessage(send);
		expect(message.text).toBe(`Open this link to sign in to Passport: ${url}`);
		// The raw, unescaped URL must never appear in the HTML body.
		expect(message.html).not.toContain(url);
		// The escaped URL is present as the button/link target.
		expect(message.html).toContain("https://passport.test/sign-in?token=a&amp;next=&lt;x&gt;");
		expect(message.html).toContain("Sign in");
	});

	it("escapes organization invitation dynamic fields in HTML", async () => {
		const { env, send } = createEmailEnv();
		const organizationName = '<Acme & "Co">';
		const inviterName = "Ada <script>alert('x')</script> & Co";
		const url = "https://passport.test/invitations/accept?invite=<id>&team=R&D";

		await sendOrganizationInvitationEmail(
			env,
			"user@example.com",
			organizationName,
			inviterName,
			url,
		);

		const message = sentMessage(send);
		expect(message.subject).toBe(`Join ${organizationName} on Passport`);
		expect(message.text).toBe(
			`${inviterName} invited you to join ${organizationName} on Passport: ${url}`,
		);
		// Attacker-controlled markup must be escaped, never emitted as live HTML.
		expect(message.html).not.toContain("<script>");
		expect(message.html).not.toContain("<Acme");
		expect(message.html).toContain("&lt;script&gt;");
		expect(message.html).toContain("Accept invitation");
	});

	it("renders two-factor OTP values into the HTML without changing plain text", async () => {
		const { env, send } = createEmailEnv();
		const otp = "123<456&'\">";

		await sendTwoFactorOTPEmail(env, "user@example.com", otp);

		const message = sentMessage(send);
		expect(message.text).toBe(`Your Passport verification code is ${otp}.`);
		expect(message.html).not.toContain(otp);
		expect(message.html).toContain("123&lt;456&amp;");
	});
});
