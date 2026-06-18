/**
 * Organization invitation entrypoint. The invitation id comes from the email
 * link query string, and mutations go through Better Auth organization APIs.
 * Successful accepts redirect into the organization dashboard; declined or
 * invalid states stay in this compact auth-shell flow.
 */
import { useState } from "react";
import { ArrowRight, Building2, Check, X } from "lucide-react";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/auth/wordmark";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type InvitationAction = "accept" | "reject";

export function OrganizationInvitation() {
	const session = authClient.useSession();
	const invitationId = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
	const callbackURL = `${window.location.pathname}${window.location.search}`;
	const signInURL = `/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`;
	const [busy, setBusy] = useState<InvitationAction | null>(null);
	const [declined, setDeclined] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);

	async function decide(action: InvitationAction) {
		if (!invitationId) return;
		setBusy(action);
		setStatus(null);
		const result =
			action === "accept"
				? await authClient.organization.acceptInvitation({ invitationId })
				: await authClient.organization.rejectInvitation({ invitationId });
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not update this invitation.",
			});
			return;
		}
		if (action === "accept") {
			window.location.assign("/organizations");
			return;
		}
		setDeclined(true);
		setStatus({ tone: "success", message: "Invitation declined." });
	}

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<Wordmark className="h-7" />
					<h1 className="text-xl font-semibold tracking-tight">Organization invitation</h1>
				</div>

				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg tracking-tight">
							<Building2 className="size-5" />
							Join organization
						</CardTitle>
						<CardDescription>
							Accept or decline this Passport organization invitation.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<StatusBanner status={status} />
						{!invitationId ? (
							<p className="text-sm text-muted-foreground">
								This invitation link is missing an invitation id.
							</p>
						) : declined ? (
							<p className="text-sm text-muted-foreground">
								The invitation was declined. You can return to your account.
							</p>
						) : session.isPending ? (
							<p className="text-sm text-muted-foreground">Checking your session...</p>
						) : !session.data ? (
							<p className="text-sm text-muted-foreground">
								Sign in with the invited email address before accepting this invitation.
							</p>
						) : (
							<div className="rounded-lg border bg-muted/30 px-3 py-2.5">
								<div className="text-xs font-medium text-muted-foreground">Invitation ID</div>
								<div className="mt-1 truncate font-mono text-sm">{invitationId}</div>
							</div>
						)}
					</CardContent>
					<CardFooter className="grid gap-2 border-t bg-muted/40 sm:grid-cols-2">
						{!session.isPending && !session.data && invitationId && !declined ? (
							<Button asChild className="sm:col-span-2">
								<a href={signInURL}>
									Sign in
									<ArrowRight className="size-4" />
								</a>
							</Button>
						) : declined ? (
							<Button asChild className="sm:col-span-2">
								<a href="/account">
									Go to account
									<ArrowRight className="size-4" />
								</a>
							</Button>
						) : (
							<>
								<Button
									variant="outline"
									type="button"
									onClick={() => void decide("reject")}
									disabled={!session.data || !invitationId || busy !== null}
								>
									<X className="size-4" />
									Decline
								</Button>
								<Button
									type="button"
									onClick={() => void decide("accept")}
									disabled={!session.data || !invitationId || busy !== null}
								>
									<Check className="size-4" />
									Accept
								</Button>
							</>
						)}
					</CardFooter>
				</Card>
			</div>
		</AuthShell>
	);
}
