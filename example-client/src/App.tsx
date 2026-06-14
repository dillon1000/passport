import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import "./App.css";

type SessionPayload = {
	authenticated: boolean;
	claims?: {
		sub?: string;
		email?: string;
		name?: string;
		iss?: string;
		aud?: string | string[];
		exp?: number;
	};
};

function App() {
	const [session, setSession] = useState<SessionPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const params = new URLSearchParams(window.location.search);
	const error = params.get("error");
	const loginComplete = params.get("login") === "complete";

	async function refresh() {
		setLoading(true);
		const response = await fetch("/api/session");
		setSession((await response.json()) as SessionPayload);
		setLoading(false);
	}

	async function logout() {
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
						OIDC example client
					</Badge>
					<div className="space-y-3">
						<h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
							Auth code + PKCE against Passport
						</h1>
						<p className="max-w-2xl text-muted-foreground">
							This Worker exchanges an authorization code for tokens, verifies the ID token against
							Passport JWKS, and exposes the verified claims to the React UI.
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
						<AlertDescription>Login completed and the ID token was JWKS-verified.</AlertDescription>
					</Alert>
				) : null}

				<Card className="rounded-lg bg-card/95 shadow-2xl shadow-slate-950/10 backdrop-blur">
					<CardHeader>
						<CardTitle>Client session</CardTitle>
						<CardDescription>
							{loading
								? "Checking local session"
								: session?.authenticated
									? "Authenticated with Passport"
									: "No local client session"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="flex flex-col gap-2 sm:flex-row">
							<Button asChild>
								<a href="/api/login">
									<KeyRound className="size-4" />
									Start OIDC login
								</a>
							</Button>
							<Button variant="outline" onClick={refresh}>
								<RefreshCw className="size-4" />
								Refresh
							</Button>
							<Button variant="secondary" onClick={logout}>
								<LogOut className="size-4" />
								Log out
							</Button>
						</div>
						<Separator />
						<pre className="max-h-80 overflow-auto rounded-lg border bg-muted/55 p-4 text-xs leading-6">
							{JSON.stringify(session ?? { authenticated: false }, null, 2)}
						</pre>
					</CardContent>
				</Card>
			</section>
		</main>
	);
}

export default App;
