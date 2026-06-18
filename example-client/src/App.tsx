/**
 * Example client UI. Inputs are the Better Auth-backed `/api/session` DTO and
 * auth route responses; outputs are Passport sign-in controls plus claim
 * inspection panels for ID token, access token, and userinfo claim groups.
 */
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import "./App.css";

type ClaimGroup = Record<string, unknown>;

type PassportConnectionClaim = {
	provider: string;
	accountId: string;
	scopes?: string[];
	connectedAt?: string;
	updatedAt?: string;
};

type PassportClaimHighlights = {
	preferredUsername?: string;
	phoneNumber?: string;
	phoneNumberVerified?: boolean;
	organizationIds: string[];
	organizationRoles: Record<string, string>;
	teamIds: string[];
	roles: string[];
	permissions: string[];
	entitlements: string[];
	mfaEnabled?: boolean;
	passkeyEnabled?: boolean;
	connections: PassportConnectionClaim[];
};

type SessionPayload =
	| {
			authenticated: false;
	  }
	| {
			authenticated: true;
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				image?: string | null;
			};
			session: {
				id: string;
				expiresAt: string;
			};
			scopes: string[];
			claims: {
				idToken?: ClaimGroup;
				accessToken?: ClaimGroup;
				userInfo?: ClaimGroup;
			};
			passportClaims: PassportClaimHighlights;
			claimNames: {
				organizations: string;
				teams: string;
				organizationIds: string;
				organizationRoles: string;
				teamIds: string;
				roles: string;
				permissions: string;
				entitlements: string;
				mfaEnabled: string;
				passkeyEnabled: string;
				connections: string;
			};
	  };

function hasClaimGroup(claims: ClaimGroup | undefined) {
	return Boolean(claims && Object.keys(claims).length > 0);
}

function ClaimPanel({ claims, title }: { claims: ClaimGroup | undefined; title: string }) {
	return (
		<div className="rounded-lg border bg-muted/35">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-medium">{title}</h2>
			</div>
			<pre className="max-h-64 overflow-auto p-4 text-xs leading-6">
				{JSON.stringify(hasClaimGroup(claims) ? claims : {}, null, 2)}
			</pre>
		</div>
	);
}

function EmptyValue() {
	return <span className="text-muted-foreground">Not returned</span>;
}

function TextValue({ value }: { value?: string }) {
	return value ? <span className="font-medium">{value}</span> : <EmptyValue />;
}

function BooleanValue({ value }: { value?: boolean }) {
	if (value === undefined) return <EmptyValue />;
	return <span className="font-medium">{value ? "Yes" : "No"}</span>;
}

function ListValue({ values }: { values: string[] }) {
	if (!values.length) return <EmptyValue />;

	return (
		<div className="flex flex-wrap gap-1.5">
			{values.map((value) => (
				<Badge key={value} variant="secondary" className="font-mono text-[0.6875rem]">
					{value}
				</Badge>
			))}
		</div>
	);
}

function RoleMapValue({ roles }: { roles: Record<string, string> }) {
	const entries = Object.entries(roles);
	if (!entries.length) return <EmptyValue />;

	return (
		<div className="space-y-1">
			{entries.map(([organizationId, role]) => (
				<div key={organizationId} className="flex items-center justify-between gap-3">
					<span className="font-mono text-xs text-muted-foreground">{organizationId}</span>
					<Badge variant="outline" className="font-mono text-[0.6875rem]">
						{role}
					</Badge>
				</div>
			))}
		</div>
	);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid gap-1 border-t py-2.5 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[150px_1fr]">
			<div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
				{label}
			</div>
			<div className="min-w-0 text-sm">{children}</div>
		</div>
	);
}

function ConnectionsValue({ connections }: { connections: PassportConnectionClaim[] }) {
	if (!connections.length) return <EmptyValue />;

	return (
		<div className="space-y-2">
			{connections.map((connection) => (
				<div
					key={`${connection.provider}:${connection.accountId}`}
					className="rounded-md border bg-background px-3 py-2"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="font-medium">{connection.provider}</span>
						<span className="font-mono text-xs text-muted-foreground">
							{connection.accountId}
						</span>
					</div>
					{connection.scopes?.length ? (
						<div className="mt-2">
							<ListValue values={connection.scopes} />
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

function ClaimHighlights({ claims }: { claims: PassportClaimHighlights }) {
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<section className="rounded-lg border bg-muted/25 p-4">
				<h2 className="text-sm font-medium">Identity claims</h2>
				<div className="mt-3">
					<DetailRow label="Username">
						<TextValue value={claims.preferredUsername} />
					</DetailRow>
					<DetailRow label="Phone">
						<div className="space-y-1">
							<TextValue value={claims.phoneNumber} />
							<div className="text-xs text-muted-foreground">
								Verified: <BooleanValue value={claims.phoneNumberVerified} />
							</div>
						</div>
					</DetailRow>
					<DetailRow label="Security">
						<div className="grid gap-1">
							<span>
								MFA enabled: <BooleanValue value={claims.mfaEnabled} />
							</span>
							<span>
								Passkey enabled: <BooleanValue value={claims.passkeyEnabled} />
							</span>
						</div>
					</DetailRow>
				</div>
			</section>
			<section className="rounded-lg border bg-muted/25 p-4">
				<h2 className="text-sm font-medium">Membership claims</h2>
				<div className="mt-3">
					<DetailRow label="Org IDs">
						<ListValue values={claims.organizationIds} />
					</DetailRow>
					<DetailRow label="Org roles">
						<RoleMapValue roles={claims.organizationRoles} />
					</DetailRow>
					<DetailRow label="Team IDs">
						<ListValue values={claims.teamIds} />
					</DetailRow>
				</div>
			</section>
			<section className="rounded-lg border bg-muted/25 p-4">
				<h2 className="text-sm font-medium">Policy claims</h2>
				<div className="mt-3">
					<DetailRow label="Roles">
						<ListValue values={claims.roles} />
					</DetailRow>
					<DetailRow label="Permissions">
						<ListValue values={claims.permissions} />
					</DetailRow>
					<DetailRow label="Entitlements">
						<ListValue values={claims.entitlements} />
					</DetailRow>
				</div>
			</section>
			<section className="rounded-lg border bg-muted/25 p-4">
				<h2 className="text-sm font-medium">Connections</h2>
				<div className="mt-3">
					<ConnectionsValue connections={claims.connections} />
				</div>
			</section>
		</div>
	);
}

function App() {
	const [session, setSession] = useState<SessionPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const params = new URLSearchParams(window.location.search);
	const error = params.get("error");
	const loginComplete = params.get("login") === "complete";
	const authenticated = session?.authenticated === true;

	async function refresh() {
		setLoading(true);
		try {
			const response = await fetch("/api/session");
			setSession((await response.json()) as SessionPayload);
		} catch {
			setSession({ authenticated: false });
		} finally {
			setLoading(false);
		}
	}

	async function logout() {
		setLoading(true);
		await fetch("/api/logout", { method: "POST" });
		await refresh();
	}

	useEffect(() => {
		let active = true;
		fetch("/api/session")
			.then((response) => response.json() as Promise<SessionPayload>)
			.then((payload) => {
				if (!active) return;
				setSession(payload);
				setLoading(false);
			})
			.catch(() => {
				if (!active) return;
				setSession({ authenticated: false });
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	return (
		<main className="grid min-h-svh place-items-center px-4 py-8">
			<section className="w-full max-w-4xl space-y-6">
				<div className="space-y-4">
					<Badge className="rounded-sm bg-accent text-accent-foreground hover:bg-accent">
						<ShieldCheck className="mr-1 size-3.5" />
						Better Auth example client
					</Badge>
					<div className="space-y-3">
						<h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
							Passport claim inspector
						</h1>
						<p className="max-w-2xl text-muted-foreground">
							Sign in with Passport and inspect the Better Auth session alongside the
							standard and namespaced OAuth claims returned for identity, memberships,
							policy, security, and connected accounts.
						</p>
					</div>
				</div>

				{error ? (
					<Alert variant="destructive">
						<AlertDescription>Login failed: {error}</AlertDescription>
					</Alert>
				) : null}
				{loginComplete ? (
					<Alert>
						<CheckCircle2 className="size-4" />
						<AlertDescription>Login completed and a Better Auth session is active.</AlertDescription>
					</Alert>
				) : null}

				<Card className="rounded-lg bg-card/95 shadow-2xl shadow-slate-950/10 backdrop-blur">
					<CardHeader>
						<CardTitle>Client session</CardTitle>
						<CardDescription>
							{loading
								? "Checking local session"
								: authenticated
									? `Signed in as ${session.user.email}`
									: "No local client session"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="flex flex-col gap-2 sm:flex-row">
							<Button asChild>
								<a href="/api/login">
									<KeyRound className="size-4" />
									Sign in with Passport
								</a>
							</Button>
							<Button variant="outline" onClick={refresh}>
								<RefreshCw className="size-4" />
								Refresh
							</Button>
							<Button variant="secondary" onClick={logout}>
								<LogOut className="size-4" />
								Sign out
							</Button>
						</div>
						<Separator />
						{authenticated ? (
							<div className="space-y-4">
								<div className="grid gap-3 text-sm sm:grid-cols-2">
									<div>
										<div className="text-muted-foreground">User</div>
										<div className="font-medium">{session.user.name}</div>
										<div className="font-mono text-xs text-muted-foreground">{session.user.id}</div>
									</div>
									<div>
										<div className="text-muted-foreground">Session expires</div>
										<div className="font-medium">
											{new Date(session.session.expiresAt).toLocaleString()}
										</div>
										<div className="font-mono text-xs text-muted-foreground">
											{session.session.id}
										</div>
									</div>
								</div>
								<div className="flex flex-wrap gap-2">
									{session.scopes.map((scope) => (
										<Badge key={scope} variant="secondary" className="font-mono">
											{scope}
										</Badge>
									))}
								</div>
								<ClaimHighlights claims={session.passportClaims} />
								<div className="grid gap-4 lg:grid-cols-3">
									<ClaimPanel claims={session.claims.idToken} title="ID token claims" />
									<ClaimPanel claims={session.claims.userInfo} title="Userinfo claims" />
									<ClaimPanel claims={session.claims.accessToken} title="Access token claims" />
								</div>
							</div>
						) : (
							<pre className="max-h-80 overflow-auto rounded-lg border bg-muted/55 p-4 text-xs leading-6">
								{JSON.stringify(session ?? { authenticated: false }, null, 2)}
							</pre>
						)}
					</CardContent>
				</Card>
			</section>
		</main>
	);
}

export default App;
