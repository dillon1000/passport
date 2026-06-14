import { useState, type ComponentType } from "react";
import {
	Check,
	Clock,
	Fingerprint,
	Mail,
	ShieldCheck,
	UserRound,
	X,
} from "lucide-react";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandMark } from "@/components/auth/brand-mark";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useBrand } from "@/lib/brand-runtime";
import { initialsOf } from "@/lib/session";

/** Human-readable copy + icon for the standard OIDC scopes; unknown scopes pass through. */
const SCOPE_META: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
	openid: { label: "Verify your identity", icon: Fingerprint },
	profile: { label: "Read your name and profile details", icon: UserRound },
	email: { label: "Read your email address", icon: Mail },
	offline_access: { label: "Stay signed in when you're away", icon: Clock },
};

export function Consent() {
	const brand = useBrand();
	const { data: session } = authClient.useSession();
	const params = new URLSearchParams(window.location.search);
	const clientId = params.get("client_id") ?? "Unknown client";
	const code = params.get("code");
	const scopes = (params.get("scope") ?? "openid profile email")
		.split(" ")
		.map((scope) => scope.trim())
		.filter(Boolean);
	const [status, setStatus] = useState<Status | null>(null);
	const [loading, setLoading] = useState<"accept" | "deny" | null>(null);
	const user = session?.user;

	async function decide(accept: boolean) {
		if (!code) {
			setStatus({ tone: "error", message: "Missing OAuth consent code." });
			return;
		}
		setLoading(accept ? "accept" : "deny");
		setStatus(null);
		const response = await fetch("/oauth2/consent", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ code, accept }),
		});

		if (!response.ok) {
			setLoading(null);
			setStatus({ tone: "error", message: await response.text() });
			return;
		}

		const payload = (await response.json()) as {
			redirectURI?: string;
			redirectTo?: string;
			url?: string;
		};
		const redirect = payload.redirectURI ?? payload.redirectTo ?? payload.url;
		if (redirect) {
			window.location.assign(redirect);
			return;
		}
		setLoading(null);
		setStatus({
			tone: "error",
			message: "Consent was accepted but no redirect URL was returned.",
		});
	}

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<Card className="w-full gap-0 overflow-hidden py-0">
					<CardContent className="space-y-5 px-6 pt-6 pb-5">
						{/* Brand ↔ client handshake. */}
						<div className="flex items-center justify-center gap-3">
							<BrandMark className="size-11 rounded-xl" />
							<div className="flex items-center gap-1 text-muted-foreground" aria-hidden="true">
								<span className="size-1 rounded-full bg-current" />
								<span className="size-1 rounded-full bg-current opacity-60" />
								<span className="size-1 rounded-full bg-current opacity-30" />
							</div>
							<div className="grid size-11 place-items-center rounded-xl border bg-muted/40 text-sm font-semibold text-muted-foreground">
								{clientId.slice(0, 2).toUpperCase()}
							</div>
						</div>

						<div className="space-y-1 text-center">
							<h1 className="text-lg font-semibold tracking-tight">Authorize access</h1>
							<p className="text-sm text-muted-foreground">
								<span className="font-mono text-foreground">{clientId}</span> wants to access your{" "}
								{brand.name} account.
							</p>
						</div>

						<StatusBanner status={status} />

						{user ? (
							<div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
								<span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border bg-background text-[0.6875rem] font-medium">
									{user.image ? (
										<img src={user.image} alt="" className="size-full object-cover" />
									) : (
										initialsOf(user.name)
									)}
								</span>
								<div className="min-w-0 flex-1 text-sm">
									<span className="text-muted-foreground">Signed in as </span>
									<span className="font-medium">{user.email}</span>
								</div>
							</div>
						) : null}

						<div className="space-y-2">
							<div className="text-xs font-medium text-muted-foreground">This will allow it to</div>
							<ul className="space-y-px">
								{scopes.map((scope) => {
									const meta = SCOPE_META[scope];
									const Icon = meta?.icon ?? Check;
									return (
										<li
											key={scope}
											className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
										>
											<span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
												<Icon className="size-4" />
											</span>
											<span className="flex-1 text-sm">{meta?.label ?? scope}</span>
											<span className="font-mono text-[0.6875rem] text-muted-foreground">{scope}</span>
										</li>
									);
								})}
							</ul>
						</div>
					</CardContent>

					<CardFooter className="flex-col gap-3 border-t bg-muted/40 px-6 py-4">
						<div className="grid w-full grid-cols-2 gap-2">
							<Button variant="outline" onClick={() => decide(false)} disabled={loading !== null}>
								<X className="size-4" />
								Deny
							</Button>
							<Button autoFocus onClick={() => decide(true)} disabled={loading !== null}>
								<Check className="size-4" />
								{loading === "accept" ? "Authorizing…" : "Allow"}
							</Button>
						</div>
						<p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
							<ShieldCheck className="size-3.5" />
							You can revoke this access anytime from Applications.
						</p>
					</CardFooter>
				</Card>
			</div>
		</AuthShell>
	);
}
