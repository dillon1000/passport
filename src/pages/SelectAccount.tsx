/**
 * OAuth account-selection page. Inputs are the signed OAuth request and the
 * browser's Better Auth multi-session records; output is an OAuth continuation
 * for the selected account. The Add account link preserves the full request.
 */
import { Loader } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import { authClient } from "@/auth-client";
import { AccountChoice } from "@/components/auth/account-choice";
import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/auth/wordmark";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { resolveAddAccountURL } from "@/lib/auth-flow";
import { oauthConsentRedirect } from "@/lib/oauth-consent";
import { useAccountSwitch } from "@/lib/account-switch";

type DeviceAccount = {
	session: {
		token: string;
	};
	user: {
		id: string;
		name: string;
		email: string;
		image?: string | null;
	};
};

const deviceAccountSchema = z.object({
	session: z.object({ token: z.string() }),
	user: z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		image: z.string().nullable().optional(),
	}),
});
const oauthContinuationSchema = z.object({
	redirect_uri: z.string().optional(),
	redirectURI: z.string().optional(),
	redirectTo: z.string().optional(),
	url: z.string().optional(),
});

async function fetchDeviceAccounts(): Promise<DeviceAccount[]> {
	const result = await authClient.multiSession.listDeviceSessions();
	if (result.error) {
		throw new Error(result.error.message ?? "Could not load signed-in accounts.");
	}
	return z.array(deviceAccountSchema).parse(result.data ?? []);
}

/** Completes the provider's select-account interaction and returns its redirect URL. */
async function continueOAuthAccountSelection() {
	const response = await fetch("/api/auth/oauth2/continue", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ selected: true, oauth_query: window.location.search }),
	});
	if (!response.ok) throw new Error(await response.text());
	return oauthConsentRedirect(oauthContinuationSchema.parse(await response.json()));
}

export function SelectAccount() {
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [status, setStatus] = useState<Status | null>(null);
	const [loading, setLoading] = useState(false);
	const beginAccountSwitch = useAccountSwitch((state) => state.begin);
	const clearAccountSwitch = useAccountSwitch((state) => state.clear);
	const authorizationURL = window.location.pathname + window.location.search;
	const accountsQuery = useQuery({
		queryKey: ["oauth-device-accounts", session?.user.id],
		queryFn: fetchDeviceAccounts,
		enabled: Boolean(session?.user),
	});
	const otherAccounts = (accountsQuery.data ?? []).filter(
		(account) => account.user.id !== session?.user.id,
	);

	async function chooseAccount(sessionToken: string, account: DeviceAccount["user"]) {
		setStatus(null);
		setLoading(true);
		beginAccountSwitch(account);
		if (sessionToken !== session?.session.token) {
			const result = await authClient.multiSession.setActive({ sessionToken });
			if (result.error) {
				setLoading(false);
				clearAccountSwitch();
				setStatus({ tone: "error", message: result.error.message ?? "Could not switch accounts." });
				return;
			}
		}

		try {
			const redirect = await continueOAuthAccountSelection();
			if (!redirect) throw new Error("OAuth did not return a continuation URL.");
			window.location.assign(redirect);
		} catch (error) {
			setLoading(false);
			clearAccountSwitch();
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not continue OAuth authorization.",
			});
		}
	}

	useEffect(() => {
		if (!sessionPending && !session) {
			window.location.assign(`/sign-in?callbackURL=${encodeURIComponent(authorizationURL)}`);
		}
	}, [authorizationURL, session, sessionPending]);

	if (!session) return null;

	return (
		<AuthShell focused>
			<Card className="w-full">
				<CardContent className="space-y-5 p-7">
					<div className="space-y-7">
						<Wordmark className="h-7" />
						<h1 className="text-2xl font-semibold tracking-tight">Choose an account</h1>
					</div>
					<p className="text-xs text-muted-foreground">
						Choose the Passport account to use with this application.
					</p>

					<StatusBanner status={status} />

					<div className="space-y-2">
						{session?.user ? (
							<AccountChoice
								account={session.user}
								status="Current"
								disabled={loading}
								onChoose={() => void chooseAccount(session.session.token, session.user)}
							/>
						) : (
							<Skeleton className="h-16 w-full" />
						)}
						{accountsQuery.isPending ? (
							<div aria-label="Loading accounts" className="flex min-h-16 items-center justify-center rounded-lg border bg-background text-muted-foreground" role="status">
								<Loader size="sm" />
							</div>
						) : null}
						{otherAccounts.map((account) => (
							<AccountChoice
								key={account.session.token}
								account={account.user}
								disabled={loading}
								onChoose={() => void chooseAccount(account.session.token, account.user)}
							/>
						))}
					</div>

					<Button asChild className="w-full" variant="outline">
						<a href={resolveAddAccountURL(authorizationURL)}>Add an account</a>
					</Button>
				</CardContent>
			</Card>
		</AuthShell>
	);
}
