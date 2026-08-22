/**
 * Focused interstitial shown after an authentication email link is sent.
 * Inputs select magic-link or password-reset copy plus resend/back actions;
 * the parent owns polling and restores recoverable request errors in place.
 */
import { MailCheck } from "@/lib/icons";

import { FastAuthSpinner } from "@/components/auth/fast-auth-spinner";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Wordmark } from "@/components/auth/wordmark";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";

type PendingEmailLinkKind = "magic-link" | "password-reset";

const COPY: Record<PendingEmailLinkKind, {
	description: (email: string) => string;
	waiting: string;
	resend: string;
	back: string;
	loading: string;
}> = {
	"magic-link": {
		description: (email) => `Open the magic link sent to ${email}. This page will continue when the link opens.`,
		waiting: "Waiting for your magic link…",
		resend: "Resend magic link",
		back: "Use another sign-in method",
		loading: "Sending magic link",
	},
	"password-reset": {
		description: (email) => `If an account matches ${email}, open the password reset link we sent. This page will continue when the link opens.`,
		waiting: "Waiting for your reset link…",
		resend: "Resend reset link",
		back: "Back to account recovery",
		loading: "Sending password reset link",
	},
};

export function EmailLinkPending({
	kind,
	email,
	loading,
	status,
	onResend,
	onBack,
}: {
	kind: PendingEmailLinkKind;
	email: string;
	loading: boolean;
	status: Status | null;
	onResend: () => void;
	onBack: () => void;
}) {
	const copy = COPY[kind];

	return (
		<Card className="relative w-full overflow-hidden [view-transition-name:auth-step]">
			<div
				aria-hidden={loading}
				className={`transition-[translate,opacity] duration-150 ease-out ${
					loading ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
				}`}
				inert={loading ? true : undefined}
			>
				<CardContent className="space-y-5 p-7">
					<div className="space-y-7">
						<Wordmark className="h-7" />
						<div className="space-y-2">
							<div className="grid size-12 place-items-center rounded-xl bg-muted text-foreground">
								<MailCheck aria-hidden="true" className="size-7" />
							</div>
							<h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
						</div>
					</div>

					<StatusBanner status={status?.tone === "error" ? status : null} />
					<p className="text-sm text-pretty text-muted-foreground">{copy.description(email)}</p>
					<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
						<FastAuthSpinner className="size-4" />
						<span role="status" aria-live="polite">{copy.waiting}</span>
					</div>
					<Button className="w-full" size="lg" variant="outline" type="button" onClick={onResend}>
						{copy.resend}
					</Button>
					<button
						type="button"
						className="mx-auto flex min-h-8 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
						onClick={onBack}
					>
						{copy.back}
					</button>
				</CardContent>
			</div>

			<div
				aria-hidden={!loading}
				aria-label={copy.loading}
				aria-live="polite"
				className={`absolute inset-0 z-10 grid place-items-center bg-card text-muted-foreground transition-[translate,opacity] duration-150 ease-out ${
					loading ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
				}`}
				role="status"
			>
				<FastAuthSpinner />
			</div>
		</Card>
	);
}
