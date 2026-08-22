/**
 * Browser client for cross-device email-link flows. It creates the callback
 * URL embedded in an email and polls until another device consumes that link.
 */
export type EmailLinkKind = "magic-link" | "verification" | "password-reset";

export type EmailLinkFlow = {
	flow: string;
	callbackURL: string;
};

type EmailLinkPollResult =
	| { status: "pending" }
	| { status: "complete"; destination: string }
	| { status: "expired" };

/** Keeps fresh links responsive, then reduces idle database traffic. */
export function emailLinkPollDelay(elapsedMilliseconds: number) {
	if (elapsedMilliseconds < 2 * 60 * 1_000) return 1_000;
	if (elapsedMilliseconds < 10 * 60 * 1_000) return 3_000;
	return 10_000;
}

/** Creates a short-lived server flow and returns its email callback URL. */
export async function startEmailLinkFlow(
	kind: EmailLinkKind,
	destination: string,
): Promise<EmailLinkFlow> {
	const response = await fetch("/api/auth/email-link/start", {
		method: "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ kind, destination }),
	});
	if (!response.ok) throw new Error("Could not prepare the email link.");
	return (await response.json()) as EmailLinkFlow;
}

/** Checks whether an email link was consumed on any device. */
export async function pollEmailLinkFlow(
	flow: string,
	signal?: AbortSignal,
): Promise<EmailLinkPollResult> {
	const response = await fetch(`/api/auth/email-link/poll?flow=${encodeURIComponent(flow)}`, {
		credentials: "same-origin",
		signal,
	});
	if (response.status === 410) return { status: "expired" };
	if (!response.ok && response.status !== 202) {
		throw new Error("Could not check the email link.");
	}
	return (await response.json()) as EmailLinkPollResult;
}

/** Removes a flow when the auth request does not send an email link. */
export async function cancelEmailLinkFlow(flow: string) {
	await fetch(`/api/auth/email-link/cancel?flow=${encodeURIComponent(flow)}`, {
		method: "DELETE",
		credentials: "same-origin",
	});
}
