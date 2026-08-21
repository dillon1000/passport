/**
 * OAuth consent page. Inputs are the provider-signed OAuth query, reviewed
 * client metadata, and the current account; output is an allow or deny POST.
 * The page groups scopes by effect and sends partial grants when users omit
 * optional access. Unpublished clients lose uploaded branding and expose raw
 * scope strings so development requests are explicit.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	Check,
	CheckCircle2,
	ChevronDown,
	Clock,
	ExternalLink,
	Globe2,
	Repeat2,
	ShieldCheck,
	TriangleAlert,
	X,
} from "@/lib/icons";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent, CardFooter } from "@/components/kumo/primitives/card";
import { Loader } from "@/components/kumo/primitives/loader";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { useBrand } from "@/lib/brand-runtime";
import {
	consentScopeGroups,
	consentScopeLabel,
	isLocalOAuthHost,
	isOptionalConsentScope,
	oauthRedirectHost,
	safeOAuthClientName,
} from "@/lib/oauth-consent-scopes";
import {
	OAUTH_CONSENT_ENDPOINT,
	oauthConsentRedirect,
	oauthConsentRequestBody,
} from "@/lib/oauth-consent";
import { fetchAPIJSON, queryKeys } from "@/lib/query-client";
import { initialsOf } from "@/lib/session";
import { cn } from "@/lib/utils";

type ConsentClientMetadata = {
	clientId: string;
	name: string;
	redirectUris: string[];
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	disabled?: boolean;
	verified: boolean;
	source: "database" | "seed";
};

export function Consent() {
	const brand = useBrand();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const params = useMemo(() => new URLSearchParams(window.location.search), []);
	const clientId = params.get("client_id") ?? "Unknown client";
	const requestedScopes = useMemo(
		() =>
			(params.get("scope") ?? "openid profile email")
				.split(" ")
				.map((scope) => scope.trim())
				.filter(Boolean),
		[params],
	);
	const [selectedScopes, setSelectedScopes] = useState(() => new Set(requestedScopes));
	const [status, setStatus] = useState<Status | null>(null);
	const [loading, setLoading] = useState<"accept" | "deny" | null>(null);
	const [redirecting, setRedirecting] = useState(false);
	const hasClientId = clientId !== "Unknown client";
	const clientMetadataQuery = useQuery({
		queryKey: queryKeys.consentClientMetadata(clientId),
		queryFn: async () => {
			try {
				const payload = await fetchAPIJSON<{ client?: ConsentClientMetadata }>(
					`/api/oauth/client-metadata?clientId=${encodeURIComponent(clientId)}`,
				);
				return payload.client ?? null;
			} catch {
				return null;
			}
		},
		enabled: hasClientId,
	});
	const signedOut = !sessionPending && !session;
	const metadataLoaded = hasClientId ? clientMetadataQuery.isFetched : true;
	const client = hasClientId ? clientMetadataQuery.data ?? null : null;
	const redirectURI = params.get("redirect_uri");
	const redirectHost = oauthRedirectHost(redirectURI) ?? oauthRedirectHost(client?.uri);
	const registeredRedirect = Boolean(
		redirectURI && client?.redirectUris.some((registered) => registered === redirectURI),
	);
	const published = Boolean(
		client?.verified && registeredRedirect && !isLocalOAuthHost(redirectHost),
	);
	const clientName = safeOAuthClientName(client?.name ?? "", "Unknown application");
	const groups = consentScopeGroups(requestedScopes);
	const hasOfflineAccess = requestedScopes.includes("offline_access");
	const links = [
		...(client?.uri ? [{ label: "Website", href: client.uri }] : []),
		...(client?.tos ? [{ label: "Terms", href: client.tos }] : []),
		...(client?.policy ? [{ label: "Privacy", href: client.policy }] : []),
	];
	const accountSelectionURL = `/select-account?${params.toString()}`;
	const approvalBlocked =
		loading !== null ||
		selectedScopes.size === 0 ||
		!metadataLoaded ||
		!client ||
		client.disabled;

	useEffect(() => {
		if (!signedOut) return;
		const callbackURL = window.location.pathname + window.location.search;
		window.location.assign(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
	}, [signedOut]);

	function setScopeSelection(scopes: readonly string[], enabled: boolean) {
		setSelectedScopes((current) => {
			const next = new Set(current);
			for (const scope of scopes) {
				if (!isOptionalConsentScope(scope)) continue;
				if (enabled) next.add(scope);
				else next.delete(scope);
			}
			return next;
		});
	}

	async function decide(accept: boolean) {
		const body = oauthConsentRequestBody(
			window.location.search,
			accept,
			requestedScopes.filter((scope) => selectedScopes.has(scope)),
		);
		if (!body) {
			setStatus({ tone: "error", message: "Missing OAuth consent request." });
			return;
		}
		setLoading(accept ? "accept" : "deny");
		setStatus(null);
		const response = await fetch(OAUTH_CONSENT_ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			setLoading(null);
			setStatus({ tone: "error", message: await response.text() });
			return;
		}
		const redirect = oauthConsentRedirect((await response.json()) as Record<string, string>);
		if (redirect) {
			setRedirecting(true);
			requestAnimationFrame(() => window.location.assign(redirect));
			return;
		}
		setLoading(null);
		setStatus({ tone: "error", message: "The consent service did not return a redirect URL." });
	}

	if (!metadataLoaded || sessionPending || signedOut) return <ConsentSkeleton />;

	if (redirecting) {
		return (
			<AuthShell width="md" focused>
				<Card>
					<CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
						<AppMark client={client} published={published} name={clientName} />
						<p className="text-sm font-medium">Returning to {clientName}…</p>
					</CardContent>
				</Card>
			</AuthShell>
		);
	}

	return (
		<AuthShell width="md" focused>
			<Card className="w-full gap-0 overflow-hidden py-0">
				<CardContent className="space-y-5 px-5 pt-5 pb-6 sm:px-6 sm:pt-6">
					<div className="flex items-start gap-4">
						<AppMark client={client} published={published} name={clientName} />
						<div className="min-w-0 flex-1 pt-0.5">
							<h1 className="text-xl font-semibold tracking-tight">
								{clientName} wants access to your {brand.name} account
							</h1>
							{redirectHost ? (
								<p className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
									{published ? <CheckCircle2 className="size-3.5" /> : <Globe2 className="size-3.5" />}
									<span className="truncate">{redirectHost}</span>
									{published ? <span className="font-sans">verified redirect</span> : null}
								</p>
							) : null}
						</div>
					</div>

					{!published ? (
						<div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-sm">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
							<div>
								<p className="font-medium">Unpublished application</p>
								<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Passport has not verified this application and its redirect. Continue only if you trust the developer.</p>
							</div>
						</div>
					) : null}

					<StatusBanner status={status} />
					{client?.disabled ? (
						<StatusBanner
							status={{
								tone: "error",
								message: "This application is disabled and cannot receive access.",
							}}
						/>
					) : null}

					{session?.user ? (
						<div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
							<span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-background text-xs font-medium">
								{session.user.image ? (
									<img src={session.user.image} alt="" className="size-full object-cover" />
								) : (
									initialsOf(session.user.name || session.user.email)
								)}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{session.user.name || session.user.email}</p>
								{session.user.name ? <p className="truncate text-xs text-muted-foreground">{session.user.email}</p> : null}
							</div>
							<Button asChild size="sm" variant="ghost">
								<a href={accountSelectionURL}>
									<Repeat2 className="size-3.5" />
									Switch account
								</a>
							</Button>
						</div>
					) : null}

					<section aria-labelledby="access-heading" className="space-y-2">
						<h2 id="access-heading" className="text-sm font-medium">{clientName} is asking to</h2>
						<div className="divide-y rounded-xl border">
							{groups.map((group) => (
								<ScopeGroup
									key={group.id}
									group={group}
									selected={selectedScopes}
									unpublished={!published}
									onChange={setScopeSelection}
								/>
							))}
						</div>
					</section>

					{hasOfflineAccess ? (
						<label className="flex cursor-pointer gap-3 rounded-xl border border-foreground/20 bg-muted/25 p-3.5">
							<input
								type="checkbox"
								className="mt-1 size-4 accent-foreground"
								checked={selectedScopes.has("offline_access")}
								onChange={(event) =>
									setScopeSelection(["offline_access"], event.target.checked)
								}
							/>
							<Clock className="mt-0.5 size-5 shrink-0" />
							<span>
								<span className="block text-sm font-medium">Let {clientName} access your account in the background</span>
								<span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{clientName} can refresh access while you are away for up to 30 days. You can revoke access sooner.</span>
								{!published ? <code className="mt-1.5 block text-[0.6875rem] text-muted-foreground">offline_access</code> : null}
							</span>
						</label>
					) : null}
				</CardContent>

				<CardFooter className="flex-col gap-3 border-t bg-muted/40 px-5 py-4 sm:px-6">
					<div className="grid w-full grid-cols-2 gap-2">
						<Button
							size="lg"
							variant="secondary"
							onClick={() => void decide(false)}
							disabled={loading !== null}
						>
							{loading === "deny" ? <Loader size="sm" /> : <><X className="size-4" />Deny</>}
						</Button>
						<Button size="lg" onClick={() => void decide(true)} disabled={approvalBlocked}>
							{loading === "accept" ? <Loader size="sm" className="text-primary-foreground" /> : <><Check className="size-4" />Allow</>}
						</Button>
					</div>
					<div className="space-y-1 text-center text-xs leading-relaxed text-muted-foreground">
						<p>You can revoke {clientName}'s access at any time from Applications.</p>
						<p>{clientName} cannot access your password.</p>
					</div>
					{links.length ? <nav aria-label="Application policies" className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">{links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{link.label}<ExternalLink className="size-3" /></a>)}</nav> : null}
					<p className="text-center text-[0.6875rem] text-muted-foreground/70">Consent managed by {brand.name}</p>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}

function AppMark({ client, published, name }: { client: ConsentClientMetadata | null; published: boolean; name: string }) {
	return published && client?.icon ? (
		<img src={client.icon} alt="" className="size-14 shrink-0 rounded-xl bg-muted object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
	) : (
		<div className="grid size-14 shrink-0 place-items-center rounded-xl border bg-muted text-base font-semibold">
			{initialsOf(name)}
		</div>
	);
}

function ScopeGroup({ group, selected, unpublished, onChange }: { group: ReturnType<typeof consentScopeGroups>[number]; selected: Set<string>; unpublished: boolean; onChange: (scopes: readonly string[], enabled: boolean) => void }) {
	const checked = group.scopes.every((scope) => selected.has(scope));
	return (
		<details
			className={cn(
				"group px-3.5 py-3",
				group.id === "write" && "bg-destructive/[0.035]",
			)}
		>
			<summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
				{group.optional ? <input type="checkbox" aria-label={group.title} className="mt-0.5 size-4 shrink-0 accent-foreground" checked={checked} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(group.scopes, event.target.checked)} /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
				<span className="min-w-0 flex-1"><span className="block text-sm font-medium">{group.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{group.description}</span></span>
				<ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
			</summary>
			<ul className="mt-3 space-y-2 border-t pt-3 pl-7">
				{group.visibleScopes.map((scope) => {
					const optional = isOptionalConsentScope(scope);
					return <li key={scope} className="flex items-start gap-2 text-xs"><input type="checkbox" aria-label={consentScopeLabel(scope)} className={cn("mt-0.5 size-3.5 accent-foreground", !optional && "invisible")} checked={selected.has(scope)} disabled={!optional} onChange={(event) => onChange([scope], event.target.checked)} /><span className="min-w-0 flex-1"><span className="block">{consentScopeLabel(scope)}</span>{unpublished ? <code className="mt-0.5 block break-all text-[0.6875rem] text-muted-foreground">{scope}</code> : null}</span></li>;
				})}
			</ul>
		</details>
	);
}

function ConsentSkeleton() {
	return <AuthShell width="md" focused><Card className="w-full"><CardContent className="space-y-5 px-6 py-6"><div className="flex gap-4"><Skeleton className="size-14 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-3 w-2/5" /></div></div><Skeleton className="h-16 w-full rounded-lg" /><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-44 w-full rounded-xl" /></CardContent></Card></AuthShell>;
}
