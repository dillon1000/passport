/**
 * OAuth account-selection page. Inputs are the signed OAuth request and the
 * browser's Better Auth multi-session records; output is an OAuth continuation
 * for the selected account. The Add account link preserves the full request.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/auth/wordmark";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { resolveAddAccountURL } from "@/lib/auth-flow";
import { oauthConsentRedirect } from "@/lib/oauth-consent";
import { initialsOf } from "@/lib/session";
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

async function fetchDeviceAccounts(): Promise<DeviceAccount[]> {
	const result = await authClient.multiSession.listDeviceSessions();
	if (result.error) {
		throw new Error(result.error.message ?? "Could not load signed-in accounts.");
	}
	return (result.data ?? []) as DeviceAccount[];
}

/** Completes the provider's select-account interaction and returns its redirect URL. */
async function continueOAuthAccountSelection() {
	const response = await fetch("/api/auth/oauth2/continue", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ selected: true, oauth_query: window.location.search }),
	});
	if (!response.ok) throw new Error(await response.text());
	return oauthConsentRedirect(
		(await response.json()) as {
			redirect_uri?: string;
			redirectURI?: string;
			redirectTo?: string;
			url?: string;
		},
	);
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
		<AuthShell width="sm">
			<Card className="w-full">
				<CardContent className="space-y-5">
					<div className="space-y-1.5 text-center">
						<Wordmark className="mx-auto h-7" />
						<h1 className="text-lg font-semibold tracking-tight">Choose an account</h1>
						<p className="text-sm text-muted-foreground">
							Choose the Passport account to use with this application.
						</p>
					</div>

					<StatusBanner status={status} />

					<div className="space-y-2">
						{session?.user ? (
							<AccountChoice
								account={session.user}
								current
								disabled={loading}
								onChoose={() => void chooseAccount(session.session.token, session.user)}
							/>
						) : (
							<Skeleton className="h-16 w-full" />
						)}
						{accountsQuery.isPending ? <Skeleton className="h-16 w-full" /> : null}
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

/** Renders one selectable browser account before OAuth creates an authorization code. */
function AccountChoice({
	account,
	current = false,
	disabled,
	onChoose,
}: {
	account: { name: string; email: string; image?: string | null };
	current?: boolean;
	disabled: boolean;
	onChoose: () => void;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
			disabled={disabled}
			onClick={onChoose}
		>
			<Avatar>
				<AvatarImage src={account.image ?? undefined} />
				<AvatarFallback>{initialsOf(account.name)}</AvatarFallback>
			</Avatar>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{account.name}</span>
				<span className="block truncate text-xs text-muted-foreground">{account.email}</span>
			</span>
			{current ? <span className="text-xs text-muted-foreground">Current</span> : null}
		</button>
	);
}
