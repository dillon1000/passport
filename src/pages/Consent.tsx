/**
 * OAuth consent page. Inputs are the provider-signed OAuth query, reviewed
 * client metadata, and the current account; output is an allow or deny POST.
 * Required scopes render as fixed capability rows. Only scopes explicitly
 * marked optional by the client can be removed with Passport's checkbox.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
	AppWindow,
	Building2,
	CheckCircle2,
	ChevronDown,
	Clock,
	CreditCard,
	History,
	Link2,
	Lock,
	Pencil,
	Phone,
	TriangleAlert,
	UserRound,
} from "@/lib/icons";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { FastAuthSpinner } from "@/components/auth/fast-auth-spinner";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Wordmark } from "@/components/auth/wordmark";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";
import { Checkbox } from "@/components/kumo/primitives/checkbox";
import { useBrand } from "@/lib/brand-runtime";
import {
	consentScopeGroups,
	consentScopeLabel,
	isLocalOAuthHost,
	isOptionalConsentScope,
	oauthRedirectHost,
	safeOAuthClientName,
	type ConsentScopeGroup,
} from "@/lib/oauth-consent-scopes";
import {
	OAUTH_CONSENT_ENDPOINT,
	oauthConsentRedirect,
	oauthConsentRequestBody,
} from "@/lib/oauth-consent";
import { fetchAPIJSON, queryKeys } from "@/lib/query-client";
import { initialsOf } from "@/lib/session";

type ConsentClientMetadata = {
	clientId: string;
	name: string;
	redirectUris: string[];
	optionalScopes?: string[];
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	disabled?: boolean;
	verified: boolean;
	source: "database" | "seed";
};

const GROUP_ICONS = {
	write: Pencil,
	identity: UserRound,
	phone: Phone,
	organization: Building2,
	security: Link2,
	billing: CreditCard,
} satisfies Record<ConsentScopeGroup["id"], ComponentType<{ className?: string }>>;

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
	const optionalScopes = client?.optionalScopes ?? [];
	const groups = consentScopeGroups(requestedScopes, optionalScopes);
	const hasOfflineAccess = requestedScopes.includes("offline_access");
	const offlineAccessOptional = isOptionalConsentScope("offline_access", optionalScopes);
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
				if (!isOptionalConsentScope(scope, optionalScopes)) continue;
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

	if (!metadataLoaded || sessionPending || signedOut) return <ConsentLoader />;

	const transitioning = loading !== null || redirecting;

	return (
		<AuthShell width="sm" focused>
			<Card
				aria-busy={transitioning}
				className="relative w-full gap-0 overflow-hidden py-0 [view-transition-name:auth-step]"
			>
				<div
					aria-hidden={transitioning}
					className={`transition-[translate,opacity] duration-150 ease-out ${
						transitioning ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
					}`}
					inert={transitioning ? true : undefined}
				>
					<CardContent className="px-5 py-6 sm:px-6 sm:py-7">
					<header className="space-y-7">
						<Wordmark className="h-7" />
						<div className="flex items-start gap-3.5">
							<AppMark client={client} published={published} name={clientName} />
							<div className="min-w-0 flex-1">
								<h1 className="text-2xl leading-7 font-semibold tracking-tight">
									{clientName} wants to connect with your {brand.name} account
								</h1>
								<p className="mt-1 text-sm text-muted-foreground">
									Review what {clientName} can do with your {brand.name} account.
								</p>
								{redirectHost ? (
									<p className="mt-2 flex max-w-full items-center gap-2 font-mono text-xs text-muted-foreground">
										{published ? (
											<CheckCircle2 className="size-3.5 shrink-0 text-green-700 dark:text-green-400" />
										) : null}
										<span className="truncate">{redirectHost}</span>
									</p>
								) : null}
							</div>
						</div>
					</header>

					{!published ? (
						<div className="mt-5 flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
							<div>
								<p className="font-medium">Unpublished application</p>
								<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
									{brand.name} has not verified this application and its redirect. Continue only if you trust the developer.
								</p>
							</div>
						</div>
					) : null}

					<div className="mt-5">
						<StatusBanner status={status} />
						{client?.disabled ? (
							<StatusBanner status={{ tone: "error", message: "This application is disabled and cannot receive access." }} />
						) : null}
					</div>

					{session?.user ? (
						<div className="mt-5 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2">
							<span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
								{session.user.image ? (
									<img src={session.user.image} alt="" className="size-full object-cover" />
								) : (
									initialsOf(session.user.email)
								)}
							</span>
							<p className="min-w-0 flex-1 truncate text-sm font-medium">{session.user.email}</p>
							<a
								href={accountSelectionURL}
								className="shrink-0 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
							>
								Switch account
							</a>
						</div>
					) : null}

					<section aria-labelledby="access-heading" className="mt-6">
						<h2 id="access-heading" className="pb-2 text-sm text-muted-foreground">
							This will allow {clientName} to
						</h2>
						<div className="border-y">
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
						<div className="mt-3 flex gap-3 rounded-lg bg-amber-200/80 px-3 py-3 text-amber-950 dark:bg-amber-900/45 dark:text-amber-100">
							<Clock className="mt-0.5 size-5 shrink-0" />
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium leading-5">Keep this access when you’re not using {clientName}</p>
								<p className="mt-0.5 text-xs leading-5">{clientName} can read the access above in the background for up to 30 days, until you revoke it.</p>
								{!published ? <code className="mt-1 block text-[0.6875rem]">offline_access</code> : null}
							</div>
							{offlineAccessOptional ? (
								<Checkbox
									aria-label="Allow background access"
									checked={selectedScopes.has("offline_access")}
									onCheckedChange={(checked) => setScopeSelection(["offline_access"], checked === true)}
									className="mt-0.5 shrink-0"
								/>
							) : null}
						</div>
					) : null}

					<div className="mt-5 grid grid-cols-2 gap-2">
						<Button className="w-full" size="lg" variant="outline" onClick={() => void decide(false)} disabled={loading !== null}>
							Deny
						</Button>
						<Button className="w-full" size="lg" onClick={() => void decide(true)} disabled={approvalBlocked}>
							Allow access
						</Button>
					</div>

					<div className="mt-5 space-y-2 border-t pt-4 text-sm text-muted-foreground">
						<p className="flex items-center gap-2"><Lock className="size-4 shrink-0" />{clientName} cannot see your password.</p>
						<p className="flex items-center gap-2"><History className="size-4 shrink-0" />Revoke any time in <a href="/applications" className="text-blue-700 hover:underline dark:text-blue-400">Applications.</a></p>
					</div>

					<footer className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
						{links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="hover:text-foreground">{link.label}</a>)}
						{links.length ? <span aria-hidden="true">·</span> : null}
						<span>Secured by {brand.name}</span>
					</footer>
					</CardContent>
				</div>

				<div
					aria-hidden={!transitioning}
					aria-label={redirecting ? `Returning to ${clientName}` : "Saving authorization choice"}
					aria-live="polite"
					className={`absolute inset-0 z-10 grid place-items-center bg-card text-muted-foreground transition-[translate,opacity] duration-150 ease-out ${
						transitioning ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
					}`}
					role="status"
				>
					<div className="flex flex-col items-center gap-3 text-center">
						<AppMark client={client} published={published} name={clientName} />
						<FastAuthSpinner className="size-6" />
						<p className="text-sm font-medium">
							{redirecting ? `Returning to ${clientName}…` : "Saving your choice…"}
						</p>
					</div>
				</div>
			</Card>
		</AuthShell>
	);
}

function AppMark({ client, published, name }: { client: ConsentClientMetadata | null; published: boolean; name: string }) {
	if (published && client?.icon) {
		return <img src={client.icon} alt="" className="size-11 rounded-xl bg-muted object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />;
	}
	return (
		<div className="grid size-11 place-items-center rounded-xl border text-muted-foreground">
			{published ? <span className="text-sm font-semibold">{initialsOf(name)}</span> : <AppWindow className="size-5" />}
		</div>
	);
}

function ScopeGroup({ group, selected, unpublished, onChange }: { group: ConsentScopeGroup; selected: Set<string>; unpublished: boolean; onChange: (scopes: readonly string[], enabled: boolean) => void }) {
	const Icon = GROUP_ICONS[group.id];
	const fullyOptional = group.requiredScopes.length === 0;
	const checked = group.optionalScopes.every((scope) => selected.has(scope));
	return (
		<details className="group border-t first:border-t-0">
			<summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
				<Icon className="size-5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1">
					<span className="block text-sm font-medium leading-5">{group.title}</span>
					{group.description ? <span className="block text-xs leading-4 text-muted-foreground">{group.description}</span> : null}
				</span>
				{fullyOptional ? (
					<span onClick={(event) => event.stopPropagation()}>
						<Checkbox
							aria-label={`Allow ${group.title.toLowerCase()}`}
							checked={checked}
							onCheckedChange={(value) => onChange(group.optionalScopes, value === true)}
						/>
					</span>
				) : null}
				<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
			</summary>
			<ul className="space-y-2 border-t py-3 pl-8 text-xs">
				{group.visibleScopes.map((scope) => {
					const optional = group.optionalScopes.includes(scope);
					return (
						<li key={scope} className="flex items-start gap-2">
							{optional && !fullyOptional ? (
								<Checkbox
									aria-label={consentScopeLabel(scope)}
									checked={selected.has(scope)}
									onCheckedChange={(value) => onChange([scope], value === true)}
									className="mt-0.5"
								/>
							) : null}
							<span className="min-w-0 flex-1"><span className="block">{consentScopeLabel(scope)}</span>{unpublished ? <code className="block break-all text-[0.6875rem] text-muted-foreground">{scope}</code> : null}</span>
						</li>
					);
				})}
			</ul>
		</details>
	);
}

function ConsentLoader() {
	return (
		<AuthShell width="sm" focused>
			<Card className="[view-transition-name:auth-step]">
				<CardContent
					className="flex min-h-72 flex-col px-7 py-7 text-muted-foreground"
					role="status"
					aria-live="polite"
				>
					<Wordmark className="h-7 text-foreground" />
					<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
						<FastAuthSpinner />
						<p className="text-sm font-medium">Preparing authorization…</p>
					</div>
				</CardContent>
			</Card>
		</AuthShell>
	);
}
